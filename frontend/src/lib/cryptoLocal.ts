import init, {
  decryptFile,
  encryptWithPublicKey,
  generateKeyPair,
} from '../wasm/crypto-module/pkg/crypto_module.js'
import * as keyStore from './keyStore'

/** Bundled with Vite — wasm path resolves via `import.meta.url` in the generated glue. */
let wasmInit: Promise<unknown> | null = null

export async function ensureWasmLoaded(): Promise<void> {
  if (!wasmInit) {
    wasmInit = init()
  }
  await wasmInit
}

/**
 * Legacy IndexedDB id (one key per browser). Superseded by per-user ids; still read once to migrate.
 */
export const LEGACY_MLKEM_KEY_ID = 'mlkem-768-v1'

/** IndexedDB key id for the signed-in user (isolates keys when several accounts use the same browser). */
export function mlkemKeyStoreIdForUser(userId: string): string {
  const id = userId.trim()
  if (!id) {
    throw new Error('ML-KEM keys require a signed-in user')
  }
  return `${LEGACY_MLKEM_KEY_ID}:${id}`
}

/**
 * Load ML-KEM key pair for this auth user from IndexedDB, or generate, persist, and return.
 * If a legacy single-slot key exists (pre–per-user storage), it is copied to this user’s slot once
 * and removed from the legacy id so the next account on this browser gets its own key.
 */
export async function ensureLocalMlkemKeyPair(userId: string): Promise<{
  publicKey: Uint8Array
  secretKey: Uint8Array
}> {
  await ensureWasmLoaded()
  const storeId = mlkemKeyStoreIdForUser(userId)

  let existing = await keyStore.getKeyPair(storeId)
  if (!existing) {
    const legacy = await keyStore.getKeyPair(LEGACY_MLKEM_KEY_ID)
    if (legacy) {
      await keyStore.saveKeyPair(storeId, legacy.publicKey, legacy.secretKey)
      await keyStore.deleteKeyPair(LEGACY_MLKEM_KEY_ID)
      existing = legacy
    }
  }
  if (existing) {
    return existing
  }

  const kp = generateKeyPair()
  const publicKey = new Uint8Array(kp.public_key)
  const secretKey = new Uint8Array(kp.secret_key)
  kp.free()

  await keyStore.saveKeyPair(storeId, publicKey, secretKey)
  return { publicKey, secretKey }
}

/** Base64 (standard alphabet) for storing ML-KEM public key bytes in `boxes.public_key`. */
export function encodeMlkemPublicKeyBase64(publicKey: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < publicKey.length; i++) {
    bin += String.fromCharCode(publicKey[i]!)
  }
  return btoa(bin)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!)
  }
  return btoa(bin)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim())
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

/**
 * ML-KEM + AEAD encrypt `plaintext` to the holder of the secret key for `recipientPublicKeyBase64`.
 */
export async function encryptPlaintextForRecipient(
  recipientPublicKeyBase64: string,
  plaintext: Uint8Array
): Promise<{
  encrypted: Uint8Array
  nonce: Uint8Array
  kemCiphertext: Uint8Array
}> {
  await ensureWasmLoaded()
  const pk = base64ToBytes(recipientPublicKeyBase64)
  const out = encryptWithPublicKey(pk, plaintext)
  const encrypted = new Uint8Array(out.encrypted)
  const nonce = new Uint8Array(out.nonce)
  const kemCiphertext = new Uint8Array(out.kem_ciphertext)
  out.free()
  return { encrypted, nonce, kemCiphertext }
}

/**
 * Decrypt payload encrypted with {@link encryptPlaintextForRecipient} using the local ML-KEM secret key.
 */
export async function decryptCiphertextWithLocalSecret(
  secretKey: Uint8Array,
  kemCiphertextBase64: string,
  nonceBase64: string,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  await ensureWasmLoaded()
  const kem = base64ToBytes(kemCiphertextBase64)
  const nonce = base64ToBytes(nonceBase64)
  return new Uint8Array(decryptFile(secretKey, kem, nonce, ciphertext))
}

type EncryptedNameEnvelopeV1 = { v: number; n: string; k: string; c: string }

/**
 * Decrypts the JSON blob stored in `files.encrypted_name` (see upload page) to the original filename.
 */
export async function decryptEncryptedFilename(
  secretKey: Uint8Array,
  encryptedNameJson: string
): Promise<string | null> {
  await ensureWasmLoaded()
  let o: EncryptedNameEnvelopeV1
  try {
    o = JSON.parse(encryptedNameJson) as EncryptedNameEnvelopeV1
  } catch {
    return null
  }
  if (o.v !== 1 || typeof o.n !== 'string' || typeof o.k !== 'string' || typeof o.c !== 'string') {
    return null
  }
  try {
    const plain = decryptFile(secretKey, base64ToBytes(o.k), base64ToBytes(o.n), base64ToBytes(o.c))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
