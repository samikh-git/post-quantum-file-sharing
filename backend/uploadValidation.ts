/**
 * Server-side checks for public upload registration and box creation.
 */

export const MAX_BOX_PUBLIC_KEY_LENGTH = 12_000;

/** Max plaintext file size for one drop upload (50 MiB). UI and client checks should match. */
export const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Max `byteSizeBytes` for the file body ciphertext registered at upload (AES-GCM payload).
 * Slightly above plaintext cap to allow auth tag / padding beyond raw file length.
 */
export const MAX_CIPHERTEXT_BYTES = MAX_UPLOAD_FILE_BYTES + 64 * 1024;
export const MAX_ENCRYPTED_NAME_CHARS = 8192;
export const MAX_KEM_FIELD_LENGTH = 8192;
export const MAX_CONTENT_TYPE_LENGTH = 128;
export const MAX_S3_KEY_LENGTH = 768;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidBoxSlug(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 3 && s.length <= 48 && SLUG_RE.test(s);
}

/** Public handle in `/drop/:username/:slug`; same character rules as box slugs. */
export function isValidUsername(s: unknown): s is string {
  return isValidBoxSlug(s);
}

export function isValidRecipientPublicKey(s: unknown): s is string {
  if (typeof s !== 'string' || s.length === 0 || s.length > MAX_BOX_PUBLIC_KEY_LENGTH) {
    return false;
  }
  return !s.includes('\0');
}

export function isValidContentType(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    s.trim().length > 0 &&
    s.length <= MAX_CONTENT_TYPE_LENGTH
  );
}

export function isValidByteSize(n: unknown): n is number {
  return (
    typeof n === 'number' &&
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n > 0 &&
    n <= MAX_CIPHERTEXT_BYTES
  );
}

export function isValidEncryptedName(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= MAX_ENCRYPTED_NAME_CHARS;
}

/** Base64 / base64url-ish field (nonce, kem, etc.). */
export function isValidKemField(s: unknown): s is string {
  if (typeof s !== 'string' || s.length === 0 || s.length > MAX_KEM_FIELD_LENGTH) {
    return false;
  }
  return /^[A-Za-z0-9+/=_-]+$/.test(s);
}

function isValidUploadLeaf(leaf: string): boolean {
  if (leaf.length < 38 || leaf.length > 220) return false;
  if (leaf.includes('..') || leaf.includes('/') || leaf.includes('\\')) return false;
  if (leaf[36] !== '_') return false;
  const uuidPart = leaf.slice(0, 36);
  const namePart = leaf.slice(37);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      uuidPart
    )
  ) {
    return false;
  }
  if (namePart.length < 1 || namePart.length > 180) return false;
  return /^[\w.\-+()@[\]]+$/.test(namePart);
}

/**
 * Object key must be `{ownerId}/{slug}/{uuid}_{safeName}` matching the box row (anonymous uploader).
 */
export function isStorageKeyAllowedForBox(
  s3Key: string,
  ownerId: string,
  slug: string
): boolean {
  if (s3Key.length > MAX_S3_KEY_LENGTH || s3Key.includes('..')) return false;
  const parts = s3Key.split('/');
  if (parts.length !== 3) return false;
  if (parts[0].toLowerCase() !== ownerId.toLowerCase()) return false;
  if (parts[1] !== slug) return false;
  return isValidUploadLeaf(parts[2]!);
}
