use crate::entities::{prelude::*, *};
use crate::services::encryption::EncryptionService;
use crate::services::storage::StorageService;
use anyhow::{Context, Result};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter,
    Set, TransactionTrait,
};
use std::sync::Arc;
use tokio::io::AsyncReadExt;

pub struct KeyManagementService {
    db: DatabaseConnection,
    storage: Arc<dyn StorageService>,
}

impl KeyManagementService {
    pub fn new(db: DatabaseConnection, storage: Arc<dyn StorageService>) -> Self {
        Self { db, storage }
    }

    /// Generates a new keypair, encrypts the private key with the system master key,
    /// and uploads it to MinIO. Returns (public_key_pem, private_key_path).
    pub async fn generate_and_store_key(&self, user_id: &str) -> Result<(String, String)> {
        let (pub_key_pem, priv_key_pem) = EncryptionService::generate_user_keys()?;

        let master_secret =
            std::env::var("SYSTEM_SECRET").unwrap_or_else(|_| "system_secret_default".to_string());
        let master_key = EncryptionService::derive_key_from_hash(&master_secret);

        let encrypted_priv_key =
            EncryptionService::encrypt_with_master_key(priv_key_pem.as_bytes(), &master_key)?;

        let key_path = format!("users/{}/private.enc", user_id);

        self.storage
            .upload_file(&key_path, encrypted_priv_key.into_bytes())
            .await
            .context("Failed to upload private key to storage")?;

        Ok((pub_key_pem, key_path))
    }

    /// Fetches and decrypts the user's private key from MinIO.
    pub async fn fetch_private_key(&self, user_id: &str) -> Result<String> {
        let user = Users::find_by_id(user_id)
            .one(&self.db)
            .await?
            .ok_or_else(|| anyhow::anyhow!("User not found"))?;

        // Fallback for migration: check DB first if path is missing
        if let Some(enc_blob) = user.private_key_enc {
            // Existing legacy behavior
            let master_secret = std::env::var("SYSTEM_SECRET")
                .unwrap_or_else(|_| "system_secret_default".to_string());
            let master_key = EncryptionService::derive_key_from_hash(&master_secret);
            let decrypted = EncryptionService::decrypt_with_master_key(&enc_blob, &master_key)?;
            return String::from_utf8(decrypted).context("Invalid PEM encoding");
        }

        let key_path = user
            .private_key_path
            .ok_or_else(|| anyhow::anyhow!("No private key found for user"))?;

        // Download from S3
        let s3_res = self.storage.get_object_stream(&key_path).await?;
        let mut body_reader = s3_res.body.into_async_read();
        let mut encrypted_bytes = Vec::new();
        body_reader.read_to_end(&mut encrypted_bytes).await?;

        let encrypted_str =
            String::from_utf8(encrypted_bytes).context("Invalid encrypted key format")?;

        // Decrypt with Master Key
        let master_secret =
            std::env::var("SYSTEM_SECRET").unwrap_or_else(|_| "system_secret_default".to_string());
        let master_key = EncryptionService::derive_key_from_hash(&master_secret);
        let decrypted = EncryptionService::decrypt_with_master_key(&encrypted_str, &master_key)?;

        String::from_utf8(decrypted).context("Invalid PEM encoding")
    }

    /// Rotates the user's keypair.
    /// 1. Generates new keys.
    /// 2. Re-wraps ALL user files with the new public key.
    /// 3. Updates user record with new public key and private key path.
    pub async fn rotate_user_key(&self, user_id: &str) -> Result<()> {
        // 1. Generate new keys
        let (new_pub_pem, new_priv_pem) = EncryptionService::generate_user_keys()?;
        let master_secret =
            std::env::var("SYSTEM_SECRET").unwrap_or_else(|_| "system_secret_default".to_string());
        let master_key = EncryptionService::derive_key_from_hash(&master_secret);
        let new_enc_priv_key =
            EncryptionService::encrypt_with_master_key(new_priv_pem.as_bytes(), &master_key)?;

        // 2. Fetch OLD private key to decrypt existing file keys
        let old_priv_key_pem = self.fetch_private_key(user_id).await?;

        // 3. Start Transaction
        let txn = self.db.begin().await?;

        // get all user files that are encrypted
        // Note: This could be heavy for many files. In real prod, use a cursor/batching.
        let mut file_pages = user_files::Entity::find()
            .filter(user_files::Column::UserId.eq(user_id))
            .filter(user_files::Column::FileSignature.is_not_null())
            .paginate(&txn, 100);

        while let Some(files) = file_pages.fetch_and_next().await? {
            for file in files {
                if let Some(old_wrapped_key) = file.file_signature.clone() {
                    // Unwrap with OLD key
                    let file_key =
                        EncryptionService::unwrap_key(&old_wrapped_key, &old_priv_key_pem)?;

                    // Wrap with NEW key
                    let new_wrapped_key = EncryptionService::wrap_key(&file_key, &new_pub_pem)?;

                    // Update DB
                    let mut active_file: user_files::ActiveModel = file.into();
                    active_file.file_signature = Set(Some(new_wrapped_key));
                    active_file.update(&txn).await?;
                }
            }
        }

        // 4. Upload NEW Private Key to Storage
        let key_path = format!("users/{}/private.enc", user_id);
        self.storage
            .upload_file(&key_path, new_enc_priv_key.into_bytes())
            .await?;

        // 5. Update User Record
        // We find the user inside the transaction to ensure lock validity if we were doing locking,
        // but here just updating is fine.
        let user = users::Entity::find_by_id(user_id)
            .one(&txn)
            .await?
            .ok_or_else(|| anyhow::anyhow!("User not found"))?;
        let mut active_user: users::ActiveModel = user.into();

        active_user.public_key = Set(Some(new_pub_pem));
        active_user.private_key_path = Set(Some(key_path));
        active_user.private_key_enc = Set(None); // Clear legacy blob

        active_user.update(&txn).await?;

        txn.commit().await?;

        Ok(())
    }
    pub async fn rotate_system_secret(&self, old_secret: &str, new_secret: &str) -> Result<usize> {
        let old_master_key = EncryptionService::derive_key_from_hash(old_secret);
        let new_master_key = EncryptionService::derive_key_from_hash(new_secret);

        let mut count = 0;
        let mut user_pages = users::Entity::find().paginate(&self.db, 100);

        while let Some(users) = user_pages.fetch_and_next().await? {
            for user in users {
                // 1. Fetch & Decrypt with OLD key
                let priv_key_pem = if let Some(enc_blob) = &user.private_key_enc {
                    // Legacy DB storage
                    let decrypted =
                        EncryptionService::decrypt_with_master_key(enc_blob, &old_master_key)
                            .context(format!(
                                "Failed to decrypt legacy key for user {}",
                                user.id
                            ))?;
                    String::from_utf8(decrypted).context("Invalid PEM encoding")?
                } else if let Some(key_path) = &user.private_key_path {
                    // S3 storage
                    let s3_res = self
                        .storage
                        .get_object_stream(key_path)
                        .await
                        .context(format!("Failed to download key for user {}", user.id))?;

                    let mut body_reader = s3_res.body.into_async_read();
                    let mut encrypted_bytes = Vec::new();
                    body_reader.read_to_end(&mut encrypted_bytes).await?;
                    let encrypted_str = String::from_utf8(encrypted_bytes)?;

                    let decrypted =
                        EncryptionService::decrypt_with_master_key(&encrypted_str, &old_master_key)
                            .context(format!("Failed to decrypt S3 key for user {}", user.id))?;
                    String::from_utf8(decrypted).context("Invalid PEM encoding")?
                } else {
                    continue; // No key? Skip.
                };

                // 2. Encrypt with NEW key
                let new_enc_priv_key = EncryptionService::encrypt_with_master_key(
                    priv_key_pem.as_bytes(),
                    &new_master_key,
                )?;

                // 3. Save back (prefer S3)
                let key_path = format!("users/{}/private.enc", user.id);
                self.storage
                    .upload_file(&key_path, new_enc_priv_key.clone().into_bytes())
                    .await?;

                // 4. Update DB to point to S3 and clear legacy blob
                let mut active: users::ActiveModel = user.into();
                active.private_key_path = Set(Some(key_path));
                active.private_key_enc = Set(None);
                active.update(&self.db).await?;

                count += 1;
            }
        }
        Ok(count)
    }
}
