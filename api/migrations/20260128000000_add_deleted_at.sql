ALTER TABLE user_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_user_files_deleted_at ON user_files(deleted_at);
