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

    config: SecurityConfig,
    shutdown: watch::Receiver<bool>,
}

use crate::config::SecurityConfig;

use crate::entities::{prelude::*, *};
use crate::services::storage::StorageService;
use chrono::Utc;

impl BackgroundWorker {
    pub fn new(
        db: DatabaseConnection,
        storage: Arc<dyn StorageService>,
        scanner: Arc<dyn VirusScanner>,
        config: SecurityConfig,
        shutdown: watch::Receiver<bool>,
    ) -> Self {
        Self {
            db,
            storage,
            scanner,
            config,
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
                _ = sleep(Duration::from_secs(5)) => {
                    self.perform_facts_update().await;
                }
                _ = sleep(Duration::from_secs(60)) => {
                    self.perform_cleanup().await;
                }
            }
        }
    }

    async fn perform_facts_update(&self) {
        use crate::services::facts_service::FactsService;
        let _ = FactsService::update_all_users(&self.db).await;
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

                // use crate::services::encryption::EncryptionService;
                // let file_key = EncryptionService::derive_key_from_hash(&sf.hash);
                
                // Direct scan of S3 stream (Plaintext)
                let body_reader = stream.body.into_async_read();
                // let decrypted_stream = EncryptionService::decrypt_stream(Box::new(body_reader), file_key);
                // let reader = Box::pin(tokio_util::io::ReaderStream::new(body_reader));
                
                // VirusScanner usually takes AsyncRead.
                let reader = Box::pin(body_reader);

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

        // 4. Clean up abandoned staging files
        match self.storage.list_objects("staging/").await {
            Ok(staged_files) => {
                for key in staged_files {
                    match self.storage.get_object_metadata(&key).await {
                        Ok(metadata) => {
                            if let Some(last_modified) = metadata.last_modified {
                                let age = Utc::now() - last_modified;
                                if age > chrono::Duration::hours(self.config.staging_cleanup_age_hours as i64) {
                                    tracing::info!(
                                        "🗑️ Deleting abandoned staging file: {} (Age: {}h)",
                                        key,
                                        age.num_hours()
                                    );
                                    if let Err(e) = self.storage.delete_file(&key).await {
                                        tracing::error!("Failed to delete staged file {}: {}", key, e);
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("Failed to get metadata for staged file {}: {}", key, e);
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to list staging files: {}", e);
            }
        }

        tracing::info!("✅ Background cleanup completed");
    }
}
