use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::services::audit::{AuditEventType, AuditService};
use crate::utils::auth::Claims;
use crate::utils::validation::sanitize_filename;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, IntoActiveModel, QueryFilter,
    QuerySelect, RelationTrait, Set,
};
use uuid::Uuid;

use super::types::*;

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
        updated_at: Set(Some(Utc::now())),
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
        has_thumbnail: false,
        is_encrypted: false,
        is_shared: false,
        share_token: None,
        is_system: res.is_system,
        is_locked: false,
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
    state.file_service.delete_item(&claims.sub, &id).await?;

    // Audit log
    let audit = AuditService::new(state.db.clone());
    audit
        .log(
            AuditEventType::FileDelete,
            Some(claims.sub),
            Some(id),
            "delete_item",
            "success",
            None,
            None,
        )
        .await;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/files/{id}/restore",
    params(
        ("id" = String, Path, description = "File/Folder ID")
    ),
    responses(
        (status = 200, description = "Item restored", body = FileMetadataResponse),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Item not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn restore_item(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
) -> Result<Json<FileMetadataResponse>, AppError> {
    let res = state.file_service.restore_item(&claims.sub, &id).await?;

    // Audit log
    let audit = AuditService::new(state.db.clone());
    audit
        .log(
            AuditEventType::FileRestore,
            Some(claims.sub),
            Some(id),
            "restore_item",
            "success",
            None,
            None,
        )
        .await;

    return_file_metadata(state, res).await
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
    active_model.updated_at = Set(Some(Utc::now()));
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
        has_thumbnail: storage_file
            .as_ref()
            .map(|s| s.has_thumbnail)
            .unwrap_or(false),
        is_encrypted: storage_file
            .as_ref()
            .map(|s| s.is_encrypted)
            .unwrap_or(false),
        is_shared: false,
        share_token: None,
        is_system: res.is_system,
        is_locked: res.is_locked,
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
            active_existing.updated_at = Set(Some(Utc::now()));
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
    active.updated_at = Set(Some(Utc::now()));

    let updated = active.update(&state.db).await?;
    return_file_metadata(state, updated).await
}

pub(crate) async fn return_file_metadata(
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
        has_thumbnail: storage_file
            .as_ref()
            .map(|s| s.has_thumbnail)
            .unwrap_or(false),
        is_encrypted: storage_file
            .as_ref()
            .map(|s| s.is_encrypted)
            .unwrap_or(false),
        is_shared: false,
        share_token: None,
        is_system: updated.is_system,
        is_locked: updated.is_locked,
    }))
}

#[utoipa::path(
    post,
    path = "/files/{id}/lock",
    params(
        ("id" = String, Path, description = "File/Folder ID")
    ),
    responses(
        (status = 200, description = "Item locked", body = FileMetadataResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Passphrase incorrect or not set"),
        (status = 404, description = "Item not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn lock_item(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
    Json(req): Json<LockUnlockRequest>,
) -> Result<Json<FileMetadataResponse>, AppError> {
    // 1. Check if user has a lock passphrase
    let settings = UserSettings::find_by_id(claims.sub.clone())
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User settings not found".to_string()))?;

    let passphrase_hash = settings
        .lock_passphrase
        .ok_or_else(|| AppError::Forbidden("Lock passphrase not set in settings".to_string()))?;

    // 2. Verify passphrase
    let req_pass = req
        .passphrase
        .ok_or_else(|| AppError::Forbidden("Passphrase required to lock".to_string()))?;
    if crate::utils::hash::calculate_hash(req_pass.as_bytes()) != passphrase_hash {
        return Err(AppError::Forbidden("Passphrase incorrect".to_string()));
    }

    // 3. Update item
    let item = UserFiles::find_by_id(&id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Item not found".to_string()))?;

    let mut active = item.into_active_model();
    active.is_locked = Set(true);
    active.updated_at = Set(Some(Utc::now()));
    let res = active.update(&state.db).await?;

    return_file_metadata(state, res).await
}

#[utoipa::path(
    post,
    path = "/files/{id}/unlock",
    params(
        ("id" = String, Path, description = "File/Folder ID")
    ),
    responses(
        (status = 200, description = "Item unlocked", body = FileMetadataResponse),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Passphrase incorrect"),
        (status = 404, description = "Item not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn unlock_item(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
    Json(req): Json<LockUnlockRequest>,
) -> Result<Json<FileMetadataResponse>, AppError> {
    // 1. Verify passphrase
    let settings = UserSettings::find_by_id(claims.sub.clone())
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User settings not found".to_string()))?;

    let passphrase_hash = settings
        .lock_passphrase
        .ok_or_else(|| AppError::Forbidden("Lock passphrase not set".to_string()))?;

    let req_pass = req
        .passphrase
        .ok_or_else(|| AppError::Forbidden("Passphrase required to unlock".to_string()))?;
    if crate::utils::hash::calculate_hash(req_pass.as_bytes()) != passphrase_hash {
        return Err(AppError::Forbidden("Passphrase incorrect".to_string()));
    }

    // 2. Update item
    let item = UserFiles::find_by_id(&id)
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Item not found".to_string()))?;

    let mut active = item.into_active_model();
    active.is_locked = Set(false);
    active.updated_at = Set(Some(Utc::now()));
    let res = active.update(&state.db).await?;

    return_file_metadata(state, res).await
}

#[utoipa::path(
    delete,
    path = "/trash/{id}/empty",
    responses(
        (status = 200, description = "Trash emptied"),
        (status = 401, description = "Unauthorized"),
        (status = 403, description = "Forbidden (not a trash folder)"),
        (status = 404, description = "Folder not found")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn empty_trash(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<StatusCode, AppError> {
    // 1. Ensure it exists AND belongs to the user AND IS SYSTEM/TRASH
    let folder = UserFiles::find_by_id(id.clone())
        .filter(user_files::Column::UserId.eq(&claims.sub))
        .filter(user_files::Column::IsSystem.eq(true))
        .filter(user_files::Column::DeletedAt.is_null())
        .one(&state.db)
        .await?
        .ok_or(AppError::NotFound("Trash folder not found".to_string()))?;

    // Validate that it's a trash folder
    if !folder.is_folder || (folder.filename != ".Trash" && folder.filename != "Trash") {
        return Err(AppError::Forbidden(
            "Only trash folders can be emptied".to_string(),
        ));
    }

    // 2. Perform recursive HARD DELETE of all contents (items whose ancestor is this folder)
    let db_backend = state.db.get_database_backend();

    // SQLite and Postgres both support WITH RECURSIVE
    let sql = format!(
        r#"
        WITH RECURSIVE descendants AS (
            SELECT id FROM user_files WHERE parent_id = '{}' AND user_id = '{}'
            UNION ALL
            SELECT u.id FROM user_files u INNER JOIN descendants d ON u.parent_id = d.id WHERE u.user_id = '{}'
        )
        DELETE FROM user_files WHERE id IN (SELECT id FROM descendants) AND user_id = '{}'
        "#,
        id, claims.sub, claims.sub, claims.sub
    );

    // Note: We don't delete the Trash folder itself, just its contents.
    state
        .db
        .execute(sea_orm::Statement::from_string(db_backend, sql))
        .await?;

    Ok(StatusCode::OK)
}
