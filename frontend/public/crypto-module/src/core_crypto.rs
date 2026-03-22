//! Platform-neutral ML-KEM-768 + AES-256-GCM (pure Rust). Used by WASM and unit tests.

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use ml_kem::array::Array;
use ml_kem::kem::{Decapsulate, DecapsulationKey, Encapsulate, EncapsulationKey};
use ml_kem::{EncodedSizeUser, MlKem768, MlKem768Params, KemCore};
use rand_core::RngCore;
use std::fmt;

/// ML-KEM-768 encapsulation key length (FIPS 203).
pub const ML_KEM_768_PUBLIC_KEY_LEN: usize = 1184;
/// ML-KEM-768 decapsulation key length.
pub const ML_KEM_768_SECRET_KEY_LEN: usize = 2400;
/// ML-KEM-768 ciphertext length.
pub const ML_KEM_768_CIPHERTEXT_LEN: usize = 1088;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CryptoError {
    BadPublicKeyLength { got: usize, expected: usize },
    BadSecretKeyLength { got: usize, expected: usize },
    BadKemCiphertextLength { got: usize, expected: usize },
    BadNonceLength { got: usize, expected: usize },
    KemEncapsulate(String),
    KemDecapsulate(String),
    Aead(String),
}

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CryptoError::BadPublicKeyLength { got, expected } => {
                write!(f, "invalid ML-KEM public key length: got {got}, expected {expected}")
            }
            CryptoError::BadSecretKeyLength { got, expected } => {
                write!(f, "invalid ML-KEM secret key length: got {got}, expected {expected}")
            }
            CryptoError::BadKemCiphertextLength { got, expected } => {
                write!(f, "invalid ML-KEM ciphertext length: got {got}, expected {expected}")
            }
            CryptoError::BadNonceLength { got, expected } => {
                write!(f, "invalid AES-GCM nonce length: got {got}, expected {expected}")
            }
            CryptoError::KemEncapsulate(s) => write!(f, "KEM encapsulate failed: {s}"),
            CryptoError::KemDecapsulate(s) => write!(f, "KEM decapsulate failed: {s}"),
            CryptoError::Aead(s) => write!(f, "AEAD error: {s}"),
        }
    }
}

impl std::error::Error for CryptoError {}

fn encap_key_from_bytes(bytes: &[u8]) -> Result<EncapsulationKey<MlKem768Params>, CryptoError> {
    if bytes.len() != ML_KEM_768_PUBLIC_KEY_LEN {
        return Err(CryptoError::BadPublicKeyLength {
            got: bytes.len(),
            expected: ML_KEM_768_PUBLIC_KEY_LEN,
        });
    }
    let arr: [u8; ML_KEM_768_PUBLIC_KEY_LEN] = bytes
        .try_into()
        .map_err(|_| CryptoError::BadPublicKeyLength {
            got: bytes.len(),
            expected: ML_KEM_768_PUBLIC_KEY_LEN,
        })?;
    let encoded: ml_kem::Encoded<EncapsulationKey<MlKem768Params>> = Array::from(arr);
    Ok(EncapsulationKey::from_bytes(&encoded))
}

fn decap_key_from_bytes(bytes: &[u8]) -> Result<DecapsulationKey<MlKem768Params>, CryptoError> {
    if bytes.len() != ML_KEM_768_SECRET_KEY_LEN {
        return Err(CryptoError::BadSecretKeyLength {
            got: bytes.len(),
            expected: ML_KEM_768_SECRET_KEY_LEN,
        });
    }
    let arr: [u8; ML_KEM_768_SECRET_KEY_LEN] = bytes
        .try_into()
        .map_err(|_| CryptoError::BadSecretKeyLength {
            got: bytes.len(),
            expected: ML_KEM_768_SECRET_KEY_LEN,
        })?;
    let encoded: ml_kem::Encoded<DecapsulationKey<MlKem768Params>> = Array::from(arr);
    Ok(DecapsulationKey::from_bytes(&encoded))
}

fn kem_ct_from_bytes(bytes: &[u8]) -> Result<ml_kem::Ciphertext<MlKem768>, CryptoError> {
    if bytes.len() != ML_KEM_768_CIPHERTEXT_LEN {
        return Err(CryptoError::BadKemCiphertextLength {
            got: bytes.len(),
            expected: ML_KEM_768_CIPHERTEXT_LEN,
        });
    }
    let arr: [u8; ML_KEM_768_CIPHERTEXT_LEN] = bytes
        .try_into()
        .map_err(|_| CryptoError::BadKemCiphertextLength {
            got: bytes.len(),
            expected: ML_KEM_768_CIPHERTEXT_LEN,
        })?;
    Ok(Array::from(arr))
}

/// Generate (public_key, secret_key) as raw FIPS 203 byte encodings.
pub fn generate_key_pair_bytes() -> Result<(Vec<u8>, Vec<u8>), CryptoError> {
    let mut rng = OsRng;
    let (dk, ek) = MlKem768::generate(&mut rng);
    let pk = ek.as_bytes().as_slice().to_vec();
    let sk = dk.as_bytes().as_slice().to_vec();
    debug_assert_eq!(pk.len(), ML_KEM_768_PUBLIC_KEY_LEN);
    debug_assert_eq!(sk.len(), ML_KEM_768_SECRET_KEY_LEN);
    Ok((pk, sk))
}

/// Returns `(ciphertext_with_tag, nonce_12_bytes, kem_ciphertext)`.
pub fn encrypt_with_public_key_bytes(
    public_key_bytes: &[u8],
    plaintext: &[u8],
) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>), CryptoError> {
    let ek = encap_key_from_bytes(public_key_bytes)?;
    let mut rng = OsRng;
    let (kem_ct, shared) = ek
        .encapsulate(&mut rng)
        .map_err(|e| CryptoError::KemEncapsulate(format!("{e:?}")))?;

    let key = Key::<Aes256Gcm>::from_slice(shared.as_slice());
    let cipher = Aes256Gcm::new(key);

    let mut nonce_raw = [0u8; 12];
    rng.fill_bytes(&mut nonce_raw);
    let nonce = *Nonce::from_slice(&nonce_raw);

    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| CryptoError::Aead(format!("{e:?}")))?;

    // Ciphertext || tag (same layout as typical AES-GCM seal).
    Ok((
        ciphertext,
        nonce_raw.to_vec(),
        kem_ct.as_slice().to_vec(),
    ))
}

pub fn decrypt_file_bytes(
    secret_key_bytes: &[u8],
    kem_ciphertext: &[u8],
    nonce_bytes: &[u8],
    encrypted: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if nonce_bytes.len() != 12 {
        return Err(CryptoError::BadNonceLength {
            got: nonce_bytes.len(),
            expected: 12,
        });
    }

    let dk = decap_key_from_bytes(secret_key_bytes)?;
    let kem_ct = kem_ct_from_bytes(kem_ciphertext)?;
    let shared = dk
        .decapsulate(&kem_ct)
        .map_err(|e| CryptoError::KemDecapsulate(format!("{e:?}")))?;

    let key = Key::<Aes256Gcm>::from_slice(shared.as_slice());
    let cipher = Aes256Gcm::new(key);
    let nonce = *Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(&nonce, encrypted.as_ref())
        .map_err(|e| CryptoError::Aead(format!("{e:?}")))
}
