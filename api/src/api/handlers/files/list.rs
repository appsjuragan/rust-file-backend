use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use crate::utils::auth::Claims;
use axum::{
    Extension, Json,
    extract::{Query, State},
};
use chrono::Utc;
use sea_orm::{
    ColumnTrait, Condition, ConnectionTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect,
    RelationTrait,
    sea_query::{Expr, Func},
};

use super::types::*;

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

        let is_shared = crate::services::share_service::ShareService::has_active_shares(
            &state.db,
            &user_file.id,
        )
        .await
        .unwrap_or(false);

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
            has_thumbnail: storage_file
                .as_ref()
                .map(|s| s.has_thumbnail)
                .unwrap_or(false),
            is_encrypted: storage_file
                .as_ref()
                .map(|s| s.is_encrypted)
                .unwrap_or(false),
            is_shared,
        });
    }

    Ok(Json(result))
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
    axum::extract::Path(id): axum::extract::Path<String>,
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
                has_thumbnail: false,
                is_encrypted: false,
                is_shared: false,
            },
        );

        current_id = folder.parent_id;
    }

    Ok(Json(path))
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
