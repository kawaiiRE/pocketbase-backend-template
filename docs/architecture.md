# Architecture

PocketBase already provides authentication, collection APIs, rules, realtime, files, and SQLite persistence. Use those native capabilities before writing wrappers. Ordinary CRUD is modeled with migrations and collection rules. Custom routes exist for workflows that need transactions, idempotency, integrations, or response allowlisting.

## Layout

```text
pb_hooks/
  main.pb.js                     routes, app/mailer hooks, cron job (thin adapters)
  modules/
    shared/env.cjs               environment parsing (feature flags, runtime settings)
    shared/http-error.cjs        { message, code } errors and safe responses
    shared/http-request.cjs      JSON body parsing (required or optional)
    health/                      health service + presenter
    config/config.presenter.cjs  public feature flags DTO
    auth/register.validation.cjs registration and locale input allowlist
    auth/register.service.cjs    registration workflow
    auth/guest.service.cjs       guest creation, in-place upgrade, expiry cleanup
    auth/user.repository.cjs     users persistence and verification email
    auth/user.presenter.cjs      user DTO
    mail/auth-email.cjs          localized (ar) auth email rendering
    mail/auth-email.hook.cjs     mailer hook: localize, drop mail to guests
    settings/runtime-settings.cjs env -> PocketBase settings
pb_migrations/                   forward-only schema, rules, settings
scripts/                         setup, start, seed, type generation, runtime test, backup
tests/                           Vitest unit tests for pure hook modules
```

## Request flow

For a non-trivial custom route:

`route -> validation -> service workflow -> scoped repository -> (transaction) -> presenter -> response DTO`

Registration follows it: `main.pb.js` reads flags and the JSON body, `register.service.cjs` checks the feature, validates via `register.validation.cjs`, checks duplicates and creates through `user.repository.cjs`, and `user.presenter.cjs` allowlists the response. Services receive their repository and flags as arguments, which keeps them testable under Node. The health and config routes skip layers that would do no work.

Guest sessions follow the same shape: `guest.service.cjs` owns the rules (feature flag, guest-only upgrade, duplicate checks, TTL cutoff), the repository owns record writes, and the routes answer with PocketBase's own `$apis.recordAuthResponse` so guests receive the standard `{ token, record }`. The hourly `guestCleanup` cron job calls the same service with the injected clock and TTL.

Users, profiles, passwords, verification, password reset, account deletion, and notes CRUD stay on native collection APIs protected by rules. Mailer hooks localize those native emails from the recipient's `locale` instead of replacing the native flows.

## Configuration

- Feature flags (`PB_REGISTRATION_ENABLED`, `PB_REQUIRE_EMAIL_VERIFICATION`, `PB_GUEST_ENABLED`) and `PB_GUEST_TTL_HOURS` are read from the environment per request or cron run, so they need no database state. They are also validated at startup.
- Runtime settings (`PB_APP_NAME`, `PB_APP_URL`, sender, SMTP, trusted proxy headers) are applied by an `onBootstrap` hook at every start when set; unset variables leave dashboard-managed values untouched. Invalid values stop startup.
- Durable settings (rate limits, log retention, collection options, email templates) live in migrations.

## JSVM constraints

Handlers run in isolated JavaScript scopes. Reusable code is stateless CommonJS loaded inside the handler with an absolute `__hooks` path (modules may require siblings relatively). Hooks are not Node.js and must not use Node APIs or async workflows. Errors are duck-typed (`isAppError`) because modules can be evaluated in different VM instances.

## Contract ownership

This backend owns its database contract. Frontends consume versioned HTTP behavior (`docs/integration.md`) but do not import migration or hook files. Contract changes are deliberately synchronized across independently released repositories.
