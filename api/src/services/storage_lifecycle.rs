use crate::entities::{prelude::*, *};
use crate::services::storage::StorageService;
use anyhow::{Result, anyhow};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, ModelTrait, QueryFilter, Set,
    TransactionTrait,
};

/// Service for managing storage file lifecycle and reference counting
pub struct StorageLifecycleService;

impl StorageLifecycleService {
    /// Decrement ref_count for a storage file and delete from S3 if count reaches 0
    ///
    /// Returns true if the storage file was deleted from both DB and S3
    pub async fn decrement_ref_count(
        db: &impl sea_orm::ConnectionTrait,
        storage: &dyn StorageService,
        storage_file_id: &str,
    ) -> Result<bool> {
        let storage_file = StorageFiles::find_by_id(storage_file_id)
            .one(db)
            .await?
            .ok_or_else(|| anyhow!("Storage file not found: {}", storage_file_id))?;

        let new_count = storage_file.ref_count - 1;
        tracing::info!(
            "Decrementing ref_count for storage_file {} from {} to {}",
            storage_file_id,
            storage_file.ref_count,
            new_count
        );

        let mut active: storage_files::ActiveModel = storage_file.clone().into();
        active.ref_count = Set(new_count);
        let updated = active.update(db).await?;

        let deleted = if new_count <= 0 {
            tracing::info!("ref_count reached 0, deleting from S3: {}", updated.s3_key);

            // Delete from S3
            storage.delete_file(&updated.s3_key).await?;

            // Delete from database
            updated.delete(db).await?;

            tracing::info!(
                "Successfully deleted storage_file {} from S3 and DB",
                storage_file_id
            );
            true
        } else {
            tracing::debug!(
                "ref_count is {}, keeping storage_file {} in S3",
                new_count,
                storage_file_id
            );
            false
        };

        Ok(deleted)
    }

    /// Recursively delete a folder and all its children, managing ref counts
    ///
    /// This performs soft delete on user_files (sets deleted_at) and decrements
    /// ref_count on storage_files, triggering S3 cleanup when ref_count reaches 0
    #[async_recursion::async_recursion]
    pub async fn delete_folder_recursive(
        db: &impl sea_orm::ConnectionTrait,
        storage: &dyn StorageService,
        folder_id: &str,
    ) -> Result<()> {
        tracing::info!("Recursively deleting folder: {}", folder_id);

        // Find all children of this folder
        let children = UserFiles::find()
            .filter(user_files::Column::ParentId.eq(folder_id))
            .filter(user_files::Column::DeletedAt.is_null()) // Only non-deleted items
            .all(db)
            .await?;

        tracing::debug!("Found {} children in folder {}", children.len(), folder_id);

        for child in children {
            if child.is_folder {
                // Recursively delete subfolders
                Self::delete_folder_recursive(db, storage, &child.id).await?;
            }

            // Soft delete the child
            Self::soft_delete_user_file(db, storage, &child).await?;
        }

        tracing::info!("Completed recursive deletion of folder {}", folder_id);
        Ok(())
    }

    /// Soft delete a user_file and decrement storage ref_count
    pub async fn soft_delete_user_file(
        db: &impl sea_orm::ConnectionTrait,
        storage: &dyn StorageService,
        user_file: &user_files::Model,
    ) -> Result<()> {
        tracing::info!("Soft deleting user_file: {}", user_file.id);

        // Set deleted_at timestamp
        let mut active: user_files::ActiveModel = user_file.clone().into();
        active.deleted_at = Set(Some(chrono::Utc::now()));
        active.is_favorite = Set(false); // remove favorite status on delete
        active.update(db).await?;

        // Delete associated share links
        crate::entities::share_links::Entity::delete_many()
            .filter(crate::entities::share_links::Column::UserFileId.eq(&user_file.id))
            .exec(db)
            .await?;

        // Decrement ref_count if this file has storage
        if let Some(ref storage_file_id) = user_file.storage_file_id {
            Self::decrement_ref_count(db, storage, storage_file_id).await?;
        }

        Ok(())
    }

    /// Bulk delete multiple files/folders
    ///
    /// Returns the number of items deleted
    pub async fn bulk_delete(
        db: &DatabaseConnection,
        storage: &dyn StorageService,
        user_id: &str,
        item_ids: Vec<String>,
    ) -> Result<usize> {
        tracing::info!(
            "Bulk deleting {} items for user {}",
            item_ids.len(),
            user_id
        );

        let txn = db.begin().await?;
        let mut deleted_count = 0;

        for item_id in item_ids {
            // Verify ownership
            let item = UserFiles::find_by_id(&item_id)
                .filter(user_files::Column::UserId.eq(user_id))
                .filter(user_files::Column::DeletedAt.is_null())
                .one(&txn)
                .await?;

            if let Some(item) = item {
                if item.is_folder {
                    Self::delete_folder_recursive(&txn, storage, &item.id).await?;
                }
                Self::soft_delete_user_file(&txn, storage, &item).await?;
                deleted_count += 1;
            } else {
                tracing::warn!(
                    "Item {} not found or already deleted for user {}",
                    item_id,
                    user_id
                );
            }
        }

        txn.commit().await?;
        tracing::info!("Bulk deleted {} items", deleted_count);
        Ok(deleted_count)
    }
    /// Hard delete a storage file and all its associated user files
    pub async fn delete_storage_file(
        db: &DatabaseConnection,
        storage: &dyn StorageService,
        storage_file: &storage_files::Model,
    ) -> Result<()> {
        tracing::warn!("Hard deleting infected storage file: {}", storage_file.id);

        // 1. Delete from S3
        storage.delete_file(&storage_file.s3_key).await?;

        // 2. Delete all associated UserFiles (and their metadata/tags)
        // Note: In a real app, we might want to soft-delete them first or notify users
        UserFiles::delete_many()
            .filter(user_files::Column::StorageFileId.eq(&storage_file.id))
            .exec(db)
            .await?;

        // 3. Delete the storage file record
        storage_file.clone().delete(db).await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    // Tests will be added in the integration test file
}
