use std::env;

/// Security configuration for file uploads
#[derive(Debug, Clone)]
pub struct SecurityConfig {
    /// Maximum file size in bytes (default: 256 MB)
    pub max_file_size: usize,

    /// Rate limit: uploads per hour per user (default: 250)
    pub uploads_per_hour: u32,

    /// Enable virus scanning (default: true)
    pub enable_virus_scan: bool,

    /// Virus scanner type: "clamav" or "noop" (default: "clamav")
    pub virus_scanner_type: String,

    /// ClamAV host (default: "127.0.0.1")
    pub clamav_host: String,

    /// ClamAV port (default: 3310)
    pub clamav_port: u16,

    /// Chunk size for large file hashing in bytes (default: 7 MB)
    pub chunk_size: usize,

    /// OIDC Issuer URL
    pub oidc_issuer_url: Option<String>,
    /// OIDC Client ID
    pub oidc_client_id: Option<String>,
    /// OIDC Client Secret
    pub oidc_client_secret: Option<String>,
    /// OIDC Redirect URL
    pub oidc_redirect_url: Option<String>,
    /// Skip OIDC Discovery (use derived endpoints)
    pub oidc_skip_discovery: bool,

    /// Staging file cleanup age in hours (default: 24)
    pub staging_cleanup_age_hours: u64,

    /// JWT Secret Key (Required)
    pub jwt_secret: String,

    /// Allowed CORS Origins (comma separated)
    pub allowed_origins: Vec<String>,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            max_file_size: 1024 * 1024 * 1024, // 1 GB
            uploads_per_hour: 250,
            enable_virus_scan: true,
            virus_scanner_type: "clamav".to_string(),
            clamav_host: "127.0.0.1".to_string(),
            clamav_port: 3310,
            chunk_size: 7 * 1024 * 1024, // 7 MB
            oidc_issuer_url: None,
            oidc_client_id: None,
            oidc_client_secret: None,
            oidc_redirect_url: None,
            oidc_skip_discovery: false,
            staging_cleanup_age_hours: 24,
            jwt_secret: "secret".to_string(),
            // More secure default: localhost only instead of wildcard
            allowed_origins: vec![
                "http://localhost:3000".to_string(),
                "http://localhost:5173".to_string(), // Vite default
                "http://127.0.0.1:3000".to_string(),
            ],
        }
    }
}

impl SecurityConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Self {
        let default = Self::default();

        Self {
            max_file_size: env::var("MAX_FILE_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.max_file_size),

            uploads_per_hour: env::var("UPLOADS_PER_HOUR")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.uploads_per_hour),

            enable_virus_scan: env::var("ENABLE_VIRUS_SCAN")
                .map(|v| v.to_lowercase() != "false" && v != "0")
                .unwrap_or(default.enable_virus_scan),

            virus_scanner_type: env::var("VIRUS_SCANNER_TYPE")
                .unwrap_or(default.virus_scanner_type),

            clamav_host: env::var("CLAMAV_HOST").unwrap_or(default.clamav_host),

            clamav_port: env::var("CLAMAV_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.clamav_port),

            chunk_size: env::var("CHUNK_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.chunk_size),

            oidc_issuer_url: env::var("OIDC_ISSUER_URL").ok(),
            oidc_client_id: env::var("OIDC_CLIENT_ID").ok(),
            oidc_client_secret: env::var("OIDC_CLIENT_SECRET").ok(),
            oidc_redirect_url: env::var("OIDC_REDIRECT_URL").ok(),
            oidc_skip_discovery: env::var("OIDC_SKIP_DISCOVERY")
                .map(|v| v.to_lowercase() == "true" || v == "1")
                .unwrap_or(false),

            staging_cleanup_age_hours: env::var("STAGING_CLEANUP_AGE_HOURS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.staging_cleanup_age_hours),

            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "secret".to_string()), // Fallback for dev convenience, strictly enforced in production method

            allowed_origins: env::var("ALLOWED_ORIGINS")
                .ok()
                .map(|v| v.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or(default.allowed_origins),
        }
    }

    /// Create config for development (no virus scanning, relaxed limits)
    pub fn development() -> Self {
        Self {
            max_file_size: 1024 * 1024 * 1024,
            uploads_per_hour: 1000,
            enable_virus_scan: false,
            virus_scanner_type: "noop".to_string(),
            clamav_host: "127.0.0.1".to_string(),
            clamav_port: 3310,
            chunk_size: 7 * 1024 * 1024, // 7 MB
            oidc_issuer_url: None,
            oidc_client_id: None,
            oidc_client_secret: None,
            oidc_redirect_url: None,
            oidc_skip_discovery: false,
            staging_cleanup_age_hours: 24,
            jwt_secret: "secret".to_string(),
            // Development: localhost origins only
            allowed_origins: vec![
                "http://localhost:3000".to_string(),
                "http://localhost:5173".to_string(), // Vite default
                "http://127.0.0.1:3000".to_string(),
            ],
        }
    }

    /// Create config for production (strict security)
    pub fn production() -> Self {
        let default = Self::default();
        Self {
            max_file_size: env::var("MAX_FILE_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.max_file_size),
            uploads_per_hour: env::var("UPLOADS_PER_HOUR")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.uploads_per_hour),
            enable_virus_scan: env::var("ENABLE_VIRUS_SCAN")
                .map(|v| v.to_lowercase() != "false" && v != "0")
                .unwrap_or(default.enable_virus_scan),
            virus_scanner_type: env::var("VIRUS_SCANNER_TYPE")
                .unwrap_or(default.virus_scanner_type),
            clamav_host: env::var("CLAMAV_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            clamav_port: env::var("CLAMAV_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3310),
            chunk_size: env::var("CHUNK_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default.chunk_size),
            oidc_issuer_url: env::var("OIDC_ISSUER_URL").ok(),
            oidc_client_id: env::var("OIDC_CLIENT_ID").ok(),
            oidc_client_secret: env::var("OIDC_CLIENT_SECRET").ok(),
            oidc_redirect_url: env::var("OIDC_REDIRECT_URL").ok(),
            oidc_skip_discovery: env::var("OIDC_SKIP_DISCOVERY")
                .map(|v| v.to_lowercase() == "true" || v == "1")
                .unwrap_or(false),
            staging_cleanup_age_hours: env::var("STAGING_CLEANUP_AGE_HOURS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(24),
            jwt_secret: env::var("JWT_SECRET").expect("CRITICAL: JWT_SECRET must be set"),
            allowed_origins: env::var("ALLOWED_ORIGINS")
                .ok()
                .map(|v| v.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_else(|| vec!["https://myfiles1.thepihouse.my.id".to_string()]), // Default to known prod domain if not set
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = SecurityConfig::default();
        assert_eq!(config.max_file_size, 1024 * 1024 * 1024);
        assert_eq!(config.uploads_per_hour, 250);
        assert!(config.enable_virus_scan);
        assert_eq!(config.virus_scanner_type, "clamav");
    }

    #[test]
    fn test_development_config() {
        let config = SecurityConfig::development();
        assert!(!config.enable_virus_scan);
        assert_eq!(config.virus_scanner_type, "noop");
    }

    #[test]
    fn test_production_config() {
        unsafe { env::set_var("JWT_SECRET", "test_secret") };
        let config = SecurityConfig::production();
        unsafe { env::remove_var("JWT_SECRET") };
        assert!(config.enable_virus_scan);
        assert_eq!(config.virus_scanner_type, "clamav");
        assert_eq!(config.uploads_per_hour, 250);
    }

    #[test]
    fn test_from_env_cors_fallback() {
        unsafe { env::remove_var("ALLOWED_ORIGINS") };
        let config = SecurityConfig::from_env();
        let default_config = SecurityConfig::default();
        assert_eq!(config.allowed_origins, default_config.allowed_origins);
        assert!(!config.allowed_origins.contains(&"*".to_string()));
    }
}
