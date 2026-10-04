# Elay Menu API contract

Base path: `/api` (served on the same origin as the web app; nginx proxies `/api/` to the API container).
Health endpoints are on the API itself (`/health/*`) and are not proxied.

All request and response bodies are JSON. Schemas are defined once in `packages/shared/src/schemas.ts`
(zod, strict: unknown fields are rejected). Money is an integer number of **Toman**. Dates are Tehran
local calendar dates as ISO `YYYY-MM-DD`; the UI converts to and from Jalali.

## Error format

Every non-2xx response has this body (`ApiErrorSchema`):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "اطلاعات واردشده درست نیست.", "details": [{ "path": "newPassword", "message": "..." }] } }
```

`message` is Persian, safe to show to users. `details` appears only for field validation errors.
Stack traces and internal values are never returned.

| Status | code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Malformed body, unknown fields, invalid ids, wrong current password |
| 401 | `UNAUTHENTICATED` | No session, expired or revoked session |
| 401 | `INVALID_CREDENTIALS` | Login failed (same response for unknown user and wrong password) |
| 403 | `FORBIDDEN` | Wrong role, or a stall admin addressing another stall |
| 403 | `CSRF_FAILED` | Cross-origin state-changing request, or missing/wrong `x-csrf-token` |
| 404 | `NOT_FOUND` | Unknown route or resource |
| 409 | `CONFLICT` | Reserved for DRAGON-01 (for example deleting a category that has foods) |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | Body over 64 KB / unsupported content type |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected failure (logged server-side) |
| 503 | — | `/health/ready` only, when MongoDB is unreachable |

## Security model

- Session: opaque random token in cookie `elay_sid` (`HttpOnly`, `SameSite=Strict`, `Secure` unless
  `COOKIE_SECURE=false`, `Path=/api`). Only its SHA-256 is stored. Default lifetime 12 h (`SESSION_TTL_HOURS`),
  removed by a MongoDB TTL index after expiry.
- CSRF: every POST/PUT/PATCH/DELETE is rejected when the `Origin` host differs from the request host or
  `Sec-Fetch-Site` is `cross-site`. Authenticated state-changing requests must also send the session's
  CSRF token in `x-csrf-token` (returned by login and `/api/auth/me`).
- Passwords: scrypt (Node `crypto`, N=2^15, r=8, p=1, 16-byte salt). Policy for new passwords: at least
  8 characters, at least one letter and one digit. Hashes are never returned or logged.
- Rate limits: 300 requests/min per IP overall; login `LOGIN_RATE_LIMIT_PER_15M` (default 10) per IP per
  15 min; change-password 10 per 15 min. Counters are in memory (single API instance).
- Authorization is enforced server-side only: `requireAccount`, `requireRole`, `requireStallAccess`
  in `apps/api/src/auth/guards.ts`. Stall ownership comes from the account record, never from the client.
- Session invalidation primitives (`apps/api/src/auth/sessions.ts`): password change revokes all other
  sessions; `resetToTemporaryPassword` (shown once, never logged) and `deleteAccount` revoke all sessions.

## Implemented endpoints (DRAGON-00)

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/health/live` | none | — | `{ "status": "ok" }` |
| GET | `/health/ready` | none | — | `{ "status": "ready", "db": "ok" }` or 503 |
| POST | `/api/auth/login` | none (origin-checked, rate-limited) | `LoginInputSchema` `{ username, password }` | `SessionResponse` `{ account, csrfToken }` + cookie |
| POST | `/api/auth/logout` | session + CSRF | — | 204, cookie cleared, session deleted |
| GET | `/api/auth/me` | session | — | `SessionResponse` |
| POST | `/api/auth/change-password` | session + CSRF | `ChangePasswordInputSchema` `{ currentPassword, newPassword, confirmPassword }` | 204; other sessions revoked |
| GET | `/api/admin/stalls/:stallId` | super admin, or the owning stall admin | — | `AdminStallSchema` |
| GET | `/api/admin/foodcourt` | super admin | — | `AdminFoodcourtSchema` (includes read-only `publicMenuUrl`, `null` when unconfigured) |
| GET | `/api/media/:name` | none | — | image bytes (`nosniff`, sandboxing CSP) |

`account` is `{ id, username, role: "stall_admin" | "super_admin", stallId | null }`.

## Planned (DRAGON-01, not implemented yet)

Public menu read endpoints returning `PublicFoodcourt`, `PublicStall`, `PublicCategory`,
`PublicStallCategory`, `PublicFood`; the anonymous popularity increment (`PopularityEventSchema`);
stall-scoped food/category/hours CRUD; super-admin stall/account/category/settings management; uploads.
This section is to be replaced with the real contract when DRAGON-01 lands.

## Data model

Collections: `foodcourt` (singleton `_id: "foodcourt"`), `stalls`, `accounts`, `sessions`, `categories`
(foodcourt-wide), `stallCategories`, `foods`, `popularityCounters` (anonymous `{ foodId, day, count }`),
`migrations`. There is deliberately no cart, order or payment collection: the order list lives only in
the customer's `localStorage`.

Weekly hours: exactly seven `{ closed, open: "HH:MM", close: "HH:MM" | "24:00" }`, index 0 = Saturday.
`close < open` means the interval runs past midnight. Manual override: `{ state: "open" | "closed", until }`
where `until` is the next scheduled opening start, or `null` when none exists.

Migrations (`apps/api/src/db.ts`) run on API start and are recorded in `migrations`; they create all
indexes (unique username, one stall admin per stall, unique session token hash, TTL on sessions and
counters, unique `(foodId, day)` counter) and the foodcourt singleton.
