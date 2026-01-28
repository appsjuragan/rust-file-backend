use crate::entities::{prelude::*, *};
use crate::services::storage::StorageService;
use chrono::Utc;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QuerySelect};
use std::sync::Arc;
use tokio::time::{Duration, sleep};
use tokio::sync::watch;

pub struct BackgroundWorker {
    db: DatabaseConnection,
    storage: Arc<dyn StorageService>,
    shutdown: watch::Receiver<bool>,
}

impl BackgroundWorker {
    pub fn new(
        db: DatabaseConnection,
        storage: Arc<dyn StorageService>,
        shutdown: watch::Receiver<bool>,
    ) -> Self {
        Self { db, storage, shutdown }
    }

    pub async fn run(mut self) {
        tracing::info!("🚀 Background worker started");

        loop {
            tokio::select! {
                _ = self.shutdown.changed() => {
                    tracing::info!("🛑 Background worker shutting down");
                    break;
                }
                _ = sleep(Duration::from_secs(3600)) => {
                    self.perform_cleanup().await;
                }
            }
        }
    }

    async fn perform_cleanup(&self) {
        tracing::info!("🧹 Running background cleanup tasks...");

        // 1. Expire Files
        let expired_files = UserFiles::find()
            .filter(user_files::Column::ExpiresAt.lt(Utc::now()))
            .filter(user_files::Column::DeletedAt.is_null())
            .limit(100)
            .all(&self.db)
            .await;

        if let Ok(files) = expired_files {
            for file in files {
                tracing::info!("Expiring file: {}", file.id);
                if let Err(e) = crate::services::storage_lifecycle::StorageLifecycleService::soft_delete_user_file(
                    &self.db,
                    self.storage.as_ref(),
                    &file,
                ).await {
                    tracing::error!("Failed to expire file {}: {}", file.id, e);
                }
            }
        }

        // 2. Clean up expired tokens
        let _ = Tokens::delete_many()
            .filter(tokens::Column::ExpiresAt.lt(Utc::now()))
            .exec(&self.db)
            .await;
            
        tracing::info!("✅ Background cleanup completed");
    }
}
