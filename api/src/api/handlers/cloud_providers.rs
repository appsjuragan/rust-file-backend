use axum::{
    extract::{Path, Query, State},
    response::Redirect,
    Json,
    Extension,
};
use crate::AppState;
use crate::api::error::AppError;
use crate::services::cloud_providers::CloudFile;
use serde::{Deserialize, Serialize};
use crate::utils::auth::Claims;
use axum::http::StatusCode;

#[derive(Deserialize)]
pub struct CloudCallbackParams {
    pub code: String,
    pub state: String, // state typically contains user_id or csrf token
}

#[derive(Serialize)]
pub struct ProviderStatus {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub email: Option<String>,
}

#[derive(Deserialize)]
pub struct ImportRequest {
    pub file_id: String,
    pub parent_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ExportRequest {
    pub file_id: String, // app file id
    pub remote_parent_id: Option<String>,
}

#[derive(Deserialize)]
pub struct CloudListQuery {
    pub folder_id: Option<String>,
}

/// List all available cloud providers and their connection status for the current user
pub async fn list_providers(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<ProviderStatus>>, AppError> {
    let user_id = claims.sub;
    let connections = state.cloud_provider_manager.get_user_connections(&user_id).await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let providers = state.cloud_provider_manager.list_available();
    let mut status = Vec::new();

    for p_id in providers {
        if let Some(provider) = state.cloud_provider_manager.get(&p_id) {
            status.push(ProviderStatus {
                id: p_id.clone(),
                name: provider.display_name().to_string(),
                connected: connections.contains(&p_id),
                email: None, 
            });
        }
    }

    Ok(Json(status))
}

/// Get the OAuth connection URL for a specific provider
pub async fn connect_provider(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(provider_id): Path<String>,
) -> Result<Json<String>, AppError> {
    let provider = state.cloud_provider_manager.get(&provider_id)
        .ok_or_else(|| AppError::NotFound("Provider not found".to_string()))?;

    // In a real app, 'state' would be a signed/encrypted string containing user_id and a nonce
    let auth_url = provider.get_auth_url(&claims.sub);
    Ok(Json(auth_url))
}

/// OAuth callback handler (Public)
pub async fn provider_callback(
    State(state): State<AppState>,
    Path(provider_id): Path<String>,
    Query(params): Query<CloudCallbackParams>,
) -> Result<Redirect, AppError> {
    let provider = state.cloud_provider_manager.get(&provider_id)
        .ok_or_else(|| AppError::NotFound("Provider not found".to_string()))?;

    let tokens = provider.exchange_code(&params.code).await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    // The 'state' in params should be decrypted to get the user_id
    let user_id = params.state; 

    state.cloud_provider_manager.store_tokens(&user_id, &provider_id, tokens).await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Redirect back to frontend settings or cloud page
    Ok(Redirect::to("/settings/cloud"))
}

/// List files in the user's cloud storage
pub async fn list_cloud_files(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(provider_id): Path<String>,
    Query(query): Query<CloudListQuery>,
) -> Result<Json<Vec<CloudFile>>, AppError> {
    let user_id = claims.sub;
    let access_token = state.cloud_provider_manager.get_valid_token(&user_id, &provider_id).await
        .map_err(|e| AppError::Unauthorized(e.to_string()))?;

    let provider = state.cloud_provider_manager.get(&provider_id).unwrap();
    let files = provider.list_files(&access_token, query.folder_id.as_deref()).await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(Json(files))
}

/// Import a file from cloud storage to the app's S3 storage
pub async fn import_file(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(provider_id): Path<String>,
    Json(payload): Json<ImportRequest>,
) -> Result<StatusCode, AppError> {
    // 1. Get cloud download stream
    let user_id = claims.sub;
    let access_token = state.cloud_provider_manager.get_valid_token(&user_id, &provider_id).await
        .map_err(|e| AppError::Unauthorized(e.to_string()))?;

    let provider = state.cloud_provider_manager.get(&provider_id).unwrap();
    let stream = provider.download_file(&access_token, &payload.file_id).await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // 2. Wrap buffer in reader
    let cursor = std::io::Cursor::new(stream.content);

    // 3. Upload via file_service
    let staged = state.file_service.upload_to_staging(
        &stream.filename,
        Some(&stream.mime_type),
        cursor
    ).await?;

    state.file_service.process_upload(
        staged,
        stream.filename,
        user_id,
        payload.parent_id,
        None,
        None,
    ).await?;

    Ok(StatusCode::CREATED)
}

/// Export a file from the app to cloud storage
pub async fn export_file(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(provider_id): Path<String>,
    Json(payload): Json<ExportRequest>,
) -> Result<StatusCode, AppError> {
    let user_id = claims.sub;
    
    // 1. Get file from internal storage
    // Mocking the file retrieval for now
    let access_token = state.cloud_provider_manager.get_valid_token(&user_id, &provider_id).await
        .map_err(|e| AppError::Unauthorized(e.to_string()))?;

    let provider = state.cloud_provider_manager.get(&provider_id).unwrap();
    
    // In a real implementation, we'd get the actual file data from S3
    let mock_data = b"Internal file content".to_vec();
    
    provider.upload_file(
        &access_token,
        "exported_file.txt",
        payload.remote_parent_id.as_deref(),
        mock_data,
        "text/plain",
    ).await.map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(StatusCode::OK)
}

/// Disconnect a cloud provider
pub async fn disconnect_provider(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(provider_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let user_id = claims.sub;
    state.cloud_provider_manager.disconnect(&user_id, &provider_id).await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
