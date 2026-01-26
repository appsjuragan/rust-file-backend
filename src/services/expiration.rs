use crate::entities::{prelude::*, *};
use crate::services::storage::StorageService;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, ModelTrait, QueryFilter,
    QuerySelect, TransactionTrait,
};
use std::sync::Arc;
use tokio::time::{Duration, sleep};

pub async fn expiration_worker(db: DatabaseConnection, storage: Arc<StorageService>) {
    loop {
        tracing::info!("Running expiration worker...");

        let expired_files = UserFiles::find()
            .filter(user_files::Column::ExpiresAt.lt(Utc::now()))
            .limit(1000)
            .all(&db)
            .await;

        if let Ok(files) = expired_files {
            for file in files {
                tracing::info!("Expiring file: {}", file.id);

                let txn = match db.begin().await {
                    Ok(tx) => tx,
                    Err(_) => continue,
                };

                // Delete user file entry
                if file.clone().delete(&txn).await.is_err() {
                    continue;
                }

                // Decrement ref_count
                if let Ok(Some(sf)) = StorageFiles::find_by_id(&file.storage_file_id)
                    .one(&txn)
                    .await
                {
                    use sea_orm::ActiveValue::Set;
                    let new_count = sf.ref_count - 1;
                    let mut active_sf: storage_files::ActiveModel = sf.clone().into();
                    active_sf.ref_count = Set(new_count);

                    if let Ok(updated_sf) = active_sf.update(&txn).await {
                        if updated_sf.ref_count <= 0 {
                            // Delete from S3
                            if let Err(e) = storage.delete_file(&updated_sf.s3_key).await {
                                tracing::error!("Failed to delete from S3: {}", e);
                            }
                            let _ = updated_sf.delete(&txn).await;
                        }
                    }
                }

                let _ = txn.commit().await;
            }
        }

        // Clean up expired tokens
        let _ = Tokens::delete_many()
            .filter(tokens::Column::ExpiresAt.lt(Utc::now()))
            .exec(&db)
            .await;

        sleep(Duration::from_secs(3600)).await; // Run every hour
    }
}
