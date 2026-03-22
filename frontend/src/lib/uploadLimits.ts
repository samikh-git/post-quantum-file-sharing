/**
 * Max plaintext file size for drop uploads (50 MiB).
 * Keep in sync with `MAX_UPLOAD_FILE_BYTES` in `backend/uploadValidation.ts`.
 */
export const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024

/** Registered body ciphertext size cap; matches `MAX_CIPHERTEXT_BYTES` on the API. */
export const MAX_REGISTERED_CIPHERTEXT_BYTES = MAX_UPLOAD_FILE_BYTES + 64 * 1024

export const MAX_UPLOAD_FILE_LABEL = '50 MB'
