use crate::entities::{
    allowed_mimes, audit_logs, blocked_extensions, file_metadata, file_tags, magic_signatures,
    storage_files, tags, tokens, user_file_facts, user_files, user_settings, users,
};
use sea_orm::{ConnectOptions, Database, DatabaseConnection, Schema, ConnectionTrait};
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

    // Seed additional data if needed (e.g. system accounts)
    crate::infrastructure::seed::seed_initial_data(&db).await?;

    Ok(db)
}

pub async fn run_migrations(db: &DatabaseConnection) -> anyhow::Result<()> {
    let db_url = env::var("DATABASE_URL")?;
    
    if db_url.starts_with("postgres://") {
        info!("🔄 Running SQLx migrations for PostgreSQL...");
        let pool = sqlx::PgPool::connect(&db_url).await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
    } else {
        info!("🔄 Running SeaORM auto-migrations for SQLite/Other...");
        let builder = db.get_database_backend();
        let schema = Schema::new(builder);
        
        let stmts = vec![
            schema.create_table_from_entity(users::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(user_settings::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(tokens::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(storage_files::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(user_files::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(tags::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(file_metadata::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(file_tags::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(audit_logs::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(user_file_facts::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(allowed_mimes::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(magic_signatures::Entity).if_not_exists().to_owned(),
            schema.create_table_from_entity(blocked_extensions::Entity).if_not_exists().to_owned(),
        ];

        for stmt in stmts {
            let stmt = builder.build(&stmt);
            let _ = db.execute(stmt).await;
        }
        
        // Seed validation data for SQLite since SQL migrations won't run
        crate::infrastructure::seed::seed_validation_data_sqlite(db).await?;
    }
    
    Ok(())
}
