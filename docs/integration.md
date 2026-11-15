# Frontend integration (API v1)

This backend serves the separate `next-frontend-template` (and, through that gateway, the Expo app) over a versioned HTTP contract. The repositories never share source files, environment files, runtime data, credentials, or backup locations.

PocketBase stays private: the Next.js server is the only client that reaches it. Browsers and mobile apps call the Next.js same-origin `/api/*` routes, which forward to the endpoints below.

## Gateway requirements

- Forward the user's PocketBase token as the `Authorization` header (raw token, no `Bearer` prefix needed). Never forward superuser credentials.
- Set `X-Forwarded-For` to the real client IP, **overwriting** any incoming value, and run PocketBase with `PB_TRUSTED_PROXY_HEADERS=X-Forwarded-For`. Without this every user shares the gateway's IP and the rate limits below apply to all users together.
- Validate every response shape before presenting it. Reject an unexpected `apiVersion`, and ignore unknown object keys so fields can be added without a new version.

## Custom routes

Custom routes return raw DTOs on success and `{ message, code }` (plus optional `fields`) on failure. JSON key order is not significant.

### `GET /api/v1/health`

`200`:

```json
{
  "status": "ok",
  "apiVersion": 1,
  "service": "pocketbase-backend-template",
  "time": "2026-09-19T12:00:00.000Z"
}
```

### `GET /api/v1/config`

Public feature flags so clients can show or hide registration, verification, and guest UI.

`200`:

```json
{
  "apiVersion": 1,
  "features": {
    "registration": false,
    "emailVerification": false,
    "guest": false,
    "guestTtlHours": 24
  }
}
```

- `registration` mirrors `PB_REGISTRATION_ENABLED` (default `false`).
- `emailVerification` mirrors `PB_REQUIRE_EMAIL_VERIFICATION` (default `false`). When `true`, unverified users cannot sign in or refresh.
- `guest` mirrors `PB_GUEST_ENABLED` (default `false`).
- `guestTtlHours` is the effective `PB_GUEST_TTL_HOURS` (default `24`, may be fractional): how long a guest account lives before cleanup. Always present.

### `POST /api/v1/auth/register`

Request (`Content-Type: application/json`, max 16 KiB; unknown keys are ignored):

```json
{ "name": "Ada Lovelace", "email": "ada@example.com", "password": "correct horse", "locale": "ar" }
```

| Field      | Rule                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------ |
| `name`     | Trimmed, 2–120 characters                                                                  |
| `email`    | Trimmed, lowercased, valid address, max 254 characters, not on the `guest.invalid` domain  |
| `password` | 8–71 characters; at most 71 UTF-8 bytes (PocketBase bcrypt limit). Not trimmed.            |
| `locale`   | Optional: `"en"`, `"ar"`, `""`, or `null`. Stored on the user; selects the email language. |

`201` (the user DTO):

```json
{
  "id": "k2x7c0d9a1b3e5f",
  "email": "ada@example.com",
  "name": "Ada Lovelace",
  "locale": "ar",
  "verified": false,
  "guest": false,
  "createdAt": "2026-10-18T12:00:00.000Z"
}
```

Errors:

| Status | `code`                   | When                                                                               |
| ------ | ------------------------ | ---------------------------------------------------------------------------------- |
| 400    | `INVALID_INPUT`          | Malformed JSON, non-object body, or field errors in `fields: { [field]: message }` |
| 403    | `REGISTRATION_DISABLED`  | `PB_REGISTRATION_ENABLED` is not `true` (checked before the body is read)          |
| 409    | `EMAIL_TAKEN`            | An account already uses the email (case-insensitive)                               |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` is not `application/json`                                           |
| 500    | `INTERNAL_ERROR`         | Unexpected failure; details are logged server-side only                            |

When verification is enabled, the route sends the verification email. If sending fails the account is still created (logged server-side); the client can resend with `request-verification`. The response does not include a token: sign in with the native login afterwards.

### `POST /api/v1/auth/guest`

Creates a guest account ("continue as guest"). No body is required. Optionally send `Content-Type: application/json` with `{ "locale": "en" | "ar" }` (max 4 KiB) to localize the default name.

The guest gets a random unguessable email `guest-<24 lowercase letters/digits>@guest.invalid` (a reserved domain that never receives mail), a random password nobody knows, `name` `"Guest"` (`"ضيف"` for `ar`), `verified: true` so the verification gate never blocks it, and `guest: true`.

`200`: PocketBase's standard auth response, the same shape as `auth-with-password`:

```json
{
  "token": "eyJhbGciOi...",
  "record": {
    "id": "7sfmb5mfcd4zzur",
    "email": "guest-ejb1r26sf2ufi8ogle8axiqf@guest.invalid",
    "emailVisibility": false,
    "name": "Guest",
    "locale": "",
    "verified": true,
    "guest": true,
    "avatar": "",
    "created": "2026-10-18 16:49:29.885Z",
    "updated": "2026-10-18 16:49:29.885Z",
    "collectionId": "_pb_users_auth_",
    "collectionName": "users"
  }
}
```

| Status | `code`                   | When                                                       |
| ------ | ------------------------ | ---------------------------------------------------------- |
| 400    | `INVALID_INPUT`          | Malformed JSON, non-object body, or unsupported `locale`   |
| 403    | `GUEST_DISABLED`         | `PB_GUEST_ENABLED` is not `true` (checked before the body) |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | A `Content-Type` other than `application/json` is sent     |
| 500    | `INTERNAL_ERROR`         | Unexpected failure; details are logged server-side only    |

The guest token behaves like any user token (7 days, `auth-refresh` works), but the account and its notes are deleted `guestTtlHours` after creation unless upgraded. To end a guest session, delete the account with the native `DELETE /api/collections/users/records/{id}` (own record; notes cascade).

### `POST /api/v1/auth/guest/upgrade`

Converts the authenticated guest into a regular account **in place**: same `id`, notes kept. Send the guest token in `Authorization` and a `Content-Type: application/json` body (max 16 KiB) with exactly the register fields and validation (`name`, `email`, `password`, optional `locale`; omitting `locale` keeps the guest's).

The account receives the new email and password, `guest: false`, and `verified: false`. The password change rotates the token key, so the guest token stops working.

- Verification not required: `200` with a fresh standard auth response `{ token, record }`.
- `PB_REQUIRE_EMAIL_VERIFICATION=true`: `202` with the user DTO (the register `201` shape, no token) and a verification email is sent. The user verifies, then signs in natively.

| Status | `code`                   | When                                                                       |
| ------ | ------------------------ | -------------------------------------------------------------------------- |
| 400    | `INVALID_INPUT`          | Malformed JSON, non-object body, or field errors in `fields`               |
| 401    | `AUTH_REQUIRED`          | No valid auth token                                                        |
| 403    | `NOT_GUEST`              | The token belongs to a regular user or a superuser                         |
| 403    | `REGISTRATION_DISABLED`  | `PB_REGISTRATION_ENABLED` is not `true` (upgrading creates a real account) |
| 409    | `EMAIL_TAKEN`            | Another account uses the email (case-insensitive)                          |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` is not `application/json`                                   |
| 500    | `INTERNAL_ERROR`         | Unexpected failure; details are logged server-side only                    |

Checks run in that order: authentication, guest status, registration flag, content type and input, duplicates.

### Guest rules

- Guests cannot change `guest`, `email`, or `password` through the record API (`400`), and `request-email-change` returns `403`; they upgrade instead. Only superusers and the guest routes change `guest`.
- No email is ever sent to a guest address: verification, password reset, email change, and login alert emails are dropped.
- The hourly cron job `guestCleanup` (minute 0) deletes guests older than `PB_GUEST_TTL_HOURS` with their notes and logs the count. It also runs when `PB_GUEST_ENABLED=false`, so existing guests still expire. Upgraded accounts are never removed.

## Native PocketBase APIs used by clients

Native errors use PocketBase's shape: `{ "status": 400, "message": "...", "data": { "field": { "code": "...", "message": "..." } } }`.

| Purpose                | Request                                                                                     | Notes                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Sign in                | `POST /api/collections/users/auth-with-password` `{ identity, password }`                   | `200 { token, record }`. Wrong credentials `400`. Unverified while verification is required `403`.      |
| Refresh                | `POST /api/collections/users/auth-refresh` (auth)                                           | `200 { token, record }`. Same `403` rule for unverified users.                                          |
| Current profile        | `GET /api/collections/users/records/{id}` (auth)                                            | Own record only; others `404`.                                                                          |
| Update profile         | `PATCH /api/collections/users/records/{id}` `{ name?, locale?, avatar? }` (auth)            | `locale` is `"en"`, `"ar"`, or `""`. `verified`, `email`, and `guest` changes are rejected with `400`.  |
| Change password        | `PATCH /api/collections/users/records/{id}` `{ oldPassword, password, passwordConfirm }`    | Rotates the token key: every existing token for that user stops working; sign in again. Not for guests. |
| Delete account         | `DELETE /api/collections/users/records/{id}` (auth)                                         | `204`. Own record only, guests included. The user's notes are cascade-deleted.                          |
| Request password reset | `POST /api/collections/users/request-password-reset` `{ email }`                            | Always `204` (no account enumeration). Email links to `{PB_APP_URL}/reset-password?token=...`.          |
| Confirm password reset | `POST /api/collections/users/confirm-password-reset` `{ token, password, passwordConfirm }` | `204`. Token lifetime 30 minutes.                                                                       |
| Request verification   | `POST /api/collections/users/request-verification` `{ email }`                              | Always `204`. Email links to `{PB_APP_URL}/verify-email?token=...`.                                     |
| Confirm verification   | `POST /api/collections/users/confirm-verification` `{ token }`                              | `204`. Token lifetime 24 hours.                                                                         |

Auth tokens last 7 days (`authToken.duration = 604800`). OTP and MFA are disabled. Login alerts for new locations are enabled and sent when SMTP is configured.

User record fields: `id`, `email`, `emailVisibility`, `verified`, `name`, `locale`, `guest`, `avatar`, `created`, `updated`, `collectionId`, `collectionName`. Accounts created before the guest and locale migrations have `locale: ""` and `guest: false`. Native timestamps use `"YYYY-MM-DD HH:MM:SS.sssZ"` (UTC).

`avatar` is an optional single file (multipart `PATCH`): JPEG, PNG, WebP, or GIF up to 2 MiB; SVG is rejected. Files are served by `GET /api/files/users/{id}/{filename}` without a file token, so only expose them through the gateway if the product shows avatars.

Realtime subscriptions (`/api/realtime`) are evaluated with the same list/view rules, so a client only receives events for its own user record and notes.

### Notes

`notes` records: `{ id, owner, title (1–160), body (≤ 20000), archived (bool), created, updated }`. All rules are owner-scoped; other users' notes return `404` or are absent from lists.

| Purpose | Request                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------ |
| List    | `GET /api/collections/notes/records?page=1&perPage=20&sort=-updated&filter=...`                  |
| View    | `GET /api/collections/notes/records/{id}`                                                        |
| Create  | `POST /api/collections/notes/records` `{ owner: <auth user id>, title, body?, archived? }`       |
| Update  | `PATCH /api/collections/notes/records/{id}` `{ title?, body?, archived? }` (owner cannot change) |
| Delete  | `DELETE /api/collections/notes/records/{id}` → `204`                                             |

Filter examples (build them with the SDK's `pb.filter()` to escape user input):

- Active notes: `archived = false`
- Search: `(title ~ "milk" || body ~ "milk")` (case-insensitive substring)
- Both: `archived = false && (title ~ {:q} || body ~ {:q})`

The `(owner, archived, updated)` index serves owner-scoped lists filtered by `archived` and sorted by `updated`. Substring search scans only the rows that index narrows to; add a full-text strategy if notes grow large.

## Email links

Emails use `{APP_URL}`, which the backend sets from `PB_APP_URL` at every start (the frontend origin, no trailing slash):

| Email          | Link                                                                       |
| -------------- | -------------------------------------------------------------------------- |
| Verification   | `{PB_APP_URL}/verify-email?token={TOKEN}`                                  |
| Password reset | `{PB_APP_URL}/reset-password?token={TOKEN}`                                |
| Email change   | `{PB_APP_URL}/confirm-email-change?token={TOKEN}` (not part of v1 clients) |

The frontend pages call `confirm-verification` or `confirm-password-reset` with the token.

`{APP_NAME}` comes from `PB_APP_NAME` when set. Emails follow the recipient's `locale`: English or no locale uses the collection templates from the migrations; `ar` uses right-to-left Arabic templates from `pb_hooks/modules/mail/auth-email.cjs`, including the login alert. Links and token lifetimes are identical in both languages.

## Rate limits

PocketBase's built-in limiter is enabled per client IP (fixed windows). Exceeding a limit returns PocketBase's native `429 { status, message, data }`; treat any `429` as rate limited. Superuser requests are not limited.

| Label                             | Limit             |
| --------------------------------- | ----------------- |
| `POST /api/v1/auth/register`      | 5 per 15 minutes  |
| `POST /api/v1/auth/guest`         | 10 per hour       |
| `POST /api/v1/auth/guest/upgrade` | 5 per 15 minutes  |
| `*:auth` (password login)         | 10 per minute     |
| `*:authRefresh`                   | 30 per minute     |
| `*:requestPasswordReset`          | 3 per 15 minutes  |
| `*:confirmPasswordReset`          | 10 per 15 minutes |
| `*:requestVerification`           | 3 per 15 minutes  |
| `*:confirmVerification`           | 10 per 15 minutes |
| `*:requestEmailChange`            | 3 per 15 minutes  |
| `*:confirmEmailChange`            | 10 per 15 minutes |
| `*:requestOTP`                    | 3 per 15 minutes  |
| `*:create` (record creation)      | 30 per minute     |
| `/api/batch`                      | 3 per second      |
| `/api/` (everything else)         | 300 per 10 s      |

Adjust them in the dashboard or with a new forward migration.

## Verification

Start this backend, start the frontend with `POCKETBASE_URL` pointing here, and run from the frontend wrapper:

```powershell
corepack yarn integration:check
```

`corepack yarn test:runtime` in this repository exercises the routes and rules above against a disposable database.
