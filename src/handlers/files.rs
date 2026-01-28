use crate::entities::{prelude::*, *};
use crate::services::scanner::ScanResult;
use crate::services::metadata::MetadataService;
use crate::utils::auth::Claims;
use crate::utils::validation::{sanitize_filename, validate_upload};
use axum::{
    Extension, Json,
    body::Body,
    extract::{Multipart, Path, State, Query},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use chrono::{Duration, Utc};
use futures::TryStreamExt;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set, Condition, ModelTrait, QuerySelect, RelationTrait};
use serde::Deserialize;
use serde::Serialize;
use tokio::io::AsyncReadExt;
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
) -> Result<Json<PreCheckResponse>, (StatusCode, String)> {
    let existing = StorageFiles::find()
        .filter(storage_files::Column::Hash.eq(&req.full_hash))
        .filter(storage_files::Column::Size.eq(req.size))
        .one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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
) -> Result<Json<UploadResponse>, (StatusCode, String)> {
    let mut filename = String::new();
    let mut expiration_hours: Option<i64> = None;
    let mut parent_id: Option<String> = None;
    let mut upload_result = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        let name = field.name().unwrap_or_default().to_string();

        if name == "file" {
            let original_filename = field.file_name().unwrap_or("unnamed").to_string();
            let content_type = field.content_type().map(|s| s.to_string());

            // 1. Sanitize filename
            filename = sanitize_filename(&original_filename)
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

            // 2. Peek into stream for magic bytes
            let body_with_io_error =
                field.map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err));
            let mut reader = StreamReader::new(body_with_io_error);

            let mut header_buffer = [0u8; 1024]; // Read up to 1KB header
            let n = reader.read(&mut header_buffer).await.map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Read error: {}", e),
                )
            })?;
            let header = &header_buffer[..n];

            // 3. Early Validation (MIME + Magic Bytes)
            validate_upload(&filename, content_type.as_deref(), 0, header)
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

            // Reconstruct stream
            let header_cursor = std::io::Cursor::new(header.to_vec());
            let chained_reader = tokio::io::AsyncReadExt::chain(header_cursor, reader);

            // 4. Upload to Staging
            let staging_key = format!("staging/{}", Uuid::new_v4());
            let res = state
                .storage
                .upload_stream_with_hash(&staging_key, chained_reader)
                .await
                .map_err(|e| {
                    tracing::error!("S3 staging upload failed: {:?}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
                })?;

            // 5. Post-upload Size Validation
            if let Err(e) = crate::utils::validation::validate_file_size(res.size as usize) {
                let _ = state.storage.delete_file(&staging_key).await;
                return Err((StatusCode::PAYLOAD_TOO_LARGE, e.to_string()));
            }

            upload_result = Some(res);
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

    let upload = upload_result.ok_or((StatusCode::BAD_REQUEST, "No file provided".to_string()))?;

    // Check for deduplication
    let existing_storage_file = StorageFiles::find()
        .filter(storage_files::Column::Hash.eq(&upload.hash))
        .one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut analysis_result = None;
    let storage_file_id = if let Some(sf) = existing_storage_file {
        // Deduplication hit! Increment ref_count
        let mut active: storage_files::ActiveModel = sf.clone().into();
        active.ref_count = Set(sf.ref_count + 1);
        active
            .update(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let _ = state.storage.delete_file(&upload.s3_key).await;
        sf.id
    } else {
        // New unique file! Read bytes for analysis and scanning
        let stream = state
            .storage
            .get_object_stream(&upload.s3_key)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to open for processing: {}", e),
                )
            })?;

        let bytes = stream
            .collect()
            .await
            .map(|b| b.into_bytes())
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        // 6. Virus Scanning
        if state.config.enable_virus_scan {
            match state.scanner.scan(&bytes).await {
                Ok(ScanResult::Clean) => {
                    tracing::info!("Virus scan passed for {}", upload.hash);
                }
                Ok(ScanResult::Infected { threat_name }) => {
                    tracing::warn!("Virus detected in {}: {}", upload.hash, threat_name);
                    let _ = state.storage.delete_file(&upload.s3_key).await;
                    return Err((
                        StatusCode::BAD_REQUEST,
                        format!("File rejected: Virus detected ({})", threat_name),
                    ));
                }
                _ => {
                    tracing::error!("Virus scan failed or errored");
                    let _ = state.storage.delete_file(&upload.s3_key).await;
                    return Err((StatusCode::INTERNAL_SERVER_ERROR, "Scan error".to_string()));
                }
            }
        }

        // 7. Metadata Analysis
        let analysis = MetadataService::analyze(&bytes, &filename);
        let mime_type = analysis.metadata["mime_type"].as_str().unwrap_or("application/octet-stream").to_string();
        analysis_result = Some(analysis);

        let id = Uuid::new_v4().to_string();
        let permanent_key = format!("{}/{}", upload.hash, filename);

        state
            .storage
            .copy_object(&upload.s3_key, &permanent_key)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("S3 move failed: {}", e),
                )
            })?;

        let _ = state.storage.delete_file(&upload.s3_key).await;

        let new_storage_file = storage_files::ActiveModel {
            id: Set(id.clone()),
            hash: Set(upload.hash),
            s3_key: Set(permanent_key),
            size: Set(upload.size),
            ref_count: Set(1),
            mime_type: Set(Some(mime_type)),
            scan_status: Set(Some(
                if state.config.enable_virus_scan {
                    "clean"
                } else {
                    "unchecked"
                }
                .to_string(),
            )),
            scanned_at: Set(Some(Utc::now())),
            ..Default::default()
        };

        new_storage_file
            .insert(&state.db)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        id
    };

    let user_file_id = Uuid::new_v4().to_string();
    let expires_at = expiration_hours.map(|h| Utc::now() + Duration::hours(h));

    let new_user_file = user_files::ActiveModel {
        id: Set(user_file_id.clone()),
        user_id: Set(claims.sub),
        storage_file_id: Set(Some(storage_file_id.clone())),
        filename: Set(filename.clone()),
        expires_at: Set(expires_at),
        parent_id: Set(parent_id),
        is_folder: Set(false),
        ..Default::default()
    };

    new_user_file.insert(&state.db).await.map_err(|e| {
        tracing::error!("Failed to insert user_file: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

    // 8. Save Metadata and Tags (Async)
    // Always call save_metadata_and_tags. If analysis_result is None (dedup), 
    // it will fetch existing metadata to link tags to this new user_file.
    if let Err(e) = save_metadata_and_tags(&state.db, &storage_file_id, &user_file_id, analysis_result).await {
        tracing::error!("Failed to save metadata and tags: {}", e);
    }

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
) -> Result<Response, (StatusCode, String)> {
    // 1. Verify file ownership and existence
    let user_file = UserFiles::find_by_id(file_id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::NOT_FOUND,
            "File not found or access denied".to_string(),
        ))?;

    if user_file.is_folder {
        return Err((StatusCode::BAD_REQUEST, "Cannot download a folder".to_string()));
    }

    let storage_file_id = user_file.storage_file_id.ok_or((StatusCode::NOT_FOUND, "Storage file missing".to_string()))?;

    // 2. Check expiration
    if user_file.expires_at.is_some_and(|expires| Utc::now() > expires) {
        return Err((StatusCode::GONE, "File has expired".to_string()));
    }

    // 3. Get storage file
    let storage_file = StorageFiles::find_by_id(storage_file_id)
        .one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Storage file not found".to_string()))?;

    // 4. Get stream from S3
    let stream = state
        .storage
        .get_object_stream(&storage_file.s3_key)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get S3 object stream: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to retrieve file".to_string(),
            )
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
) -> Result<Json<Vec<FileMetadataResponse>>, (StatusCode, String)> {
    let mut cond = Condition::all().add(user_files::Column::UserId.eq(&claims.sub));

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
        select = select.join(sea_orm::JoinType::InnerJoin, storage_files::Relation::FileMetadata.def())
            .filter(file_metadata::Column::Category.eq(cat));
    }

    // Tags filter (Intersection logic)
    if let Some(tags_str) = query.tags {
        let tag_list: Vec<String> = tags_str.split(',').map(|s| s.trim().to_string()).collect();
        if let Some(tag_name) = tag_list.first() {
             select = select.join(sea_orm::JoinType::InnerJoin, user_files::Relation::FileTags.def())
                 .join(sea_orm::JoinType::InnerJoin, file_tags::Relation::Tags.def())
                 .filter(tags::Column::Name.eq(tag_name));
        }
    }

    let items = select
        .all(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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
) -> Result<Json<FileMetadataResponse>, (StatusCode, String)> {
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

    new_folder.insert(&state.db).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
    })?;

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
) -> Result<StatusCode, (StatusCode, String)> {
     let item = UserFiles::find_by_id(id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Item not found".to_string()))?;

    // TODO: Recursive delete for folders? For now, we assume frontend warns or we just delete the pointer.
    // Ideally, we should check checks and delete them too.
    
    item.delete(&state.db).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    // Decrement ref count for storage but do NOT delete storage immediately if other users have it (dedup).
    // In this simplified app, we assume 1:1 or just don't worry about aggressive cleanup for now.
    // Real logic needs to check if storage_file_id is used by others.

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
) -> Result<Json<FileMetadataResponse>, (StatusCode, String)> {
     let item = UserFiles::find_by_id(id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .one(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Item not found".to_string()))?;

    let mut active: user_files::ActiveModel = item.clone().into();
    active.filename = Set(req.name.clone());

    let updated = active.update(&state.db).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    // Need storage info to return full metadata
    let storage_file = if let Some(sid) = updated.storage_file_id.as_ref() {
         StorageFiles::find_by_id(sid.clone()).one(&state.db).await.ok().flatten()
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

async fn save_metadata_and_tags(
    db: &sea_orm::DatabaseConnection,
    storage_file_id: &str,
    user_file_id: &str,
    analysis: Option<crate::services::metadata::MetadataResult>,
) -> Result<(), anyhow::Error> {
    let tags_to_link = if let Some(a) = analysis {
        tracing::debug!("Saving new metadata for storage_file_id: {}", storage_file_id);
        // 1. Save Metadata if it doesn't exist for this storage file
        let existing_meta = FileMetadata::find()
            .filter(file_metadata::Column::StorageFileId.eq(storage_file_id))
            .one(db)
            .await?;

        if existing_meta.is_none() {
            let mut metadata_with_tags = a.metadata.clone();
            metadata_with_tags["auto_tags"] = serde_json::json!(a.suggested_tags);
            
            let meta_model = file_metadata::ActiveModel {
                id: Set(Uuid::new_v4().to_string()),
                storage_file_id: Set(storage_file_id.to_string()),
                category: Set(a.category.clone()),
                metadata: Set(metadata_with_tags),
                ..Default::default()
            };
            meta_model.insert(db).await?;
            tracing::debug!("Inserted new metadata record");
        }
        a.suggested_tags
    } else {
        tracing::debug!("Dedup case, fetching metadata for storage_file_id: {}", storage_file_id);
        // Dedup case: Fetch existing metadata to get auto_tags
        let existing_meta = FileMetadata::find()
            .filter(file_metadata::Column::StorageFileId.eq(storage_file_id))
            .one(db)
            .await?;
        
        if let Some(meta) = existing_meta {
            meta.metadata["auto_tags"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default()
        } else {
            tracing::debug!("No existing metadata found for deduped file");
            Vec::new()
        }
    };

    tracing::debug!("Linking {} tags to user_file_id: {}", tags_to_link.len(), user_file_id);

    // 2. Link Tags to UserFile
    for tag_name in tags_to_link {
        // Find or create tag
        let tag = match Tags::find()
            .filter(tags::Column::Name.eq(&tag_name))
            .one(db)
            .await?
        {
            Some(t) => t,
            None => {
                let new_tag = tags::ActiveModel {
                    id: Set(Uuid::new_v4().to_string()),
                    name: Set(tag_name.clone()),
                    ..Default::default()
                };
                new_tag.insert(db).await?
            }
        };

        // Link to user file
        let link = file_tags::ActiveModel {
            user_file_id: Set(user_file_id.to_string()),
            tag_id: Set(tag.id),
            ..Default::default()
        };
        let _ = link.insert(db).await; // Ignore duplicate links
    }

    Ok(())
}

