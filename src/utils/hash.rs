use hex;
use sha2::{Digest, Sha256};

pub fn calculate_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    hex::encode(result)
}

pub async fn calculate_hash_from_reader<R: tokio::io::AsyncRead + Unpin>(
    mut reader: R,
) -> anyhow::Result<String> {
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let n = tokio::io::AsyncReadExt::read(&mut reader, &mut buffer).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    let result = hasher.finalize();
    Ok(hex::encode(result))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_hash() {
        let data = b"hello world";
        let hash = calculate_hash(data);
        // SHA-256 for "hello world"
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[tokio::test]
    async fn test_calculate_hash_from_reader() {
        let data = b"hello world";
        let hash = calculate_hash_from_reader(&data[..]).await.unwrap();
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn test_calculate_hash_empty() {
        let data = b"";
        let hash = calculate_hash(data);
        // SHA-256 for empty string
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
