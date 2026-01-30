use anyhow::{Result, anyhow};
use std::path::Path;

/// Maximum file size: 256 MB
pub const MAX_FILE_SIZE: usize = 256 * 1024 * 1024; // 256 MB

/// Allowed MIME types: Documents, Media, Archives (no code)
pub const ALLOWED_MIME_TYPES: &[&str] = &[
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/rtf",
    "text/plain",
    "text/csv",
    // Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "image/svg+xml",
    // Audio
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/flac",
    "audio/aac",
    "audio/webm",
    // Video
    "video/mp4",
    "video/mpeg",
    "video/webm",
    "video/ogg",
    "video/quicktime",
    "video/x-msvideo",
    // Archives
    "application/zip",
    "application/x-rar-compressed",
    "application/vnd.rar",
    "application/x-7z-compressed",
    "application/gzip",
    "application/x-tar",
    "application/x-bzip2",
    "application/x-zip-compressed",
    "application/x-compress",
    "application/x-compressed",
    "application/x-zip",
    "application/x-rar",
    "application/octet-stream",
    "application/x-gtar",
    "application/x-tgz",
    "application/x-gzip",
    "video/mp2t",
];

/// Magic byte signatures for file type verification
const MAGIC_SIGNATURES: &[(&[u8], &str)] = &[
    // Documents
    (&[0x25, 0x50, 0x44, 0x46], "application/pdf"), // %PDF
    (&[0xD0, 0xCF, 0x11, 0xE0], "application/msword"), // OLE (doc, xls, ppt)
    (&[0x50, 0x4B, 0x03, 0x04], "application/zip"), // ZIP (also docx, xlsx, pptx)
    // Images
    (&[0xFF, 0xD8, 0xFF], "image/jpeg"),       // JPEG
    (&[0x89, 0x50, 0x4E, 0x47], "image/png"),  // PNG
    (&[0x47, 0x49, 0x46, 0x38], "image/gif"),  // GIF
    (&[0x52, 0x49, 0x46, 0x46], "image/webp"), // WEBP (RIFF)
    (&[0x42, 0x4D], "image/bmp"),              // BMP
    // Audio
    (&[0x49, 0x44, 0x33], "audio/mpeg"),       // MP3 with ID3
    (&[0xFF, 0xFB], "audio/mpeg"),             // MP3 without ID3
    (&[0xFF, 0xFA], "audio/mpeg"),             // MP3 variant
    (&[0x4F, 0x67, 0x67, 0x53], "audio/ogg"),  // OGG
    (&[0x66, 0x4C, 0x61, 0x43], "audio/flac"), // FLAC
    // Video
    (
        &[0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70],
        "video/mp4",
    ), // MP4 ftyp
    (
        &[0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
        "video/mp4",
    ), // MP4 variant
    (&[0x47], "video/mp2t"), // MPEG-TS (Sync byte)
    // Archives
    (&[0x1F, 0x8B], "application/gzip"),                // GZIP
    (&[0x52, 0x61, 0x72, 0x21], "application/vnd.rar"), // RAR
    (&[0x37, 0x7A, 0xBC, 0xAF], "application/x-7z-compressed"), // 7z
];

/// Dangerous file extensions that should never be allowed
const BLOCKED_EXTENSIONS: &[&str] = &[
    // Executables
    "exe", "dll", "so", "dylib", "bin", "com", "bat", "cmd", "ps1", "sh", "bash",
    // Scripts/Code
    "js", "ts", "jsx", "tsx", "py", "pyw", "rb", "php", "pl", "cgi", "asp", "aspx", "jsp", "jspx",
    "cfm", "go", "rs", "java", "class", "jar", "war", "c", "cpp", "h", "hpp", "cs", "vb", "vbs",
    "lua", "r", "swift", "kt", "scala", "groovy", // Web
    "html", "htm", "xhtml", "shtml", "svg", "xml", "xsl", "xslt",
    // Config/Data that could be dangerous
    "htaccess", "htpasswd", "json", "yaml", "yml", "toml", "ini", "conf", "config",
    // Container/VM
    "iso", "img", "vmdk", "vhd", "ova", "ovf", // Macro-enabled documents
    "docm", "xlsm", "pptm", "dotm", "xltm", "potm",
];

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
pub fn validate_mime_type(content_type: &str) -> Result<()> {
    let normalized = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();

    if ALLOWED_MIME_TYPES
        .iter()
        .any(|&allowed| allowed == normalized)
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
pub fn sanitize_filename(filename: &str) -> Result<String> {
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
        if BLOCKED_EXTENSIONS.contains(&ext_lower.as_str()) {
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
pub fn verify_magic_bytes(header: &[u8], claimed_mime: &str) -> Result<()> {
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
    for (signature, mime_type) in MAGIC_SIGNATURES {
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
) -> Result<String> {
    // 1. Size check
    validate_file_size(size, max_size)?;

    // 2. Sanitize filename (also checks extension)
    let sanitized_filename = sanitize_filename(filename)?;

    // 3. MIME type check
    let mime = content_type.unwrap_or("application/octet-stream");
    validate_mime_type(mime)?;

    // 4. Magic bytes verification
    verify_magic_bytes(header, mime)?;

    Ok(sanitized_filename)
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

    #[test]
    fn test_validate_mime_type() {
        assert!(validate_mime_type("image/jpeg").is_ok());
        assert!(validate_mime_type("application/pdf").is_ok());
        assert!(validate_mime_type("application/zip").is_ok());
        assert!(validate_mime_type("video/mp4").is_ok());

        // Should reject code files
        assert!(validate_mime_type("application/javascript").is_err());
        assert!(validate_mime_type("text/html").is_err());
        assert!(validate_mime_type("application/x-python").is_err());
    }

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("test.pdf").unwrap(), "test.pdf");
        assert_eq!(sanitize_filename("my file.doc").unwrap(), "my file.doc");
        assert_eq!(
            sanitize_filename("test<script>.pdf").unwrap(),
            "test_script_.pdf"
        );
        assert_eq!(sanitize_filename("测试.txt").unwrap(), "测试.txt");
        assert_eq!(sanitize_filename("日本語.mp4").unwrap(), "日本語.mp4");

        // Path traversal
        assert_eq!(sanitize_filename("../../../etc/passwd").unwrap(), "passwd");
        assert_eq!(
            sanitize_filename("..\\..\\windows\\system32").unwrap(),
            "system32"
        );

        // Blocked extensions
        assert!(sanitize_filename("virus.exe").is_err());
        assert!(sanitize_filename("script.php").is_err());
        assert!(sanitize_filename("hack.js").is_err());

        // Hidden files
        assert!(sanitize_filename(".htaccess").is_err());
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
        // JPEG
        assert!(verify_magic_bytes(&[0xFF, 0xD8, 0xFF, 0xE0], "image/jpeg").is_ok());
        // PNG
        assert!(verify_magic_bytes(&[0x89, 0x50, 0x4E, 0x47], "image/png").is_ok());
        // PDF
        assert!(verify_magic_bytes(b"%PDF-1.5", "application/pdf").is_ok());
        // ZIP
        assert!(verify_magic_bytes(&[0x50, 0x4B, 0x03, 0x04], "application/zip").is_ok());

        // Executable disguised as image
        assert!(verify_magic_bytes(&[0x4D, 0x5A, 0x00, 0x00], "image/jpeg").is_err());
    }
}
