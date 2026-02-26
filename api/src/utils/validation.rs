use anyhow::{Result, anyhow};
use sea_orm::EntityTrait;
use serde::Serialize;
use std::path::Path;
use utoipa::ToSchema;

/// Maximum file size: 256 MB
pub const MAX_FILE_SIZE: usize = 512 * 1024 * 1024; // 256 MB

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub struct ValidationRules {
    pub allowed_mimes: Vec<String>,
    pub blocked_extensions: Vec<String>,
    #[serde(skip)]
    pub magic_signatures: Vec<(Vec<u8>, String)>,
    pub max_file_size: usize,
    pub chunk_size: usize,
}

impl ValidationRules {
    pub async fn load(
        db: &sea_orm::DatabaseConnection,
        max_file_size: usize,
        chunk_size: usize,
    ) -> Result<Self, sea_orm::DbErr> {
        use crate::entities::prelude::*;

        let mimes = AllowedMimes::find().all(db).await?;
        let extensions = BlockedExtensions::find().all(db).await?;
        let signatures = MagicSignatures::find().all(db).await?;

        Ok(Self {
            allowed_mimes: mimes.into_iter().map(|m| m.mime_type).collect(),
            blocked_extensions: extensions.into_iter().map(|e| e.extension).collect(),
            magic_signatures: signatures
                .into_iter()
                .map(|s| (s.signature, s.mime_type))
                .collect(),
            max_file_size,
            chunk_size,
        })
    }
}

#[derive(Debug, Clone)]
pub struct ValidationError {
    pub code: &'static str,
    pub message: String,
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for ValidationError {}

/// Validates file size against maximum limit
pub fn validate_file_size(size: usize, max_size: usize) -> Result<()> {
    if size > max_size {
        return Err(anyhow!(ValidationError {
            code: "FILE_TOO_LARGE",
            message: format!(
                "File size {} bytes exceeds maximum allowed {} bytes ({} MB)",
                size,
                max_size,
                max_size / 1024 / 1024
            ),
        }));
    }
    Ok(())
}

/// Validates MIME type against allowlist
pub fn validate_mime_type(content_type: &str, rules: &ValidationRules) -> Result<()> {
    let mut normalized = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();

    // Normalizing frequent variations provided by OS/Browsers to standard allowed DB counterparts
    normalized = match normalized.as_str() {
        "video/mov" => "video/quicktime".to_string(),
        "video/m4v" | "video/x-m4v" => "video/mp4".to_string(),
        "video/3gp" | "video/3gpp" | "video/3gpp2" => "video/mp4".to_string(),
        "video/ogv" | "video/x-ogv" => "video/ogg".to_string(),
        "video/x-ms-wmv" | "video/x-ms-asf" | "video/x-ms-vob" => "video/x-msvideo".to_string(),
        _ => normalized,
    };

    if rules
        .allowed_mimes
        .iter()
        .any(|allowed| allowed == &normalized)
    {
        return Ok(());
    }

    Err(anyhow!(ValidationError {
        code: "INVALID_MIME_TYPE",
        message: format!(
            "MIME type '{}' is not allowed. Only documents, media, and archives are permitted.",
            content_type
        ),
    }))
}

/// Sanitizes filename to prevent path traversal and injection attacks
/// Returns the sanitized filename or an error if the name is invalid
pub fn sanitize_filename(filename: &str, rules: &ValidationRules) -> Result<String> {
    // Get only the filename component (remove any path)
    let name = Path::new(filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    if name.is_empty() {
        return Err(anyhow!(ValidationError {
            code: "INVALID_FILENAME",
            message: "Filename cannot be empty".to_string(),
        }));
    }

    // Check for path traversal attempts
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        tracing::warn!("Path traversal attempt detected: {}", filename);
    }

    // Remove dangerous characters, keep only safe ones
    // We allow most Unicode characters but block path separators and reserved characters
    let sanitized: String = name
        .chars()
        .map(|c| {
            if c.is_control()
                || c == '/'
                || c == '\\'
                || c == ':'
                || c == '*'
                || c == '?'
                || c == '"'
                || c == '<'
                || c == '>'
                || c == '|'
                || c == ';'
            {
                '_'
            } else {
                c
            }
        })
        .collect();

    // Limit length safely for UTF-8
    let sanitized = if sanitized.len() > 255 {
        let mut end = 255;
        while !sanitized.is_char_boundary(end) {
            end -= 1;
        }
        sanitized[..end].to_string()
    } else {
        sanitized
    };

    // Check for blocked extensions
    if let Some(ext) = Path::new(&sanitized).extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        if rules.blocked_extensions.contains(&ext_lower) {
            return Err(anyhow!(ValidationError {
                code: "BLOCKED_EXTENSION",
                message: format!("File extension '.{}' is not allowed", ext_lower),
            }));
        }
    }

    // Prevent hidden files
    if sanitized.starts_with('.') {
        return Err(anyhow!(ValidationError {
            code: "HIDDEN_FILE",
            message: "Hidden files (starting with '.') are not allowed".to_string(),
        }));
    }

    Ok(sanitized)
}

/// Checks magic bytes to verify actual file type matches claimed type
pub fn verify_magic_bytes(
    header: &[u8],
    claimed_mime: &str,
    rules: &ValidationRules,
) -> Result<()> {
    if header.is_empty() {
        return Err(anyhow!(ValidationError {
            code: "EMPTY_FILE",
            message: "File appears to be empty".to_string(),
        }));
    }

    // Check for executable content in first bytes
    if is_executable_content(header) {
        return Err(anyhow!(ValidationError {
            code: "EXECUTABLE_CONTENT",
            message: "File contains executable content which is not allowed".to_string(),
        }));
    }

    // For text files, we can't verify magic bytes reliably
    if claimed_mime.starts_with("text/") {
        // Check it's actually text (no binary content in first bytes)
        if header.iter().take(512).any(|&b| b == 0) {
            return Err(anyhow!(ValidationError {
                code: "BINARY_AS_TEXT",
                message: "File claimed as text but contains binary content".to_string(),
            }));
        }
        return Ok(());
    }

    // Find matching signature
    for (signature, mime_type) in &rules.magic_signatures {
        if header.len() >= signature.len() && header.starts_with(signature) {
            // Special case: ZIP-based formats (docx, xlsx, pptx, zip)
            if *mime_type == "application/zip" {
                // ZIP signature matches many formats, allow if claimed is zip-based
                if claimed_mime.contains("zip")
                    || claimed_mime.contains("openxmlformats")
                    || claimed_mime == "application/zip"
                {
                    return Ok(());
                }
            }

            // Check if detected type is compatible with claimed type
            if claimed_mime.contains(mime_type) || mime_type.contains(claimed_mime) {
                return Ok(());
            }

            // Allow generic category matches (e.g., detected audio/mpeg for claimed audio/mp3)
            let claimed_category = claimed_mime.split('/').next().unwrap_or("");
            let detected_category = mime_type.split('/').next().unwrap_or("");
            if claimed_category == detected_category {
                return Ok(());
            }
        }
    }

    // If no signature matched but MIME type is allowed, log warning but allow
    // (some formats don't have reliable magic bytes)
    tracing::debug!(
        "No magic bytes match for claimed MIME type '{}', allowing anyway",
        claimed_mime
    );

    Ok(())
}

/// Checks if file content appears to be executable
pub fn is_executable_content(header: &[u8]) -> bool {
    if header.len() < 4 {
        return false;
    }

    // ELF binary (Linux)
    if header.starts_with(&[0x7F, 0x45, 0x4C, 0x46]) {
        return true;
    }

    // PE/COFF (Windows .exe, .dll)
    if header.starts_with(&[0x4D, 0x5A]) {
        return true;
    }

    // Mach-O (macOS)
    if header.starts_with(&[0xFE, 0xED, 0xFA, 0xCE])
        || header.starts_with(&[0xFE, 0xED, 0xFA, 0xCF])
        || header.starts_with(&[0xCE, 0xFA, 0xED, 0xFE])
        || header.starts_with(&[0xCF, 0xFA, 0xED, 0xFE])
    {
        return true;
    }

    // Shebang (shell scripts)
    if header.starts_with(b"#!") {
        return true;
    }

    false
}

/// Full validation pipeline for uploaded files
pub fn validate_upload(
    filename: &str,
    content_type: Option<&str>,
    size: usize,
    header: &[u8],
    max_size: usize,
    rules: &ValidationRules,
) -> Result<String> {
    // 1. Size check
    validate_file_size(size, max_size)?;

    // 2. Sanitize filename (also checks extension)
    let sanitized_filename = sanitize_filename(filename, rules)?;

    // 3. MIME type check
    let mime = content_type.unwrap_or("application/octet-stream");
    validate_mime_type(mime, rules)?;

    // 4. Magic bytes verification
    verify_magic_bytes(header, mime, rules)?;

    // 5. Deep content inspection
    inspect_content_security(header, mime)?;

    Ok(sanitized_filename)
}

/// Calculate Shannon entropy to detect packed/encrypted content
pub fn calculate_entropy(data: &[u8]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    let mut frequency = [0usize; 256];
    for &byte in data {
        frequency[byte as usize] += 1;
    }
    let len = data.len() as f64;
    frequency
        .iter()
        .filter(|&&count| count > 0)
        .fold(0.0, |acc, &count| {
            let p = count as f64 / len;
            acc - p * p.log2()
        })
}

/// Deep inspection for hidden threats (scripts, high entropy in text)
pub fn inspect_content_security(header: &[u8], mime_type: &str) -> Result<()> {
    // Check for script injection in non-script formats (XSS vectors)
    // We check the first 2KB which usually contains the header/metadata
    let check_len = std::cmp::min(header.len(), 2048);
    let sample = &header[..check_len];

    // Convert to lowercase roughly for pattern matching (not perfect for full unicode but good for keywords)
    // We use lossy conversion to simple ASCII lowercase for checking standard tags
    let sample_lower = sample
        .iter()
        .map(|b| b.to_ascii_lowercase())
        .collect::<Vec<u8>>();
    let sample_str = String::from_utf8_lossy(&sample_lower);

    // Block common XSS vectors in uploaded files
    // Note: This is an aggressive filter.
    let dangerous_patterns = [
        "<script",
        "javascript:",
        "vbscript:",
        "onload=",
        "onerror=",
        "onclick=",
        "onmouseover=",
    ];

    for pattern in dangerous_patterns {
        if sample_str.contains(pattern) {
            return Err(anyhow!(ValidationError {
                code: "POTENTIAL_SCRIPT_INJECTION",
                message: format!(
                    "File contains potentially malicious script pattern: '{}'",
                    pattern
                ),
            }));
        }
    }

    // Entropy Check
    // Text files should have relatively low entropy (< 6.0 usually).
    // If a text file has very high entropy (> 7.5), it might be encrypted/packed code hiding as text.
    if mime_type.starts_with("text/") {
        let entropy = calculate_entropy(sample);
        if entropy > 7.5 {
            tracing::warn!(
                "High entropy ({:.2}) detected in text file. Potential embedded code/obfuscation.",
                entropy
            );
            // We generally allow it but warn, unless strict mode is on.
            // For this implementation, we'll strict fail on extremely high entropy for text to be safe
            if entropy > 7.9 {
                return Err(anyhow!(ValidationError {
                    code: "SUSPICIOUS_ENTROPY",
                    message: "Text file has suspiciously high entropy, resembling encrypted data."
                        .to_string(),
                }));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_file_size() {
        assert!(validate_file_size(1024, MAX_FILE_SIZE).is_ok());
        assert!(validate_file_size(MAX_FILE_SIZE, MAX_FILE_SIZE).is_ok());
        assert!(validate_file_size(MAX_FILE_SIZE + 1, MAX_FILE_SIZE).is_err());
    }

    fn get_test_rules() -> ValidationRules {
        ValidationRules {
            allowed_mimes: vec![
                "image/jpeg".to_string(),
                "image/png".to_string(),
                "application/pdf".to_string(),
                "application/zip".to_string(),
                "video/mp4".to_string(),
                "text/plain".to_string(),
            ],
            blocked_extensions: vec!["exe".to_string(), "php".to_string(), "js".to_string()],
            magic_signatures: vec![
                (vec![0xFF, 0xD8, 0xFF, 0xE0], "image/jpeg".to_string()),
                (vec![0x89, 0x50, 0x4E, 0x47], "image/png".to_string()),
                (vec![0x25, 0x50, 0x44, 0x46], "application/pdf".to_string()),
                (vec![0x50, 0x4B, 0x03, 0x04], "application/zip".to_string()),
            ],
            max_file_size: MAX_FILE_SIZE,
            chunk_size: 10 * 1024 * 1024, // 10 MB
        }
    }

    #[test]
    fn test_validate_mime_type() {
        let rules = get_test_rules();
        assert!(validate_mime_type("image/jpeg", &rules).is_ok());
        assert!(validate_mime_type("application/pdf", &rules).is_ok());
        assert!(validate_mime_type("application/zip", &rules).is_ok());
        assert!(validate_mime_type("video/mp4", &rules).is_ok());

        // Should reject code files
        assert!(validate_mime_type("application/javascript", &rules).is_err());
        assert!(validate_mime_type("text/html", &rules).is_err());
        assert!(validate_mime_type("application/x-python", &rules).is_err());
    }

    #[test]
    fn test_sanitize_filename() {
        let rules = get_test_rules();
        assert_eq!(sanitize_filename("test.pdf", &rules).unwrap(), "test.pdf");
        assert_eq!(
            sanitize_filename("my file.doc", &rules).unwrap(),
            "my file.doc"
        );
        assert_eq!(
            sanitize_filename("test<script>.pdf", &rules).unwrap(),
            "test_script_.pdf"
        );
        assert_eq!(sanitize_filename("测试.txt", &rules).unwrap(), "测试.txt");
        assert_eq!(
            sanitize_filename("日本語.mp4", &rules).unwrap(),
            "日本語.mp4"
        );

        // Path traversal
        assert_eq!(
            sanitize_filename("../../../etc/passwd", &rules).unwrap(),
            "passwd"
        );
        assert_eq!(
            sanitize_filename("..\\..\\windows\\system32", &rules).unwrap(),
            "system32"
        );

        // Blocked extensions
        assert!(sanitize_filename("virus.exe", &rules).is_err());
        assert!(sanitize_filename("script.php", &rules).is_err());
        assert!(sanitize_filename("hack.js", &rules).is_err());

        // Hidden files
        assert!(sanitize_filename(".htaccess", &rules).is_err());
    }

    #[test]
    fn test_is_executable_content() {
        // ELF header
        assert!(is_executable_content(&[0x7F, 0x45, 0x4C, 0x46, 0x00]));
        // PE header
        assert!(is_executable_content(&[0x4D, 0x5A, 0x00, 0x00]));
        // Shebang
        assert!(is_executable_content(b"#!/bin/bash"));
        // Regular content
        assert!(!is_executable_content(b"Hello World"));
        assert!(!is_executable_content(&[0x89, 0x50, 0x4E, 0x47])); // PNG
    }

    #[test]
    fn test_verify_magic_bytes() {
        let rules = get_test_rules();
        // JPEG
        assert!(verify_magic_bytes(&[0xFF, 0xD8, 0xFF, 0xE0], "image/jpeg", &rules).is_ok());
        // PNG
        assert!(verify_magic_bytes(&[0x89, 0x50, 0x4E, 0x47], "image/png", &rules).is_ok());
        // PDF
        assert!(verify_magic_bytes(b"%PDF-1.5", "application/pdf", &rules).is_ok());
        // ZIP
        assert!(verify_magic_bytes(&[0x50, 0x4B, 0x03, 0x04], "application/zip", &rules).is_ok());

        // Executable disguised as image
        assert!(verify_magic_bytes(&[0x4D, 0x5A, 0x00, 0x00], "image/jpeg", &rules).is_err());
    }

    #[test]
    fn test_calculate_entropy() {
        // Zero entropy (all same bytes)
        let data = vec![0u8; 100];
        assert_eq!(calculate_entropy(&data), 0.0);

        // Max entropy (random bytes)
        // In a perfect random distribution 0..255, entropy is 8.0
        // We simulate a simple high entropy case
        let data: Vec<u8> = (0..255).collect();
        let entropy = calculate_entropy(&data);
        assert!(entropy > 7.9);
    }

    #[test]
    fn test_inspect_content_security() {
        // Safe text
        assert!(inspect_content_security(b"Hello World", "text/plain").is_ok());

        // XSS Vector 1: Script tag
        let xss = b"<html><script>alert(1)</script></html>";
        assert!(inspect_content_security(xss, "text/html").is_err());

        // XSS Vector 2: Javascript URI
        let xss = b"<a href='javascript:alert(1)'>Click me</a>";
        assert!(inspect_content_security(xss, "text/html").is_err());

        // XSS Vector 3: Onload handler
        let xss = b"<img src=x onerror=alert(1)>";
        assert!(inspect_content_security(xss, "text/html").is_err());

        // High entropy text (simulated encryption)
        // Determine what constitutes strict failure (implementation says > 7.9)
        let mut high_entropy = Vec::new();
        for _ in 0..10 {
            high_entropy.extend(0..255);
        }
        // This should trigger the suspicious entropy error
        assert!(inspect_content_security(&high_entropy, "text/plain").is_err());
    }
}
