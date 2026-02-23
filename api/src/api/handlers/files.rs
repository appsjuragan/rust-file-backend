use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use crate::utils::validation::sanitize_filename;
use axum::{
    Extension, Json,
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{StatusCode, header},
    response::Response,
};
use chrono::Utc;
use futures::TryStreamExt;
use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, ConnectionTrait, EntityTrait, IntoActiveModel,
    QueryFilter, QueryOrder, QuerySelect, RelationTrait, Set,
    sea_query::{Expr, Func},
};
use serde::{Deserialize, Serialize};
use tokio_util::io::StreamReader;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

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
    pub scan_status: Option<String>,
    pub scan_result: Option<String>,
    pub hash: Option<String>,
    pub is_favorite: bool,
}

#[derive(Serialize, ToSchema)]
pub struct FolderTreeEntry {
    pub id: String,
    pub filename: String,
    pub parent_id: Option<String>,
}

#[derive(Deserialize, ToSchema, Validate)]

pub struct PreCheckRequest {
    #[validate(length(min = 32, max = 32, message = "Invalid hash format"))]
    pub full_hash: String,
    #[validate(range(min = 1, message = "File size must be positive"))]
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
    pub regex: Option<bool>,
    pub wildcard: Option<bool>,
    pub similarity: Option<bool>,
    pub limit: Option<u64>,
    pub offset: Option<u64>,
    pub is_favorite: Option<bool>,
}

#[derive(Deserialize, ToSchema, Validate)]
pub struct CreateFolderRequest {
    #[validate(length(
        min = 1,
        max = 255,
        message = "Folder name must be between 1 and 255 characters"
    ))]
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct RenameRequest {
    pub name: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct BulkDeleteRequest {
    pub item_ids: Vec<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct BulkMoveRequest {
    pub item_ids: Vec<String>,
    pub parent_id: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct BulkMoveResponse {
    pub moved_count: usize,
}

#[derive(Deserialize, ToSchema)]
pub struct LinkFileRequest {
    pub storage_file_id: String,
    pub filename: String,
    pub parent_id: Option<String>,
    pub expiration_hours: Option<i64>,
}

#[derive(Serialize, ToSchema)]
pub struct ZipEntry {
    pub name: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_dir: bool,
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
    req.validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

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
    path = "/files/link",
    request_body = LinkFileRequest,
    responses(
        (status = 200, description = "File linked successfully", body = UploadResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Storage file not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn link_file(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<LinkFileRequest>,
) -> Result<Json<UploadResponse>, AppError> {
    let rules = crate::utils::validation::ValidationRules::load(
        &state.db,
        state.config.max_file_size,
        state.config.chunk_size,
    )
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load validation rules: {}", e)))?;

    let sanitized_filename = crate::utils::validation::sanitize_filename(&req.filename, &rules)
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let (user_file_id, expires_at) = state
        .file_service
        .link_existing_file(
            req.storage_file_id,
            sanitized_filename.clone(),
            claims.sub,
            req.parent_id,
            req.expiration_hours,
        )
        .await?;

    Ok(Json(UploadResponse {
        file_id: user_file_id,
        filename: req.filename,
        expires_at,
    }))
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
    let mut total_size: Option<u64> = None;
    let mut staged_file: Option<crate::services::file_service::StagedFile> = None;

    // Use a result to capture errors so we can consume the multipart stream if needed
    let result: Result<Json<UploadResponse>, AppError> = async {
        while let Some(field) = multipart.next_field().await.map_err(|e| {
            let err_msg = e.to_string();
            if err_msg.contains("length limit exceeded") {
                AppError::PayloadTooLarge(
                    "Request body exceeds the maximum allowed limit".to_string(),
                )
            } else {
                AppError::BadRequest(err_msg)
            }
        })? {
            let name = field.name().unwrap_or_default().to_string();

            if name == "file" {
                let original_filename = field.file_name().unwrap_or("unnamed").to_string();
                let content_type = field.content_type().map(|s| s.to_string());

                // 0. Load Validation Rules
                let rules = crate::utils::validation::ValidationRules::load(
                    &state.db,
                    state.config.max_file_size,
                    state.config.chunk_size,
                )
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Failed to load validation rules: {}", e))
                })?;

                // 1. Sanitize filename
                filename = sanitize_filename(&original_filename, &rules)
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;

                // 2. Create reader
                let body_with_io_error = field.map_err(std::io::Error::other);
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
            } else if name == "total_size" {
                let text = field.text().await.unwrap_or_default();
                total_size = text.parse().ok();
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
                total_size,
            )
            .await?;

        Ok(Json(UploadResponse {
            file_id: user_file_id,
            filename,
            expires_at,
        }))
    }
    .await;

    match result {
        Ok(res) => Ok(res),
        Err(e) => {
            // CRITICAL: Consume the remaining multipart stream to avoid TCP reset ("Network error" in browser)
            // This is especially important for restricted files or large files rejected early
            tracing::warn!("Upload failed early: {}. Consuming remaining stream...", e);
            while let Ok(Some(mut field)) = multipart.next_field().await {
                while let Ok(Some(_)) = field.chunk().await {}
            }
            Err(e)
        }
    }
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
    let user_file = UserFiles::find_by_id(file_id.clone())
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
        .clone()
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

    // 4. Security: Check Virus Scan Status
    if matches!(storage_file.scan_status.as_deref(), Some("infected")) {
        tracing::warn!("Blocked access to infected file: {}", file_id);
        return Err(AppError::Forbidden(format!(
            "File is infected with malware: {}",
            storage_file
                .scan_result
                .as_deref()
                .unwrap_or("unknown threat")
        )));
    }

    // 5. Generate presigned URL and redirect (no data through backend memory)
    let (content_type, content_disposition) =
        resolve_file_headers(&user_file.filename, &storage_file);

    let presigned_url = state
        .storage
        .generate_presigned_url_raw(
            &storage_file.s3_key,
            43200, // 12 hours
            &content_type,
            &content_disposition,
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to generate presigned URL: {}", e);
            AppError::Internal("Failed to generate download URL".to_string())
        })?;

    tracing::info!(
        "📎 Presigned redirect for file_id={} user={}",
        file_id,
        claims.sub
    );

    let url = url::Url::parse(&presigned_url).map_err(|e| {
        tracing::error!("Failed to parse presigned URL: {}", e);
        AppError::Internal("Failed to generate download URL".to_string())
    })?;

    // Extract path and query for X-Accel-Redirect
    // Should be /bucket/key?Signature=...
    let path = url.path();
    let query = url.query().unwrap_or("");
    let internal_redirect_uri = format!("/minio_protected{}?{}", path, query);

    tracing::info!(
        "📎 X-Accel-Redirect for file_id={} user={}",
        file_id,
        claims.sub
    );

    Ok(Response::builder()
        .status(StatusCode::OK)
        // Nginx internal redirect
        .header("X-Accel-Redirect", internal_redirect_uri)
        // Content headers for the client
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_DISPOSITION, content_disposition)
        .header(header::CACHE_CONTROL, "private, max-age=31536000") // 1 year cache since it's immutable
        .body(Body::empty())
        .unwrap())
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
    } else if query.search.is_none()
        && query.tags.is_none()
        && query.category.is_none()
        && query.is_favorite.is_none()
    {
        cond = cond.add(user_files::Column::ParentId.is_null());
    }

    if let Some(fav) = query.is_favorite {
        cond = cond.add(user_files::Column::IsFavorite.eq(fav));
    }

    if let Some(ref search) = query.search {
        if query.regex.unwrap_or(false) {
            // Postgres: ~ , SQLite: REGEXP
            let op = if state.db.get_database_backend() == sea_orm::DatabaseBackend::Postgres {
                "~*" // Case-insensitive regex
            } else {
                "REGEXP"
            };
            cond = cond.add(
                Expr::col(user_files::Column::Filename)
                    .binary(sea_orm::sea_query::BinOper::Custom(op), Expr::val(search)),
            );
        } else if query.wildcard.unwrap_or(false) {
            // Use LIKE with the search string as is (user provides % or *)
            let pattern = search.replace('*', "%").replace('?', "_");
            cond = cond.add(user_files::Column::Filename.like(pattern));
        } else {
            // Case-insensitive search using ILIKE (Postgres) or LOWER LIKE (SQLite)
            if state.db.get_database_backend() == sea_orm::DatabaseBackend::Postgres {
                cond = cond.add(Expr::col(user_files::Column::Filename).binary(
                    sea_orm::sea_query::BinOper::Custom("ILIKE"),
                    Expr::val(format!("%{}%", search)),
                ));
            } else {
                cond = cond.add(
                    Expr::expr(Func::lower(Expr::col(user_files::Column::Filename)))
                        .like(format!("%{}%", search.to_lowercase())),
                );
            }
        }
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

    if query.similarity.unwrap_or(false) {
        if let Some(q) = query.search.as_ref() {
            if state.db.get_database_backend() == sea_orm::DatabaseBackend::Postgres {
                select = select.order_by_desc(Expr::cust_with_values(
                    "similarity(filename, $1)",
                    [sea_orm::Value::from(q)],
                ));
            }
            select = select.limit(query.limit.unwrap_or(15));
            if let Some(offset) = query.offset {
                select = select.offset(offset);
            }
        } else {
            select = select.order_by_desc(user_files::Column::CreatedAt);
        }
    } else {
        select = select.order_by_desc(user_files::Column::CreatedAt);
        if let Some(limit) = query.limit {
            select = select.limit(limit);
        }
        if let Some(offset) = query.offset {
            select = select.offset(offset);
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
            scan_status: storage_file.as_ref().and_then(|s| s.scan_status.clone()),
            scan_result: storage_file.as_ref().and_then(|s| s.scan_result.clone()),
            hash: storage_file.as_ref().map(|s| s.hash.clone()),
            is_favorite: user_file.is_favorite,
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

    let rules = crate::utils::validation::ValidationRules::load(
        &state.db,
        state.config.max_file_size,
        state.config.chunk_size,
    )
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load validation rules: {}", e)))?;

    let sanitized_name =
        sanitize_filename(&req.name, &rules).map_err(|e| AppError::BadRequest(e.to_string()))?;

    let new_folder = user_files::ActiveModel {
        id: Set(id.clone()),
        user_id: Set(claims.sub),
        storage_file_id: Set(None),
        filename: Set(sanitized_name.clone()),
        is_folder: Set(true),
        parent_id: Set(req.parent_id.clone()),
        created_at: Set(Some(Utc::now())),
        is_favorite: Set(false),
        ..Default::default()
    };

    let res = new_folder.insert(&state.db).await?;

    Ok(Json(FileMetadataResponse {
        id: res.id,
        filename: res.filename,
        size: None,
        mime_type: None,
        is_folder: true,
        parent_id: res.parent_id,
        created_at: res.created_at.unwrap_or_else(Utc::now),
        expires_at: res.expires_at,
        tags: Vec::new(),
        category: None,
        extra_metadata: None,
        scan_status: None,
        scan_result: None,
        hash: None,
        is_favorite: res.is_favorite,
    }))
}

#[utoipa::path(
    get,
    path = "/files/{id}/path",
    params(
        ("id" = String, Path, description = "Folder ID")
    ),
    responses(
        (status = 200, description = "Folder path breadcrumbs", body = Vec<FileMetadataResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn get_folder_path(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<Json<Vec<FileMetadataResponse>>, AppError> {
    let mut path = Vec::new();
    let mut current_id = Some(id);

    while let Some(id_str) = current_id {
        if id_str == "0" || id_str == "root" {
            break;
        }

        let folder = UserFiles::find_by_id(id_str)
            .filter(user_files::Column::UserId.eq(&claims.sub))
            .filter(user_files::Column::DeletedAt.is_null())
            .one(&state.db)
            .await?
            .ok_or(AppError::NotFound("Folder not found".to_string()))?;

        if !folder.is_folder {
            return Err(AppError::BadRequest("ID is not a folder".to_string()));
        }

        path.insert(
            0,
            FileMetadataResponse {
                id: folder.id.clone(),
                filename: folder.filename.clone(),
                size: None,
                mime_type: None,
                is_folder: true,
                parent_id: folder.parent_id.clone(),
                created_at: folder.created_at.unwrap_or_else(Utc::now),
                expires_at: folder.expires_at,
                tags: Vec::new(),
                category: None,
                extra_metadata: None,
                scan_status: None,
                scan_result: None,
                hash: None,
                is_favorite: folder.is_favorite,
            },
        );

        current_id = folder.parent_id;
    }

    Ok(Json(path))
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
    state.file_service.delete_item(&claims.sub, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/files/{id}/favorite",
    params(
        ("id" = String, Path, description = "File/Folder ID")
    ),
    responses(
        (status = 200, description = "Favorite status toggled", body = FileMetadataResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Item not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn toggle_favorite(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<Json<FileMetadataResponse>, AppError> {
    let item = UserFiles::find_by_id(id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Item not found".to_string()))?;

    let mut active_model = item.into_active_model();
    active_model.is_favorite = Set(!active_model.is_favorite.unwrap());
    let res = active_model.update(&state.db).await?;

    // Manual mapping for now to include metadata
    let storage_file: Option<storage_files::Model> = if let Some(ref sf_id) = res.storage_file_id {
        StorageFiles::find_by_id(sf_id.clone())
            .one(&state.db)
            .await?
    } else {
        None
    };

    let tags_items: Vec<tags::Model> = Tags::find()
        .join(sea_orm::JoinType::InnerJoin, tags::Relation::FileTags.def())
        .filter(file_tags::Column::UserFileId.eq(&res.id))
        .all(&state.db)
        .await?;

    let metadata = if let Some(ref sf) = storage_file {
        FileMetadata::find()
            .filter(file_metadata::Column::StorageFileId.eq(&sf.id))
            .one(&state.db)
            .await?
    } else {
        None
    };

    Ok(Json(FileMetadataResponse {
        id: res.id,
        filename: res.filename,
        size: storage_file.as_ref().map(|s| s.size),
        mime_type: storage_file.as_ref().and_then(|s| s.mime_type.clone()),
        is_folder: res.is_folder,
        parent_id: res.parent_id,
        created_at: res.created_at.unwrap_or_else(Utc::now),
        expires_at: res.expires_at,
        tags: tags_items.into_iter().map(|t| t.name).collect(),
        category: metadata.as_ref().map(|m| m.category.clone()),
        extra_metadata: metadata.map(|m| m.metadata),
        scan_status: storage_file.as_ref().and_then(|s| s.scan_status.clone()),
        scan_result: storage_file.as_ref().and_then(|s| s.scan_result.clone()),
        hash: storage_file.as_ref().map(|s| s.hash.clone()),
        is_favorite: res.is_favorite,
    }))
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

    let rules = crate::utils::validation::ValidationRules::load(
        &state.db,
        state.config.max_file_size,
        state.config.chunk_size,
    )
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load validation rules: {}", e)))?;

    let target_filename = if let Some(name) = req.name.clone() {
        sanitize_filename(&name, &rules).map_err(|e| AppError::BadRequest(e.to_string()))?
    } else {
        item.filename.clone()
    };

    // Validate and sanitize parent_id input
    let target_parent_id = match req.parent_id.clone() {
        Some(p) if p == "root" || p == "0" => None,
        Some(p) => {
            // Validate that parent_id is a valid UUID format to prevent SQL injection attempts
            if !p.is_empty() && p != "root" && p != "0" {
                // Check if it's a valid UUID format (basic validation)
                if p.len() != 36 || p.chars().filter(|c| *c == '-').count() != 4 {
                    return Err(AppError::BadRequest(
                        "Invalid parent_id format. Must be a valid UUID.".to_string(),
                    ));
                }

                // Verify the parent folder exists and belongs to the user
                let parent_folder = UserFiles::find_by_id(&p)
                    .filter(user_files::Column::UserId.eq(&claims.sub))
                    .filter(user_files::Column::DeletedAt.is_null())
                    .one(&state.db)
                    .await?;

                if parent_folder.is_none() {
                    return Err(AppError::NotFound(
                        "Parent folder not found or access denied".to_string(),
                    ));
                }

                // Verify it's actually a folder
                if let Some(ref parent) = parent_folder
                    && !parent.is_folder
                {
                    return Err(AppError::BadRequest(
                        "Parent ID must refer to a folder, not a file".to_string(),
                    ));
                }
            }
            Some(p)
        }
        None => item.parent_id.clone(),
    };

    // Circularity check: prevent moving a folder into itself or its descendants
    if let Some(ref target_id) = target_parent_id
        && item.is_folder
    {
        if target_id == &item.id {
            return Err(AppError::BadRequest(
                "Cannot move a folder into itself".to_string(),
            ));
        }

        let mut current_check_id = target_id.clone();
        // Traverse up from target parent to root
        while let Some(parent) = UserFiles::find_by_id(current_check_id)
            .filter(user_files::Column::UserId.eq(&claims.sub))
            .one(&state.db)
            .await?
        {
            if parent.id == item.id {
                return Err(AppError::BadRequest(
                    "Cannot move a folder into its own subfolder".to_string(),
                ));
            }
            if let Some(next_id) = parent.parent_id {
                current_check_id = next_id;
            } else {
                break;
            }
        }
    }

    // Check if target already exists (only for files)
    if !item.is_folder {
        let existing = UserFiles::find()
            .filter(user_files::Column::UserId.eq(&claims.sub))
            .filter(user_files::Column::Filename.eq(&target_filename))
            .filter(user_files::Column::ParentId.eq(target_parent_id.clone()))
            .filter(user_files::Column::IsFolder.eq(false))
            .filter(user_files::Column::DeletedAt.is_null())
            .filter(user_files::Column::Id.ne(&item.id))
            .one(&state.db)
            .await?;

        if let Some(existing_file) = existing {
            // Merge logic: Update existing_file to use item's storage_file_id
            let old_storage_file_id = existing_file.storage_file_id.clone();
            let new_storage_file_id = item.storage_file_id.clone();

            let mut active_existing: user_files::ActiveModel = existing_file.clone().into();
            active_existing.storage_file_id = Set(new_storage_file_id.clone());
            active_existing.created_at = Set(Some(Utc::now()));
            let updated = active_existing.update(&state.db).await?;

            // Soft delete the original item (the one being renamed/moved)
            let mut active_item: user_files::ActiveModel = item.clone().into();
            active_item.deleted_at = Set(Some(Utc::now()));
            active_item.update(&state.db).await?;

            // Decrement ref count of the OVERWRITTEN storage file
            if let Some(old_id) = old_storage_file_id
                && Some(old_id.clone()) != new_storage_file_id
            {
                let _ = crate::services::storage_lifecycle::StorageLifecycleService::decrement_ref_count(
                        &state.db,
                        state.storage.as_ref(),
                        &old_id,
                    )
                    .await;
            }

            // Return the updated existing file metadata
            return return_file_metadata(state, updated).await;
        }
    }

    let mut active: user_files::ActiveModel = item.clone().into();
    if let Some(name) = req.name {
        let rules = crate::utils::validation::ValidationRules::load(
            &state.db,
            state.config.max_file_size,
            state.config.chunk_size,
        )
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load validation rules: {}", e)))?;

        let sanitized_name =
            sanitize_filename(&name, &rules).map_err(|e| AppError::BadRequest(e.to_string()))?;
        active.filename = Set(sanitized_name);
    }
    if let Some(parent_id) = req.parent_id {
        if parent_id == "root" || parent_id == "0" {
            active.parent_id = Set(None);
        } else {
            active.parent_id = Set(Some(parent_id));
        }
    }

    let updated = active.update(&state.db).await?;
    return_file_metadata(state, updated).await
}

#[utoipa::path(
    get,
    path = "/files/{id}/zip-contents",
    params(
        ("id" = String, Path, description = "User File ID")
    ),
    responses(
        (status = 200, description = "List of files inside archive (ZIP, 7z)", body = Vec<ZipEntry>),
        (status = 400, description = "File is not a supported archive or too large"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "File not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn get_zip_contents(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ZipEntry>>, AppError> {
    // 1. Verify file ownership and existence
    let user_file = UserFiles::find_by_id(id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("File not found".to_string()))?;

    if user_file.is_folder {
        return Err(AppError::BadRequest(
            "Folders cannot be archives".to_string(),
        ));
    }

    let storage_file_id = user_file
        .storage_file_id
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;
    let storage_file = StorageFiles::find_by_id(storage_file_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;

    // 2. Check size limit (500MB)
    if storage_file.size > 500 * 1024 * 1024 {
        return Err(AppError::BadRequest(
            "Archive file too large for preview (max 500MB)".to_string(),
        ));
    }

    // 3. Simple S3 Stream (Plaintext)
    let s3_res = state
        .storage
        .get_object_stream(&storage_file.s3_key)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to get S3 object: {}", e)))?;

    // let file_key = EncryptionService::derive_key_from_hash(&storage_file.hash);

    // Read Body Directly
    let body_reader = s3_res.body.into_async_read();
    let pinned_stream = Box::pin(tokio_util::io::ReaderStream::new(body_reader));
    let mut stream_reader = StreamReader::new(pinned_stream);

    let mut data = Vec::with_capacity(storage_file.size as usize);
    tokio::io::copy(&mut stream_reader, &mut data)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to read file data: {}", e)))?;

    // 4. Parse Archive based on extension
    let extension = user_file
        .filename
        .split('.')
        .next_back()
        .unwrap_or("")
        .to_lowercase();
    let mut entries = Vec::new();

    if extension == "zip" {
        let cursor = std::io::Cursor::new(data);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| AppError::BadRequest(format!("Failed to parse ZIP: {}", e)))?;

        for i in 0..archive.len() {
            let file = archive
                .by_index(i)
                .map_err(|e| AppError::Internal(format!("Failed to read ZIP entry: {}", e)))?;

            entries.push(ZipEntry {
                name: file.name().to_string(),
                size: file.size(),
                compressed_size: file.compressed_size(),
                is_dir: file.is_dir(),
            });
        }
    } else if extension == "7z" {
        let data_len = data.len() as u64;
        let cursor = std::io::Cursor::new(data);
        let archive =
            sevenz_rust::SevenZReader::new(cursor, data_len, sevenz_rust::Password::empty())
                .map_err(|e| {
                    AppError::BadRequest(format!("Failed to parse {}: {}", extension, e))
                })?;

        for entry in archive.archive().files.iter() {
            entries.push(ZipEntry {
                name: entry.name().to_string(),
                size: entry.size(),
                compressed_size: entry.compressed_size,
                is_dir: entry.is_directory(),
            });
        }
    } else if extension == "rar" {
        use std::io::Write;
        // unrar crate needs a file path, so we write to a temp file
        let temp_dir = std::env::temp_dir();
        let temp_file_path = temp_dir.join(format!("temp_rar_{}.rar", uuid::Uuid::new_v4()));

        {
            let mut temp_file = std::fs::File::create(&temp_file_path)
                .map_err(|e| AppError::Internal(format!("Failed to create temp file: {}", e)))?;
            temp_file
                .write_all(&data)
                .map_err(|e| AppError::Internal(format!("Failed to write temp file: {}", e)))?;
        }

        let archive_result = unrar::Archive::new(&temp_file_path).open_for_listing();

        match archive_result {
            Ok(archive) => {
                let mut current_archive = Some(archive);
                while let Some(archive) = current_archive.take() {
                    match archive.read_header() {
                        Ok(Some(header)) => {
                            let entry = header.entry();
                            entries.push(ZipEntry {
                                name: entry.filename.to_string_lossy().to_string(),
                                size: entry.unpacked_size,
                                compressed_size: entry.unpacked_size,
                                is_dir: entry.is_directory(),
                            });
                            match header.skip() {
                                Ok(next_archive) => current_archive = Some(next_archive),
                                Err(_) => break,
                            }
                        }
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
            }
            Err(e) => {
                let _ = std::fs::remove_file(&temp_file_path);
                return Err(AppError::BadRequest(format!(
                    "Failed to open RAR archive: {}",
                    e
                )));
            }
        }

        let _ = std::fs::remove_file(&temp_file_path);
    } else if extension == "tar" || extension == "gz" || user_file.filename.ends_with(".tar.gz") {
        let cursor = std::io::Cursor::new(data);
        if user_file.filename.ends_with(".tar.gz") || extension == "gz" {
            let tar_gz = flate2::read::GzDecoder::new(cursor);
            let mut archive = tar::Archive::new(tar_gz);
            let tar_entries = archive.entries().map_err(|e| {
                AppError::BadRequest(format!("Failed to read tar.gz entries: {}", e))
            })?;

            for entry in tar_entries {
                let entry = entry
                    .map_err(|e| AppError::Internal(format!("Failed to read tar entry: {}", e)))?;
                let path = entry.path().map_err(|e| {
                    AppError::Internal(format!("Failed to read tar entry path: {}", e))
                })?;

                entries.push(ZipEntry {
                    name: path.to_string_lossy().to_string(),
                    size: entry.size(),
                    compressed_size: entry.size(), // tar.gz doesn't easily give compressed size per file
                    is_dir: entry.header().entry_type().is_dir(),
                });
            }
        } else {
            let mut archive = tar::Archive::new(cursor);
            let tar_entries = archive
                .entries()
                .map_err(|e| AppError::BadRequest(format!("Failed to read tar entries: {}", e)))?;

            for entry in tar_entries {
                let entry = entry
                    .map_err(|e| AppError::Internal(format!("Failed to read tar entry: {}", e)))?;
                let path = entry.path().map_err(|e| {
                    AppError::Internal(format!("Failed to read tar entry path: {}", e))
                })?;

                entries.push(ZipEntry {
                    name: path.to_string_lossy().to_string(),
                    size: entry.size(),
                    compressed_size: entry.size(),
                    is_dir: entry.header().entry_type().is_dir(),
                });
            }
        }
    } else {
        return Err(AppError::BadRequest(format!(
            "Unsupported archive format: .{}",
            extension
        )));
    }

    Ok(Json(entries))
}

async fn return_file_metadata(
    state: crate::AppState,
    updated: user_files::Model,
) -> Result<Json<FileMetadataResponse>, AppError> {
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
    let tags_items: Vec<tags::Model> = Tags::find()
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
        scan_status: storage_file.as_ref().and_then(|s| s.scan_status.clone()),
        scan_result: storage_file.as_ref().and_then(|s| s.scan_result.clone()),
        hash: storage_file.as_ref().map(|s| s.hash.clone()),
        is_favorite: updated.is_favorite,
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
    if req.item_ids.is_empty() {
        return Err(AppError::BadRequest("No items provided".to_string()));
    }

    let deleted_count = state
        .file_service
        .bulk_delete(&claims.sub, req.item_ids)
        .await?;

    Ok(Json(BulkDeleteResponse { deleted_count }))
}

#[utoipa::path(
    post,
    path = "/files/bulk-move",
    request_body = BulkMoveRequest,
    responses(
        (status = 200, description = "Items moved", body = BulkMoveResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn bulk_move(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkMoveRequest>,
) -> Result<Json<BulkMoveResponse>, AppError> {
    if req.item_ids.is_empty() {
        return Err(AppError::BadRequest("No items provided".to_string()));
    }

    let moved_count = state
        .file_service
        .bulk_move(&claims.sub, req.item_ids, req.parent_id)
        .await?;

    Ok(Json(BulkMoveResponse { moved_count }))
}

#[derive(Serialize, ToSchema)]
pub struct BulkCopyResponse {
    pub copied_count: usize,
}

#[utoipa::path(
    post,
    path = "/files/bulk-copy",
    request_body = BulkMoveRequest,
    responses(
        (status = 200, description = "Items copied", body = BulkCopyResponse),
        (status = 401, description = "Unauthorized"),
        (status = 400, description = "Bad request")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn bulk_copy(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<BulkMoveRequest>,
) -> Result<Json<BulkCopyResponse>, AppError> {
    if req.item_ids.is_empty() {
        return Err(AppError::BadRequest("No items provided".to_string()));
    }

    let copied_count = state
        .file_service
        .bulk_copy(&claims.sub, req.item_ids, req.parent_id)
        .await?;

    Ok(Json(BulkCopyResponse { copied_count }))
}

#[utoipa::path(
    post,
    path = "/files/{id}/ticket",
    params(
        ("id" = String, Path, description = "File ID")
    ),
    responses(
        (status = 200, description = "Ticket generated"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "File not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn generate_download_ticket(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(file_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_file = UserFiles::find_by_id(file_id.clone())
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("File not found".to_string()))?;

    // Generate ticket for backward compat
    let ticket = Uuid::new_v4().to_string();
    let expiry = Utc::now() + chrono::Duration::hours(12);

    state
        .download_tickets
        .insert(ticket.clone(), (file_id.clone(), expiry));

    // Generate presigned URL (12 hours)
    let storage_file_id = user_file
        .storage_file_id
        .clone()
        .ok_or(AppError::NotFound("Storage file missing".to_string()))?;

    let storage_file = StorageFiles::find_by_id(storage_file_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;

    // Check virus scan
    if matches!(storage_file.scan_status.as_deref(), Some("infected")) {
        return Err(AppError::Forbidden(format!(
            "File is infected with malware: {}",
            storage_file
                .scan_result
                .as_deref()
                .unwrap_or("unknown threat")
        )));
    }

    let (_content_type, _content_disposition) =
        resolve_file_headers(&user_file.filename, &storage_file);

    // Generate a public URL pointing to the download endpoint with ticket
    let public_url = format!("/api/download/{}", ticket);

    tracing::info!(
        "📎 Ticket generated for file_id={} user={}",
        file_id,
        claims.sub
    );

    Ok(Json(serde_json::json!({
        "ticket": ticket,
        "url": public_url,
        "expires_at": expiry
    })))
}

#[utoipa::path(
    get,
    path = "/download/{ticket}",
    params(
        ("ticket" = String, Path, description = "Download Ticket")
    ),
    responses(
        (status = 200, description = "File stream"),
        (status = 403, description = "Invalid/Expired ticket")
    )
)]
pub async fn download_file_with_ticket(
    State(state): State<crate::AppState>,
    Path(ticket): Path<String>,
) -> Result<Response, AppError> {
    let (file_id, _) = {
        if let Some(entry) = state.download_tickets.get(&ticket) {
            let (fid, exp) = entry.value();
            if *exp < Utc::now() {
                return Err(AppError::Forbidden("Ticket expired".to_string()));
            }
            (fid.clone(), *exp)
        } else {
            return Err(AppError::Forbidden("Invalid ticket".to_string()));
        }
    };

    let user_file = UserFiles::find_by_id(file_id.clone())
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("File not found or deleted".to_string()))?;

    if user_file.is_folder {
        return Err(AppError::BadRequest("Cannot download a folder".to_string()));
    }

    let storage_file_id = user_file
        .storage_file_id
        .clone()
        .ok_or(AppError::NotFound("Storage file missing".to_string()))?;

    if user_file
        .expires_at
        .is_some_and(|expires| Utc::now() > expires)
    {
        return Err(AppError::Gone("File has expired".to_string()));
    }

    let storage_file = StorageFiles::find_by_id(storage_file_id)
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Storage file not found".to_string()))?;

    if matches!(storage_file.scan_status.as_deref(), Some("infected")) {
        return Err(AppError::Forbidden(format!(
            "File is infected with malware: {}",
            storage_file
                .scan_result
                .as_deref()
                .unwrap_or("unknown threat")
        )));
    }

    // Generate presigned URL and redirect
    let (content_type, content_disposition) =
        resolve_file_headers(&user_file.filename, &storage_file);

    let presigned_url = state
        .storage
        .generate_presigned_url_raw(
            &storage_file.s3_key,
            43200, // 12 hours
            &content_type,
            &content_disposition,
        )
        .await
        .map_err(|e| {
            tracing::error!("Failed to generate presigned URL: {}", e);
            AppError::Internal("Failed to generate download URL".to_string())
        })?;

    let url = url::Url::parse(&presigned_url).map_err(|e| {
        tracing::error!("Failed to parse presigned URL: {}", e);
        AppError::Internal("Failed to generate download URL".to_string())
    })?;

    // Extract path and query for X-Accel-Redirect
    // Should be /bucket/key?Signature=...
    let path = url.path();
    let query = url.query().unwrap_or("");
    let internal_redirect_uri = format!("/minio_protected{}?{}", path, query);

    Ok(Response::builder()
        .status(StatusCode::OK)
        // Nginx internal redirect
        .header("X-Accel-Redirect", internal_redirect_uri)
        // Content headers for the client
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_DISPOSITION, content_disposition)
        // Cache for ticket duration approx? Or strict validation.
        // We'll trust the browser cache for a bit if needed.
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::empty())
        .unwrap())
}

/// Resolve content-type and content-disposition for a file.
fn resolve_file_headers(
    filename: &str,
    storage_file: &crate::entities::storage_files::Model,
) -> (String, String) {
    let mut content_type = storage_file
        .mime_type
        .clone()
        .unwrap_or_else(|| "application/octet-stream".to_string());

    if content_type == "application/octet-stream" || content_type == "application/stream" {
        let extension = filename.split('.').next_back().unwrap_or("").to_lowercase();
        content_type = match extension.as_str() {
            "mp4" => "video/mp4".to_string(),
            "webm" => "video/webm".to_string(),
            "ogg" => "video/ogg".to_string(),
            "mp3" => "audio/mpeg".to_string(),
            "wav" => "audio/wav".to_string(),
            "jpg" | "jpeg" => "image/jpeg".to_string(),
            "png" => "image/png".to_string(),
            "gif" => "image/gif".to_string(),
            "webp" => "image/webp".to_string(),
            "svg" => "image/svg+xml".to_string(),
            "pdf" => "application/pdf".to_string(),
            _ => content_type,
        };
    }

    let ascii_filename = filename
        .chars()
        .filter(|c| c.is_ascii() && !c.is_control() && *c != '"' && *c != '\\' && *c != ';')
        .take(64)
        .collect::<String>();
    let fallback_filename = if ascii_filename.is_empty() {
        "file"
    } else {
        &ascii_filename
    };

    let encoded_filename = utf8_percent_encode(filename, NON_ALPHANUMERIC).to_string();

    let disposition_type = if content_type.starts_with("video/")
        || content_type.starts_with("audio/")
        || content_type.starts_with("image/")
        || content_type == "application/pdf"
        || content_type.starts_with("text/")
    {
        "inline"
    } else {
        "attachment"
    };

    let content_disposition = format!(
        "{}; filename=\"{}\"; filename*=UTF-8''{}",
        disposition_type, fallback_filename, encoded_filename
    );

    (content_type, content_disposition)
}

#[utoipa::path(
    get,
    path = "/folders/tree",
    responses(
        (status = 200, description = "All folders for navigation tree", body = Vec<FolderTreeEntry>),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn folder_tree(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<FolderTreeEntry>>, AppError> {
    let folders = UserFiles::find()
        .filter(
            Condition::all()
                .add(user_files::Column::UserId.eq(&claims.sub))
                .add(user_files::Column::IsFolder.eq(true))
                .add(user_files::Column::DeletedAt.is_null()),
        )
        .order_by_asc(user_files::Column::Filename)
        .all(&state.db)
        .await?;

    let result: Vec<FolderTreeEntry> = folders
        .into_iter()
        .map(|f| FolderTreeEntry {
            id: f.id,
            filename: f.filename,
            parent_id: f.parent_id,
        })
        .collect();

    Ok(Json(result))
}
