use sea_orm::{Database, EntityTrait, ColumnTrait, QueryFilter};
use rust_file_backend::entities::user_files;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let db = Database::connect(db_url).await?;
    
    let admin_id = "820f4cda-8882-4154-b2a0-d31f97bd5ab0";
    
    let target = user_files::Entity::find()
        .filter(user_files::Column::UserId.eq(admin_id))
        .filter(user_files::Column::Filename.contains("Ini Sub"))
        .one(&db).await?;
        
    if let Some(file) = target {
        println!("FOUND: ID={}, Name={}, DeletedAt={:?}, IsFolder={}", 
            file.id, file.filename, file.deleted_at, file.is_folder);
            
        // Check children
        let children = user_files::Entity::find()
            .filter(user_files::Column::ParentId.eq(file.id))
            .all(&db).await?;
        println!("Children count: {}", children.len());
        for child in children {
            println!("  - Child ID={}, Name={}, DeletedAt={:?}", child.id, child.name, child.deleted_at);
        }
    } else {
        println!("NOT FOUND: Folder 'Ini Sub' for admin");
    }
    
    Ok(())
}
