# Backend API

Express service for **post-quantum file sharing**: box (drop link) lifecycle, encrypted file metadata, and Supabase Storage signed upload URLs. Data lives in **Supabase** (Postgres + Storage); this server uses the **Supabase service role** key (see [Configuration](#configuration)).

---

## Configuration

Environment variables are loaded via `dotenv` (see `.endpoints.config.ts`).

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-side Supabase client. **Bypasses Row Level Security** — public routes still rely on app logic; dashboard routes validate **Supabase access tokens** (`verifyAccessToken` / `requireAuth`). Never expose in browsers or client bundles. |
| `SUPABASE_JWT_SECRET` | Optional (legacy) | Symmetric **JWT Secret** for **HS256** tokens only. New projects often use **JWT signing keys (ES256)** instead; those are verified via **JWKS** at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` automatically — **no env var needed**. If HS256 verify fails or this is unset, the API falls back to `auth.getUser`. |
| `FRONTEND_URL` | For share links | Base URL used when building `shareURL` in `POST /boxes` (no trailing slash expected in paths below). |

Optional: `.env.test` for overrides during tests.

---

## Run locally

Install dependencies:

```bash
npm install
```

Run the HTTP server (default port **3001**):

```bash
npm run dev
# or: npm start
```

`server.ts` loads `app.ts` and listens on `PORT` or `3001`. **CORS** is enabled for browser clients (`cors` with reflected origin).

Point `FRONTEND_URL` at your web app (e.g. `http://localhost:5173` for Vite) when building share links.

**`ERR_CONNECTION_REFUSED` on localhost** means the dev server for that port is not running. The **dashboard and upload pages** are served by **Vite** (usually **5173**), not by this API (**3001**). From the **repository root**, run `npm install` and `npm run dev` to start API + Vite together (see the root `README.md`).

The **Vite** dev server can proxy **`/me`**, **`/boxes`**, and **`/files`** to this API when `VITE_API_URL` is unset; see `frontend/vite.config.ts` and `frontend/.env.example`.

---

## API overview

- **Base path**: all routes below are **root-relative** (e.g. `GET /boxes/check/:slug`).
- **Content type**: JSON for bodies; use `Content-Type: application/json` on `POST`/`PATCH`.
- **Dashboard auth**: Send **`Authorization: Bearer <Supabase access token>`** (same JWT as `supabase.auth.getSession()` on the web app). The server resolves the user with `supabase.auth.getUser(token)` and uses that UUID as `public.users.id` / `boxes.user_id`.
- **Errors**:
  - **`401`** `{ "error": "unauthorized" }` — missing/invalid Bearer token (dashboard routes).
  - **`403`** `{ "error": "forbidden" }` — valid user but not the owner of the requested box.
  - **`404`** `{ "error": "not_found" }` — box id does not exist (dashboard file list).
  - **`500`** `{ "error": "internal_server_error" }` — unhandled failures.

---

## Endpoints

### `GET /me/boxes` (authenticated)

Lists **all boxes** owned by the signed-in user, with **share URLs** for the dashboard.

| | |
|---|---|
| **Headers** | `Authorization: Bearer <access_token>` (required). |
| **Response `200`** | `{ "username": string \| null, "boxes": Array<…> }` — each `shareURL` is `${FRONTEND_URL}/drop/${username}/${slug}` when `username` is present. |

---

### `GET /me/boxes/:boxId/files` (authenticated)

Lists **files** for one box with **upload status** and metadata safe for the UI (no `nonce`, `kem_ciphertext`, or `s3_key`).

| | |
|---|---|
| **Headers** | `Authorization: Bearer <access_token>` (required). |
| **Path params** | `boxId` — `boxes.id` (UUID). |
| **Response `200`** | `{ "files": Array<{ id, encrypted_name, content_type, byte_size_bytes, status, created_at, uploaded_at, confirmed_at }> }` — `status` is typically `PENDING` until `PATCH /files/:id/confirm`, then `ACTIVE`. |
| **Response `403`** | Caller is not the box owner. |
| **Response `404`** | No box with that id. |

---

### `GET /boxes/check/:slug`

Checks whether a **box slug** is still **available** (not already used in the `boxes` table).

| | |
|---|---|
| **Path params** | `slug` — URL segment for the future share link (string). |
| **Response `200`** | `{ "isAvailable": boolean }` — `true` if no box row uses this slug, `false` if taken. |

---

### `POST /boxes`

Creates a **box** (drop zone) for a given user and returns a **share URL** that includes the owner’s username and slug.

| | |
|---|---|
| **Body** | `slug` (string), `publicKey` (string, recipient ML-KEM / wire format as stored in DB), `userId` (string, UUID of the owning user in `public.users`). |
| **Response `200`** | `{ "shareURL": string }` — `${FRONTEND_URL}/drop/${username}/${slug}` (URL-encoded segments) where `username` is resolved from `userId`. |

**Side effects:** Inserts into `boxes` via Supabase (`createBox`).

---

### `GET /boxes/:username/:slug`

**Public-style** read: returns the **box public key** for uploaders to run the crypto handshake. Resolves `username` → internal user id, then loads the box by `(user_id, slug)`.

| | |
|---|---|
| **Path params** | `username` — owner’s `users.username`; `slug` — box slug. |
| **Response `200`** | `{ "publicKey": string, "boxId": string, "ownerId": string }` — `boxId` is used for `POST /boxes/:id/uploads`; `ownerId` is used in storage object paths. |

Share links from `POST /boxes` and `GET /me/boxes` use **`/drop/:username/:slug`** on the frontend so recipients open the upload UI. In dev, the Vite proxy sends **`/boxes/...`** to this API (not the SPA).

If the user or box does not exist, the handler returns **`404`** `{ "error": "not_found" }` where applicable.

---

### `POST /boxes/:id/uploads`

Registers **file metadata** for an encrypted upload and returns a **signed upload URL** for Supabase Storage (`secure-drop-bucket`).

| | |
|---|---|
| **Path params** | `id` — **Box id** (`boxes.id`, UUID), not the slug. |
| **Body** | `encryptedName`, `contentType`, `byteSizeBytes`, `s3Key`, `nonce`, `kemCiphertext` (all strings/number as appropriate; see types in `app.ts`). |
| **Response `200`** | `{ "uploadURL": string, "fileId": string }` — `PUT` ciphertext bytes to `uploadURL`, then `PATCH /files/:fileId/confirm`. |

**Flow:** Inserts a row in `files` (status lifecycle per DB), then requests a signed upload URL for `s3Key`.

---

### `PATCH /files/:id/confirm`

Marks a file as successfully uploaded by setting its status to **ACTIVE** (after the client uploaded bytes to Storage).

| | |
|---|---|
| **Path params** | `id` — **File id** (`files.id`, UUID). |
| **Body** | None required. |
| **Response `200`** | `{ "success": true }` |

---

## Data layer (summary)

Implementation lives in `sb_utils.ts`:

- **Postgres tables** (see comments in `sb_utils.ts` and project `design.md`): `users`, `boxes`, `files`.
- **Storage:** bucket `secure-drop-bucket`; signed uploads via `createSignedUploadUrl`.

### Auth → `public.users` (automatic profile)

New **Auth** users (`auth.users`) should get a matching **`public.users`** row (`id` = Auth user id) so dashboard share URLs and `POST /boxes` work. The repo includes a migration that installs a trigger:

- **File:** `supabase/migrations/20250321180000_sync_public_users_on_auth_user.sql`
- **Apply:** from the project root, with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase db push`, or run the SQL in the Supabase Dashboard **SQL Editor**.

The trigger sets **`username`** from `raw_user_meta_data.username` (if present on signup) or from the email local-part, then appends `_` and the user id (no hyphens) so the handle stays **unique**. **`public_key`** starts as an empty string; update it when your product flow defines how user keys are stored.

**Accounts created before the migration** still need a one-time backfill, for example:

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

The server Supabase client uses the **service role**. **Dashboard** routes (`/me/...`) validate the user’s access token and enforce **box ownership** before returning data. Other routes remain unauthenticated unless you add middleware later.

---

## Tests

| Command | Description |
|---------|-------------|
| `npm test` | Unit tests (`app.test.ts`) with `sb_utils` mocked — fast, no network. |
| `npm run test:integration` | Integration tests against a real Supabase project; requires `SUPABASE_SERVICE_ROLE_KEY` (and URL) in `.env`. Slower. |

---

## Project files

| File | Role |
|------|------|
| `app.ts` | Express routes, CORS, global error handler. |
| `server.ts` | `listen()` for local / production. |
| `authMiddleware.ts` | `requireAuth` — Bearer token → `req.userId`. |
| `sb_utils.ts` | Supabase DB + Storage helpers. |
| `.endpoints.config.ts` | Env wiring for Supabase URL + service role key. |
| `express.d.ts` | Augments `Express.Request` with `userId`. |
| `integration/*` | Helpers and dotenv for integration tests. |
