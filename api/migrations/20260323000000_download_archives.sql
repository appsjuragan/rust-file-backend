-- Download Archives Table
-- Tracks temporary ZIP archives created for bulk/folder downloads

CREATE TABLE IF NOT EXISTS download_archives (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    s3_key TEXT,                          -- populated after upload completes
    status TEXT NOT NULL DEFAULT 'pending', -- pending | generating | ready | failed
    filename TEXT NOT NULL DEFAULT 'archive.zip',
    file_size BIGINT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,       -- auto-deleted after this time
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_download_archives_user_id ON download_archives(user_id);
CREATE INDEX IF NOT EXISTS idx_download_archives_status ON download_archives(status);
CREATE INDEX IF NOT EXISTS idx_download_archives_expires_at ON download_archives(expires_at);
