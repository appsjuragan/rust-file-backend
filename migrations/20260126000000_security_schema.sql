-- Security updates
ALTER TABLE storage_files ADD COLUMN scan_status TEXT DEFAULT 'pending';
ALTER TABLE storage_files ADD COLUMN scan_result TEXT;
ALTER TABLE storage_files ADD COLUMN scanned_at DATETIME;
ALTER TABLE storage_files ADD COLUMN mime_type TEXT;
ALTER TABLE storage_files ADD COLUMN content_type TEXT;

CREATE INDEX IF NOT EXISTS idx_storage_files_hash_size ON storage_files(hash, size);
