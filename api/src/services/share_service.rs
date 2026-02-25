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
        user_file_id: String,
        created_by: String,
        share_type: String,
        shared_with_user_id: Option<String>,
        password: Option<String>,
        permission: String,
        expires_at: chrono::DateTime<Utc>,
    ) -> Result<share_links::Model, AppError> {
        // Verify the user owns the file
        let _user_file = UserFiles::find_by_id(&user_file_id)
            .filter(user_files::Column::UserId.eq(&created_by))
            .filter(user_files::Column::DeletedAt.is_null())
            .one(db)
            .await?
            .ok_or(AppError::NotFound(
                "File not found or access denied".to_string(),
            ))?;

        let password_hash = match password {
            Some(ref p) if !p.is_empty() => Some(Self::hash_password(p)?),
            _ => None,
        };

        let id = Uuid::new_v4().to_string();
        let token = Self::generate_token();

        let share = share_links::ActiveModel {
            id: Set(id),
            user_file_id: Set(user_file_id),
            created_by: Set(created_by),
            share_token: Set(token),
            share_type: Set(share_type),
            shared_with_user_id: Set(shared_with_user_id),
            password_hash: Set(password_hash),
            permission: Set(permission),
            expires_at: Set(expires_at),
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
}
