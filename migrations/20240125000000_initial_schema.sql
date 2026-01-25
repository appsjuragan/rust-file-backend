CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS storage_files (
    id TEXT PRIMARY KEY NOT NULL,
    hash TEXT UNIQUE NOT NULL,
    s3_key TEXT NOT NULL,
    size INTEGER NOT NULL,
    ref_count INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_files (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    storage_file_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (storage_file_id) REFERENCES storage_files(id)
);
