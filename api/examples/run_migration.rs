use sea_orm::{ConnectionTrait, Database, Statement};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let db = Database::connect(db_url).await?;

    println!("Applying migration: ADD COLUMN has_thumbnail TO storage_files");

    let sql = "ALTER TABLE storage_files ADD COLUMN IF NOT EXISTS has_thumbnail BOOLEAN NOT NULL DEFAULT false;";

    db.execute(Statement::from_string(db.get_database_backend(), sql))
        .await?;

    println!("Migration applied successfully!");

    Ok(())
}
