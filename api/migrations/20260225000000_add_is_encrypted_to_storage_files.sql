-- Add is_encrypted column to storage_files
ALTER TABLE storage_files ADD COLUMN is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
