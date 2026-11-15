# Security

## Exposure

- Keep PocketBase off the public Internet when Next.js is the gateway. Bind the host port to loopback and use a private container network; administer through an SSH tunnel.
- Set `PB_TRUSTED_PROXY_HEADERS` (normally `X-Forwarded-For`) only when PocketBase is reachable exclusively through the gateway, and make the gateway overwrite that header with the real client IP. Otherwise clients can spoof their IP, or all clients share one rate-limit bucket.
- Keep application users and `_superusers` separate. Restrict superuser access by IP where practical (`superuserIPs`), enable superuser MFA, and keep the dedicated recovery account in a password manager. Superuser credentials never reach a frontend.

## Authentication

- Registration is closed by default (`PB_REGISTRATION_ENABLED=false`). The `users` collection keeps `createRule = null`, so `POST /api/v1/auth/register` is the only self-service path, with allowlisted input, case-insensitive duplicate checks, and its own rate limit.
- `409 EMAIL_TAKEN` reveals that an address is registered. This is a deliberate usability trade-off mitigated by the registration rate limit; password reset and verification requests always return `204` and do not enumerate accounts.
- In production enable `PB_REQUIRE_EMAIL_VERIFICATION=true` with working SMTP. An `onRecordAuthRequest` hook then rejects every `users` auth method (password, refresh, OTP, OAuth2) for unverified accounts with `403`, and only after the password check succeeds.
- Users can update only their own `name`, `locale`, `avatar`, and password (which requires `oldPassword` and rotates the token key, invalidating existing sessions). PocketBase rejects changes to `verified` and `email` by non-superusers, and the update rule rejects any `guest` change. Users can delete only their own account.

## Guest sessions

- Closed by default (`PB_GUEST_ENABLED=false`). `POST /api/v1/auth/guest` has its own per-IP limit (10 per hour) on top of the general limits, and every guest expires after `PB_GUEST_TTL_HOURS` (default 24) through the hourly cleanup job, which bounds storage abuse.
- A guest identity is `guest-<24 random [a-z0-9]>@guest.invalid` (about 124 bits) with a random 48-character password that is never returned. The token from the creation response is the only credential. Registration and upgrades reject the reserved domain.
- Guests are `verified` so the verification gate does not block them, but they cannot receive email: all auth emails to guests are dropped, `request-email-change` is refused, and the update rule forbids guests from setting `email` or `password`. The only way to a real identity is `POST /api/v1/auth/guest/upgrade`, which applies registration validation, requires `PB_REGISTRATION_ENABLED`, follows the verification policy, and rotates the token key.
- Guest rows are ordinary users: collection rules scope their notes exactly like regular accounts.
- Passwords are 8–71 UTF-8 bytes (bcrypt). Auth tokens last 7 days; reset tokens 30 minutes; verification tokens 24 hours. OTP and MFA are disabled for `users`; enable them deliberately in a forward migration if the product needs them.

## Rate limiting

The built-in limiter is enabled by migration `1800000004_enable_rate_limits.js` with strict limits for login, refresh, password reset, verification, record creation, and registration; `1800000005_guest_users_and_avatar_limits.js` adds the guest routes. Superuser requests bypass it. See `docs/integration.md` for the table.

Limits are per client IP. Behind the Next.js gateway, `PB_TRUSTED_PROXY_HEADERS=X-Forwarded-For` is required: without it every request appears to come from the gateway and, for example, ten failed logins per minute across all users lock out everyone. PocketBase logs a startup warning when the limiter is on and no trusted proxy header is configured.

## Data access and validation

- Collection rules are least-privileged and owner-scoped. Never accept an owner or user identifier from a body without tying it to `@request.auth.id`.
- Custom routes validate content type, body size (16 KiB for registration), and every field, and return only allowlisted DTOs.
- `users.avatar` accepts only JPEG, PNG, WebP, and GIF up to 2 MiB; SVG is excluded because it can carry scripts. Files are public by URL (not `protected`), so expose them only through the gateway. Validate MIME types, sizes, names, and authorization the same way when adding file fields. Treat JSON fields as untrusted.

## Errors and logging

- Custom routes return `{ message, code }` (optionally `fields`). Unexpected exceptions become `500 INTERNAL_ERROR`; the detail is written to the PocketBase log only.
- Request logs exclude client IPs by default (`logs.logIP = false`) and keep 7 days.

## Secrets

- Run with `--encryptionEnv=PB_ENCRYPTION_KEY` and an independent 32-character secret. SMTP credentials applied from the environment are stored in the encrypted settings; backups need the same key.
- Never put credentials in Git, docs, shell history, frontend bundles, logs, or chat. `.env` and `.env.*` (except the examples) are ignored.
- The seed script (`corepack yarn seed`) refuses `NODE_ENV=production`, non-loopback targets, and instances whose app URL is not a local origin. Its default demo password is for local databases only.
