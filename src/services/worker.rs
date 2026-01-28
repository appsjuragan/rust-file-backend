use crate::services::scanner::{ScanResult, VirusScanner};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QuerySelect, Set,
};
use std::sync::Arc;
use tokio::sync::watch;
use tokio::time::{Duration, sleep};

pub struct BackgroundWorker {
    db: DatabaseConnection,
    storage: Arc<dyn StorageService>,
    scanner: Arc<dyn VirusScanner>,
    shutdown: watch::Receiver<bool>,
}

use crate::entities::{prelude::*, *};
use crate::services::storage::StorageService;
use chrono::Utc;

impl BackgroundWorker {
    pub fn new(
        db: DatabaseConnection,
        storage: Arc<dyn StorageService>,
        scanner: Arc<dyn VirusScanner>,
        shutdown: watch::Receiver<bool>,
    ) -> Self {
        Self {
            db,
            storage,
            scanner,
            shutdown,
        }
    }

    pub async fn run(mut self) {
        tracing::info!("🚀 Background worker started");

        loop {
            tokio::select! {
                _ = self.shutdown.changed() => {
                    tracing::info!("🛑 Background worker shutting down");
                    break;
                }
                _ = sleep(Duration::from_secs(10)) => {
                    self.perform_virus_scans().await;
                }
                _ = sleep(Duration::from_secs(60)) => {
                    self.perform_cleanup().await;
                }
            }
        }
    }

    async fn perform_virus_scans(&self) {
        let pending_files = StorageFiles::find()
            .filter(storage_files::Column::ScanStatus.eq("pending"))
            .limit(10)
            .all(&self.db)
            .await;

        if let Ok(files) = pending_files {
            for sf in files {
                tracing::info!("🔍 Scanning file: {} (hash: {})", sf.id, sf.hash);

                let stream_res = self.storage.get_object_stream(&sf.s3_key).await;
                if let Err(e) = stream_res {
                    tracing::error!("Failed to get stream for scan {}: {}", sf.id, e);
                    continue;
                }

                let stream = stream_res.unwrap();
                let reader = Box::pin(stream.body.into_async_read());

                let mut active: storage_files::ActiveModel = sf.clone().into();
                match self.scanner.scan(reader).await {
                    Ok(ScanResult::Clean) => {
                        tracing::info!("✅ File clean: {}", sf.id);
                        active.scan_status = Set(Some("clean".to_string()));
                        active.scanned_at = Set(Some(Utc::now()));
                        let _ = active.update(&self.db).await;
                    }
                    Ok(ScanResult::Infected { threat_name }) => {
                        tracing::warn!("🚨 Virus detected in {}: {}", sf.id, threat_name);
                        active.scan_status = Set(Some("infected".to_string()));
                        active.scan_result = Set(Some(threat_name));
                        active.scanned_at = Set(Some(Utc::now()));
                        let _ = active.update(&self.db).await;
                    }
                    Err(e) => {
                        tracing::error!("❌ Scan error for {}: {}", sf.id, e);
                        // We might want to retry later or mark as error
                    }
                    _ => {}
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

        // 2. Clean up infected files (after giving frontend time to show alert)
        let infected_files = StorageFiles::find()
            .filter(storage_files::Column::ScanStatus.eq("infected"))
            .filter(storage_files::Column::ScannedAt.lt(Utc::now() - Duration::from_secs(300)))
            .all(&self.db)
            .await;

        if let Ok(files) = infected_files {
            for sf in files {
                tracing::info!("🧹 Cleaning up infected file: {}", sf.id);
                if let Err(e) = crate::services::storage_lifecycle::StorageLifecycleService::delete_storage_file(
                    &self.db,
                    self.storage.as_ref(),
                    &sf,
                ).await {
                    tracing::error!("Failed to delete infected file {}: {}", sf.id, e);
                }
            }
        }

        // 3. Clean up expired tokens
        let _ = Tokens::delete_many()
            .filter(tokens::Column::ExpiresAt.lt(Utc::now()))
            .exec(&self.db)
            .await;

        tracing::info!("✅ Background cleanup completed");
    }
}
