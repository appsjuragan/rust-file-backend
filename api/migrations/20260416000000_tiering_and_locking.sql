-- Migration: Tiering and Locking
-- 1. Add tier to users
ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';

-- 2. Add fields to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS lock_passphrase TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS trash_cleanup_days INTEGER NOT NULL DEFAULT 30;

-- 3. Add is_locked to user_files
ALTER TABLE user_files ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Seed system settings for tiering if they don't exist
INSERT INTO system_settings (key, value, description) VALUES
('quota_free', '5368709120', 'Default drive size for free tier (5GB)'),
('quota_basic', '21474836480', 'Drive size for basic tier (20GB)'),
('quota_pro', '107374182400', 'Drive size for pro tier (100GB)'),
('bandwidth_free', '5000000', 'Bandwidth limit for free tier (5mbps)'),
('bandwidth_basic', '5000000', 'Bandwidth limit for basic tier (5mbps)'),
('bandwidth_pro', '10000000', 'Bandwidth limit for pro tier (10mbps)')
ON CONFLICT (key) DO NOTHING;
