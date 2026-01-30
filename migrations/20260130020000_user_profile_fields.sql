-- Add profile fields to users table
ALTER TABLE users ADD COLUMN name VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL;
