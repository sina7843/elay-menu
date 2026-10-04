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
| 403 | `MENU_CLOSED` | Customer search/popularity while the super admin has closed the menu |
| 404 | `NOT_FOUND` | Unknown route or resource |
| 409 | `CONFLICT` | Deleting a category that has foods; username taken; "+" on a sold-out food |
| 409 | `STALL_CLOSED` | "+" on a food of a closed stall |
| 413 / 415 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | JSON over 64 KB or upload over 5 MB / unsupported upload type |
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
- Rate limits: 300 requests/min per IP overall; login `LOGIN_RATE_LIMIT_PER_15M` (default 10) per IP+username
  per 15 min; change-password 10 per 15 min; popularity 60 per minute per IP. Counters are in memory (single API instance).
- Authorization is enforced server-side only: `requireAccount`, `requireRole`, `requireStallAccess`
  in `apps/api/src/auth/guards.ts`. Stall ownership comes from the account record, never from the client.
- Session invalidation primitives (`apps/api/src/auth/sessions.ts`): password change revokes all other
  sessions; `resetToTemporaryPassword` (shown once, never logged) and `deleteAccount` revoke all sessions.

## Endpoints

Schemas named below live in `packages/shared/src/schemas.ts`. "CSRF" = every state-changing admin
request also needs `x-csrf-token`. Lists come in display order (`sortOrder`).

### Health and auth

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/health/live` | none | — | `{ "status": "ok" }` |
| GET | `/health/ready` | none | — | `{ "status": "ready", "db": "ok" }` or 503 |
| POST | `/api/auth/login` | none (origin-checked, rate-limited) | `LoginInputSchema` | `SessionResponse` `{ account, csrfToken }` + cookie |
| POST | `/api/auth/logout` | session + CSRF | — | 204 |
| GET | `/api/auth/me` | session | — | `SessionResponse` |
| POST | `/api/auth/change-password` | session + CSRF | `ChangePasswordInputSchema` (new ≠ current) | 204; other sessions revoked |

`account` is `{ id, username, role: "stall_admin" | "super_admin", stallId | null }`.

### Customer (public, no auth)

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/public/menu` | — | `PublicMenuSchema`: foodcourt; categories (+`foodCount`); visible stalls (+`isOpen`, `opensAt`, `closesAt`, `foodCount`); stall categories; foods (+`finalPrice`, `discountPercent`); `dealIds`; `popularIds`; `generatedAt`. Menu closed → only `foodcourt`, every list empty. |
| GET | `/api/public/search` | `SearchQuerySchema`: `q`, `stallId`, `categoryId`, `onlyOpen`, `onlyDiscounted`, `minPrice`/`maxPrice` (inclusive, on `finalPrice`), `sort=default\|cheapest\|priciest\|popular` | `PublicSearchResponseSchema` `{ stalls, foods }` (stalls only when `q` is set). 403 `MENU_CLOSED`. |
| POST | `/api/public/popularity` | `PopularityEventSchema` `{ foodId }`, one call per successful "+" (add or increment) | 204; 404 hidden/unknown; 409 sold out; 409 `STALL_CLOSED`; 403 `MENU_CLOSED`; 429 over 60/min |
| GET | `/api/media/:name` | — | image bytes (`nosniff`, sandboxing CSP) |

Rules applied on the server: stalls that are invisible, being deleted or have no foods are omitted with
their foods and stall categories. Sold-out foods stay in `foods` and search results but never in
`dealIds`/`popularIds`. A deal is active when `startDate ≤ today ≤ endDate` in Tehran local dates (whole last
day included). `popularIds`: up to five available foods with most "+" over today and the six previous Tehran
dates, ties by ascending food id, zero-count foods unranked. Search requires every query token to occur in
food name + description + stall name + category name, after unifying ی/ي/ى and ک/ك and removing ZWNJ,
diacritics and spaces, digits mapped to ASCII (`normalizeFa`/`matchesTokens` in shared, reusable offline).
Customer order lists, quantities and identities are never sent.

### Stall-scoped admin (owning stall admin, or super admin)

Paths are relative to `/api/admin/stalls/:stallId`. Another stall's id → 403; another stall's child ids
under one's own stall path → 404.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | (the stall) | — | `AdminStallSchema` (status incl. `opensAt`/`closesAt`, override, `foodCount`, `adminUsername`) |
| PUT | `/profile` | `StallProfileInputSchema` `{ intro, weeklyHours }` | `AdminStall`; an active override is re-anchored to the new hours |
| PUT | `/manual-status` | `ManualStatusInputSchema` `{ isOpen }` | `AdminStall`. Differs from schedule → override until the next scheduled opening start (`null` if none); same as schedule → override cleared |
| GET / POST | `/categories` | `StallCategoryInputSchema` `{ name }` | `AdminStallCategorySchema[]` / 201 |
| PUT | `/categories/order` | `ReorderInputSchema` `{ ids }` (exactly all ids) | `{ ok: true }` |
| PATCH / DELETE | `/categories/:id` | `{ name }` / — | `AdminStallCategory` / 204; 409 when it has foods |
| GET / POST | `/foods` | `FoodInputSchema` | `AdminFoodSchema[]` / 201 |
| GET / PUT / DELETE | `/foods/:id` | `FoodInputSchema` (full replace) | `AdminFood` / `AdminFood` / 204 |
| PUT | `/foods/:id/availability` | `AvailabilityInputSchema` `{ available }` | `AdminFood` |
| POST | `/media/food-image` | raw body, `Content-Type: image/png\|image/jpeg\|image/webp` | 201 `{ name, url }` |

Food validation: `categoryId` must exist; `stallCategoryId` must belong to this stall; `image` must be
unchanged or a food upload owned by this stall. Discount: integer percent 1–90, `startDate ≤ endDate` (ISO
dates; the UI converts with `toJalali`/`fromJalali` from shared). Discounted price =
`round(price × (100 − percent) / 100 / 1000) × 1000` (`discountedPrice`).

### Foodcourt categories

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/categories` | any admin (CategoryPicker) | — | `AdminCategorySchema[]` (+`foodCount`) |
| POST | `/api/admin/categories` | super admin | `GlobalCategoryInputSchema` `{ name, icon }` | 201 |
| PUT | `/api/admin/categories/order` | super admin | `{ ids }` | `{ ok: true }` |
| PATCH / DELETE | `/api/admin/categories/:id` | super admin | `{ name, icon }` / — | `AdminCategory` / 204; 409 when used |

### Super admin

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/admin/stalls` | — | `AdminStall[]` |
| POST | `/api/admin/stalls` | `StallCreateInputSchema` `{ name, logo, visible, adminUsername }` | 201 `{ stall, credentials: { username, temporaryPassword } }`; the password is returned only here; 409 username taken (no stall left behind) |
| PUT | `/api/admin/stalls/order` | `{ ids }` | `{ ok: true }` |
| PATCH | `/api/admin/stalls/:stallId` | `StallUpdateInputSchema` `{ name, logo, visible }` | `AdminStall` |
| DELETE | `/api/admin/stalls/:stallId` | — | 204 (cascade below) |
| PUT | `/api/admin/stalls/:stallId/account` | `{ username }` | `{ username }`; 409 taken |
| POST | `/api/admin/stalls/:stallId/account/reset-password` | — | `TemporaryPasswordResponseSchema`; old password and all sessions invalid at once |
| GET / PUT | `/api/admin/foodcourt` | `FoodcourtInputSchema` `{ name, logo, menuOpen, closedMessage }` | `AdminFoodcourtSchema`; `publicMenuUrl` comes from `PUBLIC_MENU_URL`, read-only, `null` when unset |
| POST | `/api/admin/media/stall-logo`, `/api/admin/media/foodcourt-logo` | raw body `image/png` or `image/svg+xml` | 201 `{ name, url }` |

Stall deletion (`apps/api/src/admin/delete-stall.ts`): mark the stall `deleting` (invisible everywhere at
once) → delete manager account and sessions → counters, foods, stall categories → the stall → release media
nothing references. Every step is idempotent; a failed DELETE is completed by repeating it, and API start
resumes any stall left `deleting`.

### Media pipeline

Uploads are the raw image body (no multipart), ≤ 5 MB, authenticated and ownership-checked. sharp decodes
the real bytes (declared type must match); images must be square (±1 %), food ≥ 256 px, logos ≥ 128 px. The
output is re-encoded with metadata stripped under a random name: food → WebP ≤ 1024 px with transparency,
logos → PNG ≤ 512 px. SVG logos containing DOCTYPE/entities, scripts, event handlers, `javascript:`,
embedded/foreign content or any non-fragment `href`/`url()` are rejected; accepted ones are rasterised to
PNG, so no uploaded SVG is ever served. Replaced/deleted images are removed once no food, stall or
foodcourt references them; never-attached uploads are swept after 24 h (at start and every 6 h).

## Data model

Collections: `foodcourt` (singleton `_id: "foodcourt"`), `stalls`, `accounts`, `sessions`, `categories`
(foodcourt-wide), `stallCategories`, `foods`, `popularityCounters` (anonymous `{ foodId, day, count }`, 30-day TTL),
`media` (upload kind and owner), `migrations`. There is deliberately no cart, order or payment collection: the order list lives only in
the customer's `localStorage`.

Weekly hours: exactly seven `{ closed, open: "HH:MM", close: "HH:MM" | "24:00" }`, index 0 = Saturday.
`close < open` means the interval runs past midnight. Manual override: `{ state: "open" | "closed", until }`
where `until` is the next scheduled opening start, or `null` when none exists.

Migrations (`apps/api/src/db.ts`) run on API start and are recorded in `migrations`; they create all
indexes (unique username, one stall admin per stall, unique session token hash, TTL on sessions and
counters, unique `(foodId, day)` counter) and the foodcourt singleton.
