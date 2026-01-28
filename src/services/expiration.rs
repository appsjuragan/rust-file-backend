use crate::entities::{prelude::*, *};
use crate::services::storage::StorageService;
use chrono::Utc;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter,
    QuerySelect,
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

                if let Err(e) = crate::services::storage_lifecycle::StorageLifecycleService::soft_delete_user_file(
                    &db,
                    &storage,
                    &file,
                ).await {
                    tracing::error!("Failed to expire file {}: {}", file.id, e);
                }
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
