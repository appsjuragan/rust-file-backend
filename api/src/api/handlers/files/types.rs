use chrono::Utc;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
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
    pub has_thumbnail: bool,
    pub is_encrypted: bool,
    pub is_shared: bool,
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

#[derive(Serialize, ToSchema)]
pub struct BulkCopyResponse {
    pub copied_count: usize,
}
