use anyhow::{Context, Result};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use blake3::Hasher;
use chacha20poly1305::{
    AeadCore, ChaCha20Poly1305, Key, Nonce,
    aead::{Aead, KeyInit, OsRng},
};
use futures::stream::Stream;
use rsa::{
    Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey,
    pkcs1::{DecodeRsaPrivateKey, EncodeRsaPrivateKey},
    pkcs8::{DecodePublicKey, EncodePublicKey, LineEnding},
};
use tokio::io::{AsyncRead, AsyncReadExt};

pub struct EncryptionService;

const CHUNK_SIZE: usize = 64 * 1024; // 64KB chunks for streaming

impl EncryptionService {
    /// Generate a new RSA 2048 keypair.
    /// Returns (public_key_pem, private_key_pem)
    pub fn generate_user_keys() -> Result<(String, String), anyhow::Error> {
        let mut rng = rand::thread_rng();
        let bits = 2048;
        let priv_key =
            RsaPrivateKey::new(&mut rng, bits).context("failed to generate private key")?;
        let pub_key = RsaPublicKey::from(&priv_key);

        let priv_pem = priv_key
            .to_pkcs1_pem(LineEnding::LF)
            .context("failed to encode private key")?
            .to_string();

        let pub_pem = pub_key
            .to_public_key_pem(LineEnding::LF)
            .context("failed to encode public key")?
            .to_string();

        Ok((pub_pem, priv_pem))
    }

    /// Derive a symmetric key from content hash (Convergent Encryption)
    pub fn derive_key_from_hash(hash: &str) -> [u8; 32] {
        let mut hasher = Hasher::new();
        hasher.update(hash.as_bytes());
        // Use a fixed salt or context string for domain separation
        hasher.update(b"rust-file-backend-file-key");
        let output = hasher.finalize();
        *output.as_bytes()
    }

    /// Wrap a symmetric key using User's Public Key
    pub fn wrap_key(file_key: &[u8; 32], user_public_pem: &str) -> Result<String, anyhow::Error> {
        let pub_key = RsaPublicKey::from_public_key_pem(user_public_pem)
            .context("failed to parse public key")?;
        let mut rng = rand::thread_rng();

        // Pkcs1v15Encrypt is standard, OAEP is better but Pkcs1v15 is widely compatible
        let enc_data = pub_key
            .encrypt(&mut rng, Pkcs1v15Encrypt, file_key)
            .context("failed to encrypt key")?;

        Ok(BASE64.encode(enc_data))
    }

    /// Unwrap a symmetric key using User's Private Key
    pub fn unwrap_key(
        wrapped_key_b64: &str,
        user_private_pem: &str,
    ) -> Result<[u8; 32], anyhow::Error> {
        let priv_key = RsaPrivateKey::from_pkcs1_pem(user_private_pem)
            .context("failed to parse private key")?;

        let encrypted_data = BASE64
            .decode(wrapped_key_b64)
            .context("failed to decode base64 key")?;

        let decrypted_data = priv_key
            .decrypt(Pkcs1v15Encrypt, &encrypted_data)
            .context("failed to decrypt key")?;

        if decrypted_data.len() != 32 {
            anyhow::bail!("Invalid key length after decryption");
        }

        let mut key = [0u8; 32];
        key.copy_from_slice(&decrypted_data);
        Ok(key)
    }

    /// Encrypt a stream using ChaCha20Poly1305 in chunks.
    pub fn encrypt_stream(
        mut reader: Box<dyn AsyncRead + Unpin + Send>,
        key: [u8; 32],
    ) -> impl Stream<Item = std::io::Result<bytes::Bytes>> + Send {
        async_stream::try_stream! {
            let cipher = ChaCha20Poly1305::new(&Key::from(key));
            let mut buffer = vec![0u8; CHUNK_SIZE];

            loop {
                let n = reader.read(&mut buffer).await?;
                if n == 0 {
                    break;
                }

                let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng); // 96-bits
                let ciphertext = cipher.encrypt(&nonce, &buffer[..n])
                    .map_err(|e| std::io::Error::other(e.to_string()))?;

                // Yield Nonce + Ciphertext
                let mut chunk = Vec::with_capacity(nonce.len() + ciphertext.len());
                chunk.extend_from_slice(&nonce);
                chunk.extend_from_slice(&ciphertext);

                yield bytes::Bytes::from(chunk);
            }
        }
    }

    /// Decrypt a stream
    pub fn decrypt_stream(
        mut reader: Box<dyn AsyncRead + Unpin + Send>,
        key: [u8; 32],
    ) -> impl Stream<Item = std::io::Result<bytes::Bytes>> + Send {
        async_stream::try_stream! {
            let cipher = ChaCha20Poly1305::new(&Key::from(key));
            let encrypted_chunk_size = CHUNK_SIZE + 12 + 16;
            let mut buffer = vec![0u8; encrypted_chunk_size];

            loop {
                // Read exactly N bytes or EOF
                let mut valid_bytes = 0;
                while valid_bytes < encrypted_chunk_size {
                    let n = reader.read(&mut buffer[valid_bytes..]).await?;
                    if n == 0 {
                        break;
                    }
                    valid_bytes += n;
                }

                if valid_bytes == 0 {
                    break;
                }

                if valid_bytes < 12 + 16 {
                     // Too small to be a valid chunk
                     Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "corrupt chunk: too short"))?;
                }

                let nonce_slice = &buffer[0..12];
                let ciphertext_slice = &buffer[12..valid_bytes];

                let nonce = Nonce::from_slice(nonce_slice);
                let plaintext = cipher.decrypt(nonce, ciphertext_slice)
                     .map_err(|e| std::io::Error::other(format!("decryption failed: {}", e)))?;

                yield bytes::Bytes::from(plaintext);

                if valid_bytes < encrypted_chunk_size {
                    // This was likely the last chunk
                    break;
                }
            }
        }
    }

    /// Encrypt a small secret (like a private key) using a system master key.
    /// Returns Base64 encoded ciphertext (nonce + ciphertext + tag)
    pub fn encrypt_with_master_key(
        data: &[u8],
        master_key: &[u8; 32],
    ) -> Result<String, anyhow::Error> {
        let cipher = ChaCha20Poly1305::new(&Key::from(*master_key));
        let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng); // 96-bits
        let ciphertext = cipher
            .encrypt(&nonce, data)
            .map_err(|e| anyhow::anyhow!("sys encryption failed: {}", e))?;

        // Combine Nonce + Ciphertext
        let mut combined = Vec::with_capacity(nonce.len() + ciphertext.len());
        combined.extend_from_slice(&nonce);
        combined.extend_from_slice(&ciphertext);

        Ok(BASE64.encode(combined))
    }

    /// Decrypt a small secret using a system master key.
    pub fn decrypt_with_master_key(
        encoded_data: &str,
        master_key: &[u8; 32],
    ) -> Result<Vec<u8>, anyhow::Error> {
        let decoded = BASE64
            .decode(encoded_data)
            .context("failed to decode base64")?;

        if decoded.len() < 12 + 16 {
            // Nonce + MinTag
            anyhow::bail!("invalid ciphertext length");
        }

        let nonce = Nonce::from_slice(&decoded[0..12]);
        let ciphertext = &decoded[12..];

        let cipher = ChaCha20Poly1305::new(&Key::from(*master_key));
        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| anyhow::anyhow!("sys decryption failed: {}", e))?;

        Ok(plaintext)
    }
}
