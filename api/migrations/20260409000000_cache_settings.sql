-- Migration: Cache Settings
-- Adds admin-configurable browser cache TTL settings
-- Global default + per-group overrides

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Per-group cache TTL overrides
CREATE TABLE IF NOT EXISTS group_cache_settings (
    group_id TEXT PRIMARY KEY NOT NULL,
    cache_ttl_seconds INTEGER NOT NULL DEFAULT 3600,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,
    FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Seed default global cache TTL (1 hour = 3600 seconds)
INSERT INTO system_settings (key, value, description)
VALUES ('default_cache_ttl_seconds', '3600', 'Default browser cache TTL in seconds for thumbnails and file previews')
ON CONFLICT (key) DO NOTHING;
