use super::cloud_providers::{CloudProvider, CloudTokens, CloudFile};
use crate::entities::{prelude::CloudProviderTokens, cloud_provider_tokens};
use anyhow::{Result, anyhow};
use chrono::Utc;
use sea_orm::*;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

pub struct CloudProviderManager {
    providers: HashMap<String, Arc<dyn CloudProvider>>,
    db: DatabaseConnection,
}

impl CloudProviderManager {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            providers: HashMap::new(),
            db,
        }
    }

    pub fn register(&mut self, provider: Arc<dyn CloudProvider>) {
        self.providers.insert(provider.provider_id().to_string(), provider);
    }

    pub fn get(&self, provider_id: &str) -> Option<Arc<dyn CloudProvider>> {
        self.providers.get(provider_id).cloned()
    }

    pub fn list_available(&self) -> Vec<String> {
        self.providers.keys().cloned().collect()
    }

    pub async fn get_valid_token(&self, user_id: &str, provider_id: &str) -> Result<String> {
        let token_record = CloudProviderTokens::find()
            .filter(cloud_provider_tokens::Column::UserId.eq(user_id))
            .filter(cloud_provider_tokens::Column::ProviderId.eq(provider_id))
            .one(&self.db)
            .await?
            .ok_or_else(|| anyhow!("Provider not connected"))?;

        if token_record.token_expires_at > Utc::now() + chrono::Duration::minutes(5) {
            return Ok(token_record.access_token);
        }

        // Token expired or about to expire, refresh it
        let provider = self.get(provider_id).ok_or_else(|| anyhow!("Provider not found"))?;
        let new_tokens = provider.refresh_token(&token_record.refresh_token).await?;

        // Update database
        let mut active_model: cloud_provider_tokens::ActiveModel = token_record.into();
        active_model.access_token = Set(new_tokens.access_token.clone());
        if let Some(rt) = new_tokens.refresh_token {
            active_model.refresh_token = Set(rt);
        }
        active_model.token_expires_at = Set(new_tokens.expires_at.into());
        active_model.updated_at = Set(Some(Utc::now().into()));

        active_model.update(&self.db).await?;

        Ok(new_tokens.access_token)
    }

    pub async fn store_tokens(&self, user_id: &str, provider_id: &str, tokens: CloudTokens) -> Result<()> {
        let existing = CloudProviderTokens::find()
            .filter(cloud_provider_tokens::Column::UserId.eq(user_id))
            .filter(cloud_provider_tokens::Column::ProviderId.eq(provider_id))
            .one(&self.db)
            .await?;

        if let Some(record) = existing {
            let mut active_model: cloud_provider_tokens::ActiveModel = record.into();
            active_model.access_token = Set(tokens.access_token);
            if let Some(rt) = tokens.refresh_token {
                active_model.refresh_token = Set(rt);
            }
            active_model.token_expires_at = Set(tokens.expires_at.into());
            active_model.provider_email = Set(tokens.email);
            active_model.updated_at = Set(Some(Utc::now().into()));
            active_model.update(&self.db).await?;
        } else {
            let active_model = cloud_provider_tokens::ActiveModel {
                id: Set(Uuid::new_v4().to_string()),
                user_id: Set(user_id.to_string()),
                provider_id: Set(provider_id.to_string()),
                access_token: Set(tokens.access_token),
                refresh_token: Set(tokens.refresh_token.unwrap_or_default()),
                token_expires_at: Set(tokens.expires_at.into()),
                provider_email: Set(tokens.email),
                connected_at: Set(Some(Utc::now().into())),
                updated_at: Set(Some(Utc::now().into())),
            };
            active_model.insert(&self.db).await?;
        }

        Ok(())
    }

    pub async fn disconnect(&self, user_id: &str, provider_id: &str) -> Result<()> {
        let token_record = CloudProviderTokens::find()
            .filter(cloud_provider_tokens::Column::UserId.eq(user_id))
            .filter(cloud_provider_tokens::Column::ProviderId.eq(provider_id))
            .one(&self.db)
            .await?;

        if let Some(record) = token_record {
            // Revoke at provider level if possible
            if let Some(provider) = self.get(provider_id) {
                let _ = provider.revoke_token(&record.access_token).await;
            }
            
            // Delete from DB
            CloudProviderTokens::delete_by_id(record.id).exec(&self.db).await?;
        }

        Ok(())
    }

    pub async fn get_user_connections(&self, user_id: &str) -> Result<Vec<String>> {
        let records = CloudProviderTokens::find()
            .filter(cloud_provider_tokens::Column::UserId.eq(user_id))
            .all(&self.db)
            .await?;

        Ok(records.into_iter().map(|r| r.provider_id).collect())
    }
}
