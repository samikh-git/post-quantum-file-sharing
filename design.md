# Design

High-level data model, storage layout, and API shape for **post-quantum file sharing**. For exact request/response codes and env vars, prefer [`backend/README.md`](backend/README.md).

## Cryptography (client-side)

- **ML-KEM-768** (and related AEAD) run in the browser via **WebAssembly**, built from Rust (`frontend/public/crypto-module`).
- **Public** drop page fetches the box owner’s **recipient public key** from the API and encrypts file name + payload in the browser.
- The **server** stores **ciphertext**, **KEM metadata**, and **opaque encrypted filenames** — not plaintext content.

## PostgreSQL (intended shape)

Normalized for ownership, `(user_id, slug)` scoping, and file lifecycle **`PENDING` → `ACTIVE`**.

```sql
-- public.users.id should match auth.users.id (see supabase/migrations/*_sync_public_users_on_auth_user.sql).
CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  public_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  public_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  encrypted_name text NOT NULL,
  content_type text NOT NULL,
  byte_size_bytes bigint NOT NULL CHECK (byte_size_bytes > 0),
  s3_key text NOT NULL UNIQUE,
  nonce text NOT NULL,
  kem_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'DELETED')),
  uploaded_at timestamptz NULL,
  confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_boxes_user_id ON boxes (user_id);
CREATE INDEX idx_files_box_id ON files (box_id);
CREATE INDEX idx_files_status ON files (status);
```

**Notes**

- Share paths are **`/drop/:username/:slug`**; slug uniqueness is **per owner**, not global (`UNIQUE (user_id, slug)`).
- `files.s3_key` is globally unique; server validation enforces **`{ownerId}/{slug}/{uuid_v4}_{safeLeaf}`** for anonymous uploads.
- `shareURL` is derived from `FRONTEND_URL` + username + slug — not stored as a column.

## Object storage (Supabase Storage)

- **Bucket** (implementation): `secure-drop-bucket`.
- **Key convention** (enforced on register):  
  `{owner_uuid}/{slug}/{uuid_v4}_{sanitized_filename}`  
  Owner id segment is compared case-insensitively; slug segment must match the `boxes.slug` row exactly.

## API (conceptual map)

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/me/boxes` | Bearer | List owner’s boxes + share URLs |
| GET | `/me/boxes/:boxId/files` | Bearer | List files in a box (dashboard) |
| GET | `/me/files/:fileId/download` | Bearer | Signed URL + KEM fields for decrypt |
| GET | `/boxes/check/:username/:slug` | No | Slug free for that user? |
| POST | `/boxes` | Bearer | Create box (body: `slug`, `publicKey` only) |
| GET | `/boxes/:username/:slug` | No | Public key + `boxId` + `ownerId` for uploader |
| POST | `/boxes/:id/uploads` | No (rate-limited) | Insert `files` row + signed **upload** URL |
| PATCH | `/files/:id/confirm` | Bearer (owner) | Set file `ACTIVE` |

Legacy or alternate names in older sketches (`GET /public/boxes/:slug`, body field names like `fileName`) are **not** what the current Express app implements — use `backend/README.md` and `app.ts` as source of truth.

## Upload flow (happy path)

1. Uploader opens **`/drop/:username/slug`**, loads box metadata, encrypts in browser.
2. **`POST /boxes/:boxId/uploads`** with metadata and a valid **`s3Key`** → receive **`uploadURL`** + **`fileId`**.
3. Browser **PUT**s ciphertext to Storage (not proxied through Express).
4. Box owner signs in, sees **PENDING** file, clicks **Finalize** → **`PATCH /files/:fileId/confirm`** (Bearer).
5. Owner can download via **`GET /me/files/:fileId/download`** when status is **ACTIVE**.

## Operational hardening (outside this repo)

- **Rate limits** on upload registration live in **`rateLimits.ts`** (see backend README).
- **Raw Storage traffic** (PUT/GET to Supabase) is not limited by Express; use **CDN/WAF** or provider quotas if needed.
- **Service role** key: server-only; prefer **RLS** in Supabase as defense-in-depth if you add direct client DB access later.
