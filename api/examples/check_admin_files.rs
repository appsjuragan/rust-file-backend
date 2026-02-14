use sea_orm::{Database, EntityTrait, ColumnTrait, QueryFilter};
use rust_file_backend::entities::user_files;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let db = Database::connect(db_url).await?;
    
    let admin_id = "820f4cda-8882-4154-b2a0-d31f97bd5ab0";
    
    let files = user_files::Entity::find()
        .filter(user_files::Column::UserId.eq(admin_id))
        .all(&db).await?;
        
    println!("Files for admin ({}):", admin_id);
    for file in files {
        println!("- ID: {}, Name: {}, DeletedAt: {:?}, IsFolder: {}", 
            file.id, file.filename, file.deleted_at, file.is_folder);
    }
    
    Ok(())
}
