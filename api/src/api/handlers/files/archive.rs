use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use axum::{
    Extension, Json,
    extract::{Path, State},
};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use tokio_util::io::StreamReader;

use super::types::*;

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
            let file = match archive.by_index(i) {
                Ok(f) => f,
                Err(e) => {
                    tracing::warn!("Failed to read ZIP entry: {}", e);
                    continue;
                }
            };

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
                let entry = match entry {
                    Ok(e) => e,
                    Err(e) => {
                        tracing::warn!("Failed to read tar entry: {}", e);
                        continue;
                    }
                };
                let path = match entry.path() {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!("Failed to read tar entry path: {}", e);
                        continue;
                    }
                };

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
                let entry = match entry {
                    Ok(e) => e,
                    Err(e) => {
                        tracing::warn!("Failed to read tar entry: {}", e);
                        continue;
                    }
                };
                let path = match entry.path() {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!("Failed to read tar entry path: {}", e);
                        continue;
                    }
                };

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
