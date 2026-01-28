use crate::config::SecurityConfig;
use crate::services::scanner::VirusScanner;
use std::sync::Arc;
use tracing::info;

pub async fn setup_scanner(security_config: &SecurityConfig) -> Arc<dyn VirusScanner> {
    let scanner_service =
        crate::services::scanner::create_scanner(&security_config.virus_scanner_type);

    // Warm up scanner connection
    if security_config.enable_virus_scan {
        if scanner_service.health_check().await {
            info!("🦠 Virus scanner connected successfully");
        } else {
            tracing::warn!(
                "⚠️  Virus scanner unreachable! Uploads may be rejected or skipped depending on policy."
            );
        }
    }

    scanner_service.into()
}
