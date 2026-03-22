# Design process

## Algorithms

## PostgreSQL Table Schemas

Schema below is normalized for ownership checks, file lifecycle (`PENDING` -> `ACTIVE`), and reliable querying.

```sql
-- In production, `id` should match `auth.users.id` (see supabase/migrations/*_sync_public_users_on_auth_user.sql).
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
  slug text NOT NULL UNIQUE,
  public_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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

CREATE INDEX idx_boxes_user_id ON boxes(user_id);
CREATE INDEX idx_files_box_id_created_at ON files(box_id, created_at DESC);
CREATE INDEX idx_files_status ON files(status);
```

Notes:
- `shareable_link` is intentionally omitted because it can be derived from `slug`.
- `files.box_id` enables efficient `GET /boxes/:id/files` lookups and ownership checks.
- `status` + `confirmed_at` model the upload confirmation flow from your API.

## S3 Object Storage

Key convention: `user/slug/file_name`

## API

### Boxes (Links)
Managing the "drop zones" where people can upload files.

#### `GET /boxes/check/:slug`
Checks if a custom URL slug is available for use.

- Auth required: Yes
- Responses:
  - `200 OK`: Slug is available
  - `409 Conflict`: Slug is already taken

#### `POST /boxes`
Creates a new shareable DropBox link.

- Auth required: Yes
- Request body:

```json
{
  "slug": "blue-mountain-42",
  "publicKey": "base64_encoded_ml_kem_key...",
  "expiresAt": "2026-03-25T12:00:00Z"
}
```

- Response: `201 Created`

```json
{
  "id": "uuid-123",
  "shareUrl": "https://your-app.com/drop/blue-mountain-42"
}
```

#### `GET /public/boxes/:slug`
Public endpoint for "Bob" (the uploader) to get the handshake data.

- Auth required: No
- Response: `200 OK`

```json
{
  "boxId": "uuid-123",
  "publicKey": "base64_encoded_ml_kem_key..."
}
```

### Uploads
The multi-step process for secure file delivery.

#### `POST /boxes/:id/uploads`
Requests a "permission slip" to upload a file directly to S3.

- Auth required: No (public drop)
- Request body:

```json
{
  "fileName": "encrypted_name_string",
  "fileType": "application/octet-stream",
  "fileSize": 5242880,
  "nonce": "base64_nonce...",
  "kemCiphertext": "base64_ciphertext..."
}
```

- Response: `200 OK`

```json
{
  "fileId": "uuid-abc",
  "uploadUrl": "https://s3.amazonaws.com/your-bucket/path?signature=..."
}
```

#### `PATCH /files/:id/confirm`
Notifies the database that the S3 upload was successful.

- Auth required: No
- Note: Moves the file from `PENDING` to `ACTIVE` in Postgres
- Response: `204 No Content`

### Storage & Cleanup
Endpoints for "Alice" to manage her received files.

#### `GET /boxes/:id/files`
Lists all encrypted files currently sitting in a specific box.

- Auth required: Yes
- Response: `200 OK`

```json
[
  {
    "id": "uuid-abc",
    "encryptedName": "...",
    "nonce": "...",
    "kemCiphertext": "...",
    "s3Url": "https://...",
    "createdAt": "2026-03-21T11:50:00Z"
  }
]
```

#### `DELETE /files/:id`
The "Burn" command. Deletes metadata from Postgres and the blob from S3.

- Auth required: Yes
- Response: `204 No Content`