# PocketBase hook rules

- Only `*.pb.js` files are auto-loaded. Shared modules use `.cjs` and are required inside handlers by absolute `__hooks` paths.
- Shared modules are stateless because PocketBase caches required modules across requests.
- Do not use `process`, `Buffer`, `fetch`, `fs`, timers, promises, ESM imports, or top-level mutable request state.
- Route handlers authenticate first, validate second, scope every query, run atomic writes, and present allowlisted output last.
- Built-in collection APIs remain locked or protected by collection rules. A custom route must not become a generic PocketBase proxy.
