-- Add is_favorite column to user_files
ALTER TABLE user_files ADD COLUMN is_favorite BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_user_files_is_favorite ON user_files(is_favorite) WHERE is_favorite = TRUE;
