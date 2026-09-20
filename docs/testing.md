# Testing

Pure hook modules are tested under Node where their semantics match the PocketBase JavaScript engine. The runtime smoke test also starts the verified PocketBase binary with disposable data, applies every committed migration, checks the versioned health route, authenticates the generated recovery account, and verifies the starter collections.

Cover unauthenticated access, cross-user isolation, invalid bodies, record limits, transaction rollback, idempotent retries, file authorization, and safe errors. Never run automated tests against production or a copied production data directory.

Run `corepack yarn setup` once, then `corepack yarn check`. With the Next.js template running, execute `corepack yarn integration:check` in the frontend wrapper to verify the complete server-to-server path.
