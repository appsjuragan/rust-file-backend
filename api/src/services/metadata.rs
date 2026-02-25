use lofty::file::AudioFile;
use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use lofty::tag::Accessor;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use zip::ZipArchive;

#[derive(Debug, Serialize, Deserialize)]
pub struct MetadataResult {
    pub category: String,
    pub metadata: Value,
    pub suggested_tags: Vec<String>,
    pub is_encrypted: bool,
}

pub struct MetadataService;

impl MetadataService {
    pub fn analyze(bytes: &[u8], filename: &str) -> MetadataResult {
        let mut tags = HashSet::new();
        let extension = filename.split('.').next_back().unwrap_or("").to_lowercase();

        // 1. Detect MIME type using infer
        let kind = infer::get(bytes);
        let mut mime_type = kind
            .map(|k| k.mime_type())
            .unwrap_or("application/octet-stream");

        // 2. Fallback to extension if generic or unknown
        if mime_type == "application/octet-stream" || mime_type == "application/stream" {
            mime_type = match extension.as_str() {
                "mp4" => "video/mp4",
                "webm" => "video/webm",
                "ogg" => "video/ogg",
                "mkv" => "video/x-matroska",
                "avi" => "video/avi",
                "ts" => "video/mp2t",
                "mov" => "video/quicktime",
                "flv" => "video/x-flv",
                "mp3" => "audio/mpeg",
                "wav" => "audio/wav",
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "svg" => "image/svg+xml",
                "pdf" => "application/pdf",
                "txt" => "text/plain",
                "html" => "text/html",
                "css" => "text/css",
                "js" => "application/javascript",
                "json" => "application/json",
                _ => mime_type,
            };
        }

        tags.insert(extension.clone());

        if mime_type.starts_with("image/") {
            return Self::analyze_image(bytes, mime_type, tags);
        } else if mime_type.starts_with("video/") || mime_type.starts_with("audio/") {
            return Self::analyze_multimedia(bytes, mime_type, tags);
        } else if mime_type == "application/pdf" {
            return Self::analyze_pdf(bytes, mime_type, tags);
        } else if Self::is_office_xml(mime_type, &extension) {
            return Self::analyze_office_xml(bytes, mime_type, tags);
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
            is_encrypted: false,
        }
    }

    fn is_office_xml(mime: &str, ext: &str) -> bool {
        mime.contains("openxmlformats") || ["docx", "xlsx", "pptx", "odt", "ods"].contains(&ext)
    }

    fn analyze_image(bytes: &[u8], mime_type: &str, mut tags: HashSet<String>) -> MetadataResult {
        tags.insert("image".to_string());

        let mut meta = json!({
            "mime_type": mime_type,
        });

        // 1. Basic Image Props (Width/Height) using image crate
        if let Some(img) = image::io::Reader::new(std::io::Cursor::new(bytes))
            .with_guessed_format()
            .ok()
            .and_then(|reader| reader.decode().ok())
        {
            let (w, h) = (img.width(), img.height());
            meta["width"] = json!(w);
            meta["height"] = json!(h);

            if w > 1920 || h > 1080 {
                tags.insert("high-res".to_string());
            }
        }

        // 2. EXIF Data using kamadak-exif
        let exif_reader = exif::Reader::new();
        if let Ok(exif) = exif_reader.read_from_container(&mut std::io::Cursor::new(bytes)) {
            let mut exif_map = serde_json::Map::new();

            for field in exif.fields() {
                let key = field.tag.to_string();
                let value = field.display_value().with_unit(&exif).to_string();

                // Filter for interesting tags to avoid clutter
                if key.contains("ISO")
                    || key.contains("Model")
                    || key.contains("DateTime")
                    || key.contains("FNumber")
                    || key.contains("ExposureTime")
                {
                    exif_map.insert(key.clone(), Value::String(value.clone()));
                }

                // Add specific tags based on metadata
                if key.contains("Model") {
                    tags.insert(value.replace(" ", "-").to_lowercase());
                }
            }
            meta["exif"] = Value::Object(exif_map);
            tags.insert("has-exif".to_string());
        }

        MetadataResult {
            category: "image".to_string(),
            metadata: meta,
            suggested_tags: tags.into_iter().collect(),
            is_encrypted: false,
        }
    }

    fn analyze_multimedia(
        bytes: &[u8],
        mime_type: &str,
        mut tags: HashSet<String>,
    ) -> MetadataResult {
        let category = if mime_type.starts_with("video/") {
            tags.insert("video".to_string());
            "video"
        } else {
            tags.insert("audio".to_string());
            "audio"
        };

        let mut meta = json!({
            "mime_type": mime_type,
            "size_bytes": bytes.len(),
        });

        // Lofty for Audio/Video
        let mut cursor = std::io::Cursor::new(bytes);
        if let Ok(probe) = Probe::new(&mut cursor).guess_file_type() {
            // Use mut tagged_file to access primary_tag_mut if needed
            if let Ok(mut tagged_file) = probe.read() {
                let properties = tagged_file.properties();
                meta["duration_seconds"] = json!(properties.duration().as_secs());

                // Audio bitrate if available
                if let Some(bitrate) = properties.audio_bitrate() {
                    meta["bitrate"] = json!(bitrate);
                }

                // Use primary_tag_mut if primary_tag is unavailable
                if let Some(tag) = tagged_file.primary_tag_mut() {
                    if let Some(title) = tag.title() {
                        meta["title"] = json!(title.to_string());
                    }
                    if let Some(artist) = tag.artist() {
                        meta["artist"] = json!(artist.to_string());
                    }
                    if let Some(album) = tag.album() {
                        meta["album"] = json!(album.to_string());
                    }

                    if tag.title().is_some() || tag.artist().is_some() {
                        tags.insert("tagged".to_string());
                    }
                }
            }
        }

        MetadataResult {
            category: category.to_string(),
            metadata: meta,
            suggested_tags: tags.into_iter().collect(),
            is_encrypted: false,
        }
    }

    fn analyze_pdf(bytes: &[u8], mime_type: &str, mut tags: HashSet<String>) -> MetadataResult {
        tags.insert("pdf".to_string());
        tags.insert("document".to_string());

        let mut meta = json!({
            "mime_type": mime_type,
            "size_bytes": bytes.len(),
        });

        let mut is_encrypted = false;
        match lopdf::Document::load_mem(bytes) {
            Ok(doc) => {
                meta["page_count"] = json!(doc.get_pages().len());

                // Extract Info dictionary
                if let Ok(info_val) = doc.trailer.get(b"Info") {
                    // Fix: trailer.get returns Result
                    if let Ok(info_dict) = info_val
                        .as_reference()
                        .and_then(|id| doc.get_object(id))
                        .and_then(|obj| obj.as_dict())
                    {
                        for (key, val) in info_dict.iter() {
                            let key_str = String::from_utf8_lossy(key).to_string();
                            if let Ok(s) = val.as_str() {
                                let val_str = String::from_utf8_lossy(s).to_string();
                                if !val_str.is_empty()
                                    && ["Title", "Author", "Subject", "Creator"]
                                        .contains(&key_str.as_str())
                                {
                                    meta[key_str.to_lowercase()] = json!(val_str);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let err_msg = e.to_string().to_lowercase();
                if err_msg.contains("password") || err_msg.contains("encrypted") {
                    is_encrypted = true;
                    tags.insert("encrypted".to_string());
                }
            }
        }

        MetadataResult {
            category: "document".to_string(),
            metadata: meta,
            suggested_tags: tags.into_iter().collect(),
            is_encrypted,
        }
    }

    fn analyze_office_xml(
        bytes: &[u8],
        mime_type: &str,
        mut tags: HashSet<String>,
    ) -> MetadataResult {
        tags.insert("office".to_string());
        tags.insert("document".to_string());

        let mut meta = json!({
            "mime_type": mime_type,
            "size_bytes": bytes.len(),
        });

        let cursor = std::io::Cursor::new(bytes);
        if let Ok(mut archive) = ZipArchive::new(cursor) {
            // 1. Parse docProps/core.xml (Basic Properties: Title, Creator, Dates)
            if let Ok(mut file) = archive.by_name("docProps/core.xml") {
                let mut xml_content = String::new();
                if std::io::Read::read_to_string(&mut file, &mut xml_content).is_ok() {
                    let mut reader = Reader::from_str(&xml_content);
                    reader.config_mut().trim_text(true);
                    let mut buf = Vec::new();
                    let mut current_tag = String::new();

                    loop {
                        match reader.read_event_into(&mut buf) {
                            Ok(Event::Start(e)) => {
                                current_tag =
                                    String::from_utf8_lossy(e.name().as_ref()).to_string();
                            }
                            Ok(Event::Text(e)) => {
                                let txt = String::from_utf8_lossy(e.as_ref()).to_string();
                                if !txt.is_empty() {
                                    if current_tag.ends_with(":title") {
                                        meta["title"] = json!(txt);
                                    }
                                    if current_tag.ends_with(":creator") {
                                        meta["author"] = json!(txt);
                                    }
                                    if current_tag.ends_with(":lastModifiedBy") {
                                        meta["last_saved_by"] = json!(txt);
                                    }
                                    if current_tag.ends_with(":revision") {
                                        meta["revision"] = json!(txt);
                                    }
                                    if current_tag.ends_with(":created") {
                                        meta["created_at"] = json!(txt);
                                    }
                                    if current_tag.ends_with(":modified") {
                                        meta["modified_at"] = json!(txt);
                                    }
                                }
                            }
                            Ok(Event::Eof) => break,
                            Err(_) => break,
                            _ => (),
                        }
                        buf.clear();
                    }
                }
            }

            // 2. Parse docProps/app.xml (Extended Properties: Words, Pages, Slides, Time)
            if let Ok(mut file) = archive.by_name("docProps/app.xml") {
                let mut xml_content = String::new();
                if std::io::Read::read_to_string(&mut file, &mut xml_content).is_ok() {
                    let mut reader = Reader::from_str(&xml_content);
                    reader.config_mut().trim_text(true);
                    let mut buf = Vec::new();
                    let mut current_tag = String::new();

                    loop {
                        match reader.read_event_into(&mut buf) {
                            Ok(Event::Start(e)) => {
                                current_tag =
                                    String::from_utf8_lossy(e.name().as_ref()).to_string();
                            }
                            Ok(Event::Text(e)) => {
                                let txt = String::from_utf8_lossy(e.as_ref()).to_string();
                                if !txt.is_empty() {
                                    if current_tag.ends_with("Pages") {
                                        meta["page_count"] = json!(txt.parse::<i32>().unwrap_or(0));
                                    }
                                    if current_tag.ends_with("Words") {
                                        meta["word_count"] = json!(txt.parse::<i32>().unwrap_or(0));
                                    }
                                    if current_tag.ends_with("TotalTime") {
                                        meta["total_editing_time"] =
                                            json!(txt.parse::<i32>().unwrap_or(0));
                                    }
                                    if current_tag.ends_with("Application") {
                                        meta["application"] = json!(txt);
                                    }
                                    if current_tag.ends_with("Slides") {
                                        meta["slide_count"] =
                                            json!(txt.parse::<i32>().unwrap_or(0));
                                    }
                                    if current_tag.ends_with("Paragraphs") {
                                        meta["paragraph_count"] =
                                            json!(txt.parse::<i32>().unwrap_or(0));
                                    }
                                    if current_tag.ends_with("AppVersion") {
                                        meta["app_version"] = json!(txt);
                                    }
                                }
                            }
                            Ok(Event::Eof) => break,
                            Err(_) => break,
                            _ => (),
                        }
                        buf.clear();
                    }
                }
            }
        }

        MetadataResult {
            category: "document".to_string(),
            metadata: meta,
            suggested_tags: tags.into_iter().collect(),
            is_encrypted: false,
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
            is_encrypted: false,
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
}
