use anyhow::{Result, anyhow};
use image::{ImageFormat, imageops};
use sea_orm::ActiveValue::Set;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use std::io::Write;
use std::process::Command;
use std::sync::Arc;
use tempfile::NamedTempFile;
use tracing::{debug, error, info};

use crate::entities::storage_files;
use crate::services::storage::StorageService;

pub struct ThumbnailService {
    db: DatabaseConnection,
    storage: Arc<dyn StorageService>,
}

impl ThumbnailService {
    pub fn new(db: DatabaseConnection, storage: Arc<dyn StorageService>) -> Self {
        Self { db, storage }
    }

    /// Process a single file to generate and upload a thumbnail
    pub async fn generate_thumbnail(&self, storage_file_id: &str) -> Result<()> {
        let file = storage_files::Entity::find_by_id(storage_file_id)
            .one(&self.db)
            .await?
            .ok_or_else(|| anyhow!("Storage file not found"))?;

        if file.has_thumbnail {
            return Ok(()); // Already has a thumbnail
        }

        let mime_type = file
            .mime_type
            .as_deref()
            .unwrap_or("application/octet-stream");
        info!(
            "Generating thumbnail for {} (MIME: {})",
            storage_file_id, mime_type
        );

        let data = self.storage.get_file(&file.s3_key).await?;

        // Check if we can generate a thumbnail for this mime type
        let thumb_data = if mime_type.starts_with("image/") {
            self.generate_image_thumbnail(&data)?
        } else if mime_type == "application/pdf" {
            self.generate_pdf_thumbnail(&data).await?
        } else if mime_type.starts_with("video/") {
            self.generate_video_thumbnail(&data).await?
        } else {
            return Err(anyhow!("Unsupported mime type for thumbnail generation"));
        };

        // Upload thumbnail to MinIO
        let thumbnail_key = format!("thumbnails/{}.jpg", storage_file_id);
        self.storage.upload_file(&thumbnail_key, thumb_data).await?;

        // Update database
        let mut active_model: storage_files::ActiveModel = file.into();
        active_model.has_thumbnail = Set(true);
        active_model.update(&self.db).await?;

        info!("Successfully generated thumbnail for {}", storage_file_id);
        Ok(())
    }

    fn generate_image_thumbnail(&self, data: &[u8]) -> Result<Vec<u8>> {
        // Load image from memory
        let img =
            image::load_from_memory(data).map_err(|e| anyhow!("Failed to load image: {}", e))?;

        // Resize to max 256x256 while preserving aspect ratio
        let thumbnail = img.thumbnail(256, 256);

        // Encode as JPEG
        let mut out_data = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut out_data);
        thumbnail
            .write_to(&mut cursor, ImageFormat::Jpeg)
            .map_err(|e| anyhow!("Failed to write JPEG thumbnail: {}", e))?;

        Ok(out_data)
    }

    async fn generate_pdf_thumbnail(&self, data: &[u8]) -> Result<Vec<u8>> {
        // Write PDF data to a temp file
        let mut input_file = NamedTempFile::new()?;
        input_file.write_all(data)?;
        let input_path = input_file.into_temp_path();

        // Create a temp file for output (pdftocairo will add .jpg extension if we use -jpeg)
        let output_base = NamedTempFile::new()?;
        let output_base_path = output_base.path().to_string_lossy().to_string();

        // Run pdftocairo
        // pdftocairo -jpeg -singlefile -scale-to 256 input.pdf output_base
        // It outputs to output_base.jpg
        let output = Command::new("pdftocairo")
            .arg("-jpeg")
            .arg("-singlefile")
            .arg("-scale-to")
            .arg("256")
            .arg(input_path.as_os_str())
            .arg(&output_base_path)
            .output()?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            error!("pdftocairo failed: {}", err_msg);
            return Err(anyhow!("pdftocairo failed: {}", err_msg));
        }

        let output_img_path = format!("{}.jpg", output_base_path);
        let result_data = tokio::fs::read(&output_img_path).await?;

        // Cleanup the output file manually since we generated it outside the NamedTempFile's control
        let _ = tokio::fs::remove_file(&output_img_path).await;

        Ok(result_data)
    }

    async fn generate_video_thumbnail(&self, data: &[u8]) -> Result<Vec<u8>> {
        // Write Video data to a temp file
        let mut input_file = NamedTempFile::new()?;
        input_file.write_all(data)?;
        let input_path = input_file.into_temp_path();

        // Output temp file
        let output_file = NamedTempFile::new()?;
        let output_path = output_file.path().to_string_lossy().to_string();

        // Run ffmpeg
        // ffmpeg -y -i input.mp4 -ss 00:00:01.000 -vframes 1 -vf scale=256:-1 output.jpg
        let output = Command::new("ffmpeg")
            .arg("-y") // Overwrite output
            .arg("-i")
            .arg(input_path.as_os_str())
            .arg("-ss")
            .arg("00:00:01.000") // 1 second in
            .arg("-vframes")
            .arg("1")
            .arg("-vf")
            .arg("scale=256:-1") // 256 width, auto height
            .arg("-f")
            .arg("image2")
            .arg(&output_path)
            .output()?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            error!("ffmpeg failed: {}", err_msg);
            return Err(anyhow!("ffmpeg failed: {}", err_msg));
        }

        let result_data = tokio::fs::read(&output_path).await?;
        Ok(result_data)
    }
}
