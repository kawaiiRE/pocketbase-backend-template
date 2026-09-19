# Architecture

PocketBase already provides authentication, collection APIs, rules, realtime, files, and SQLite persistence. Use those native capabilities before writing wrappers. Ordinary CRUD is modeled with migrations and collection rules. Custom routes exist for workflows that need transactions, idempotency, integrations, or response allowlisting.

For a non-trivial custom route the flow is:

`route -> authentication/validation -> service workflow -> scoped repository -> transaction -> presenter -> response DTO`

Handlers run in isolated JavaScript scopes. Reusable code is stateless CommonJS loaded inside the handler with an absolute `__hooks` path. Hooks are not Node.js and must not use Node APIs or async workflows.

This backend owns its database contract. Frontends consume versioned HTTP behavior but do not import migration or hook files. Contract changes are deliberately synchronized across independently released repositories.

The starter publishes `GET /api/v1/health` with `apiVersion: 1` as its minimal integration contract. The separate Next.js template validates that response server-side and exposes its own same-origin health route to the browser. This HTTP boundary keeps deployment and data ownership independent.
