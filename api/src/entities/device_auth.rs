use chrono::{DateTime, Utc};
use serde::Serialize;

/// In-memory device auth session stored in AppState DashMap
/// No DB migration needed - sessions expire after 10 minutes
#[derive(Clone, Debug, Serialize)]
pub struct DeviceAuthSession {
    /// Unique device code (UUID) given to desktop client
    pub device_code: String,
    /// 6-digit user OTP shown in the browser / web UI  
    pub user_code: String,
    /// Expiration time (10 minutes)
    pub expires_at: DateTime<Utc>,
    /// User ID set once web user confirms (None = pending)
    pub user_id: Option<String>,
    /// JWT token set upon confirmation (None = pending/denied)
    pub token: Option<String>,
    /// Session status
    pub status: DeviceAuthStatus,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceAuthStatus {
    Pending,
    Approved,
    Denied,
    Expired,
}
