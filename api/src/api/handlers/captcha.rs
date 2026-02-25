use crate::api::error::AppError;
use axum::{Json, extract::State, http::HeaderMap};
use rand::Rng;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

/// CAPTCHA challenge data stored server-side
#[derive(Clone, Debug)]
pub struct CaptchaChallenge {
    pub answer: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Cooldown tracking per IP
#[derive(Clone, Debug)]
pub struct CooldownEntry {
    pub failed_attempts: u32,
    pub last_attempt: chrono::DateTime<chrono::Utc>,
    pub locked_until: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Serialize, ToSchema)]
pub struct CaptchaResponse {
    pub captcha_id: String,
    pub question: String,
    pub expires_in: u64,
}

#[derive(Deserialize, ToSchema)]
pub struct CaptchaVerifyRequest {
    pub captcha_id: String,
    pub captcha_answer: i32,
}

/// Extract client IP from headers (supports proxies)
pub fn extract_client_ip(headers: &HeaderMap) -> String {
    // Check X-Forwarded-For first (proxy)
    if let Some(forwarded) = headers.get("x-forwarded-for")
        && let Ok(val) = forwarded.to_str()
        && let Some(ip) = val.split(',').next()
    {
        return ip.trim().to_string();
    }
    // Check X-Real-IP
    if let Some(real_ip) = headers.get("x-real-ip")
        && let Ok(val) = real_ip.to_str()
    {
        return val.trim().to_string();
    }
    "unknown".to_string()
}

/// Check if client IP is on cooldown
pub fn check_cooldown(
    cooldowns: &dashmap::DashMap<String, CooldownEntry>,
    ip: &str,
) -> Result<(), AppError> {
    if let Some(entry) = cooldowns.get(ip)
        && let Some(locked_until) = entry.locked_until
    {
        let now = chrono::Utc::now();
        if now < locked_until {
            let remaining = (locked_until - now).num_seconds();
            return Err(AppError::BadRequest(format!(
                "Too many failed attempts. Please wait {} seconds before trying again.",
                remaining
            )));
        }
    }
    Ok(())
}

/// Record a failed attempt and potentially apply cooldown
pub fn record_failed_attempt(cooldowns: &dashmap::DashMap<String, CooldownEntry>, ip: &str) {
    let now = chrono::Utc::now();
    let mut entry = cooldowns.entry(ip.to_string()).or_insert(CooldownEntry {
        failed_attempts: 0,
        last_attempt: now,
        locked_until: None,
    });

    // Reset counter if last attempt was more than 15 minutes ago
    if (now - entry.last_attempt).num_minutes() > 15 {
        entry.failed_attempts = 0;
        entry.locked_until = None;
    }

    entry.failed_attempts += 1;
    entry.last_attempt = now;

    // Apply escalating cooldowns
    match entry.failed_attempts {
        3..=4 => {
            entry.locked_until = Some(now + chrono::Duration::seconds(10));
            tracing::warn!(
                "IP {} hit 10s cooldown after {} attempts",
                ip,
                entry.failed_attempts
            );
        }
        5..=7 => {
            entry.locked_until = Some(now + chrono::Duration::seconds(30));
            tracing::warn!(
                "IP {} hit 30s cooldown after {} attempts",
                ip,
                entry.failed_attempts
            );
        }
        8..=10 => {
            entry.locked_until = Some(now + chrono::Duration::seconds(60));
            tracing::warn!(
                "IP {} hit 60s cooldown after {} attempts",
                ip,
                entry.failed_attempts
            );
        }
        n if n > 10 => {
            entry.locked_until = Some(now + chrono::Duration::seconds(300));
            tracing::warn!(
                "IP {} hit 5min cooldown after {} attempts",
                ip,
                entry.failed_attempts
            );
        }
        _ => {}
    }
}

/// Clear failed attempts on success
pub fn clear_cooldown(cooldowns: &dashmap::DashMap<String, CooldownEntry>, ip: &str) {
    cooldowns.remove(ip);
}

/// Generate a new CAPTCHA challenge
#[utoipa::path(
    get,
    path = "/captcha",
    responses(
        (status = 200, description = "CAPTCHA challenge generated", body = CaptchaResponse),
        (status = 429, description = "Too many requests, cooldown active")
    )
)]
pub async fn generate_captcha(
    State(state): State<crate::AppState>,
    headers: HeaderMap,
) -> Result<Json<CaptchaResponse>, AppError> {
    let ip = extract_client_ip(&headers);

    // Check cooldown
    check_cooldown(&state.cooldowns, &ip)?;

    let mut rng = rand::thread_rng();

    // Generate diverse math challenge types
    let (question, answer) = match rng.gen_range(0..4) {
        0 => {
            // Addition
            let a = rng.gen_range(1..50);
            let b = rng.gen_range(1..50);
            (format!("{} + {}", a, b), a + b)
        }
        1 => {
            // Subtraction (ensure positive result)
            let a = rng.gen_range(10..50);
            let b = rng.gen_range(1..a);
            (format!("{} − {}", a, b), a - b)
        }
        2 => {
            // Multiplication
            let a = rng.gen_range(2..13);
            let b = rng.gen_range(2..10);
            (format!("{} × {}", a, b), a * b)
        }
        _ => {
            // Mixed: a + b - c
            let a = rng.gen_range(10..40);
            let b = rng.gen_range(1..20);
            let c = rng.gen_range(1..std::cmp::min(a + b, 20));
            (format!("{} + {} − {}", a, b, c), a + b - c)
        }
    };

    let captcha_id = Uuid::new_v4().to_string();
    let expires_in: u64 = 120; // 2 minutes

    state.captchas.insert(
        captcha_id.clone(),
        CaptchaChallenge {
            answer,
            created_at: chrono::Utc::now(),
        },
    );

    tracing::debug!(
        "CAPTCHA generated: id={}, question='{}', answer={}",
        captcha_id,
        question,
        answer
    );

    Ok(Json(CaptchaResponse {
        captcha_id,
        question: format!("What is {}?", question),
        expires_in,
    }))
}

/// Validate a CAPTCHA answer (called internally by auth handlers)
pub fn validate_captcha(
    captchas: &dashmap::DashMap<String, CaptchaChallenge>,
    cooldowns: &dashmap::DashMap<String, CooldownEntry>,
    captcha_id: &str,
    captcha_answer: i32,
    ip: &str,
) -> Result<(), AppError> {
    // Check cooldown first
    check_cooldown(cooldowns, ip)?;

    // Look up the challenge
    let challenge = captchas
        .remove(captcha_id) // Remove on use (one-time)
        .map(|(_, v)| v)
        .ok_or_else(|| {
            record_failed_attempt(cooldowns, ip);
            AppError::BadRequest(
                "Invalid or expired CAPTCHA. Please request a new one.".to_string(),
            )
        })?;

    // Check expiration (2 minutes)
    let age = chrono::Utc::now() - challenge.created_at;
    if age.num_seconds() > 120 {
        record_failed_attempt(cooldowns, ip);
        return Err(AppError::BadRequest(
            "CAPTCHA expired. Please request a new one.".to_string(),
        ));
    }

    // Validate answer
    if captcha_answer != challenge.answer {
        record_failed_attempt(cooldowns, ip);
        return Err(AppError::BadRequest(
            "Incorrect CAPTCHA answer. Please try again.".to_string(),
        ));
    }

    // Success — clear any cooldown for this IP
    clear_cooldown(cooldowns, ip);

    Ok(())
}

/// Periodic cleanup of expired captchas and stale cooldown entries
pub fn cleanup_expired(
    captchas: &dashmap::DashMap<String, CaptchaChallenge>,
    cooldowns: &dashmap::DashMap<String, CooldownEntry>,
) {
    let now = chrono::Utc::now();

    // Remove captchas older than 5 minutes
    captchas.retain(|_, v| (now - v.created_at).num_minutes() < 5);

    // Remove cooldown entries older than 30 minutes
    cooldowns.retain(|_, v| (now - v.last_attempt).num_minutes() < 30);
}
