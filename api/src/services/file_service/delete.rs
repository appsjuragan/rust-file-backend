use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

use super::FileService;

impl FileService {
    pub async fn delete_item(&self, user_id: &str, id: &str) -> Result<(), AppError> {
        use crate::services::storage_lifecycle::StorageLifecycleService;
        use sea_orm::TransactionTrait;

        let item = UserFiles::find_by_id(id)
            .filter(user_files::Column::UserId.eq(user_id))
            .filter(user_files::Column::DeletedAt.is_null())
            .one(&self.db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
            .ok_or_else(|| AppError::NotFound("Item not found".to_string()))?;

        // Lock user scope
        let _lock = if item.is_folder {
            let lock = self.bulk_lock.lock(user_id).await;
            tracing::info!(
                "🔒 Scoped lock acquired for folder delete: {} (User: {})",
                item.filename,
                user_id
            );
            Some(lock)
        } else {
            None
        };

        // Start Transaction
        let txn = self.db.begin().await.map_err(AppError::Database)?;

        if item.is_folder {
            StorageLifecycleService::delete_folder_recursive(&txn, self.storage.as_ref(), &item.id)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }

        StorageLifecycleService::soft_delete_user_file(&txn, self.storage.as_ref(), &item)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        txn.commit().await.map_err(AppError::Database)?;

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.to_string();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

        Ok(())
    }

    pub async fn bulk_delete(
        &self,
        user_id: &str,
        item_ids: Vec<String>,
    ) -> Result<usize, AppError> {
        // Lock user scope
        let _lock = self.bulk_lock.lock(user_id).await;
        tracing::info!(
            "🔒 Scoped lock acquired for bulk delete by user {}",
            user_id
        );

        use crate::services::storage_lifecycle::StorageLifecycleService;
        // bulk_delete handles its own transaction
        let count = StorageLifecycleService::bulk_delete(
            &self.db,
            self.storage.as_ref(),
            user_id,
            item_ids,
        )
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.to_string();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

        Ok(count)
    }
}
