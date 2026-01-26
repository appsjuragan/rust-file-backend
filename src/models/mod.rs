use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, FromRow, ToSchema)]
pub struct User {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Token {
    pub id: String,
    pub user_id: String,
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, ToSchema)]
pub struct StorageFile {
    pub id: String,
    pub hash: String,
    pub s3_key: String,
    pub size: i64,
    pub ref_count: i32,
    pub scan_status: Option<String>,
    pub scan_result: Option<String>,
    pub scanned_at: Option<DateTime<Utc>>,
    pub mime_type: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, ToSchema)]
pub struct UserFile {
    pub id: String,
    pub user_id: String,
    pub storage_file_id: String,
    pub filename: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: Option<DateTime<Utc>>,
}
