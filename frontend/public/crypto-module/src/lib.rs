//! ML-KEM-768 hybrid encryption (KEM + AES-256-GCM) using **pure Rust** (`ml-kem`, `aes-gcm`).
//! This builds for **`wasm32-unknown-unknown`** (browser WASM). It does **not** use `aws-lc-rs`.

mod core_crypto;

pub use core_crypto::{
    decrypt_file_bytes, encrypt_with_public_key_bytes, generate_key_pair_bytes, CryptoError,
    ML_KEM_768_CIPHERTEXT_LEN, ML_KEM_768_PUBLIC_KEY_LEN, ML_KEM_768_SECRET_KEY_LEN,
};

// ---------------------------------------------------------------------------
// wasm-bindgen: only primitive / Vec / String — no custom Rust key types.
// ---------------------------------------------------------------------------

use wasm_bindgen::prelude::*;

/// Key material for JS: `public_key` (1184 bytes) and `secret_key` (2400 bytes) for ML-KEM-768.
#[wasm_bindgen]
pub struct KeyPairBytes {
    public_key: Vec<u8>,
    secret_key: Vec<u8>,
}

#[wasm_bindgen]
impl KeyPairBytes {
    #[wasm_bindgen(getter)]
    pub fn public_key(&self) -> Vec<u8> {
        self.public_key.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn secret_key(&self) -> Vec<u8> {
        self.secret_key.clone()
    }
}

/// AEAD ciphertext + nonce + KEM ciphertext for JS.
#[wasm_bindgen]
pub struct EncryptOutput {
    encrypted: Vec<u8>,
    nonce: Vec<u8>,
    kem_ciphertext: Vec<u8>,
}

#[wasm_bindgen]
impl EncryptOutput {
    #[wasm_bindgen(getter)]
    pub fn encrypted(&self) -> Vec<u8> {
        self.encrypted.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn nonce(&self) -> Vec<u8> {
        self.nonce.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn kem_ciphertext(&self) -> Vec<u8> {
        self.kem_ciphertext.clone()
    }
}

/// Generate an ML-KEM-768 key pair (FIPS 203 encodings).
#[wasm_bindgen(js_name = generateKeyPair)]
pub fn wasm_generate_key_pair() -> Result<KeyPairBytes, String> {
    let (pk, sk) = generate_key_pair_bytes().map_err(|e| e.to_string())?;
    Ok(KeyPairBytes {
        public_key: pk,
        secret_key: sk,
    })
}

/// Encrypt `plaintext` for the holder of the secret key matching `public_key_bytes`.
#[wasm_bindgen(js_name = encryptWithPublicKey)]
pub fn wasm_encrypt_with_public_key(
    public_key_bytes: &[u8],
    plaintext: &[u8],
) -> Result<EncryptOutput, String> {
    let (encrypted, nonce, kem_ciphertext) =
        encrypt_with_public_key_bytes(public_key_bytes, plaintext).map_err(|e| e.to_string())?;
    Ok(EncryptOutput {
        encrypted,
        nonce,
        kem_ciphertext,
    })
}

/// Decrypt using ML-KEM-768 secret key bytes and the blobs from [`EncryptOutput`].
#[wasm_bindgen(js_name = decryptFile)]
pub fn wasm_decrypt_file(
    secret_key_bytes: &[u8],
    kem_ciphertext: &[u8],
    nonce: &[u8],
    encrypted: &[u8],
) -> Result<Vec<u8>, String> {
    decrypt_file_bytes(secret_key_bytes, kem_ciphertext, nonce, encrypted).map_err(|e| e.to_string())
}

#[cfg(test)]
mod crypto_tests;
