use crate::api::error::AppError;
use crate::entities::{prelude::*, *};
use sea_orm::{DatabaseConnection, EntityTrait};

pub struct TierService;

pub struct QuotaInfo {
    pub total_size_limit: i64,
    pub bandwidth_limit_bps: i64,
}

impl TierService {
    pub async fn get_user_quota(db: &DatabaseConnection, user_id: &str) -> Result<QuotaInfo, AppError> {
        let user = Users::find_by_id(user_id)
            .one(db)
            .await?
            .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

        if user.is_admin {
            return Ok(QuotaInfo {
                total_size_limit: -1,     // unlimited
                bandwidth_limit_bps: -1, // unlimited
            });
        }

        let tier = user.tier.to_lowercase();

        let quota_key = format!("quota_{}", tier);
        let bandwidth_key = format!("bandwidth_{}", tier);

        let quota_val = system_settings::Entity::find_by_id(quota_key)
            .one(db)
            .await?
            .map(|s| s.value.parse::<i64>().unwrap_or(5368709120)) // 5GB default
            .unwrap_or(5368709120);

        let bandwidth_val = system_settings::Entity::find_by_id(bandwidth_key)
            .one(db)
            .await?
            .map(|s| s.value.parse::<i64>().unwrap_or(5000000)) // 5mbps default
            .unwrap_or(5000000);

        Ok(QuotaInfo {
            total_size_limit: quota_val,
            bandwidth_limit_bps: bandwidth_val,
        })
    }

    pub async fn check_upload_allowed(
        db: &DatabaseConnection,
        user_id: &str,
        new_file_size: u64,
    ) -> Result<(), AppError> {
        let quota = Self::get_user_quota(db, user_id).await?;
        if quota.total_size_limit == -1 {
            return Ok(());
        }

        let facts = UserFileFacts::find_by_id(user_id)
            .one(db)
            .await?
            .ok_or_else(|| AppError::Internal("User file facts not found".to_string()))?;

        if facts.total_size + (new_file_size as i64) > quota.total_size_limit {
            return Err(AppError::BadRequest("Storage quota exceeded".to_string()));
        }

        Ok(())
    }
}
