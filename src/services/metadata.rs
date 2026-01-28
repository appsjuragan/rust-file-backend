use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;

#[derive(Debug, Serialize, Deserialize)]
pub struct MetadataResult {
    pub category: String,
    pub metadata: Value,
    pub suggested_tags: Vec<String>,
}

pub struct MetadataService;

impl MetadataService {
    pub fn analyze(bytes: &[u8], filename: &str) -> MetadataResult {
        let mut tags = HashSet::new();
        let extension = filename.split('.').last().unwrap_or("").to_lowercase();
        
        // 1. Detect MIME type using infer
        let kind = infer::get(bytes);
        let mime_type = kind.map(|k| k.mime_type()).unwrap_or("application/octet-stream");
        
        tags.insert(extension.clone());
        
        if mime_type.starts_with("image/") {
            return Self::analyze_image(bytes, mime_type, tags);
        } else if mime_type.starts_with("video/") || mime_type.starts_with("audio/") {
             return Self::analyze_multimedia(bytes, mime_type, tags);
        } else if mime_type == "text/plain" || extension == "txt" || extension == "md" {
             return Self::analyze_text(bytes, mime_type, tags);
        }

        MetadataResult {
            category: "other".to_string(),
            metadata: json!({
                "mime_type": mime_type,
                "extension": extension
            }),
            suggested_tags: tags.into_iter().collect(),
        }
    }

    fn analyze_image(bytes: &[u8], mime_type: &str, mut tags: HashSet<String>) -> MetadataResult {
        tags.insert("image".to_string());
        
        let mut meta = json!({
            "mime_type": mime_type,
        });

        if let Ok(img) = image::io::Reader::new(std::io::Cursor::new(bytes)).with_guessed_format().unwrap().decode() {
            let (w, h) = (img.width(), img.height());
            meta["width"] = json!(w);
            meta["height"] = json!(h);
            
            if w > 1920 || h > 1080 {
                tags.insert("high-res".to_string());
            }
        }

        MetadataResult {
            category: "image".to_string(),
            metadata: meta,
            suggested_tags: tags.into_iter().collect(),
        }
    }

    fn analyze_multimedia(bytes: &[u8], mime_type: &str, mut tags: HashSet<String>) -> MetadataResult {
        let category = if mime_type.starts_with("video/") {
            tags.insert("video".to_string());
            "video"
        } else {
            tags.insert("audio".to_string());
            "audio"
        };

        // Basic metadata for now, real extraction would need ffprobe or lofty
        MetadataResult {
            category: category.to_string(),
            metadata: json!({
                "mime_type": mime_type,
                "size_bytes": bytes.len()
            }),
            suggested_tags: tags.into_iter().collect(),
        }
    }

    fn analyze_text(bytes: &[u8], mime_type: &str, mut tags: HashSet<String>) -> MetadataResult {
        tags.insert("text".to_string());
        let text = String::from_utf8_lossy(bytes);
        let lines = text.lines().count();
        let words = text.split_whitespace().count();

        MetadataResult {
            category: "text".to_string(),
            metadata: json!({
                "mime_type": mime_type,
                "line_count": lines,
                "word_count": words
            }),
            suggested_tags: tags.into_iter().collect(),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_text() {
        let content = b"Hello world! This is a test file.";
        let result = MetadataService::analyze(content, "test.txt");
        
        assert_eq!(result.category, "text");
        assert!(result.suggested_tags.contains(&"txt".to_string()));
        assert!(result.suggested_tags.contains(&"text".to_string()));
        assert_eq!(result.metadata["line_count"], 1);
        assert_eq!(result.metadata["word_count"], 7);
    }

    #[test]
    fn test_analyze_image_fake() {
        // Just enough bytes for a tiny PNG header or similar
        // Actually the image crate will fail to decode, but it should still detect generic category via extension/mime
        let content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR";
        let result = MetadataService::analyze(content, "icon.png");
        
        assert_eq!(result.category, "image");
        assert!(result.suggested_tags.contains(&"png".to_string()));
        assert!(result.suggested_tags.contains(&"image".to_string()));
    }

    #[test]
    fn test_analyze_unknown() {
        let content = vec![0u8; 100];
        let result = MetadataService::analyze(&content, "data.bin");
        
        assert_eq!(result.category, "other");
        assert!(result.suggested_tags.contains(&"bin".to_string()));
    }
}
