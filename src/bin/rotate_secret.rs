use dotenvy::dotenv;
use rust_file_backend::infrastructure::{database, storage};
use rust_file_backend::services::key_management::KeyManagementService;
use std::env;

use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "rotate_secret=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("🔐 Starting System Secret Rotation Tool...");

    // 1. Get Secrets
    let old_secret = env::var("OLD_SECRET").ok();
    let new_secret = env::var("NEW_SECRET").ok();

    if old_secret.is_none() || new_secret.is_none() {
        error!("❌ Missing environment variables: OLD_SECRET and NEW_SECRET are required.");
        info!("Usage: OLD_SECRET=... NEW_SECRET=... cargo run --bin rotate_secret");
        std::process::exit(1);
    }
    let old_secret = old_secret.unwrap();
    let new_secret = new_secret.unwrap();

    if old_secret == new_secret {
        error!("❌ OLD_SECRET and NEW_SECRET are the same. Nothing to do.");
        std::process::exit(1);
    }

    // 2. Setup Infrastructure
    info!("🔌 Connecting to database...");
    let db = database::setup_database().await?;
    info!("☁️  Connecting to storage...");
    let storage = storage::setup_storage().await;

    // 3. Init Service
    let key_service = KeyManagementService::new(db.clone(), storage.clone());

    // 4. Perform Rotation
    info!("🔄 Rotating keys for all users... This might take a while.");
    match key_service
        .rotate_system_secret(&old_secret, &new_secret)
        .await
    {
        Ok(count) => {
            info!("✅ Successfully re-encrypted keys for {} users.", count);
            info!(
                "IMPORTANT: You must now update 'SYSTEM_SECRET' in your .env or deployment config to the NEW_SECRET value."
            );
        }
        Err(e) => {
            error!("❌ Failed to rotate keys: {}", e);
            // We should probably rollback or warn, but individual failures stop the process here.
            // The method logic uses a pager but doesn't wrap "all" in a transaction (files are S3).
            // So partial success is possible. This is a "script" limitation.
        }
    }

    Ok(())
}
