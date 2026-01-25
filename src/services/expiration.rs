use sqlx::SqlitePool;
use std::sync::Arc;
use crate::services::storage::StorageService;
use tokio::time::{sleep, Duration};
use chrono::Utc;

pub async fn expiration_worker(db: SqlitePool, storage: Arc<StorageService>) {
    loop {
        tracing::info!("Running expiration worker...");
        
        let expired_files = sqlx::query_as::<_, crate::models::UserFile>(
            "SELECT id, user_id, storage_file_id, filename, expires_at, created_at FROM user_files WHERE expires_at < ? LIMIT 1000"
        )
        .bind(Utc::now())
        .fetch_all(&db)
        .await;

        if let Ok(files) = expired_files {
            for file in files {
                tracing::info!("Expiring file: {}", file.id);
                
                // Start transaction
                let mut tx = match db.begin().await {
                    Ok(tx) => tx,
                    Err(_) => continue,
                };

                // Delete user file entry
                if let Err(_e) = sqlx::query("DELETE FROM user_files WHERE id = ?")
                    .bind(&file.id)
                    .execute(&mut *tx)
                    .await {
                        continue;
                    }

                // Decrement ref_count and get storage info
                let storage_file = sqlx::query_as::<_, crate::models::StorageFile>(
                    "UPDATE storage_files SET ref_count = ref_count - 1 WHERE id = ? RETURNING id, hash, s3_key, size, ref_count"
                )
                .bind(&file.storage_file_id)
                .fetch_one(&mut *tx)
                .await;

                if let Ok(sf) = storage_file {
                    if sf.ref_count <= 0 {
                        // Delete from S3
                        if let Err(e) = storage.delete_file(&sf.s3_key).await {
                            tracing::error!("Failed to delete from S3: {}", e);
                        }
                        let _ = sqlx::query("DELETE FROM storage_files WHERE id = ?")
                            .bind(&file.storage_file_id)
                            .execute(&mut *tx)
                            .await;
                    }
                }

                let _ = tx.commit().await;
            }
        }

        // Clean up expired tokens
        let _ = sqlx::query("DELETE FROM tokens WHERE expires_at < ?")
            .bind(Utc::now())
            .execute(&db)
            .await;

        sleep(Duration::from_secs(3600)).await; // Run every hour
    }
}
