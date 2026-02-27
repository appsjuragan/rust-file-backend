use crate::entities::audit_logs;
use sea_orm::{ActiveModelTrait, DatabaseConnection, Set};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;
use tracing::{error, info};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditEventType {
    UserLogin,
    UserRegister,
    KeyGeneration,
    FileEncrypt,
    FileUpload,
    FileDownload,
    FileDecrypt,
    FileAccess,
    FileDelete,
    ShareCreate,
    ShareRevoke,
    ShareAccess,
    SystemError,
}

impl fmt::Display for AuditEventType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[derive(Clone)]
pub struct AuditService {
    db: DatabaseConnection,
}

impl AuditService {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn log(
        &self,
        event_type: AuditEventType,
        user_id: Option<String>,
        resource_id: Option<String>,
        action: &str,
        status: &str,
        details: Option<Value>,
        ip_address: Option<String>,
    ) {
        let event_type_str = event_type.to_string();
        let user_id_clone = user_id.clone();
        let resource_id_clone = resource_id.clone();
        let action_clone = action.to_string();
        let status_clone = status.to_string();
        let ip_address_clone = ip_address.clone();
        let db = self.db.clone();
        let details_json = details.map(|v| v.to_string());

        // Log to stdout/tracing immediately
        info!(
            target: "audit",
            event_type = %event_type_str,
            user_id = ?user_id_clone,
            resource_id = ?resource_id_clone,
            action = %action_clone,
            status = %status_clone,
            "Audit Event Occurred"
        );

        // Persist to DB asynchronously
        tokio::spawn(async move {
            let id = Uuid::new_v4().to_string();
            let log = audit_logs::ActiveModel {
                id: Set(id),
                timestamp: Set(chrono::Utc::now()),
                event_type: Set(event_type_str),
                user_id: Set(user_id_clone),
                resource_id: Set(resource_id_clone),
                action: Set(action_clone),
                status: Set(status_clone),
                details: Set(details_json),
                ip_address: Set(ip_address_clone),
            };

            if let Err(e) = log.insert(&db).await {
                error!("Failed to persist audit log: {}", e);
            }
        });
    }
}
