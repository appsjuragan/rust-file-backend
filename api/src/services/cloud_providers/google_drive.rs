use super::{CloudFile, CloudFileStream, CloudProvider, CloudTokens};
use anyhow::{Result, anyhow};
use async_trait::async_trait;
use chrono::Utc;

pub struct GoogleDriveProvider {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

impl GoogleDriveProvider {
    pub fn new(client_id: String, client_secret: String, redirect_uri: String) -> Self {
        Self {
            client_id,
            client_secret,
            redirect_uri,
        }
    }
}

#[async_trait]
impl CloudProvider for GoogleDriveProvider {
    fn provider_id(&self) -> &'static str {
        "google_drive"
    }

    fn display_name(&self) -> &'static str {
        "Google Drive"
    }

    fn get_auth_url(&self, state: &str) -> String {
        format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file&access_type=offline&state={}&prompt=consent",
            self.client_id, self.redirect_uri, state
        )
    }

    async fn exchange_code(&self, code: &str) -> Result<CloudTokens> {
        // Mocking for now as per user request
        if code == "mock_code" {
            return Ok(CloudTokens {
                access_token: "mock_access_token".to_string(),
                refresh_token: Some("mock_refresh_token".to_string()),
                expires_at: Utc::now() + chrono::Duration::hours(1),
                email: Some("user@example.com".to_string()),
            });
        }
        Err(anyhow!("Invalid code"))
    }

    async fn refresh_token(&self, _refresh_token: &str) -> Result<CloudTokens> {
        Ok(CloudTokens {
            access_token: "mock_access_token_refreshed".to_string(),
            refresh_token: Some("mock_refresh_token".to_string()),
            expires_at: Utc::now() + chrono::Duration::hours(1),
            email: None,
        })
    }

    async fn list_files(
        &self, _access_token: &str, folder_id: Option<&str>,
    ) -> Result<Vec<CloudFile>> {
        // Mocked response
        Ok(vec![
            CloudFile {
                id: "1".to_string(),
                name: "Mock File 1.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                size: Some(1024),
                is_folder: false,
                modified_at: Some(Utc::now()),
                parent_id: folder_id.map(|s| s.to_string()),
            },
            CloudFile {
                id: "2".to_string(),
                name: "Mock Folder".to_string(),
                mime_type: "application/vnd.google-apps.folder".to_string(),
                size: None,
                is_folder: true,
                modified_at: Some(Utc::now()),
                parent_id: folder_id.map(|s| s.to_string()),
            },
        ])
    }

    async fn download_file(
        &self, _access_token: &str, _file_id: &str,
    ) -> Result<CloudFileStream> {
        Ok(CloudFileStream {
            content: b"Mock PDF content".to_vec(),
            mime_type: "application/pdf".to_string(),
            filename: "Mock File 1.pdf".to_string(),
            size: 16,
        })
    }

    async fn upload_file(
        &self, _access_token: &str, filename: &str, 
        _parent_id: Option<&str>, _data: Vec<u8>, mime_type: &str,
    ) -> Result<CloudFile> {
        Ok(CloudFile {
            id: "new_file_id".to_string(),
            name: filename.to_string(),
            mime_type: mime_type.to_string(),
            size: Some(0),
            is_folder: false,
            modified_at: Some(Utc::now()),
            parent_id: None,
        })
    }

    async fn get_file_info(
        &self, _access_token: &str, file_id: &str,
    ) -> Result<CloudFile> {
        Ok(CloudFile {
            id: file_id.to_string(),
            name: "Mock Info.pdf".to_string(),
            mime_type: "application/pdf".to_string(),
            size: Some(1024),
            is_folder: false,
            modified_at: Some(Utc::now()),
            parent_id: None,
        })
    }

    async fn revoke_token(&self, _token: &str) -> Result<()> {
        Ok(())
    }
}
