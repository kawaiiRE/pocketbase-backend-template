# Testing

Run `corepack yarn setup` once, then `corepack yarn check` (format, lint, typecheck, unit tests, runtime smoke test). Never run automated tests against production or a copied production data directory.

## Unit tests (`corepack yarn test:run`)

Vitest loads the pure CommonJS hook modules under Node, where their semantics match the PocketBase JSVM:

- `tests/env.test.mjs`: feature flags, guest TTL bounds, and environment-managed settings parsing.
- `tests/runtime-settings.test.mjs`: idempotent application of environment settings.
- `tests/register.test.mjs`: registration validation (including `locale` and the reserved guest domain), service workflow (disabled, duplicate, race, verification email failure, unexpected errors), and presenter allowlisting.
- `tests/guest.test.mjs`: guest creation (disabled, generated identity, localized name), upgrade (not a guest, registration closed, validation, duplicate and race, verification), and batched TTL cleanup.
- `tests/auth-email.test.mjs`: Arabic email rendering, frontend links, HTML escaping, and the English template fallback.
- `tests/http.test.mjs`: safe error responses, JSON body parsing, and the config presenter.
- `tests/health.test.mjs`: the health DTO.

Modules that call JSVM globals (`user.repository.cjs`, `auth-email.hook.cjs`, `main.pb.js`, migrations) are covered by the runtime test instead of mocks.

## Runtime smoke test (`corepack yarn test:runtime`)

`scripts/check-runtime.mjs` starts the verified PocketBase binary on a random loopback port with a disposable data directory under `.runtime/runtime-tests`, applies every committed migration, and runs four phases, restarting PocketBase with a different environment for each. Inherited `PB_*` variables are stripped so results do not depend on your shell.

1. Defaults: health and config contracts, `403 REGISTRATION_DISABLED` and `403 GUEST_DISABLED`, collection rules/fields/indexes/email templates and avatar limits, recovery superuser login, and the registration rate limit returning `429`.
2. Open registration: `201` DTO, `409` duplicate, `400` field errors, native login and refresh, profile and locale updates, rejected `verified` changes and cross-account updates, notes CRUD with owner scoping, `archived` filtering and title/body search, password change invalidating old tokens, self-delete, and cascade deletion of notes.
3. Guests: config flags and TTL, guest `{ token, record }`, guest-owned notes, rejected `guest`/`password` record changes and email-change requests, in-place upgrade keeping notes, invalidated guest token, `403 NOT_GUEST` on a second upgrade, login with the new credentials, and the registered cleanup job.
4. Required verification: config flag, unverified login rejected with `403`, login allowed after verification, guests not blocked, and a guest upgrade answering `202` without a token.

The data directory is deleted afterwards and every started process is stopped.

## Cross-repository check

With the Next.js template running against this backend, execute `corepack yarn integration:check` in the frontend wrapper to verify the complete server-to-server path.

## What to add with new features

Cover unauthenticated access, cross-user isolation, invalid bodies, record limits, transaction rollback, idempotent retries, file authorization, and safe errors for every new collection or route.
