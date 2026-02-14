use sea_orm::{Database, EntityTrait};
use rust_file_backend::entities::users;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let db = Database::connect(db_url).await?;
    
    let users = users::Entity::find().all(&db).await?;
    println!("Users found: {}", users.len());
    for user in users {
        println!("- ID: {}, Username: {}", user.id, user.username);
    }
    
    Ok(())
}
