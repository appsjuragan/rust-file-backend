-- Share Links
CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY NOT NULL,
    user_file_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    share_token TEXT UNIQUE NOT NULL,
    share_type TEXT NOT NULL DEFAULT 'public',
    shared_with_user_id TEXT,
    password_hash TEXT,
    permission TEXT NOT NULL DEFAULT 'view',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_file_id) REFERENCES user_files(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Share Access Logs
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_share_links_share_token ON share_links(share_token);
CREATE INDEX IF NOT EXISTS idx_share_links_user_file_id ON share_links(user_file_id);
CREATE INDEX IF NOT EXISTS idx_share_links_created_by ON share_links(created_by);
CREATE INDEX IF NOT EXISTS idx_share_links_expires_at ON share_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_share_access_logs_share_link_id ON share_access_logs(share_link_id);
CREATE INDEX IF NOT EXISTS idx_share_access_logs_accessed_at ON share_access_logs(accessed_at);
