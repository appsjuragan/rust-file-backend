use anyhow::Result;
use async_trait::async_trait;
use chrono::{DateTime, Utc};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct CloudFile {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size: Option<i64>,
    pub is_folder: bool,
    pub modified_at: Option<DateTime<Utc>>,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CloudTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub email: Option<String>,
}

pub struct CloudFileStream {
    pub content: Vec<u8>,
    pub mime_type: String,
    pub filename: String,
    pub size: i64,
}

#[async_trait]
pub trait CloudProvider: Send + Sync {
    /// Provider identifier (e.g., "google_drive", "onedrive", "mega")
    fn provider_id(&self) -> &'static str;
    
    /// Human-readable name (e.g., "Google Drive", "OneDrive")
    fn display_name(&self) -> &'static str;
    
    /// Generate OAuth authorization URL for connecting
    fn get_auth_url(&self, state: &str) -> String;
    
    /// Exchange authorization code for tokens
    async fn exchange_code(&self, code: &str) -> Result<CloudTokens>;
    
    /// Refresh an expired access token
    async fn refresh_token(&self, refresh_token: &str) -> Result<CloudTokens>;
    
    /// List files/folders in a directory
    async fn list_files(
        &self, access_token: &str, folder_id: Option<&str>,
    ) -> Result<Vec<CloudFile>>;
    
    /// Download file content as a byte stream
    async fn download_file(
        &self, access_token: &str, file_id: &str,
    ) -> Result<CloudFileStream>;
    
    /// Upload file content to the cloud
    async fn upload_file(
        &self, access_token: &str, filename: &str, 
        parent_id: Option<&str>, data: Vec<u8>, mime_type: &str,
    ) -> Result<CloudFile>;
    
    /// Get metadata for a single file
    async fn get_file_info(
        &self, access_token: &str, file_id: &str,
    ) -> Result<CloudFile>;
    
    /// Revoke tokens (on disconnect)
    async fn revoke_token(&self, token: &str) -> Result<()>;
}

pub mod google_drive;
