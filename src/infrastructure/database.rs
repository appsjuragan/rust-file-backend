use crate::entities::{file_metadata, file_tags, storage_files, tags, tokens, user_files, users, user_settings};
use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use sea_orm::{ConnectionTrait, Schema};
use std::env;
use std::time::Duration;
use tracing::info;

pub async fn setup_database() -> anyhow::Result<DatabaseConnection> {
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    info!("📂 Database: {}", db_url);

    let mut opt = ConnectOptions::new(&db_url);
    opt.max_connections(100)
        .min_connections(5)
        .connect_timeout(Duration::from_secs(30))
        .acquire_timeout(Duration::from_secs(30))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        .sqlx_logging(true)
        .sqlx_logging_level(log::LevelFilter::Debug);

    let db = Database::connect(opt).await?;

    info!("✅ Database connected successfully");

    run_migrations(&db).await?;

    Ok(db)
}

pub async fn run_migrations(db: &DatabaseConnection) -> anyhow::Result<()> {
    let builder = db.get_database_backend();
    let schema = Schema::new(builder);

    info!("🔄 Running auto-migrations...");

    // Order matters for foreign keys: Users -> Tokens, StorageFiles -> UserFiles
    let stmts = vec![
        (
            "users",
            schema
                .create_table_from_entity(users::Entity)
                .if_not_exists()
                .to_owned(),
        ),
        (
            "user_settings",
            schema
                .create_table_from_entity(user_settings::Entity)
                .if_not_exists()
                .to_owned(),
        ),
        (
            "tokens",
            schema
                .create_table_from_entity(tokens::Entity)
                .if_not_exists()
                .to_owned(),
        ),
        (
            "storage_files",
            schema
                .create_table_from_entity(storage_files::Entity)
                .if_not_exists()
                .to_owned(),
        ),
        (
            "user_files",
            schema
                .create_table_from_entity(user_files::Entity)
                .if_not_exists()
                .to_owned(),
        ),
        (
            "tags",
            schema
                .create_table_from_entity(tags::Entity)
                .if_not_exists()
                .to_owned(),
        ),
        (
            "file_metadata",
            schema
                .create_table_from_entity(file_metadata::Entity)
                .if_not_exists()
                .to_owned(),
        ),
        (
            "file_tags",
            schema
                .create_table_from_entity(file_tags::Entity)
                .if_not_exists()
                .to_owned(),
        ),
    ];

    for (name, stmt) in stmts {
        let stmt = builder.build(&stmt);
        match db.execute(stmt).await {
            Ok(_) => info!("   - Table '{}' checked/created", name),
            Err(e) => tracing::warn!("   - Failed to create table '{}': {}", name, e),
        }
    }

    // Manual migration for new features (Folders)
    // We use raw SQL because SeaORM's create_table_from_entity is additive-only for tables, not columns
    info!("🔄 Checking for schema updates...");

    let schema_updates = vec![
        "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS parent_id VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS is_folder BOOLEAN DEFAULT FALSE",
        "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL",
        "ALTER TABLE user_files ALTER COLUMN storage_file_id DROP NOT NULL",
        // Indexes for robust search
        "CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_files_parent_id ON user_files(parent_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_files_filename ON user_files(filename)",
        "CREATE INDEX IF NOT EXISTS idx_user_files_created_at ON user_files(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_user_files_deleted_at ON user_files(deleted_at)",
        "CREATE INDEX IF NOT EXISTS idx_file_metadata_category ON file_metadata(category)",
        "CREATE INDEX IF NOT EXISTS idx_file_metadata_storage_file_id ON file_metadata(storage_file_id)",
        // OIDC Support
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_sub VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc_sub ON users(oidc_sub)",
    ];

    for query in schema_updates {
        match db
            .execute(sea_orm::Statement::from_string(
                db.get_database_backend(),
                query.to_owned(),
            ))
            .await
        {
            Ok(_) => info!("   - Executed schema update: {}", query),
            Err(e) => {
                // sqlite doesn't support ALTER COLUMN DROP NOT NULL the same way, and IF NOT EXISTS on indexes is fine
                // We ignore errors here as some might be DB-specific or already done
                tracing::debug!("   - Schema update info (ignoring): {} -> {}", query, e);
            }
        }
    }

    Ok(())
}
