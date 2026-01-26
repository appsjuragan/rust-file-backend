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

    /// Chunk size for large file hashing in bytes (default: 10 MB)
    pub chunk_size: usize,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            max_file_size: 256 * 1024 * 1024, // 256 MB
            uploads_per_hour: 250,
            enable_virus_scan: true,
            virus_scanner_type: "clamav".to_string(),
            clamav_host: "127.0.0.1".to_string(),
            clamav_port: 3310,
            chunk_size: 10 * 1024 * 1024, // 10 MB
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
        }
    }

    /// Create config for development (no virus scanning, relaxed limits)
    pub fn development() -> Self {
        Self {
            max_file_size: 256 * 1024 * 1024,
            uploads_per_hour: 1000,
            enable_virus_scan: false,
            virus_scanner_type: "noop".to_string(),
            clamav_host: "127.0.0.1".to_string(),
            clamav_port: 3310,
            chunk_size: 10 * 1024 * 1024,
        }
    }

    /// Create config for production (strict security)
    pub fn production() -> Self {
        Self {
            max_file_size: 256 * 1024 * 1024,
            uploads_per_hour: 250,
            enable_virus_scan: true,
            virus_scanner_type: "clamav".to_string(),
            clamav_host: env::var("CLAMAV_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            clamav_port: env::var("CLAMAV_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3310),
            chunk_size: 10 * 1024 * 1024,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = SecurityConfig::default();
        assert_eq!(config.max_file_size, 256 * 1024 * 1024);
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
        let config = SecurityConfig::production();
        assert!(config.enable_virus_scan);
        assert_eq!(config.virus_scanner_type, "clamav");
        assert_eq!(config.uploads_per_hour, 250);
    }
}
