/**
 * Supabase helpers for storage signed URLs, `users`, `boxes`, and `files`.
 *
 * Uses the service role key from `.endpoints.config` (server only; bypasses RLS — enforce auth in `app.ts`).
 */

import { createClient } from '@supabase/supabase-js';
import * as jose from 'jose';
import { config } from './.endpoints.config';

/** Shared Supabase client for this module (service role — not for frontend use). */
const supabase = createClient(config.supabaseURL, config.supabaseServiceRoleKey);

function supabaseAuthBaseUrl(): string | null {
    const raw = config.supabaseURL?.trim();
    if (!raw) return null;
    return raw.replace(/\/$/, '');
}

/** Lazy JWKS for ES256 (and other asymmetric) Auth JWTs — see Auth → Signing keys. */
let remoteJwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getRemoteJwks(): ReturnType<typeof jose.createRemoteJWKSet> | null {
    const base = supabaseAuthBaseUrl();
    if (!base) return null;
    if (!remoteJwks) {
        remoteJwks = jose.createRemoteJWKSet(
            new URL(`${base}/auth/v1/.well-known/jwks.json`)
        );
    }
    return remoteJwks;
}

/**
 * Requests a time-limited signed upload URL for an object in `secure-drop-bucket`.
 *
 * @param filePath - Object path inside the bucket (e.g. folder/file name).
 * @returns The signed URL string returned by Supabase Storage.
 * @throws If Storage returns an error or the request fails.
 */
async function getUploadPresignedURL(filePath: string): Promise<string>  {
    try {
        const { data, error } = await supabase.storage.from('secure-drop-bucket').createSignedUploadUrl(filePath);
        if (error) {
            throw error;
        }
        return data.signedUrl as string;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Time-limited signed URL for downloading an object from `secure-drop-bucket`.
 *
 * @param filePath - Storage object path (`files.s3_key`).
 * @param expiresInSeconds - TTL for the URL (default 1 hour).
 */
async function getDownloadSignedUrl(
    filePath: string,
    expiresInSeconds: number = 3600
): Promise<string> {
    try {
        const { data, error } = await supabase.storage
            .from('secure-drop-bucket')
            .createSignedUrl(filePath, expiresInSeconds);
        if (error) {
            throw error;
        }
        return data.signedUrl as string;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export type FileDownloadMetaRow = {
    encrypted_name: string;
    nonce: string;
    kem_ciphertext: string;
    s3_key: string;
    content_type: string;
    status: string;
};

/**
 * Returns crypto + storage fields for a file when the auth user owns the box.
 * Used for owner-side decrypt-and-download (server never sees plaintext).
 */
async function getFileDownloadMetaIfOwned(
    fileId: string,
    ownerUserId: string
): Promise<FileDownloadMetaRow | null> {
    try {
        const { data, error } = await supabase
            .from('files')
            .select(
                'encrypted_name, nonce, kem_ciphertext, s3_key, content_type, status, box_id'
            )
            .eq('id', fileId)
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!data) {
            return null;
        }
        const boxOwner = await getBoxOwnerUserId(data.box_id as string);
        if (boxOwner !== ownerUserId) {
            return null;
        }
        return {
            encrypted_name: data.encrypted_name as string,
            nonce: data.nonce as string,
            kem_ciphertext: data.kem_ciphertext as string,
            s3_key: data.s3_key as string,
            content_type: data.content_type as string,
            status: data.status as string,
        };
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Whether a box row already exists for the given owner username and slug
 * (same scope as share URLs `/drop/:username/:slug`).
 *
 * @returns `true` if that user already has a box with this slug.
 * @throws On Supabase query errors.
 */
async function chekSlugAvailability(
    username: string,
    slug: string
): Promise<boolean> {
    try {
        const ownerId = await getUserIDByUsername(username);
        if (!ownerId) {
            return false;
        }
        const { data, error } = await supabase
            .from('boxes')
            .select('id')
            .eq('user_id', ownerId)
            .eq('slug', slug);
        if (error) {
            throw error;
        }
        return (data?.length ?? 0) > 0;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Inserts a new row into `boxes` for a drop box.
 *
 * @param slug - Unique slug for the box.
 * @param publicKey - Recipient public key stored with the box.
 * @param userId - Owning user id (`users.id`).
 * @param is_active - Whether the box is active (default `true`).
 * @param expiresAt - Expiry time (default 30 days from now).
 * @throws On insert failure or Supabase errors.
 */
async function createBox(
    slug: string, 
    publicKey: string, 
    userId: string, 
    is_active: boolean = true, 
    expiresAt: Date = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
): Promise<void> {
    try {
        const { error } = await supabase
            .from('boxes')
            .insert({ user_id: userId, slug: slug, public_key: publicKey, is_active: is_active, expires_at: expiresAt });
        if (error) {
            throw error;
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Deletes a box for a specific owner and slug (scoped like share URLs).
 *
 * @throws On delete failure or Supabase errors.
 */
async function deleteBox(userId: string, slug: string): Promise<void> {
    try {
        const { error } = await supabase
            .from('boxes')
            .delete()
            .eq('user_id', userId)
            .eq('slug', slug);
        if (error) {
            throw error;
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export type SharedBoxLookup = {
    boxId: string;
    publicKey: string;
};

/**
 * Public drop metadata for a box (recipient upload flow).
 */
async function getBoxForSharedUpload(
    userID: string,
    slug: string
): Promise<SharedBoxLookup | null> {
    try {
        const { data, error } = await supabase
            .from('boxes')
            .select('id, public_key')
            .eq('user_id', userID)
            .eq('slug', slug)
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!data) {
            return null;
        }
        return {
            boxId: data.id as string,
            publicKey: data.public_key as string,
        };
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Loads the stored public key for a box by slug.
 *
 * @throws If no row exists.
 */
async function getKeyBySlug(userID: string, slug: string): Promise<string> {
    const row = await getBoxForSharedUpload(userID, slug);
    if (!row) {
        throw new Error('box_not_found');
    }
    return row.publicKey;
}

/**
 * Inserts metadata for an uploaded encrypted file into `files`.
 *
 * @param slug - Box identifier; stored as `box_id` (must match your schema / FK expectations).
 * @param encrypted_name - Client-encrypted file name.
 * @param content_type - MIME type of the plaintext (or agreed metadata).
 * @param byte_size_bytes - Size of the ciphertext or payload in bytes.
 * @param s3_key - Storage object key for the blob.
 * @param nonce - Nonce used with the file encryption.
 * @param kem_ciphertext - KEM-wrapped key material or related ciphertext.
 * @throws On insert failure or Supabase errors.
 */
/**
 * @returns New `files.id` (UUID).
 */
async function addFile(
    boxId: string,
    encrypted_name: string,
    content_type: string,
    byte_size_bytes: number,
    s3_key: string,
    nonce: string,
    kem_ciphertext: string
): Promise<string> {
    try {
        const { data, error } = await supabase
            .from('files')
            .insert({
                box_id: boxId,
                encrypted_name: encrypted_name,
                content_type: content_type,
                byte_size_bytes: byte_size_bytes,
                s3_key: s3_key,
                nonce: nonce,
                kem_ciphertext: kem_ciphertext,
            })
            .select('id')
            .single();
        if (error) {
            throw error;
        }
        return data.id as string;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Looks up a user’s display name by primary key.
 *
 * @param userId - `users.id` (UUID), typically matches `auth.users.id`.
 * @returns The `username` column, or `null` when there is no `public.users` row yet
 *   (e.g. Auth signup without a profile insert).
 */
async function getUsernameByID(userId: string): Promise<string | null> {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('username')
            .eq('id', userId)
            .maybeSingle();
        if (error) {
            throw error;
        }
        return (data?.username as string | undefined) ?? null;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Resolves a login or share handle to a user id.
 *
 * @param username - Unique `users.username` value.
 * @returns The `users.id` (UUID), or `null` if no row matches.
 */
async function getUserIDByUsername(username: string): Promise<string | null> {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle();
        if (error) {
            throw error;
        }
        return (data?.id as string | undefined) ?? null;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Marks a file row as successfully finalized by setting `status` to `ACTIVE`.
 *
 * Call this after the client has uploaded the blob to storage (e.g. via the
 * presigned URL) so listing and downloads only expose confirmed objects.
 *
 * @param id - Primary key (`files.id`) of the row to update.
 * @throws On Supabase update errors (a matching row may still be absent without throwing).
 */
async function confirmFile(id: string): Promise<void> {
    try {
        const { error } = await supabase
            .from('files')
            .update({ status: "ACTIVE"})
            .eq('id', id);
        if (error) {
            throw error;
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export type BoxUploadPathContext = { ownerId: string; slug: string };

/** Box owner id and slug for validating anonymous upload `s3_key` paths. */
async function getBoxOwnerIdAndSlug(
    boxId: string
): Promise<BoxUploadPathContext | null> {
    try {
        const { data, error } = await supabase
            .from('boxes')
            .select('user_id, slug')
            .eq('id', boxId)
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!data) {
            return null;
        }
        return {
            ownerId: data.user_id as string,
            slug: data.slug as string,
        };
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/** Sets file ACTIVE only when the auth user owns the box that contains the file. */
async function confirmFileIfOwned(fileId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('files')
        .select('box_id')
        .eq('id', fileId)
        .maybeSingle();
    if (error) {
        throw error;
    }
    if (!data?.box_id) {
        return false;
    }
    const owner = await getBoxOwnerUserId(data.box_id as string);
    if (owner !== userId) {
        return false;
    }
    await confirmFile(fileId);
    return true;
}

export type DashboardBoxRow = {
    id: string;
    slug: string;
    is_active: boolean;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
};

export type DashboardFileRow = {
    id: string;
    encrypted_name: string;
    content_type: string;
    byte_size_bytes: number;
    status: string;
    created_at: string;
    uploaded_at: string | null;
    confirmed_at: string | null;
};

/**
 * Validates a Supabase Auth access token and returns the Auth user id
 * (matches `public.users.id` when profiles use the same UUID).
 *
 * Verification order (no `getUser` round-trip when one succeeds):
 * 1. **JWKS** — `GET {SUPABASE_URL}/auth/v1/.well-known/jwks.json` (ES256 signing keys).
 * 2. **HS256** — optional legacy `SUPABASE_JWT_SECRET` (symmetric JWT secret).
 * 3. **`auth.getUser`** — fallback if local verification fails.
 */
let warnedJwtVerifyFallback = false;

function subFromPayload(payload: jose.JWTPayload): string | null {
    const sub = payload.sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

async function verifyAccessToken(accessToken: string): Promise<string | null> {
    const base = supabaseAuthBaseUrl();
    const issuer = base ? `${base}/auth/v1` : undefined;

    const jwks = getRemoteJwks();
    if (jwks && issuer) {
        try {
            const { payload } = await jose.jwtVerify(accessToken, jwks, {
                issuer,
                audience: 'authenticated',
                clockTolerance: 30,
            });
            const sub = subFromPayload(payload);
            if (sub) return sub;
        } catch {
            try {
                const { payload } = await jose.jwtVerify(accessToken, jwks, {
                    issuer,
                    clockTolerance: 30,
                });
                const sub = subFromPayload(payload);
                if (sub) return sub;
            } catch {
                /* try HS256 / getUser */
            }
        }
    }

    const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();
    if (jwtSecret) {
        try {
            const verifyOpts: jose.JWTVerifyOptions = {
                algorithms: ['HS256'],
                clockTolerance: 30,
            };
            if (issuer) {
                verifyOpts.issuer = issuer;
                verifyOpts.audience = 'authenticated';
            }
            const { payload } = await jose.jwtVerify(
                accessToken,
                new TextEncoder().encode(jwtSecret),
                verifyOpts
            );
            const sub = subFromPayload(payload);
            if (sub) return sub;
        } catch {
            if (!warnedJwtVerifyFallback) {
                warnedJwtVerifyFallback = true;
                console.warn(
                    '[pqfs] HS256 JWT verify failed; using auth.getUser fallback. ' +
                        'If you use only signing keys (ES256), remove SUPABASE_JWT_SECRET.'
                );
            }
        }
    }

    try {
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser(accessToken);
        if (error || !user) return null;
        return user.id;
    } catch {
        return null;
    }
}

/**
 * Lists all boxes owned by a user (newest first).
 */
async function listBoxesForUser(userId: string): Promise<DashboardBoxRow[]> {
    try {
        const { data, error } = await supabase
            .from('boxes')
            .select('id, slug, is_active, expires_at, created_at, updated_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as DashboardBoxRow[];
    } catch (error) {
        console.error(error);
        throw error;
    }
}

/**
 * Returns `boxes.user_id` for a box, or `null` if the box does not exist.
 */
async function getBoxOwnerUserId(boxId: string): Promise<string | null> {
    try {
        const { data, error } = await supabase
            .from('boxes')
            .select('user_id')
            .eq('id', boxId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return data.user_id as string;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

type FilesListDbRow = {
    id: string;
    encrypted_name: string;
    content_type: string;
    byte_size_bytes: number;
    status: string;
    uploaded_at: string | null;
    updated_at: string;
};

/**
 * Lists file rows for a box (dashboard-safe columns; no nonce/kem/s3_key).
 *
 * Uses `files.updated_at` for ordering and maps it to API `created_at` (for DBs without
 * `files.created_at`). Omits `confirmed_at` from the SQL select when the column may not exist;
 * the API still returns `confirmed_at: null` unless you add the column and extend this query.
 */
async function listFilesByBoxId(boxId: string): Promise<DashboardFileRow[]> {
    try {
        const { data, error } = await supabase
            .from('files')
            .select(
                'id, encrypted_name, content_type, byte_size_bytes, status, uploaded_at, updated_at'
            )
            .eq('box_id', boxId)
            .order('updated_at', { ascending: false });
        if (error) throw error;
        const rows = (data ?? []) as FilesListDbRow[];
        return rows.map((row) => ({
            id: row.id,
            encrypted_name: row.encrypted_name,
            content_type: row.content_type,
            byte_size_bytes: row.byte_size_bytes,
            status: row.status,
            created_at: row.updated_at,
            uploaded_at: row.uploaded_at,
            confirmed_at: null,
        }));
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export {
    getUploadPresignedURL,
    getDownloadSignedUrl,
    getFileDownloadMetaIfOwned,
    chekSlugAvailability,
    createBox,
    deleteBox,
    getKeyBySlug,
    getBoxForSharedUpload,
    addFile,
    getUsernameByID,
    getUserIDByUsername,
    confirmFile,
    getBoxOwnerIdAndSlug,
    confirmFileIfOwned,
    verifyAccessToken,
    listBoxesForUser,
    getBoxOwnerUserId,
    listFilesByBoxId,
};

/*
 * Reference column layouts (keep in sync with Supabase migrations / types):
 *
 * users (
 *   id (UUID)
 *   username (TEXT)
 *   public_key (TEXT)
 *   created_at (TIMESTAMPTZ)
 *   updated_at (TIMESTAMPTZ)
 * )
 *
 * boxes (
 *   id (UUID)
 *   user_id (UUID)
 *   slug (TEXT)
 *   public_key (TEXT)
 *   is_active (BOOLEAN)
 *   expires_at (TIMESTAMPTZ)
 *   created_at (TIMESTAMPTZ)
 *   updated_at (TIMESTAMPTZ)
 * )
 *
 * files (
 *   id (UUID)
 *   box_id (UUID)
 *   encrypted_name (TEXT)
 *   content_type (TEXT)
 *   byte_size_bytes (int8)
 *   s3_key (TEXT)
 *   nonce (TEXT)
 *   kem_ciphertext (TEXT)
 *   status (TEXT)
 *   uploaded_at (TIMESTAMPTZ)
 *   confirmed_at (TIMESTAMPTZ)
 *   updated_at (TIMESTAMPTZ)
 *   created_at (TIMESTAMPTZ) — optional; list API uses updated_at if absent
 * )
 */