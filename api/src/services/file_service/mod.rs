use crate::config::SecurityConfig;
use crate::services::{scanner::VirusScanner, storage::StorageService};
use sea_orm::DatabaseConnection;
use std::sync::Arc;

pub mod bulk;
pub mod delete;
pub mod metadata;
pub mod types;
pub mod upload;

pub use types::StagedFile;

pub struct FileService {
    db: DatabaseConnection,
    storage: Arc<dyn StorageService>,
    scanner: Arc<dyn VirusScanner>,
    config: SecurityConfig,
    bulk_lock: crate::utils::keyed_mutex::KeyedMutex,
}

impl FileService {
    pub fn new(
        db: DatabaseConnection,
        storage: Arc<dyn StorageService>,
        scanner: Arc<dyn VirusScanner>,
        config: SecurityConfig,
    ) -> Self {
        Self {
            db,
            storage,
            scanner,
            config,
            bulk_lock: crate::utils::keyed_mutex::KeyedMutex::new(),
        }
    }
}
