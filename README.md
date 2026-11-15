# PocketBase backend template

[![CI](https://github.com/kawaiiRE/pocketbase-backend-template/actions/workflows/ci.yml/badge.svg)](https://github.com/kawaiiRE/pocketbase-backend-template/actions/workflows/ci.yml)

[Next.js frontend template](https://github.com/kawaiiRE/next-frontend-template) | [Live demo](https://next-template.rachida.dev)

A standalone PocketBase 0.40 backend with forward migrations, typed JavaScript hooks, a checksum-verified installer, strict project boundaries, container deployment, and laptop backup tooling. It keeps the useful discipline of the Fastify template (validation, scoped persistence, services, presenters, tests, safe releases) without pretending PocketBase is Fastify or Node.js.

## What you get

- `users` auth collection (email/password, `name`, optional `locale` of `en`/`ar`, size-limited raster `avatar`): users can update their profile, change their password, and delete their own account. Registration only through a guarded custom route, closed by default.
- Optional guest sessions ("continue as guest"): a guest gets a real token, owns notes, can be upgraded in place to a full account, and is deleted with its data after a configurable TTL by an hourly cron job.
- Owner-scoped `notes` collection (`title`, `body`, `archived`) with an index for archived filtering and native text search.
- Versioned custom API: `GET /api/v1/health`, `GET /api/v1/config`, `POST /api/v1/auth/register`, `POST /api/v1/auth/guest`, `POST /api/v1/auth/guest/upgrade` with `{ message, code }` errors.
- Optional email verification gate, password reset, and verification emails linking to the frontend (`PB_APP_URL`), in English or right-to-left Arabic based on the user's `locale`.
- Built-in rate limiter enabled with strict auth and registration limits.
- Environment-managed SMTP, sender, app name, app URL, and trusted proxy headers.
- Idempotent local seed (demo user and notes), unit tests, and a runtime smoke test against a disposable database.

The full v1 contract used by the Next.js and Expo templates is in [`docs/integration.md`](docs/integration.md).

## Local development

1. Copy this folder to a new wrapper folder and rename the package/app metadata (and `meta.appName` in a new migration or the dashboard).
2. Run `corepack yarn install --immutable` and `corepack yarn setup`. The setup script downloads PocketBase 0.40.4 for Windows/Linux x64, verifies the official SHA-256, and generates local hook declarations.
3. Copy `.env.example` to `.env` and adjust it. `corepack yarn dev` and `corepack yarn seed` load `.env` automatically. On a fresh `pb_data`, the foundation migration creates the superuser from `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD`; for an existing database create one at `http://127.0.0.1:8090/_/` or with `./bin/pocketbase superuser upsert`.
4. Run `corepack yarn dev`, then `corepack yarn seed` to create `demo@example.com` / `demo-password-123` with sample notes. The seed only adds missing data and refuses non-local targets.
5. To test registration set `PB_REGISTRATION_ENABLED=true`; for guest sessions also set `PB_GUEST_ENABLED=true`. To test verification and password reset emails, run [Mailpit](https://mailpit.axllent.org) (`docker run --rm -p 8025:8025 -p 1025:1025 axllent/mailpit`), set `PB_SMTP_HOST=127.0.0.1`, `PB_SMTP_PORT=1025`, `PB_REQUIRE_EMAIL_VERIFICATION=true`, and read mail at `http://localhost:8025`.
6. Run `corepack yarn check` before handoff.

Never use production credentials locally. The `.env` file, `pb_data`, `bin`, `generated`, and `.runtime` stay out of Git.

## Scripts

| Script                          | Purpose                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `corepack yarn setup`           | Download and verify PocketBase, generate `generated/types.d.ts` |
| `corepack yarn dev`             | Run PocketBase on `127.0.0.1:${PB_PORT:-8090}` with `.env`      |
| `corepack yarn seed`            | Local-only idempotent demo data                                 |
| `corepack yarn types:generate`  | Regenerate JSVM declarations                                    |
| `corepack yarn check`           | Format, lint, typecheck, unit tests, runtime smoke test         |
| `corepack yarn backup:download` | Laptop backup through the backup API (reads `.env.backup`)      |

## Laptop backup of a server

Use PocketBase's consistent backup API instead of copying a running SQLite directory. Open an SSH tunnel to the server's loopback-only PocketBase port, copy `.env.backup.example` to `.env.backup` (or set the variables in your shell), and run `corepack yarn backup:download`. The script:

- refuses cleartext connections except loopback;
- authenticates as a dedicated recovery superuser;
- asks PocketBase to create a consistent full backup;
- downloads it to the chosen laptop directory with a SHA-256 sidecar;
- never deletes the server copy or prints credentials.

This is a manual tool, not proof of scheduled backup coverage. Production also needs encrypted server/cloud copies, retention, monitoring, and recurring isolated restore tests. Read `docs/recovery.md`.

## Documentation

- [`docs/architecture.md`](docs/architecture.md): layers, request flow, configuration model.
- [`docs/integration.md`](docs/integration.md): API v1 contract, email links, rate limits.
- [`docs/security.md`](docs/security.md): exposure, auth, rate limiting, secrets.
- [`docs/testing.md`](docs/testing.md): unit and runtime tests.
- [`docs/deployment.md`](docs/deployment.md) and [`docs/recovery.md`](docs/recovery.md): releases, backups, restore tests.

## Contributing and security

Contributions are welcome; see `CONTRIBUTING.md`. Report security issues privately by following `SECURITY.md` rather than opening a public issue.
