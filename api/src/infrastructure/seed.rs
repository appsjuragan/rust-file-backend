use crate::entities::prelude::*;
use crate::entities::{users, allowed_mimes, magic_signatures, blocked_extensions};
use argon2::PasswordHasher;
use sea_orm::{ActiveModelTrait, DatabaseConnection, EntityTrait, PaginatorTrait, Set, ColumnTrait, QueryFilter};
use tracing::info;
use uuid::Uuid;

pub async fn seed_initial_data(db: &DatabaseConnection) -> anyhow::Result<()> {
    info!("🌱 Checking for initial data seeding...");

    // Seed Admin User if none exists
    let user_count = Users::find().count(db).await?;
    if user_count == 0 {
        info!("👤 Creating initial admin user...");
        
        let argon2 = argon2::Argon2::default();
        let salt = argon2::password_hash::SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
        let password_hash = argon2
            .hash_password("admin123456".as_bytes(), &salt)
            .map_err(|e| anyhow::anyhow!(e.to_string()))?
            .to_string();

        let admin = users::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            username: Set("admin".to_string()),
            password_hash: Set(Some(password_hash)),
            name: Set(Some("Administrator".to_string())),
            ..Default::default()
        };
        
        admin.insert(db).await?;
        info!("✅ Admin user created (admin / admin123456)");
    }

    info!("✅ Initial seeding completed.");
    Ok(())
}

pub async fn seed_validation_data_sqlite(db: &DatabaseConnection) -> anyhow::Result<()> {
    info!("🌱 Seeding validation data for SQLite...");

    // 1. Allowed MIME Types
    let mimes = vec![
        ("application/pdf", "Documents"),
        ("application/msword", "Documents"),
        ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Documents"),
        ("image/jpeg", "Images"),
        ("image/png", "Images"),
        ("audio/mpeg", "Audio"),
        ("video/mp4", "Video"),
        ("application/zip", "Archives"),
        ("application/x-zip-compressed", "Archives"),
        ("application/x-rar-compressed", "Archives"),
        ("application/x-7z-compressed", "Archives"),
        ("application/x-tar", "Archives"),
        ("text/plain", "Text"),
        ("text/markdown", "Text"),
    ];

    for (mime, cat) in mimes {
        let exists = AllowedMimes::find()
            .filter(allowed_mimes::Column::MimeType.eq(mime))
            .one(db)
            .await?;

        if exists.is_none() {
            let model = allowed_mimes::ActiveModel {
                mime_type: Set(mime.to_string()),
                category: Set(cat.to_string()),
                ..Default::default()
            };
            model.insert(db).await?;
        }
    }

    // 2. Magic Signatures
    let sigs = vec![
        (vec![0x25, 0x50, 0x44, 0x46], "application/pdf"),
        (vec![0x50, 0x4B, 0x03, 0x04], "application/zip"),
        (vec![0xFF, 0xD8, 0xFF], "image/jpeg"),
        (vec![0x89, 0x50, 0x4E, 0x47], "image/png"),
    ];

    for (sig, mime) in sigs {
        let exists = MagicSignatures::find()
            .filter(magic_signatures::Column::MimeType.eq(mime))
            .filter(magic_signatures::Column::Signature.eq(sig.clone()))
            .one(db)
            .await?;

        if exists.is_none() {
            let model = magic_signatures::ActiveModel {
                signature: Set(sig),
                mime_type: Set(mime.to_string()),
                ..Default::default()
            };
            model.insert(db).await?;
        }
    }

    // 3. Blocked Extensions
    let blocked = vec!["exe", "dll", "bat", "cmd", "sh", "js"];

    for ext in blocked {
        let exists = BlockedExtensions::find()
            .filter(blocked_extensions::Column::Extension.eq(ext))
            .one(db)
            .await?;

        if exists.is_none() {
            let model = blocked_extensions::ActiveModel {
                extension: Set(ext.to_string()),
                ..Default::default()
            };
            model.insert(db).await?;
        }
    }

    info!("✅ SQLite validation seeding completed.");
    Ok(())
}
