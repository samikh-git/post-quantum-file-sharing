/* tslint:disable */
/* eslint-disable */

/**
 * AEAD ciphertext + nonce + KEM ciphertext for JS.
 */
export class EncryptOutput {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly encrypted: Uint8Array;
    readonly kem_ciphertext: Uint8Array;
    readonly nonce: Uint8Array;
}

/**
 * Key material for JS: `public_key` (1184 bytes) and `secret_key` (2400 bytes) for ML-KEM-768.
 */
export class KeyPairBytes {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly public_key: Uint8Array;
    readonly secret_key: Uint8Array;
}

/**
 * Decrypt using ML-KEM-768 secret key bytes and the blobs from [`EncryptOutput`].
 */
export function decryptFile(secret_key_bytes: Uint8Array, kem_ciphertext: Uint8Array, nonce: Uint8Array, encrypted: Uint8Array): Uint8Array;

/**
 * Encrypt `plaintext` for the holder of the secret key matching `public_key_bytes`.
 */
export function encryptWithPublicKey(public_key_bytes: Uint8Array, plaintext: Uint8Array): EncryptOutput;

/**
 * Generate an ML-KEM-768 key pair (FIPS 203 encodings).
 */
export function generateKeyPair(): KeyPairBytes;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_encryptoutput_free: (a: number, b: number) => void;
    readonly __wbg_keypairbytes_free: (a: number, b: number) => void;
    readonly decryptFile: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly encryptWithPublicKey: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly encryptoutput_encrypted: (a: number) => [number, number];
    readonly encryptoutput_kem_ciphertext: (a: number) => [number, number];
    readonly encryptoutput_nonce: (a: number) => [number, number];
    readonly generateKeyPair: () => [number, number, number];
    readonly keypairbytes_public_key: (a: number) => [number, number];
    readonly keypairbytes_secret_key: (a: number) => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
