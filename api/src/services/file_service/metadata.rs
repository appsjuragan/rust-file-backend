use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

use super::FileService;

impl FileService {
    pub(crate) async fn save_metadata_and_tags(
        &self,
        storage_file_id: &str,
        user_file_id: &str,
        analysis: Option<crate::services::metadata::MetadataResult>,
    ) -> Result<(), anyhow::Error> {
        let tags_to_link = if let Some(a) = analysis {
            tracing::debug!(
                "Saving new metadata for storage_file_id: {}",
                storage_file_id
            );
            let existing_meta = FileMetadata::find()
                .filter(file_metadata::Column::StorageFileId.eq(storage_file_id))
                .one(&self.db)
                .await?;

            if existing_meta.is_none() {
                let mut metadata_with_tags = a.metadata.clone();
                metadata_with_tags["auto_tags"] = serde_json::json!(a.suggested_tags);

                let meta_model = file_metadata::ActiveModel {
                    id: Set(Uuid::new_v4().to_string()),
                    storage_file_id: Set(storage_file_id.to_string()),
                    category: Set(a.category.clone()),
                    metadata: Set(metadata_with_tags),
                };
                meta_model.insert(&self.db).await?;
            }
            a.suggested_tags
        } else {
            tracing::debug!(
                "Dedup case, fetching metadata for storage_file_id: {}",
                storage_file_id
            );
            let existing_meta = FileMetadata::find()
                .filter(file_metadata::Column::StorageFileId.eq(storage_file_id))
                .one(&self.db)
                .await?;

            if let Some(meta) = existing_meta {
                meta.metadata["auto_tags"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        };

        for tag_name in tags_to_link {
            let normalized_name = tag_name.to_lowercase();

            let tag = match Tags::find()
                .filter(tags::Column::Name.eq(&normalized_name))
                .one(&self.db)
                .await?
            {
                Some(t) => t,
                None => {
                    let new_tag = tags::ActiveModel {
                        id: Set(Uuid::new_v4().to_string()),
                        name: Set(normalized_name.clone()),
                    };

                    match new_tag.insert(&self.db).await {
                        Ok(t) => t,
                        Err(e)
                            if e.to_string().contains("duplicate")
                                || e.to_string().contains("unique") =>
                        {
                            // Race condition: another thread inserted it. Refetch.
                            Tags::find()
                                .filter(tags::Column::Name.eq(&normalized_name))
                                .one(&self.db)
                                .await?
                                .ok_or_else(|| {
                                    AppError::Internal(
                                        "Tag missing after duplicate error".to_string(),
                                    )
                                })?
                        }
                        Err(e) => return Err(e.into()),
                    }
                }
            };

            let link = file_tags::ActiveModel {
                user_file_id: Set(user_file_id.to_string()),
                tag_id: Set(tag.id),
            };

            // Ignore error if link already exists (unique primary key)
            let _ = link.insert(&self.db).await;
        }

        Ok(())
    }
}
