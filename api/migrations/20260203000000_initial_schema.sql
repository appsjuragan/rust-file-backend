-- Unified Migration for Rust File Backend
-- Consolidated Version

-- 1. Create Users & Auth
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    oidc_sub TEXT UNIQUE,
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_group_members (
    user_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, group_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. User Architecture
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY NOT NULL,
    theme TEXT NOT NULL DEFAULT 'dark',
    view_style TEXT NOT NULL DEFAULT 'grid',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_file_facts (
    user_id TEXT PRIMARY KEY NOT NULL,
    total_files BIGINT DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    video_count BIGINT DEFAULT 0,
    audio_count BIGINT DEFAULT 0,
    document_count BIGINT DEFAULT 0,
    image_count BIGINT DEFAULT 0,
    others_count BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Storage Layer
CREATE TABLE IF NOT EXISTS storage_files (
    id TEXT PRIMARY KEY NOT NULL,
    hash TEXT UNIQUE NOT NULL,
    s3_key TEXT NOT NULL,
    size BIGINT NOT NULL,
    ref_count INTEGER DEFAULT 1,
    scan_status TEXT DEFAULT 'pending',
    scan_result TEXT,
    scanned_at TIMESTAMPTZ,
    mime_type TEXT,
    content_type TEXT,
    has_thumbnail BOOLEAN NOT NULL DEFAULT FALSE,
    is_encrypted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS file_metadata (
    id TEXT PRIMARY KEY NOT NULL,
    storage_file_id TEXT NOT NULL,
    category TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    FOREIGN KEY (storage_file_id) REFERENCES storage_files(id) ON DELETE CASCADE
);

-- 4. File System Layer
CREATE TABLE IF NOT EXISTS user_files (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    storage_file_id TEXT, 
    parent_id TEXT DEFAULT NULL,
    original_parent_id TEXT, 
    is_folder BOOLEAN DEFAULT FALSE,
    is_system BOOLEAN DEFAULT FALSE, 
    filename TEXT NOT NULL,
    file_signature TEXT, 
    is_favorite BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, 
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (storage_file_id) REFERENCES storage_files(id) ON DELETE SET NULL
);

-- 5. Uploads & Utilities
CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT,
    s3_key TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    chunk_size BIGINT NOT NULL,
    total_size BIGINT NOT NULL,
    total_chunks INT NOT NULL,
    uploaded_chunks INT DEFAULT 0,
    parts JSONB DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS download_archives (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    s3_key TEXT,                          
    status TEXT NOT NULL DEFAULT 'pending', 
    filename TEXT NOT NULL DEFAULT 'archive.zip',
    file_size BIGINT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,       
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. Social & Tagging
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS file_tags (
    user_file_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (user_file_id, tag_id),
    FOREIGN KEY (user_file_id) REFERENCES user_files(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY NOT NULL,
    user_file_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    share_token TEXT UNIQUE NOT NULL,
    share_type TEXT NOT NULL DEFAULT 'public',
    shared_with_user_id TEXT,
    shared_with_group_id TEXT,
    password_hash TEXT,
    permission TEXT NOT NULL DEFAULT 'view',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_file_id) REFERENCES user_files(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (shared_with_group_id) REFERENCES user_groups(id) ON DELETE SET NULL
);

-- 7. Logging & Auditing
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL,
    user_id TEXT,
    resource_id TEXT,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS share_access_logs (
    id TEXT PRIMARY KEY NOT NULL,
    share_link_id TEXT NOT NULL,
    accessed_by_user_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    action TEXT NOT NULL,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (share_link_id) REFERENCES share_links(id) ON DELETE CASCADE,
    FOREIGN KEY (accessed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 8. Validation Data
CREATE TABLE IF NOT EXISTS allowed_mimes (
    id SERIAL PRIMARY KEY,
    mime_type TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS magic_signatures (
    id SERIAL PRIMARY KEY,
    signature BYTEA NOT NULL,
    mime_type TEXT NOT NULL,
    description TEXT,
    UNIQUE (signature, mime_type)
);

CREATE TABLE IF NOT EXISTS blocked_extensions (
    id SERIAL PRIMARY KEY,
    extension TEXT UNIQUE NOT NULL,
    description TEXT
);

-- 9. Tooling & Indices
CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_parent_id ON user_files(parent_id);
CREATE INDEX IF NOT EXISTS idx_user_files_filename ON user_files(filename);
CREATE INDEX IF NOT EXISTS idx_user_files_created_at ON user_files(created_at);
CREATE INDEX IF NOT EXISTS idx_user_files_deleted_at ON user_files(deleted_at);
CREATE INDEX IF NOT EXISTS idx_storage_files_hash_size ON storage_files(hash, size);
CREATE INDEX IF NOT EXISTS idx_file_metadata_category ON file_metadata(category);
CREATE INDEX IF NOT EXISTS idx_file_metadata_storage_file_id ON file_metadata(storage_file_id);
CREATE INDEX IF NOT EXISTS idx_users_oidc_sub ON users(oidc_sub);
CREATE INDEX IF NOT EXISTS idx_user_files_is_favorite ON user_files(is_favorite);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_user_id ON upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_share_links_share_token ON share_links(share_token);
CREATE INDEX IF NOT EXISTS idx_share_links_user_file_id ON share_links(user_file_id);
CREATE INDEX IF NOT EXISTS idx_share_links_created_by ON share_links(created_by);
CREATE INDEX IF NOT EXISTS idx_share_links_expires_at ON share_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_share_access_logs_share_link_id ON share_access_logs(share_link_id);
CREATE INDEX IF NOT EXISTS idx_share_access_logs_accessed_at ON share_access_logs(accessed_at);
CREATE INDEX IF NOT EXISTS idx_download_archives_user_id ON download_archives(user_id);
CREATE INDEX IF NOT EXISTS idx_download_archives_status ON download_archives(status);
CREATE INDEX IF NOT EXISTS idx_download_archives_expires_at ON download_archives(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_groups_name ON user_groups(name);
CREATE INDEX IF NOT EXISTS idx_user_group_members_group_id ON user_group_members(group_id);

-- 10. Initial Data
INSERT INTO allowed_mimes (mime_type, category) VALUES
('application/pdf', 'Documents'),
('application/msword', 'Documents'),
('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Documents'),
('application/vnd.ms-excel', 'Documents'),
('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Documents'),
('application/vnd.ms-powerpoint', 'Documents'),
('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Documents'),
('application/rtf', 'Documents'),
('text/plain', 'Documents'),
('text/csv', 'Documents'),
('image/jpeg', 'Images'),
('image/png', 'Images'),
('image/gif', 'Images'),
('image/webp', 'Images'),
('image/bmp', 'Images'),
('image/tiff', 'Images'),
('image/svg+xml', 'Images'),
('image/heic', 'Images'),
('image/heif', 'Images'),
('audio/mpeg', 'Audio'),
('audio/mp3', 'Audio'),
('audio/wav', 'Audio'),
('audio/ogg', 'Audio'),
('audio/flac', 'Audio'),
('audio/aac', 'Audio'),
('audio/webm', 'Audio'),
('audio/mp4', 'Audio'),
('audio/x-m4a', 'Audio'),
('audio/m4a', 'Audio'),
('video/mp4', 'Video'),
('video/mpeg', 'Video'),
('video/webm', 'Video'),
('video/ogg', 'Video'),
('video/quicktime', 'Video'),
('video/x-msvideo', 'Video'),
('application/zip', 'Archives'),
('application/x-rar-compressed', 'Archives'),
('application/vnd.rar', 'Archives'),
('application/x-7z-compressed', 'Archives'),
('application/gzip', 'Archives'),
('application/x-tar', 'Archives'),
('application/x-bzip2', 'Archives'),
('application/x-zip-compressed', 'Archives'),
('application/x-compress', 'Archives'),
('application/x-compressed', 'Archives'),
('application/x-zip', 'Archives'),
('application/x-rar', 'Archives'),
('application/octet-stream', 'Archives'),
('application/x-gtar', 'Archives'),
('application/x-tgz', 'Archives'),
('application/x-gzip', 'Archives'),
('video/mp2t', 'Video'),
('video/avi', 'Video'),
('video/x-matroska', 'Video'),
('video/x-flv', 'Video'),
('video/ts', 'Video')
ON CONFLICT (mime_type) DO NOTHING;

INSERT INTO magic_signatures (signature, mime_type) VALUES
('\x25504446', 'application/pdf'),
('\xD0CF11E0', 'application/msword'),
('\x504B0304', 'application/zip'),
('\xFFD8FF', 'image/jpeg'),
('\x89504E47', 'image/png'),
('\x47494638', 'image/gif'),
('\x52494646', 'image/webp'),
('\x424D', 'image/bmp'),
('\x494433', 'audio/mpeg'),
('\xFFFB', 'audio/mpeg'),
('\xFFFA', 'audio/mpeg'),
('\x4F676753', 'audio/ogg'),
('\x664C6143', 'audio/flac'),
('\x00000018667479704D3441', 'audio/mp4'),
('\x0000001C667479704D3441', 'audio/mp4'),
('\x00000020667479704D3441', 'audio/mp4'),
('\x0000001C66747970', 'video/mp4'),
('\x0000002066747970', 'video/mp4'),
('\x47', 'video/mp2t'),
('\x1F8B', 'application/gzip'),
('\x52617221', 'application/vnd.rar'),
('\x377ABCAF', 'application/x-7z-compressed')
ON CONFLICT (signature, mime_type) DO NOTHING;

INSERT INTO blocked_extensions (extension) VALUES
('exe'), ('dll'), ('so'), ('dylib'), ('bin'), ('com'), ('bat'), ('cmd'), ('ps1'), ('sh'), ('bash'),
('js'), ('jsx'), ('tsx'), ('py'), ('pyw'), ('rb'), ('php'), ('pl'), ('cgi'), ('asp'), ('aspx'), ('jsp'), ('jspx'),
('cfm'), ('go'), ('rs'), ('java'), ('class'), ('jar'), ('war'), ('c'), ('cpp'), ('h'), ('hpp'), ('cs'), ('vb'), ('vbs'),
('lua'), ('r'), ('swift'), ('kt'), ('scala'), ('groovy'), ('html'), ('htm'), ('xhtml'), ('shtml'), ('svg'), ('xml'), ('xsl'), ('xslt'),
('htaccess'), ('htpasswd'), ('json'), ('yaml'), ('yml'), ('toml'), ('ini'), ('conf'), ('config'),
('iso'), ('img'), ('vmdk'), ('vhd'), ('ova'), ('ovf'),
('docm'), ('xlsm'), ('pptm'), ('dotm'), ('xltm'), ('potm')
ON CONFLICT (extension) DO NOTHING;

-- 11. Maintenance
UPDATE users SET is_admin = TRUE WHERE username = 'admin';
