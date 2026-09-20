# PocketBase backend template

[![CI](https://github.com/kawaiiRE/pocketbase-backend-template/actions/workflows/ci.yml/badge.svg)](https://github.com/kawaiiRE/pocketbase-backend-template/actions/workflows/ci.yml)

[Next.js frontend template](https://github.com/kawaiiRE/next-frontend-template) | [Live demo](https://next-template.rachida.dev)

A standalone PocketBase 0.40 backend with forward migrations, typed JavaScript hooks, a checksum-verified installer, strict project boundaries, container deployment, and laptop backup tooling. It keeps the useful discipline of the Fastify template—validation, scoped persistence, services, presenters, tests, and safe releases—without pretending PocketBase is Fastify or Node.js.

## Local development

1. Copy this entire folder to a new wrapper folder and rename the package/app metadata.
2. Run `corepack yarn install --immutable` and `corepack yarn setup`. The setup script downloads PocketBase 0.40.4 for Windows/Linux x64, verifies the official SHA-256, and generates local hook declarations.
3. Set `PB_ENCRYPTION_KEY` in your shell or a private environment loader, then run `corepack yarn dev`. For a first production migration, also set a private recovery superuser email and a random password of at least 24 characters; the migration provisions that account for backups and restore verification.
4. Open `http://127.0.0.1:8090/_/` to create the local superuser. Never use production credentials locally.
5. Run `corepack yarn check` before handoff.

The starter creates a locked `users` auth collection and an owner-scoped `notes` collection. Public registration is intentionally disabled. The custom `GET /api/v1/health` route is compatible with the separate `next-frontend-template`, but neither repository imports from the other. Start both services and run `corepack yarn integration:check` from the frontend wrapper to verify the live connection; see `docs/integration.md`.

## Laptop backup of a server

Use PocketBase's consistent backup API instead of copying a running SQLite directory. Open an SSH tunnel to the server's loopback-only PocketBase port, set the variables shown in `.env.backup.example` in your current shell, and run `corepack yarn backup:download`. The script:

- refuses cleartext connections except loopback;
- authenticates as a dedicated recovery superuser;
- asks PocketBase to create a consistent full backup;
- downloads it to the chosen laptop directory with a SHA-256 sidecar;
- never deletes the server copy or prints credentials.

This is a manual tool, not proof of scheduled backup coverage. Production also needs encrypted server/cloud copies, retention, monitoring, and recurring isolated restore tests. Read `docs/recovery.md`.

## Contributing and security

Contributions are welcome; see `CONTRIBUTING.md`. Report security issues privately by following `SECURITY.md` rather than opening a public issue.
