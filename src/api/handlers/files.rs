use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use crate::utils::validation::sanitize_filename;
use axum::{
    Extension, Json,
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use chrono::Utc;
use futures::TryStreamExt;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, EntityTrait, QueryFilter, QuerySelect, RelationTrait,
    Set,
};
use serde::Deserialize;
use serde::Serialize;

use tokio_util::io::{ReaderStream, StreamReader};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, ToSchema)]
pub struct UploadResponse {
    pub file_id: String,
    pub filename: String,
    pub expires_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Serialize, ToSchema)]
pub struct FileMetadataResponse {
    pub id: String,
    pub filename: String,
    pub size: Option<i64>,
    pub mime_type: Option<String>,
    pub is_folder: bool,
    pub parent_id: Option<String>,
    pub created_at: chrono::DateTime<Utc>,
    pub expires_at: Option<chrono::DateTime<Utc>>,
    pub tags: Vec<String>,
    pub category: Option<String>,
    pub extra_metadata: Option<serde_json::Value>,
}

#[derive(Deserialize, ToSchema)]
pub struct PreCheckRequest {
    pub full_hash: String,
    pub size: i64,
    pub chunk_hashes: Option<Vec<ChunkHash>>,
}

#[derive(Serialize, ToSchema)]
pub struct PreCheckResponse {
    pub exists: bool,
    pub upload_token: Option<String>,
    pub file_id: Option<String>,
}

#[derive(Deserialize, Serialize, ToSchema, Clone)]
pub struct ChunkHash {
    pub offset: i64,
    pub size: i64,
    pub hash: String,
}

#[derive(Deserialize)]
pub struct ListFilesQuery {
    pub parent_id: Option<String>,
    pub search: Option<String>,
    pub tags: Option<String>, // Comma separated
    pub category: Option<String>,
    pub start_date: Option<chrono::DateTime<Utc>>,
    pub end_date: Option<chrono::DateTime<Utc>>,
    pub min_size: Option<i64>,
    pub max_size: Option<i64>,
}

#[derive(Deserialize, ToSchema)]
pub struct CreateFolderRequest {
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct RenameRequest {
    pub name: String,
}

#[derive(Deserialize, ToSchema)]
pub struct BulkDeleteRequest {
    pub item_ids: Vec<String>,
}

#[derive(Serialize, ToSchema)]
pub struct BulkDeleteResponse {
    pub deleted_count: usize,
}

#[utoipa::path(
    post,
    path = "/pre-check",
    request_body = PreCheckRequest,
    responses(
        (status = 200, description = "Pre-check successful", body = PreCheckResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn pre_check_dedup(
    State(state): State<crate::AppState>,
    Extension(_claims): Extension<Claims>,
    Json(req): Json<PreCheckRequest>,
) -> Result<Json<PreCheckResponse>, AppError> {
    let existing = StorageFiles::find()
        .filter(storage_files::Column::Hash.eq(&req.full_hash))
        .filter(storage_files::Column::Size.eq(req.size))
        .one(&state.db)
        .await?;

    if let Some(file) = existing {
        Ok(Json(PreCheckResponse {
            exists: true,
            upload_token: None,
            file_id: Some(file.id),
        }))
    } else {
        Ok(Json(PreCheckResponse {
            exists: false,
            upload_token: Some(Uuid::new_v4().to_string()),
            file_id: None,
        }))
    }
}

#[utoipa::path(
    post,
    path = "/upload",
    request_body(content = Multipart, description = "File upload"),
    responses(
        (status = 200, description = "File uploaded successfully", body = UploadResponse),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn upload_file(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, AppError> {
    let mut filename = String::new();
    let mut expiration_hours: Option<i64> = None;
    let mut parent_id: Option<String> = None;
    let mut staged_file = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or_default().to_string();

        if name == "file" {
            let original_filename = field.file_name().unwrap_or("unnamed").to_string();
            let content_type = field.content_type().map(|s| s.to_string());

            // 1. Sanitize filename
            filename = sanitize_filename(&original_filename)
                .map_err(|e| AppError::BadRequest(e.to_string()))?;

            // 2. Create reader
            let body_with_io_error =
                field.map_err(std::io::Error::other);
            let reader = StreamReader::new(body_with_io_error);

            // 3. Upload to Staging
            staged_file = Some(
                state
                    .file_service
                    .upload_to_staging(&filename, content_type.as_deref(), reader)
                    .await?,
            );
        } else if name == "expiration_hours" {
            let text = field.text().await.unwrap_or_default();
            expiration_hours = text.parse().ok();
        } else if name == "parent_id" {
            let text = field.text().await.unwrap_or_default();
            if !text.is_empty() && text != "null" {
                parent_id = Some(text);
            }
        }
    }

    let staged = staged_file.ok_or(AppError::BadRequest("No file provided".to_string()))?;

    // 4. Process Upload
    let (user_file_id, expires_at) = state
        .file_service
        .process_upload(
            staged,
            filename.clone(),
            claims.sub,
            parent_id,
            expiration_hours,
        )
        .await?;

    Ok(Json(UploadResponse {
        file_id: user_file_id,
        filename,
        expires_at,
    }))
}

#[utoipa::path(
    get,
    path = "/files/{id}",
    params(
        ("id" = String, Path, description = "User File ID")
    ),
    responses(
        (status = 200, description = "File download stream"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "File not found"),
        (status = 410, description = "File expired")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn download_file(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(file_id): Path<String>,
) -> Result<Response, AppError> {
    // 1. Verify file ownership and existence
    let user_file = UserFiles::find_by_id(file_id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound(
            "File not found, access denied, or already deleted".to_string(),
        ))?;

    if user_file.is_folder {
        return Err(AppError::BadRequest("Cannot download a folder".to_string()));
    }

    let storage_file_id = user_file
        .storage_file_id
        .ok_or(AppError::NotFound("Storage file missing".to_string()))?;

    // 2. Check expiration
    if user_file
        .expires_at
        .is_some_and(|expires| Utc::now() > expires)
    {
        return Err(AppError::Gone("File has expired".to_string()));
    }

    // 3. Get storage file
    let storage_file = StorageFiles::find_by_id(storage_file_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;

    // 4. Get stream from S3
    let stream = state
        .storage
        .get_object_stream(&storage_file.s3_key)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get S3 object stream: {}", e);
            AppError::Internal("Failed to retrieve file".to_string())
        })?;

    // 5. Return stream response
    let body = Body::from_stream(ReaderStream::new(stream.into_async_read()));

    let content_type = storage_file
        .mime_type
        .unwrap_or_else(|| "application/octet-stream".to_string());

    let headers = [
        (header::CONTENT_TYPE, content_type),
        (
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", user_file.filename),
        ),
    ];

    Ok((headers, body).into_response())
}

#[utoipa::path(
    get,
    path = "/files",
    params(
        ("parent_id" = Option<String>, Query, description = "Parent Folder ID"),
        ("search" = Option<String>, Query, description = "Search query")
    ),
    responses(
        (status = 200, description = "List of user files", body = Vec<FileMetadata>),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn list_files(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<ListFilesQuery>,
) -> Result<Json<Vec<FileMetadataResponse>>, AppError> {
    let mut cond = Condition::all()
        .add(user_files::Column::UserId.eq(&claims.sub))
        .add(user_files::Column::DeletedAt.is_null()); // Exclude soft-deleted items

    // Basic filters
    if let Some(parent) = query.parent_id {
        if parent == "root" {
            cond = cond.add(user_files::Column::ParentId.is_null());
        } else {
            cond = cond.add(user_files::Column::ParentId.eq(parent));
        }
    } else if query.search.is_none() && query.tags.is_none() && query.category.is_none() {
        cond = cond.add(user_files::Column::ParentId.is_null());
    }

    if let Some(search) = query.search {
        cond = cond.add(user_files::Column::Filename.contains(&search));
    }

    if let Some(start) = query.start_date {
        cond = cond.add(user_files::Column::CreatedAt.gte(start));
    }
    if let Some(end) = query.end_date {
        cond = cond.add(user_files::Column::CreatedAt.lte(end));
    }

    // Use SelectTwo to fetch both UserFiles and StorageFiles (JOIN storage_files)
    let mut select = UserFiles::find()
        .find_also_related(StorageFiles)
        .filter(cond);

    // Filter by StorageFiles info
    if let Some(min) = query.min_size {
        select = select.filter(storage_files::Column::Size.gte(min));
    }
    if let Some(max) = query.max_size {
        select = select.filter(storage_files::Column::Size.lte(max));
    }

    // Join with FileMetadata for category filter
    if let Some(cat) = query.category {
        // We join FileMetadata using the already joined StorageFiles
        select = select
            .join(
                sea_orm::JoinType::InnerJoin,
                storage_files::Relation::FileMetadata.def(),
            )
            .filter(file_metadata::Column::Category.eq(cat));
    }

    // Tags filter (Intersection logic)
    if let Some(tags_str) = query.tags {
        let tag_list: Vec<String> = tags_str.split(',').map(|s| s.trim().to_string()).collect();
        if let Some(tag_name) = tag_list.first() {
            select = select
                .join(
                    sea_orm::JoinType::InnerJoin,
                    user_files::Relation::FileTags.def(),
                )
                .join(
                    sea_orm::JoinType::InnerJoin,
                    file_tags::Relation::Tags.def(),
                )
                .filter(tags::Column::Name.eq(tag_name));
        }
    }

    let items = select.all(&state.db).await?;

    let mut result = Vec::new();
    for (user_file, storage_file) in items {
        // Fetch tags and metadata for response
        let tags_items = Tags::find()
            .join(sea_orm::JoinType::InnerJoin, tags::Relation::FileTags.def())
            .filter(file_tags::Column::UserFileId.eq(&user_file.id))
            .all(&state.db)
            .await
            .unwrap_or_default();

        let tags_vec: Vec<String> = tags_items.into_iter().map(|t| t.name).collect();

        let metadata = if let Some(ref sf) = storage_file {
            FileMetadata::find()
                .filter(file_metadata::Column::StorageFileId.eq(&sf.id))
                .one(&state.db)
                .await
                .ok()
                .flatten()
        } else {
            None
        };

        result.push(FileMetadataResponse {
            id: user_file.id,
            filename: user_file.filename,
            size: storage_file.as_ref().map(|s| s.size),
            mime_type: storage_file.as_ref().and_then(|s| s.mime_type.clone()),
            is_folder: user_file.is_folder,
            parent_id: user_file.parent_id,
            created_at: user_file.created_at.unwrap_or_else(Utc::now),
            expires_at: user_file.expires_at,
            tags: tags_vec,
            category: metadata.as_ref().map(|m| m.category.clone()),
            extra_metadata: metadata.map(|m| m.metadata),
        });
    }

    Ok(Json(result))
}

#[utoipa::path(
    post,
    path = "/folders",
    request_body = CreateFolderRequest,
    responses(
        (status = 200, description = "Folder created"),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn create_folder(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateFolderRequest>,
) -> Result<Json<FileMetadataResponse>, AppError> {
    let id = Uuid::new_v4().to_string();

    let new_folder = user_files::ActiveModel {
        id: Set(id.clone()),
        user_id: Set(claims.sub),
        storage_file_id: Set(None),
        filename: Set(req.name.clone()),
        is_folder: Set(true),
        parent_id: Set(req.parent_id.clone()),
        created_at: Set(Some(Utc::now())),
        ..Default::default()
    };

    new_folder
        .insert(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(FileMetadataResponse {
        id,
        filename: req.name,
        size: None,
        mime_type: None,
        is_folder: true,
        parent_id: req.parent_id,
        created_at: Utc::now(),
        expires_at: None,
        tags: Vec::new(),
        category: Some("folder".to_string()),
        extra_metadata: None,
    }))
}

#[utoipa::path(
    delete,
    path = "/files/{id}",
    params(
        ("id" = String, Path, description = "File/Folder ID")
    ),
    responses(
        (status = 200, description = "Item deleted"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Item not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn delete_item(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    use crate::services::storage_lifecycle::StorageLifecycleService;

    let item = UserFiles::find_by_id(id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null()) // Only non-deleted items
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound(
            "Item not found or already deleted".to_string(),
        ))?;

    if item.is_folder {
        // Recursively delete folder and all children
        StorageLifecycleService::delete_folder_recursive(
            &state.db,
            state.storage.as_ref(),
            &item.id,
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete folder recursively: {}", e);
            AppError::Internal(e.to_string())
        })?;
    }

    // Soft delete the item and decrement ref count
    StorageLifecycleService::soft_delete_user_file(&state.db, state.storage.as_ref(), &item)
        .await
        .map_err(|e| {
            tracing::error!("Failed to soft delete user file: {}", e);
            AppError::Internal(e.to_string())
        })?;

    Ok(StatusCode::OK)
}

#[utoipa::path(
    put,
    path = "/files/{id}/rename",
    request_body = RenameRequest,
    params(
        ("id" = String, Path, description = "File/Folder ID")
    ),
    responses(
        (status = 200, description = "Item renamed"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Item not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn rename_item(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
    Json(req): Json<RenameRequest>,
) -> Result<Json<FileMetadataResponse>, AppError> {
    let item = UserFiles::find_by_id(id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
        .ok_or(AppError::NotFound(
            "Item not found or already deleted".to_string(),
        ))?;

    let mut active: user_files::ActiveModel = item.clone().into();
    active.filename = Set(req.name.clone());

    let updated = active.update(&state.db).await?;

    // Need storage info to return full metadata
    let storage_file = if let Some(sid) = updated.storage_file_id.as_ref() {
        StorageFiles::find_by_id(sid.clone())
            .one(&state.db)
            .await
            .ok()
            .flatten()
    } else {
        None
    };

    // Fetch tags and metadata for response
    let tags_items = Tags::find()
        .join(sea_orm::JoinType::InnerJoin, tags::Relation::FileTags.def())
        .filter(file_tags::Column::UserFileId.eq(&updated.id))
        .all(&state.db)
        .await
        .unwrap_or_default();

    let tags_vec: Vec<String> = tags_items.into_iter().map(|t| t.name).collect();

    let metadata = if let Some(ref sf) = storage_file {
        FileMetadata::find()
            .filter(file_metadata::Column::StorageFileId.eq(&sf.id))
            .one(&state.db)
            .await
            .ok()
            .flatten()
    } else {
        None
    };

    Ok(Json(FileMetadataResponse {
        id: updated.id,
        filename: updated.filename,
        size: storage_file.as_ref().map(|s| s.size),
        mime_type: storage_file.as_ref().and_then(|s| s.mime_type.clone()),
        is_folder: updated.is_folder,
        parent_id: updated.parent_id,
        created_at: updated.created_at.unwrap_or_else(Utc::now),
        expires_at: updated.expires_at,
        tags: tags_vec,
        category: metadata.as_ref().map(|m| m.category.clone()),
        extra_metadata: metadata.map(|m| m.metadata),
    }))
}

#[utoipa::path(
    post,
    path = "/files/bulk-delete",
    request_body = BulkDeleteRequest,
    responses(
        (status = 200, description = "Items deleted", body = BulkDeleteResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn bulk_delete(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkDeleteRequest>,
) -> Result<Json<BulkDeleteResponse>, AppError> {
    use crate::services::storage_lifecycle::StorageLifecycleService;

    if req.item_ids.is_empty() {
        return Err(AppError::BadRequest("No items provided".to_string()));
    }

    let deleted_count = StorageLifecycleService::bulk_delete(
        &state.db,
        state.storage.as_ref(),
        &claims.sub,
        req.item_ids,
    )
    .await
    .map_err(|e| {
        tracing::error!("Bulk delete failed: {}", e);
        AppError::Internal(e.to_string())
    })?;

    Ok(Json(BulkDeleteResponse { deleted_count }))
}
