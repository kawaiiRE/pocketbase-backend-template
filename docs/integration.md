# Next.js integration

This backend works with the separate `next-pocketbase-frontend-template` through a versioned HTTP contract. The repositories stay independently installable and never share source files, environment files, runtime data, credentials, or backup locations.

## Contract

`GET /api/v1/health` returns a raw response DTO:

```json
{
  "status": "ok",
  "apiVersion": 1,
  "service": "pocketbase-next-backend-template",
  "time": "2026-09-19T12:00:00.000Z"
}
```

The Next.js server validates this DTO before presenting it to browser code through its same-origin `GET /api/health` route. An incompatible version is rejected as an invalid upstream response.

## Verification

Start this backend, start the frontend with `POCKETBASE_URL` pointing here, and run the following from the frontend wrapper:

```powershell
corepack yarn integration:check
```

Keep PocketBase on loopback or a private container network in production. Only expose application routes intentionally through the chosen reverse proxy, and never provide PocketBase superuser credentials to Next.js or browser code.
