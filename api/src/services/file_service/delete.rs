use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use super::FileService;

impl FileService {
    pub async fn get_or_create_trash_folder(
        &self,
        user_id: &str,
    ) -> Result<user_files::Model, AppError> {
        let existing = UserFiles::find()
            .filter(user_files::Column::UserId.eq(user_id))
            .filter(user_files::Column::Filename.eq(".Trash"))
            .filter(user_files::Column::IsSystem.eq(true))
            .one(&self.db)
            .await?;

        if let Some(folder) = existing {
            return Ok(folder);
        }

        // Create new Trash folder
        let id = Uuid::new_v4().to_string();
        let new_folder = user_files::ActiveModel {
            id: Set(id.clone()),
            user_id: Set(user_id.to_string()),
            filename: Set(".Trash".to_string()),
            is_folder: Set(true),
            is_system: Set(true), // Mark as system folder
            parent_id: Set(None),
            created_at: Set(Some(chrono::Utc::now())),
            ..Default::default()
        };

        let folder = new_folder.insert(&self.db).await?;
        Ok(folder)
    }

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

        // 🛡 Protection: Cannot delete system folders
        if item.is_system {
            return Err(AppError::BadRequest(
                "Cannot delete system folders".to_string(),
            ));
        }

        // 🛡 Protection: Cannot delete locked items
        if item.is_locked {
            return Err(AppError::BadRequest(
                "Cannot delete locked items. Please unlock them first.".to_string(),
            ));
        }

        let trash_folder = self.get_or_create_trash_folder(user_id).await?;

        // Check if item is already in trash
        let is_already_in_trash = item.parent_id == Some(trash_folder.id.clone());

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

        if is_already_in_trash {
            // 💀 PERMANENT DELETE
            let txn = self.db.begin().await.map_err(AppError::Database)?;

            if item.is_folder {
                StorageLifecycleService::delete_folder_recursive(
                    &txn,
                    self.storage.as_ref(),
                    &item.id,
                )
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
            }

            StorageLifecycleService::soft_delete_user_file(&txn, self.storage.as_ref(), &item)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;

            txn.commit().await.map_err(AppError::Database)?;
        } else {
            // 🗑 MOVE TO TRASH
            let mut active: user_files::ActiveModel = item.clone().into();
            active.original_parent_id = Set(item.parent_id.clone());
            active.parent_id = Set(Some(trash_folder.id));
            active.updated_at = Set(Some(chrono::Utc::now()));
            // We DON'T set deleted_at here, because we want it to be visible in the Trash folder
            // for restoration. If we set deleted_at, it disappears from folder listings.
            active.update(&self.db).await?;
        }

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.to_string();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

        Ok(())
    }

    pub async fn restore_item(
        &self,
        user_id: &str,
        id: &str,
    ) -> Result<user_files::Model, AppError> {
        let item = UserFiles::find_by_id(id)
            .filter(user_files::Column::UserId.eq(user_id))
            .one(&self.db)
            .await?
            .ok_or_else(|| AppError::NotFound("Item not found".to_string()))?;

        let trash_folder = self.get_or_create_trash_folder(user_id).await?;

        if item.parent_id != Some(trash_folder.id) {
            return Err(AppError::BadRequest("Item is not in trash".to_string()));
        }

        let mut active: user_files::ActiveModel = item.clone().into();
        let target_parent_id = item.original_parent_id.clone();

        active.parent_id = Set(target_parent_id.clone());
        active.original_parent_id = Set(None);
        active.deleted_at = Set(None);

        // Verify parent still exists, if not, restore to root
        if let Some(pid) = target_parent_id {
            let parent_exists = UserFiles::find_by_id(pid)
                .filter(user_files::Column::UserId.eq(user_id))
                .filter(user_files::Column::DeletedAt.is_null())
                .one(&self.db)
                .await?
                .is_some();
            if !parent_exists {
                active.parent_id = Set(None);
            }
        }

        let updated = active.update(&self.db).await?;

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.to_string();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

        Ok(updated)
    }

    pub async fn bulk_delete(
        &self,
        user_id: &str,
        item_ids: Vec<String>,
    ) -> Result<usize, AppError> {
        // For bulk delete, we'll just iterate and call delete_item which handles the trash logic
        let mut count = 0;
        for id in item_ids {
            if self.delete_item(user_id, &id).await.is_ok() {
                count += 1;
            }
        }
        Ok(count)
    }
}
