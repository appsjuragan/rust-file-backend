-- Add cloud_provider_tokens table for pluggable cloud storage
CREATE TABLE IF NOT EXISTS cloud_provider_tokens (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,        -- 'google_drive', 'onedrive', 'mega', etc.
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    provider_email TEXT,              -- User's email on the cloud provider
    connected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, provider_id)      -- One connection per provider per user
);

CREATE INDEX IF NOT EXISTS idx_cloud_tokens_user_id ON cloud_provider_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_cloud_tokens_provider ON cloud_provider_tokens(provider_id);
