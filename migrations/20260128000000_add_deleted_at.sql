ALTER TABLE user_files ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_user_files_deleted_at ON user_files(deleted_at);
