use anyhow::{Result, anyhow};
use image::ImageFormat;
use sea_orm::ActiveValue::Set;
use sea_orm::{ActiveModelTrait, DatabaseConnection, EntityTrait};
use std::io::Write;
use std::process::Command;
use std::sync::Arc;
use tempfile::NamedTempFile;
use tracing::{error, info};

use crate::entities::storage_files;
use crate::services::storage::StorageService;

/// Thumbnail dimension (max width or height)
const THUMB_SIZE: u32 = 256;

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
            "Generating WebP thumbnail for {} (MIME: {})",
            storage_file_id, mime_type
        );

        let data = self.storage.get_file(&file.s3_key).await?;

        // Check if we can generate a thumbnail for this mime type
        let thumb_data_res = if mime_type.starts_with("image/heic") || mime_type.starts_with("image/heif") {
            self.generate_heif_thumbnail(&data).await
        } else if mime_type.starts_with("image/") {
            self.generate_image_thumbnail(&data)
        } else if mime_type == "application/pdf" {
            self.generate_pdf_thumbnail(&data).await
        } else if mime_type.starts_with("video/") {
            self.generate_video_thumbnail(&data, mime_type).await
        } else {
            return Err(anyhow!("Unsupported mime type for thumbnail generation"));
        };

        let thumb_data = match thumb_data_res {
            Ok(data) => data,
            Err(e) => {
                let err_msg = e.to_string().to_lowercase();
                if err_msg.contains("password") || err_msg.contains("encrypted") {
                    info!(
                        "File {} is password protected, flagging as encrypted and skipping thumbnail",
                        storage_file_id
                    );
                    let mut active_model: storage_files::ActiveModel = file.into();
                    active_model.is_encrypted = Set(true);
                    active_model.update(&self.db).await?;
                    return Ok(());
                }
                return Err(e);
            }
        };

        // Upload thumbnail to MinIO as WebP
        let thumbnail_key = format!("thumbnails/{}.webp", storage_file_id);
        self.storage.upload_file(&thumbnail_key, thumb_data).await?;

        // Update database
        let mut active_model: storage_files::ActiveModel = file.into();
        active_model.has_thumbnail = Set(true);
        active_model.update(&self.db).await?;

        info!(
            "Successfully generated WebP thumbnail for {} ",
            storage_file_id
        );
        Ok(())
    }

    /// Encode an image::DynamicImage to WebP bytes with quality optimized for its size
    fn encode_to_webp(img: &image::DynamicImage) -> Result<Vec<u8>> {
        // WebP does not support 16-bit or 32-bit float color spaces. Convert down to 8-bit.
        let img_8bit = match img.color() {
            image::ColorType::Rgba16 | image::ColorType::La16 | image::ColorType::Rgba32F => {
                image::DynamicImage::ImageRgba8(img.to_rgba8())
            }
            image::ColorType::Rgb16 | image::ColorType::L16 | image::ColorType::Rgb32F => {
                image::DynamicImage::ImageRgb8(img.to_rgb8())
            }
            _ => img.clone(),
        };

        let mut out_data = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut out_data);
        img_8bit
            .write_to(&mut cursor, ImageFormat::WebP)
            .map_err(|e| anyhow!("Failed to encode WebP thumbnail: {}", e))?;
        Ok(out_data)
    }

    fn generate_image_thumbnail(&self, data: &[u8]) -> Result<Vec<u8>> {
        // Load image from memory
        let img =
            image::load_from_memory(data).map_err(|e| anyhow!("Failed to load image: {}", e))?;

        // Resize to max THUMB_SIZExTHUMB_SIZE while preserving aspect ratio
        let thumbnail = img.thumbnail(THUMB_SIZE, THUMB_SIZE);

        // Encode as WebP
        Self::encode_to_webp(&thumbnail)
    }

    async fn generate_pdf_thumbnail(&self, data: &[u8]) -> Result<Vec<u8>> {
        // Write PDF data to a temp file
        let mut input_file = NamedTempFile::new()?;
        input_file.write_all(data)?;
        let input_path = input_file.into_temp_path();

        // Create a temp file for output
        let output_base = NamedTempFile::new()?;
        let output_base_path = output_base.path().to_string_lossy().to_string();

        // Use pdftocairo to render first page to PNG (lossless intermediate)
        let output = Command::new("pdftocairo")
            .arg("-png")
            .arg("-singlefile")
            .arg("-scale-to")
            .arg(THUMB_SIZE.to_string())
            .arg(input_path.as_os_str())
            .arg(&output_base_path)
            .output()?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            error!("pdftocairo failed: {}", err_msg);
            return Err(anyhow!("pdftocairo failed: {}", err_msg));
        }

        let output_img_path = format!("{}.png", output_base_path);
        let png_data = tokio::fs::read(&output_img_path).await?;

        // Cleanup the intermediate PNG
        let _ = tokio::fs::remove_file(&output_img_path).await;

        // Re-encode from PNG to WebP for optimal compression
        let img = image::load_from_memory(&png_data)
            .map_err(|e| anyhow!("Failed to load PDF thumbnail PNG: {}", e))?;
        Self::encode_to_webp(&img)
    }

    async fn generate_video_thumbnail(&self, data: &[u8], mime_type: &str) -> Result<Vec<u8>> {
        // Map common video mime types to file extensions for ffmpeg to detect format properly
        let ext = match mime_type {
            "video/mp4" => ".mp4",
            "video/x-matroska" => ".mkv",
            "video/x-msvideo" | "video/avi" => ".avi",
            "video/quicktime" => ".mov",
            "video/x-flv" => ".flv",
            "video/webm" => ".webm",
            "video/mpeg" => ".mpg",
            "video/mp2t" => ".ts",
            "video/3gpp" => ".3gp",
            "video/x-m4v" => ".m4v",
            "video/x-ms-wmv" => ".wmv",
            "video/x-ms-asf" => ".asf",
            "video/x-ms-vob" => ".vob",
            _ => ".mp4", // Fallback syntax for ffmpeg
        };

        // Write Video data to a temp file
        let mut input_file = tempfile::Builder::new().suffix(ext).tempfile()?;
        input_file.write_all(data)?;
        let input_path = input_file.into_temp_path();

        // Output temp file as PNG (lossless intermediate for best re-encoding)
        let output_file = NamedTempFile::with_suffix(".png")?;
        let output_path = output_file.path().to_string_lossy().to_string();

        // Use ffmpeg to extract a frame as PNG
        let output = Command::new("ffmpeg")
            .arg("-y") // Overwrite output
            .arg("-i")
            .arg(input_path.as_os_str())
            .arg("-ss")
            .arg("00:00:01.000") // 1 second in
            .arg("-vframes")
            .arg("1")
            .arg("-vf")
            .arg(format!("scale={}:-1", THUMB_SIZE)) // THUMB_SIZE width, auto height
            .arg(&output_path)
            .output()?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            error!("ffmpeg failed: {}", err_msg);
            return Err(anyhow!("ffmpeg failed: {}", err_msg));
        }

        let png_data = tokio::fs::read(&output_path).await?;

        // Re-encode from PNG to WebP for optimal compression
        let img = image::load_from_memory(&png_data)
            .map_err(|e| anyhow!("Failed to load video frame PNG: {}", e))?;
        Self::encode_to_webp(&img)
    }

    async fn generate_heif_thumbnail(&self, data: &[u8]) -> Result<Vec<u8>> {
        // Write HEIF data to a temp file
        let mut input_file = tempfile::Builder::new().suffix(".heic").tempfile()?;
        input_file.write_all(data)?;
        let input_path = input_file.into_temp_path();

        // Output temp file as PNG
        let output_file = NamedTempFile::with_suffix(".png")?;
        let output_path = output_file.path().to_string_lossy().to_string();

        // Use ffmpeg to extract the HEIF image as PNG
        let output = Command::new("ffmpeg")
            .arg("-y") // Overwrite output
            .arg("-i")
            .arg(input_path.as_os_str())
            .arg("-vframes")
            .arg("1")
            .arg("-vf")
            .arg(format!("scale={}:-1", THUMB_SIZE)) // THUMB_SIZE width, auto height
            .arg(&output_path)
            .output()?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            error!("ffmpeg failed on HEIC/HEIF: {}", err_msg);
            return Err(anyhow!("ffmpeg failed on HEIC: {}", err_msg));
        }

        let png_data = tokio::fs::read(&output_path).await?;
        let img = image::load_from_memory(&png_data)
            .map_err(|e| anyhow!("Failed to load HEIC to PNG frame: {}", e))?;
        Self::encode_to_webp(&img)
    }
}
