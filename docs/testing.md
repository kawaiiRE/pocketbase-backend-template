# Testing

Pure hook modules are tested under Node where their semantics match the PocketBase JavaScript engine. Integration tests for a real application should start an isolated PocketBase instance with a disposable `pb_data`, apply committed migrations, and verify collection rules and custom routes through HTTP.

Cover unauthenticated access, cross-user isolation, invalid bodies, record limits, transaction rollback, idempotent retries, file authorization, and safe errors. Never run automated tests against production or a copied production data directory.

Run `corepack yarn setup` once, then `corepack yarn check`. Also start the real binary and request `/api/v1/health` after migration changes. With the Next.js template running, execute `corepack yarn integration:check` in the frontend wrapper to verify the complete server-to-server path.
