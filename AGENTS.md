# PocketBase backend engineering rules

This repository is one complete, independent backend codebase. It owns its PocketBase hooks, migrations, tooling, dependencies, deployment contract, and documentation. Never import from a sibling frontend or another project's runtime data.

## PocketBase architecture

- Use native versioned `pb_migrations` and JavaScript `pb_hooks` with generated PocketBase declarations and `checkJs`.
- PocketBase hooks run in an embedded JavaScript engine, not Node.js. Do not use Node APIs, browser APIs, ESM, asynchronous workflows, or Node-only packages in hooks.
- Handlers execute in isolated scopes. Load local stateless CommonJS modules with `require(__hooks + '/...')` inside each handler.
- Prefer PocketBase collection rules and native record APIs for ordinary CRUD. Add custom routes only for real workflows, transactions, allowlisted responses, or integrations.
- For custom workflows preserve `route -> service -> repository -> presenter` boundaries when each layer has meaningful work. Do not manufacture empty layers for trivial health checks.
- Validate and allowlist every untrusted body. Scope ownership in the database query or collection rule, not after fetching.
- Return raw successful DTOs and safe `{ message, code }` error responses through `modules/shared/http-error.cjs`. Never expose caught exception messages, stack traces, superuser data, or raw private records.
- Read environment variables only through `modules/shared/env.cjs`. Feature flags are read per request; runtime settings (`PB_APP_NAME`, `PB_APP_URL`, SMTP, sender, trusted proxy headers) are applied by the `onBootstrap` hook. Durable settings (rate limits, templates, rules) belong in migrations.

## Data and authentication

- Migrations are forward-only in production. Never add a reset migration, destructive automatic seed, or rollback that silently deletes data.
- Every existing database receives a fresh verified backup before a release that changes migrations. Restore-test backups in an isolated target.
- Keep user auth and `_superusers` separate. Superuser credentials are for administration/recovery and never enter a frontend.
- Registration is closed by default (`PB_REGISTRATION_ENABLED=false`) and only available through `POST /api/v1/auth/register`; `users.createRule` stays `null`. Production enables `PB_REQUIRE_EMAIL_VERIFICATION` with SMTP.
- Guest sessions are opt-in (`PB_GUEST_ENABLED=false` by default). Guests use the reserved `guest.invalid` domain, never receive email, cannot set `guest`/`email`/`password` through record APIs, upgrade only through `POST /api/v1/auth/guest/upgrade`, and expire through the `guestCleanup` cron job.
- Keep the built-in rate limiter enabled. Change limits with a new forward migration.
- Pending migrations must stay schema/settings-only (no record backfills or queries): use field defaults, rules, indexes, and settings.
- The seed script is local-only and additive. Never add seeding to migrations or hooks.
- Multi-record writes use `runInTransaction` and the transaction's app instance. Retried external operations need durable idempotency keys.

## Project boundaries and quality

- Keep `pb_data`, generated declarations, binaries, secrets, archives, logs, and backups out of Git.
- This backend may share an HTTP contract with a frontend, but the repositories remain independently installable and releasable. Do not use parent-directory imports, symlinks, or shared runtime folders.
- Add the smallest useful tests and update migrations, hooks, contracts, tests, and docs together.
- Preserve the API v1 contract in `docs/integration.md` (health, config, register, guest and guest upgrade, native users/notes behavior, email link paths) used by `next-frontend-template` and the Expo template. Change it only deliberately in all repositories; verify both live services from the frontend with `corepack yarn integration:check`.
- Keep `.env.example` documenting every variable the hooks and scripts read.
- Run `corepack yarn setup` once, then `corepack yarn check` before handoff.

## Deployment contract

- Preserve `Dockerfile`, `.dockerignore`, executable `docker.sh`, and the backup/recovery docs when copying this template.
- Production normally places this checkout at `/var/www/<project>/backend` and a project-owned Compose file one level above.
- Keep the Compose service named `backend`, or set `BACKEND_SERVICE_NAME` explicitly. Bind PocketBase to loopback or a private container network; use an SSH tunnel for administration.
- Client work belongs below the dedicated client server root chosen by operations. It never shares volumes, secrets, networks, cookies, or backup repositories with RachVision or another client.
- A healthy process is not proof of a safe release. Verify migrations, representative data/files, authentication, backups, reverse proxy behavior, and existing applications.
