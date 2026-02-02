-- PostgreSQL compatible schema
-- This migration works for both SQLite and PostgreSQL

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS storage_files (
    id TEXT PRIMARY KEY NOT NULL,
    hash TEXT UNIQUE NOT NULL,
    s3_key TEXT NOT NULL,
    size BIGINT NOT NULL,
    ref_count INTEGER DEFAULT 1,
    scan_status TEXT DEFAULT 'pending',
    scan_result TEXT,
    scanned_at TIMESTAMP,
    mime_type TEXT,
    content_type TEXT
);

CREATE TABLE IF NOT EXISTS user_files (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    storage_file_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (storage_file_id) REFERENCES storage_files(id)
);

CREATE INDEX IF NOT EXISTS idx_storage_files_hash_size ON storage_files(hash, size);
CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_expires_at ON user_files(expires_at);
