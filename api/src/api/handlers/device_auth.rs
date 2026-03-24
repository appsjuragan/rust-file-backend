/// Device Auth (OTP) endpoints for the desktop sync client.
///
/// Flow:
///   1. Desktop → POST /auth/device         → gets device_code + user_code (6-digit OTP)
///   2. Desktop opens browser to /auth/device/activate?user_code=XXXXXX  (or user enters manually)
///   3. Web user (already logged in) → POST /auth/device/confirm         → approves with their JWT
///   4. Desktop polls GET /auth/device/token?device_code=…               → eventually gets JWT
use crate::api::error::AppError;
use crate::entities::{device_auth::*, *};
use crate::utils::auth::Claims;
use axum::{Extension, Json, extract::{Query, State}};
use chrono::Utc;
use rand::Rng;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

// ─── Request / Response types ────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    /// Seconds until OTP expires
    pub expires_in: u64,
    /// Polling interval in seconds (desktop should use this)
    pub interval: u64,
    /// Verification URL the user should visit
    pub verification_uri: String,
}

#[derive(Deserialize, ToSchema)]
pub struct ConfirmDeviceRequest {
    pub user_code: String,
    /// Optional: explicitly deny instead of approve
    pub deny: Option<bool>,
}

#[derive(Serialize, ToSchema)]
pub struct ConfirmDeviceResponse {
    pub status: String,
    pub message: String,
}

#[derive(Deserialize)]
pub struct PollTokenQuery {
    pub device_code: String,
}

#[derive(Serialize, ToSchema)]
pub struct PollTokenResponse {
    pub status: String,
    /// Present only when status == "approved"
    pub token: Option<String>,
    /// Human-readable message
    pub message: String,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/// POST /auth/device
/// Desktop client calls this to start the OTP flow.
/// No authentication required.
#[utoipa::path(
    post,
    path = "/auth/device",
    responses(
        (status = 200, description = "Initiate device code flow", body = DeviceCodeResponse)
    )
)]
pub async fn initiate_device_auth(
    State(state): State<crate::AppState>,
) -> Result<Json<DeviceCodeResponse>, AppError> {
    let device_code = Uuid::new_v4().to_string();

    // Generate 6-digit numeric OTP (100000 – 999999)
    let otp: u32 = rand::thread_rng().gen_range(100_000..=999_999);
    let user_code = format!("{:06}", otp);

    let expires_at = Utc::now() + chrono::Duration::minutes(10);

    let session = DeviceAuthSession {
        device_code: device_code.clone(),
        user_code: user_code.clone(),
        expires_at,
        user_id: None,
        token: None,
        status: DeviceAuthStatus::Pending,
    };

    state.device_auth_sessions.insert(device_code.clone(), session);

    let frontend_url =
        std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:5173".to_string());

    Ok(Json(DeviceCodeResponse {
        device_code,
        user_code,
        expires_in: 600,
        interval: 5,
        verification_uri: format!("{}/activate", frontend_url),
    }))
}

/// POST /auth/device/confirm  (requires JWT — the web user must be logged in)
/// Web user submits the 6-digit OTP to approve (or deny) the desktop request.
#[utoipa::path(
    post,
    path = "/auth/device/confirm",
    request_body = ConfirmDeviceRequest,
    responses(
        (status = 200, description = "Device approved", body = ConfirmDeviceResponse),
        (status = 400, description = "OTP expired or invalid"),
        (status = 401, description = "Unauthorized")
    ),
    security(
        ("jwt" = [])
    )
)]
pub async fn confirm_device_auth(
    State(state): State<crate::AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<ConfirmDeviceRequest>,
) -> Result<Json<ConfirmDeviceResponse>, AppError> {
    // Find session by user_code
    let entry = state
        .device_auth_sessions
        .iter()
        .find(|e| e.value().user_code == payload.user_code)
        .map(|e| e.key().clone());

    let device_code = entry
        .ok_or_else(|| AppError::NotFound("Invalid or expired OTP code".to_string()))?;

    // Scope the borrow so we can mutate below
    let expired = {
        let s = state
            .device_auth_sessions
            .get(&device_code)
            .ok_or_else(|| AppError::NotFound("Session not found".to_string()))?;
        s.expires_at < Utc::now() || s.status != DeviceAuthStatus::Pending
    };

    if expired {
        return Err(AppError::BadRequest(
            "OTP code has already been used or expired".to_string(),
        ));
    }

    if payload.deny.unwrap_or(false) {
        state.device_auth_sessions.alter(&device_code, |_, mut s| {
            s.status = DeviceAuthStatus::Denied;
            s
        });
        return Ok(Json(ConfirmDeviceResponse {
            status: "denied".to_string(),
            message: "Device access denied".to_string(),
        }));
    }

    // Generate a long-lived token for the desktop (7 days)
    let token_str = {
        use crate::utils::auth::create_jwt_with_expiry;
        create_jwt_with_expiry(&claims.sub, &state.config.jwt_secret, 7 * 24)
            .map_err(|e| AppError::Internal(e.to_string()))?
    };

    // Persist token in DB (same as normal login)
    let token_id = Uuid::new_v4().to_string();
    let expires_at_db = Utc::now() + chrono::Duration::hours(7 * 24);
    let token_model = tokens::ActiveModel {
        id: sea_orm::Set(token_id),
        user_id: sea_orm::Set(claims.sub.clone()),
        token: sea_orm::Set(token_str.clone()),
        expires_at: sea_orm::Set(expires_at_db),
    };
    use sea_orm::ActiveModelTrait;
    token_model
        .insert(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // Update session with approved token
    state.device_auth_sessions.alter(&device_code, |_, mut s| {
        s.status = DeviceAuthStatus::Approved;
        s.user_id = Some(claims.sub.clone());
        s.token = Some(token_str.clone());
        s
    });

    Ok(Json(ConfirmDeviceResponse {
        status: "approved".to_string(),
        message: "Desktop access granted successfully".to_string(),
    }))
}

/// GET /auth/device/token?device_code=…
/// Desktop polls this every 5 seconds until it gets a token.
/// No authentication required (device_code acts as the shared secret).
#[utoipa::path(
    get,
    path = "/auth/device/token",
    params(
        ("device_code" = String, Query, description = "Device code received from initiate")
    ),
    responses(
        (status = 200, description = "Token polling response", body = PollTokenResponse),
        (status = 404, description = "Session not found")
    )
)]
pub async fn poll_device_token(
    State(state): State<crate::AppState>,
    Query(params): Query<PollTokenQuery>,
) -> Result<Json<PollTokenResponse>, AppError> {
    let session = state
        .device_auth_sessions
        .get(&params.device_code)
        .ok_or_else(|| AppError::NotFound("Device code not found or already consumed".to_string()))?;

    // Check expiry
    if session.expires_at < Utc::now() {
        drop(session);
        state.device_auth_sessions.alter(&params.device_code, |_, mut s| {
            s.status = DeviceAuthStatus::Expired;
            s
        });
        return Ok(Json(PollTokenResponse {
            status: "expired".to_string(),
            token: None,
            message: "OTP code has expired. Please restart the sign-in.".to_string(),
        }));
    }

    let response = match session.status {
        DeviceAuthStatus::Pending => PollTokenResponse {
            status: "pending".to_string(),
            token: None,
            message: "Waiting for user to enter OTP in the browser".to_string(),
        },
        DeviceAuthStatus::Approved => {
            let token = session.token.clone();
            drop(session);
            // Remove session after successful token delivery (one-time use)
            state.device_auth_sessions.remove(&params.device_code);
            PollTokenResponse {
                status: "approved".to_string(),
                token,
                message: "Authentication successful".to_string(),
            }
        }
        DeviceAuthStatus::Denied => {
            drop(session);
            state.device_auth_sessions.remove(&params.device_code);
            PollTokenResponse {
                status: "denied".to_string(),
                token: None,
                message: "User denied access. Please restart the sign-in.".to_string(),
            }
        }
        DeviceAuthStatus::Expired => PollTokenResponse {
            status: "expired".to_string(),
            token: None,
            message: "Session expired".to_string(),
        },
    };

    Ok(Json(response))
}
