# Contributing

Thanks for improving the template. Keep changes focused, preserve the repository boundary, and use forward-only migrations for every schema or rule change.

1. Create a branch from `main`.
2. Install with `corepack yarn install --immutable`, then run `corepack yarn setup`.
3. Keep hooks, migrations, generated declarations, contracts, tests, and recovery documentation synchronized.
4. Run `corepack yarn check` before opening a pull request.
5. Describe migration, security, backup, and restore implications in the pull request.

Do not commit credentials, local environment files, binaries, generated output, backup archives, or copied production data. For a vulnerability, use the private process in `SECURITY.md`.
