# Backend API

Express service for **post-quantum file sharing**: drop links (`boxes`), encrypted file metadata (`files`), and **Supabase Storage** signed URLs. Data lives in **Supabase** (Postgres + Storage). This server uses the **Supabase service role** key — it bypasses RLS, so **authorization must be enforced in route handlers** (`app.ts`) and helpers (`sb_utils.ts`).

---

## Configuration

Loaded via `dotenv` in `.endpoints.config.ts` (imported from `sb_utils.ts`).

### Required

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only client. **Never** expose in browsers or frontend bundles. |

### Strongly recommended for production

| Variable | Purpose |
|----------|---------|
| `FRONTEND_URL` | Public origin of the SPA **without trailing slash** (e.g. `https://app.example.com`). Used for `shareURL` in `POST /boxes` and dashboard links. |
| `PORT` | Listen port (set automatically on **Railway** / many PaaS). Locally defaults to **3001** in `server.ts` if unset. |
| `TRUST_PROXY=1` | Sets Express `trust proxy` so **`req.ip`** is correct behind nginx / Railway / etc. **Needed for meaningful upload rate limits.** |

### CORS (`corsOptions.ts`)

The API no longer reflects **every** `Origin`. Allowed browser origins are built as follows:

| Variable | Purpose |
|----------|---------|
| **`CORS_ORIGINS`** | Optional. Comma-separated list of allowed origins (e.g. `https://app.vercel.app,https://www.example.com`). **Trailing slashes are normalized.** If set, these origins are allowed **plus** `http://localhost:5173` and `http://127.0.0.1:5173` (Vite dev). |
| **`FRONTEND_URL`** | If **`CORS_ORIGINS`** is unset, this origin is **added** to the allowlist (same value as for share links). **`http://localhost:5173`** and **`http://127.0.0.1:5173`** are always added as well. |
| **`NODE_ENV`** | When **not** `production`, additional local origins are allowed (ports 3000, 4173, etc.). |
| **`CORS_ALLOW_VERCEL_PREVIEWS=1`** | If set, requests whose `Origin` is **`*.vercel.app`** are allowed (optional for preview deployments). Slightly broader trust — use only if you want preview URLs to hit production API. |

Requests **without** an `Origin` header (curl, server-to-server, some tools) are still allowed.

**Production checklist:** Set **`FRONTEND_URL`** to your real SPA URL, or set **`CORS_ORIGINS`** explicitly if you have several frontends (e.g. `www` + apex). The deployed SPA’s origin must **exactly** match one allowed URL (scheme + host + port). Local Vite (`http://localhost:5173`) is always allowed.

---

### Optional — JWT verification

| Variable | Purpose |
|----------|---------|
| `SUPABASE_JWT_SECRET` | Legacy **HS256** JWT secret. New projects often use **ES256** signing keys; those are verified via **JWKS** at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` without this variable. If local verify fails, the API falls back to `auth.getUser`. |

### Optional — upload rate limits (`POST /boxes/:id/uploads`)

Implemented in `rateLimits.ts`. Disabled when `RATE_LIMIT_DISABLED=true` or `1` (debug only).

| Variable | Default | Purpose |
|----------|---------|---------|
| `UPLOAD_REGISTER_WINDOW_MS` | `900000` (15 min) | Sliding window length. |
| `UPLOAD_REGISTER_MAX_PER_IP` | `60` | Max registration + presign requests per IP per window. |
| `UPLOAD_REGISTER_MAX_PER_BOX` | `200` | Max per `boxes.id` per window (all IPs). |

Responses use **`429`** with `{ "error": "rate_limited" }`. Standard rate-limit headers apply on the per-IP limiter.

---

## Run locally

```bash
npm install
npm run dev   # or npm start
```

Listens on **`process.env.PORT` or 3001**. CORS uses **`corsOptions.ts`** (allowlist; see [CORS](#cors-corsoptionsts) above).

---

## Security model (summary)

- **Owner routes** (`/me/...`, `POST /boxes`, `PATCH /files/:id/confirm`) require **`Authorization: Bearer <Supabase access token>`**; `sub` is the user id.
- **`POST /boxes`** ignores any client-supplied user id — the box is created for the authenticated user only. Slug and public key are validated (`uploadValidation.ts`).
- **Anonymous upload registration** `POST /boxes/:id/uploads` does not use Bearer auth; **`s3_key`** must match **`{ownerId}/{slug}/{uuid_v4}_{safeLeaf}`** for that box (see `uploadValidation.ts`). Rate limits apply.
- **`PATCH /files/:id/confirm`** is **owner-only** (`confirmFileIfOwned`); anonymous uploaders do not finalize — the owner uses the dashboard **Finalize** action after ciphertext is in Storage.

---

## API overview

- **JSON** bodies: `Content-Type: application/json`.
- **Dashboard auth**: `Authorization: Bearer` — same access token as `supabase.auth.getSession()` in the web app.

### Common errors

| Status | Body | When |
|--------|------|------|
| `401` | `{ "error": "unauthorized" }` | Missing/invalid Bearer token on protected routes. |
| `403` | `{ "error": "forbidden" }` | Authenticated but not the box owner. |
| `404` | `{ "error": "not_found" }` | Missing resource or confirm denied (opaque). |
| `409` | `{ "error": "not_ready" }` | Download requested while file not `ACTIVE`. |
| `409` | `{ "error": "profile_missing" }` | No `public.users` row for the auth user (`POST /boxes`). |
| `400` | `{ "error": "invalid_…" }` | Bad slug, key, `s3_key`, sizes, etc. |
| `429` | `{ "error": "rate_limited" }` | Upload registration rate limit. |
| `500` | `{ "error": "internal_server_error" }` | Unhandled failure. |

---

## Endpoints

### `PATCH /me/username` (authenticated)

Sets the signed-in user’s **`public.users.username`** (same validation as box slugs: 3–48 chars, `^[a-z0-9]+(-[a-z0-9]+)*$`). Existing share URLs that used the old handle will no longer resolve.

| | |
|---|---|
| **Headers** | `Authorization: Bearer` |
| **Body** | `{ "username": string }` |
| **200** | `{ "username": string }` |
| **400** | `invalid_username` |
| **409** | `profile_missing` (no `public.users` row) or `username_taken` |

---

### `GET /me/boxes` (authenticated)

Lists boxes for the signed-in user and builds share URLs when `username` exists.

| | |
|---|---|
| **Headers** | `Authorization: Bearer <access_token>` |
| **200** | `{ "username": string \| null, "boxes": [ { id, slug, is_active, expires_at, created_at, updated_at, shareURL } ] }` — `shareURL` is `${FRONTEND_URL}/drop/${username}/${slug}` when `username` is set. |

---

### `GET /me/boxes/:boxId/files` (authenticated)

Lists files for a box (no `nonce` / `kem_ciphertext` / `s3_key` in list).

| | |
|---|---|
| **Headers** | `Authorization: Bearer` |
| **200** | `{ "files": [ … ] }` |
| **403** / **404** | Not owner / unknown box |

---

### `GET /me/files/:fileId/download` (authenticated)

Returns a short-lived **download** signed URL plus KEM metadata for owner-side decrypt in the browser.

| | |
|---|---|
| **Headers** | `Authorization: Bearer` |
| **200** | `{ signedUrl, encrypted_name, nonce, kem_ciphertext, content_type }` |
| **404** | Not found or not owned |
| **409** | `not_ready` if status ≠ `ACTIVE` |

---

### `GET /boxes/check/:username/:slug` (public)

Whether **`username` + `slug`** is already taken for that user (same pairing as **`/drop/:username/:slug`**).

| | |
|---|---|
| **200** | `{ "isAvailable": boolean }` |

---

### `POST /boxes` (authenticated)

Creates a box for the **token user** (no `userId` in body).

| | |
|---|---|
| **Headers** | `Authorization: Bearer` |
| **Body** | `{ "slug": string, "publicKey": string }` |
| **200** | `{ "shareURL": string }` |
| **400** | `invalid_slug` / `invalid_public_key` |
| **409** | `profile_missing` |

---

### `GET /boxes/:username/:slug` (public)

Uploader handshake: **public key**, **box id**, **owner id** for storage paths and crypto.

| | |
|---|---|
| **200** | `{ "publicKey", "boxId", "ownerId" }` |
| **404** | Unknown user or box |

---

### `POST /boxes/:id/uploads` (public, rate-limited)

Registers a **`files`** row and returns a **signed upload URL** for Storage.

| | |
|---|---|
| **Path** | `id` = `boxes.id` (UUID) |
| **Body** | `encryptedName`, `contentType`, `byteSizeBytes`, `s3Key`, `nonce`, `kemCiphertext` |
| **200** | `{ "uploadURL", "fileId" }` |
| **404** | Unknown box id |
| **400** | Invalid fields or **`s3_key`** not allowed for that box |
| **429** | Rate limited |

---

### `PATCH /files/:id/confirm` (authenticated, owner-only)

Sets file status to **`ACTIVE`** only if the caller owns the box containing the file.

| | |
|---|---|
| **Headers** | `Authorization: Bearer` |
| **200** | `{ "success": true }` |
| **404** | Not found or not owner |

---

## Data layer

Logic is in **`sb_utils.ts`** (tables: `users`, `boxes`, `files`; bucket **`secure-drop-bucket`**). Column reference comments are at the bottom of that file.

### Auth → `public.users`

New Auth users should get a matching **`public.users`** row (`id` = `auth.users.id`). Migration:

- `supabase/migrations/20250321180000_sync_public_users_on_auth_user.sql`

Apply with Supabase CLI (`supabase db push`) or run the SQL in the Dashboard.

**Accounts created before the migration** may need a one-time backfill, for example:

```sql
INSERT INTO public.users (id, username, public_key, created_at, updated_at)
SELECT
  au.id,
  'user_' || replace(au.id::text, '-', ''),
  '',
  now(),
  now()
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = au.id)
ON CONFLICT (id) DO NOTHING;
```

Adjust `username` / `public_key` rules to match your product.

### Database constraint note

The app treats **slug as unique per owner** (`user_id`, `slug`). If your database still has **`UNIQUE (slug)`** globally, align the schema with **`UNIQUE (user_id, slug)`** (and drop the global slug unique if present) so behavior matches the API and slug checks.

---

## Tests

| Command | Description |
|---------|-------------|
| `npm test` | Unit tests (`app.test.ts`), mocked `sb_utils` — no network. |
| `npm run test:integration` | Real Supabase; requires **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`**. Optional **`SUPABASE_ANON_KEY`** for HTTP tests that obtain a user JWT (`getUserAccessToken`). |

---

## Project files

| File | Role |
|------|------|
| `app.ts` | Routes, validation, rate limit wiring, error handler. |
| `server.ts` | `listen(PORT)`. |
| `authMiddleware.ts` | `requireAuth` → `req.userId`. |
| `sb_utils.ts` | Supabase DB + Storage + JWT verification. |
| `uploadValidation.ts` | Slug, public key, upload body, `s3_key` rules. |
| `rateLimits.ts` | Upload registration rate limits. |
| `corsOptions.ts` | CORS allowlist for browser `Origin`s. |
| `.endpoints.config.ts` | Env for Supabase URL + service role. |
| `express.d.ts` | `Request.userId` typing. |
| `integration/` | DB helpers for integration tests. |
