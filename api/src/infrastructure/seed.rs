use crate::entities::{allowed_mimes, blocked_extensions, magic_signatures, prelude::*};
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use tracing::info;

pub async fn seed_validation_data(db: &DatabaseConnection) -> anyhow::Result<()> {
    info!("🌱 Seeding validation data...");

    // 1. Allowed MIME Types
    let mimes = vec![
        ("application/pdf", "Documents"),
        ("application/msword", "Documents"),
        (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Documents",
        ),
        ("application/vnd.ms-excel", "Documents"),
        (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Documents",
        ),
        ("application/vnd.ms-powerpoint", "Documents"),
        (
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "Documents",
        ),
        ("application/rtf", "Documents"),
        ("text/plain", "Documents"),
        ("text/csv", "Documents"),
        ("image/jpeg", "Images"),
        ("image/png", "Images"),
        ("image/gif", "Images"),
        ("image/webp", "Images"),
        ("image/bmp", "Images"),
        ("image/tiff", "Images"),
        ("image/svg+xml", "Images"),
        ("audio/mpeg", "Audio"),
        ("audio/mp3", "Audio"),
        ("audio/wav", "Audio"),
        ("audio/ogg", "Audio"),
        ("audio/flac", "Audio"),
        ("audio/aac", "Audio"),
        ("audio/webm", "Audio"),
        ("audio/mp4", "Audio"),
        ("audio/x-m4a", "Audio"),
        ("audio/m4a", "Audio"),
        ("video/mp4", "Video"),
        ("video/mpeg", "Video"),
        ("video/webm", "Video"),
        ("video/ogg", "Video"),
        ("video/quicktime", "Video"),
        ("video/x-msvideo", "Video"),
        ("application/zip", "Archives"),
        ("application/x-rar-compressed", "Archives"),
        ("application/vnd.rar", "Archives"),
        ("application/x-7z-compressed", "Archives"),
        ("application/gzip", "Archives"),
        ("application/x-tar", "Archives"),
        ("application/x-bzip2", "Archives"),
        ("application/x-zip-compressed", "Archives"),
        ("application/x-compress", "Archives"),
        ("application/x-compressed", "Archives"),
        ("application/x-zip", "Archives"),
        ("application/x-rar", "Archives"),
        ("application/octet-stream", "Archives"),
        ("application/x-gtar", "Archives"),
        ("application/x-tgz", "Archives"),
        ("application/x-gzip", "Archives"),
        ("video/mp2t", "Video"),
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
        (vec![0xD0, 0xCF, 0x11, 0xE0], "application/msword"),
        (vec![0x50, 0x4B, 0x03, 0x04], "application/zip"),
        (vec![0xFF, 0xD8, 0xFF], "image/jpeg"),
        (vec![0x89, 0x50, 0x4E, 0x47], "image/png"),
        (vec![0x47, 0x49, 0x46, 0x38], "image/gif"),
        (vec![0x52, 0x49, 0x46, 0x46], "image/webp"),
        (vec![0x42, 0x4D], "image/bmp"),
        (vec![0x49, 0x44, 0x33], "audio/mpeg"),
        (vec![0xFF, 0xFB], "audio/mpeg"),
        (vec![0xFF, 0xFA], "audio/mpeg"),
        (vec![0x4F, 0x67, 0x67, 0x53], "audio/ogg"),
        (vec![0x66, 0x4C, 0x61, 0x43], "audio/flac"),
        (
            vec![
                0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41,
            ],
            "audio/mp4",
        ),
        (
            vec![
                0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41,
            ],
            "audio/mp4",
        ),
        (
            vec![
                0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41,
            ],
            "audio/mp4",
        ),
        (
            vec![0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70],
            "video/mp4",
        ),
        (
            vec![0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
            "video/mp4",
        ),
        (vec![0x47], "video/mp2t"),
        (vec![0x1F, 0x8B], "application/gzip"),
        (vec![0x52, 0x61, 0x72, 0x21], "application/vnd.rar"),
        (vec![0x37, 0x7A, 0xBC, 0xAF], "application/x-7z-compressed"),
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
    let blocked = vec![
        "exe", "dll", "so", "dylib", "bin", "com", "bat", "cmd", "ps1", "sh", "bash", "js", "ts",
        "jsx", "tsx", "py", "pyw", "rb", "php", "pl", "cgi", "asp", "aspx", "jsp", "jspx", "cfm",
        "go", "rs", "java", "class", "jar", "war", "c", "cpp", "h", "hpp", "cs", "vb", "vbs",
        "lua", "r", "swift", "kt", "scala", "groovy", "html", "htm", "xhtml", "shtml", "svg",
        "xml", "xsl", "xslt", "htaccess", "htpasswd", "json", "yaml", "yml", "toml", "ini", "conf",
        "config", "iso", "img", "vmdk", "vhd", "ova", "ovf", "docm", "xlsm", "pptm", "dotm",
        "xltm", "potm",
    ];

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

    info!("✅ Seeding completed.");
    Ok(())
}
