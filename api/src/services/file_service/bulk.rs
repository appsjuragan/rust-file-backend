use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use super::FileService;

impl FileService {
    pub async fn bulk_move(
        &self,
        user_id: &str,
        item_ids: Vec<String>,
        new_parent_id: Option<String>,
    ) -> Result<usize, AppError> {
        use sea_orm::TransactionTrait;

        // Lock user scope
        let _lock = self.bulk_lock.lock(user_id).await;
        tracing::info!("🔒 Scoped lock acquired for bulk move by user {}", user_id);

        let txn = self.db.begin().await.map_err(AppError::Database)?;
        let mut moved_count = 0;

        for id in item_ids {
            // Reusing the logic from rename_item but in a bulk context
            let item = UserFiles::find_by_id(&id)
                .filter(user_files::Column::UserId.eq(user_id))
                .one(&txn)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?
                .ok_or_else(|| AppError::NotFound(format!("Item {} not found", id)))?;

            // Basic circularity check (simplified for bulk)
            if let Some(ref target_id) = new_parent_id
                && item.is_folder
                && target_id == &item.id
            {
                continue; // Skip invalid moves in bulk
            }

            let mut active: user_files::ActiveModel = item.into();
            active.parent_id = Set(new_parent_id.clone());
            active
                .update(&txn)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
            moved_count += 1;
        }

        txn.commit().await.map_err(AppError::Database)?;

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.to_string();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

        Ok(moved_count)
    }

    pub async fn bulk_copy(
        &self,
        user_id: &str,
        item_ids: Vec<String>,
        new_parent_id: Option<String>,
    ) -> Result<usize, AppError> {
        use sea_orm::TransactionTrait;

        // Lock user scope
        let _lock = self.bulk_lock.lock(user_id).await;
        tracing::info!("🔒 Scoped lock acquired for bulk copy by user {}", user_id);

        let txn = self.db.begin().await.map_err(AppError::Database)?;
        let mut copied_count = 0;

        for id in item_ids {
            let item = UserFiles::find_by_id(&id)
                .filter(user_files::Column::UserId.eq(user_id))
                .one(&txn)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?
                .ok_or_else(|| AppError::NotFound(format!("Item {} not found", id)))?;

            let new_filename = if item.is_folder {
                format!("{} - Copy", item.filename)
            } else {
                let path = std::path::Path::new(&item.filename);
                let stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&item.filename);
                let extension = path.extension().and_then(|e| e.to_str());

                match extension {
                    Some(ext) => format!("{} - Copy.{}", stem, ext),
                    None => format!("{} - Copy", item.filename),
                }
            };

            self.copy_recursive(
                &txn,
                user_id,
                &item,
                new_parent_id.clone(),
                Some(new_filename),
            )
            .await?;
            copied_count += 1;
        }

        txn.commit().await.map_err(AppError::Database)?;

        // Background update facts
        let db = self.db.clone();
        let uid = user_id.to_string();
        tokio::spawn(async move {
            let _ =
                crate::services::facts_service::FactsService::update_user_facts(&db, &uid).await;
        });

        Ok(copied_count)
    }

    #[async_recursion::async_recursion]
    pub(crate) async fn copy_recursive(
        &self,
        txn: &sea_orm::DatabaseTransaction,
        user_id: &str,
        item: &user_files::Model,
        target_parent_id: Option<String>,
        new_name: Option<String>,
    ) -> Result<(), AppError> {
        let new_id = Uuid::new_v4().to_string();

        // 1. Clone the item record
        let new_item = user_files::ActiveModel {
            id: Set(new_id.clone()),
            user_id: Set(user_id.to_string()),
            filename: Set(new_name.unwrap_or_else(|| item.filename.clone())),
            parent_id: Set(target_parent_id),
            is_folder: Set(item.is_folder),
            storage_file_id: Set(item.storage_file_id.clone()),
            created_at: Set(Some(Utc::now())),
            is_favorite: Set(item.is_favorite),
            ..Default::default()
        };

        new_item
            .insert(txn)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // 2. Increment ref count if it's a file
        if !item.is_folder
            && let Some(ref sid) = item.storage_file_id
        {
            let sf = storage_files::Entity::find_by_id(sid.clone())
                .one(txn)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?
                .ok_or_else(|| {
                    AppError::NotFound("Storage file missing during copy".to_string())
                })?;

            let mut active_sf: storage_files::ActiveModel = sf.into();
            active_sf.ref_count = Set(active_sf.ref_count.unwrap() + 1);
            active_sf
                .update(txn)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }

        // 3. If folder, copy children (keeping original names)
        if item.is_folder {
            let children = UserFiles::find()
                .filter(user_files::Column::ParentId.eq(Some(item.id.clone())))
                .filter(user_files::Column::UserId.eq(user_id))
                .filter(user_files::Column::DeletedAt.is_null())
                .all(txn)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;

            for child in children {
                self.copy_recursive(txn, user_id, &child, Some(new_id.clone()), None)
                    .await?;
            }
        }

        Ok(())
    }
}
