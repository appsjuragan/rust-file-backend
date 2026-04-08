use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use base64::Engine;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder,
    Set,
};
use uuid::Uuid;

pub struct ShareService;

pub struct CreateShareParams {
    pub user_file_id: String,
    pub created_by: String,
    pub share_type: String,
    pub shared_with_user_id: Option<String>,
    pub shared_with_group_id: Option<String>,
    pub password: Option<String>,
    pub permission: String,
    pub expires_at: chrono::DateTime<Utc>,
}

impl ShareService {
    /// Generate a URL-safe random token for share links
    pub fn generate_token() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: Vec<u8> = (0..24).map(|_| rng.r#gen()).collect();
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&bytes)
    }

    /// Hash a share password using argon2
    pub fn hash_password(password: &str) -> Result<String, AppError> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| AppError::Internal(e.to_string()))?
            .to_string();
        Ok(hash)
    }

    /// Verify a share password against the stored hash
    pub fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
        let argon2 = Argon2::default();
        let parsed_hash =
            argon2::PasswordHash::new(hash).map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(argon2
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }

    /// Create a new share link
    pub async fn create_share(
        db: &sea_orm::DatabaseConnection,
        params: CreateShareParams,
    ) -> Result<share_links::Model, AppError> {
        // Verify the user owns the file
        let _user_file = UserFiles::find_by_id(&params.user_file_id)
            .filter(user_files::Column::UserId.eq(&params.created_by))
            .filter(user_files::Column::DeletedAt.is_null())
            .one(db)
            .await?
            .ok_or(AppError::NotFound(
                "File not found or access denied".to_string(),
            ))?;

        let password_hash = match params.password {
            Some(ref p) if !p.is_empty() => Some(Self::hash_password(p)?),
            _ => None,
        };

        let id = Uuid::new_v4().to_string();
        let token = Self::generate_token();

        let share = share_links::ActiveModel {
            id: Set(id),
            user_file_id: Set(params.user_file_id),
            created_by: Set(params.created_by),
            share_token: Set(token),
            share_type: Set(params.share_type),
            shared_with_user_id: Set(params.shared_with_user_id),
            shared_with_group_id: Set(params.shared_with_group_id),
            password_hash: Set(password_hash),
            permission: Set(params.permission),
            expires_at: Set(params.expires_at),
            created_at: Set(Some(Utc::now())),
        };

        let result = share.insert(db).await?;
        Ok(result)
    }

    /// List all active shares created by a user
    pub async fn list_user_shares(
        db: &sea_orm::DatabaseConnection,
        user_id: &str,
    ) -> Result<Vec<(share_links::Model, Option<user_files::Model>)>, AppError> {
        let shares = ShareLinks::find()
            .filter(share_links::Column::CreatedBy.eq(user_id))
            .filter(share_links::Column::ExpiresAt.gt(Utc::now()))
            .find_also_related(UserFiles)
            .order_by_desc(share_links::Column::CreatedAt)
            .all(db)
            .await?;

        Ok(shares)
    }

    /// Revoke (delete) a share link
    pub async fn revoke_share(
        db: &sea_orm::DatabaseConnection,
        share_id: &str,
        user_id: &str,
    ) -> Result<(), AppError> {
        let share = ShareLinks::find_by_id(share_id)
            .filter(share_links::Column::CreatedBy.eq(user_id))
            .one(db)
            .await?
            .ok_or(AppError::NotFound("Share not found".to_string()))?;

        let share: share_links::ActiveModel = share.into();
        share.delete(db).await?;
        Ok(())
    }

    /// Get a share link by token (public access)
    pub async fn get_share_by_token(
        db: &sea_orm::DatabaseConnection,
        token: &str,
    ) -> Result<share_links::Model, AppError> {
        let share = ShareLinks::find()
            .filter(share_links::Column::ShareToken.eq(token))
            .one(db)
            .await?
            .ok_or(AppError::NotFound("Share link not found".to_string()))?;

        // Check expiry
        if Utc::now() > share.expires_at {
            return Err(AppError::Gone("Share link has expired".to_string()));
        }

        Ok(share)
    }

    /// Log an access event for a share link
    pub async fn log_access(
        db: &sea_orm::DatabaseConnection,
        share_link_id: &str,
        accessed_by_user_id: Option<String>,
        ip_address: Option<String>,
        user_agent: Option<String>,
        action: &str,
    ) {
        let id = Uuid::new_v4().to_string();
        let log = share_access_logs::ActiveModel {
            id: Set(id),
            share_link_id: Set(share_link_id.to_string()),
            accessed_by_user_id: Set(accessed_by_user_id),
            ip_address: Set(ip_address),
            user_agent: Set(user_agent),
            action: Set(action.to_string()),
            accessed_at: Set(Utc::now()),
        };

        if let Err(e) = log.insert(db).await {
            tracing::error!("Failed to log share access: {}", e);
        }
    }

    /// Get access logs for a share link
    pub async fn get_access_logs(
        db: &sea_orm::DatabaseConnection,
        share_id: &str,
        user_id: &str,
    ) -> Result<Vec<share_access_logs::Model>, AppError> {
        // Verify ownership
        let _share = ShareLinks::find_by_id(share_id)
            .filter(share_links::Column::CreatedBy.eq(user_id))
            .one(db)
            .await?
            .ok_or(AppError::NotFound("Share not found".to_string()))?;

        let logs = ShareAccessLogs::find()
            .filter(share_access_logs::Column::ShareLinkId.eq(share_id))
            .order_by_desc(share_access_logs::Column::AccessedAt)
            .all(db)
            .await?;

        Ok(logs)
    }

    /// Check if a file has any active share links
    pub async fn get_active_share_token(
        db: &sea_orm::DatabaseConnection,
        user_file_id: &str,
    ) -> Result<Option<String>, AppError> {
        let share = ShareLinks::find()
            .filter(
                Condition::all()
                    .add(share_links::Column::UserFileId.eq(user_file_id))
                    .add(share_links::Column::ExpiresAt.gt(Utc::now())),
            )
            .one(db)
            .await?;

        Ok(share.map(|s| s.share_token))
    }

    /// Check if a file has any active share links
    pub async fn has_active_shares(
        db: &sea_orm::DatabaseConnection,
        user_file_id: &str,
    ) -> Result<bool, AppError> {
        let count = ShareLinks::find()
            .filter(
                Condition::all()
                    .add(share_links::Column::UserFileId.eq(user_file_id))
                    .add(share_links::Column::ExpiresAt.gt(Utc::now())),
            )
            .count(db)
            .await?;

        Ok(count > 0)
    }

    /// Get all shares for a specific file
    pub async fn get_shares_for_file(
        db: &sea_orm::DatabaseConnection,
        user_file_id: &str,
        user_id: &str,
    ) -> Result<Vec<share_links::Model>, AppError> {
        let shares = ShareLinks::find()
            .filter(
                Condition::all()
                    .add(share_links::Column::UserFileId.eq(user_file_id))
                    .add(share_links::Column::CreatedBy.eq(user_id))
                    .add(share_links::Column::ExpiresAt.gt(Utc::now())),
            )
            .order_by_desc(share_links::Column::CreatedAt)
            .all(db)
            .await?;

        Ok(shares)
    }

    /// List all shares shared WITH the user (directly or via group)
    pub async fn list_incoming_shares(
        db: &sea_orm::DatabaseConnection,
        user_id: &str,
    ) -> Result<Vec<(share_links::Model, Option<user_files::Model>)>, AppError> {
        // 1. Get user groups
        let groups = UserGroupMembers::find()
            .filter(user_group_members::Column::UserId.eq(user_id))
            .all(db)
            .await?;
        let group_ids: Vec<String> = groups.into_iter().map(|m| m.group_id).collect();

        // 2. Find shares targeting this user or their groups
        let mut condition = Condition::any().add(share_links::Column::SharedWithUserId.eq(user_id));
        if !group_ids.is_empty() {
            condition = condition.add(share_links::Column::SharedWithGroupId.is_in(group_ids));
        }

        let shares = ShareLinks::find()
            .filter(Condition::all()
                .add(condition)
                .add(share_links::Column::ExpiresAt.gt(Utc::now()))
                .add(share_links::Column::CreatedBy.ne(user_id))
            )
            .find_also_related(UserFiles)
            .order_by_desc(share_links::Column::CreatedAt)
            .all(db)
            .await?;

        Ok(shares)
    }

    /// Get the effective permission (e.g. "view" or "download") for a user on a file
    /// following the Least Privilege rule: strictest wins, except newer overrides.
    pub async fn get_effective_permission(
        db: &sea_orm::DatabaseConnection,
        file_id: &str,
        user_id: &str,
    ) -> Result<Option<String>, AppError> {
        // 1. Get user groups
        let groups = UserGroupMembers::find()
            .filter(user_group_members::Column::UserId.eq(user_id))
            .all(db)
            .await?;
        let group_ids: Vec<String> = groups.into_iter().map(|m| m.group_id).collect();

        // 2. Build the user/group condition once
        let mut condition = Condition::any().add(share_links::Column::SharedWithUserId.eq(user_id));
        if !group_ids.is_empty() {
            condition = condition.add(share_links::Column::SharedWithGroupId.is_in(group_ids));
        }

        // 3. Walk up the folder tree starting from the file itself to find ALL relevant shares
        let mut current_id = file_id.to_string();
        let mut all_shares = Vec::new();
        let mut depth = 0;
        let max_depth = 20;

        loop {
            if depth >= max_depth { break; }

            let level_shares = ShareLinks::find()
                .filter(
                    Condition::all()
                        .add(share_links::Column::UserFileId.eq(&current_id))
                        .add(condition.clone())
                        .add(share_links::Column::ExpiresAt.gt(Utc::now())),
                )
                .all(db)
                .await?;
            
            all_shares.extend(level_shares);

            let file = UserFiles::find_by_id(&current_id).one(db).await?;
            match file {
                Some(f) => {
                    match f.parent_id {
                        Some(pid) if !pid.is_empty() => {
                            current_id = pid;
                            depth += 1;
                        }
                        _ => break,
                    }
                }
                None => break,
            }
        }

        if all_shares.is_empty() {
            return Ok(None);
        }

        // 4. Resolve winner using Least Privilege + Time-Based Exception
        // Sort ASC by created_at so we process oldest first
        all_shares.sort_by_key(|s| s.created_at.unwrap_or_else(Utc::now));

        let permission_rank = |p: &str| if p == "view" { 0u8 } else { 1u8 };
        let mut winner_permission = all_shares[0].permission.clone();
        let mut winner_created = all_shares[0].created_at.unwrap_or_else(Utc::now);

        for share in all_shares.into_iter().skip(1) {
            let next_created = share.created_at.unwrap_or_else(Utc::now);
            let next_rank = permission_rank(&share.permission);
            let winner_rank = permission_rank(&winner_permission);

            if next_created > winner_created {
                // Newer share - explicit later grant wins
                winner_permission = share.permission;
                winner_created = next_created;
            } else if next_rank < winner_rank {
                // Same age or older, but stricter - stricter wins
                winner_permission = share.permission;
                winner_created = next_created;
            }
        }

        Ok(Some(winner_permission))
    }

    /// Check if a user has access to a file via ANY active share.
    pub async fn check_file_access(
        db: &sea_orm::DatabaseConnection,
        file_id: &str,
        user_id: &str,
    ) -> Result<bool, AppError> {
        let permission = Self::get_effective_permission(db, file_id, user_id).await?;
        Ok(permission.is_some())
    }
}
