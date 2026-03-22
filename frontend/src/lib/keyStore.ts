/**
 * IndexedDB storage for ML-KEM key material (never use localStorage for secret keys).
 */

const DB_NAME = 'pqfs-local'
const DB_VERSION = 1
const STORE = 'keypairs'

export type StoredKeyRecord = {
  id: string
  publicKey: ArrayBuffer
  secretKey: ArrayBuffer
  updatedAt: number
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'))
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
  })
}

function toBuf(u8: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(u8.byteLength)
  out.set(u8)
  return out.buffer
}

export async function saveKeyPair(
  id: string,
  publicKey: Uint8Array,
  secretKey: Uint8Array
): Promise<void> {
  const db = await openDb()
  const rec: StoredKeyRecord = {
    id,
    publicKey: toBuf(publicKey),
    secretKey: toBuf(secretKey),
    updatedAt: Date.now(),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
    tx.objectStore(STORE).put(rec)
  })
}

export async function getKeyPair(
  id: string
): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array } | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => {
      const v = req.result as StoredKeyRecord | undefined
      if (!v) {
        resolve(null)
        return
      }
      resolve({
        publicKey: new Uint8Array(v.publicKey),
        secretKey: new Uint8Array(v.secretKey),
      })
    }
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
  })
}

export async function deleteKeyPair(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
    tx.objectStore(STORE).delete(id)
  })
}
