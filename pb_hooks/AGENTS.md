# PocketBase hook rules

- Only `*.pb.js` files are auto-loaded. Shared modules use `.cjs` and are required inside handlers by absolute `__hooks` paths.
- Shared modules are stateless because PocketBase caches required modules across requests.
- Do not use `process`, `Buffer`, `fetch`, `fs`, timers, promises, ESM imports, or top-level mutable request state.
- Route handlers authenticate first, validate second, scope every query, run atomic writes, and present allowlisted output last.
- Built-in collection APIs remain locked or protected by collection rules. A custom route must not become a generic PocketBase proxy.
- Inside `modules/`, sibling modules may be required with relative paths; handlers always use absolute `__hooks` paths.
- Read environment variables only through `modules/shared/env.cjs` with an injected `getenv`, and throw errors from `createAppError` so `sendError` returns `{ message, code }`. Check them with `isAppError`, never `instanceof`.
- Keep services free of JSVM globals (inject repositories and flags) so they stay unit-testable under Node.
- Event hooks must call `event.next()` to continue. Returning without it cancels the action; only do that deliberately (the mailer hook drops guest emails this way).
