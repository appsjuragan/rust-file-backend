use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, JoinType, QueryFilter,
    QuerySelect, RelationTrait, Set,
};
use tracing::{error, info};

pub struct FactsService;

impl FactsService {
    pub async fn update_user_facts(db: &DatabaseConnection, user_id: &str) -> Result<(), AppError> {
        info!("📊 Updating file facts for user: {}", user_id);

        // 1. Get all non-deleted files for this user and their sizes/categories
        // We use a join to get everything in one query or more efficiently
        let results = UserFiles::find()
            .column_as(storage_files::Column::Size, "size")
            .column_as(file_metadata::Column::Category, "category")
            .join(JoinType::LeftJoin, user_files::Relation::StorageFiles.def())
            .join_rev(
                JoinType::LeftJoin,
                file_metadata::Entity::belongs_to(storage_files::Entity)
                    .from(file_metadata::Column::StorageFileId)
                    .to(storage_files::Column::Id)
                    .into(),
            )
            .filter(user_files::Column::UserId.eq(user_id))
            .filter(user_files::Column::DeletedAt.is_null())
            .filter(user_files::Column::IsFolder.eq(false))
            .into_model::<FileFactRow>()
            .all(db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let total_files = results.len() as i64;
        let mut total_size: i64 = 0;
        let mut video_count: i64 = 0;
        let mut audio_count: i64 = 0;
        let mut document_count: i64 = 0;
        let mut image_count: i64 = 0;
        let mut others_count: i64 = 0;

        for row in results {
            total_size += row.size.unwrap_or(0);

            let category = row.category.unwrap_or_else(|| "others".to_string());

            match category.to_lowercase().as_str() {
                "video" => video_count += 1,
                "audio" => audio_count += 1,
                "image" => image_count += 1,
                "document" | "pdf" | "text" | "doc" => document_count += 1,
                _ => others_count += 1,
            }
        }

        info!(
            "📊 User {user_id} facts: total_files={total_files}, size={total_size}, img={image_count}, vid={video_count}, doc={document_count}"
        );

        // 2. Upsert facts
        let existing = UserFileFacts::find_by_id(user_id)
            .one(db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        if let Some(fact) = existing {
            let mut active: user_file_facts::ActiveModel = fact.into();
            active.total_files = Set(total_files);
            active.total_size = Set(total_size);
            active.video_count = Set(video_count);
            active.audio_count = Set(audio_count);
            active.document_count = Set(document_count);
            active.image_count = Set(image_count);
            active.others_count = Set(others_count);
            active.updated_at = Set(Utc::now());
            active
                .update(db)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        } else {
            let active = user_file_facts::ActiveModel {
                user_id: Set(user_id.to_string()),
                total_files: Set(total_files),
                total_size: Set(total_size),
                video_count: Set(video_count),
                audio_count: Set(audio_count),
                document_count: Set(document_count),
                image_count: Set(image_count),
                others_count: Set(others_count),
                updated_at: Set(Utc::now()),
            };
            UserFileFacts::insert(active)
                .exec(db)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }

        info!("✅ Facts updated for user {}", user_id);
        Ok(())
    }

    pub async fn update_all_users(db: &DatabaseConnection) -> Result<(), AppError> {
        let users = Users::find()
            .all(db)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        for user in users {
            if let Err(e) = Self::update_user_facts(db, &user.id).await {
                error!("Failed to update facts for user {}: {}", user.id, e);
            }
        }
        Ok(())
    }
}

#[derive(sea_orm::FromQueryResult)]
struct FileFactRow {
    pub size: Option<i64>,
    pub category: Option<String>,
}
