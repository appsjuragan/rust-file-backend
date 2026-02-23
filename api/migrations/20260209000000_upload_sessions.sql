CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY NOT NULL, -- SQLite compatibility: UUIDs as TEXT
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT,
    s3_key TEXT NOT NULL, -- The S3 Object Key
    upload_id TEXT NOT NULL, -- S3 Upload ID
    chunk_size BIGINT NOT NULL,
    total_size BIGINT NOT NULL,
    total_chunks INT NOT NULL,
    uploaded_chunks INT DEFAULT 0,
    parts TEXT DEFAULT '[]', -- SQLite compatibility: JSON as TEXT
    status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_upload_sessions_user_id ON upload_sessions(user_id);
CREATE INDEX idx_upload_sessions_status ON upload_sessions(status);
