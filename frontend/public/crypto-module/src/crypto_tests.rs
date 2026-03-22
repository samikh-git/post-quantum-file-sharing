use crate::{
    decrypt_file_bytes, encrypt_with_public_key_bytes, generate_key_pair_bytes,
};

#[test]
fn encrypt_decrypt_round_trip_short_message() {
    let (pk, sk) = generate_key_pair_bytes().expect("key generation");
    let plaintext = b"hello, ML-KEM + AES-GCM";

    let (encrypted, nonce, kem_ct) =
        encrypt_with_public_key_bytes(&pk, plaintext).expect("encrypt");

    let decrypted = decrypt_file_bytes(&sk, &kem_ct, &nonce, &encrypted).expect("decrypt");
    assert_eq!(decrypted, plaintext);
}

#[test]
fn encrypt_decrypt_round_trip_binary_and_empty() {
    let (pk, sk) = generate_key_pair_bytes().expect("key generation");

    let with_nulls = [0u8, 1, 2, 255, 0, 0, 128];
    let (enc, nonce, kem_ct) =
        encrypt_with_public_key_bytes(&pk, &with_nulls).expect("encrypt");
    let out = decrypt_file_bytes(&sk, &kem_ct, &nonce, &enc).expect("decrypt");
    assert_eq!(out, with_nulls);

    let (enc, nonce, kem_ct) =
        encrypt_with_public_key_bytes(&pk, b"").expect("encrypt empty");
    let out = decrypt_file_bytes(&sk, &kem_ct, &nonce, &enc).expect("decrypt empty");
    assert!(out.is_empty());
}

#[test]
fn encrypt_decrypt_round_trip_larger_payload() {
    let (pk, sk) = generate_key_pair_bytes().expect("key generation");
    let plaintext: Vec<u8> = (0..50_000).map(|i| (i % 256) as u8).collect();

    let (encrypted, nonce, kem_ct) =
        encrypt_with_public_key_bytes(&pk, &plaintext).expect("encrypt");
    let decrypted = decrypt_file_bytes(&sk, &kem_ct, &nonce, &encrypted).expect("decrypt");
    assert_eq!(decrypted, plaintext);
}

#[test]
fn repeated_encryption_produces_different_ciphertexts() {
    let (pk, sk) = generate_key_pair_bytes().expect("key generation");
    let plaintext = b"same plaintext";

    let a = encrypt_with_public_key_bytes(&pk, plaintext).expect("encrypt a");
    let b = encrypt_with_public_key_bytes(&pk, plaintext).expect("encrypt b");

    assert_ne!(a.2, b.2, "KEM ciphertexts should differ (fresh encapsulation)");
    assert_ne!(a.1, b.1, "nonces should differ with high probability");

    assert_eq!(
        decrypt_file_bytes(&sk, &a.2, &a.1, &a.0).unwrap(),
        plaintext
    );
    assert_eq!(
        decrypt_file_bytes(&sk, &b.2, &b.1, &b.0).unwrap(),
        plaintext
    );
}

#[test]
fn decrypt_fails_with_wrong_private_key() {
    let (pk_a, _sk_a) = generate_key_pair_bytes().expect("key generation a");
    let (_pk_b, sk_b) = generate_key_pair_bytes().expect("key generation b");

    let (encrypted, nonce, kem_ct) =
        encrypt_with_public_key_bytes(&pk_a, b"secret payload").expect("encrypt");

    let result = decrypt_file_bytes(&sk_b, &kem_ct, &nonce, &encrypted);
    assert!(result.is_err(), "wrong decapsulation key should not yield plaintext");
}

#[test]
fn decrypt_fails_when_kem_ciphertext_is_tampered() {
    let (pk, sk) = generate_key_pair_bytes().expect("key generation");
    let plaintext = b"integrity matters";

    let (encrypted, nonce, mut kem_ct) =
        encrypt_with_public_key_bytes(&pk, plaintext).expect("encrypt");
    kem_ct[0] ^= 0xff;

    let result = decrypt_file_bytes(&sk, &kem_ct, &nonce, &encrypted);
    assert!(result.is_err(), "tampered KEM ciphertext should not decrypt");
}
