-- Up
ALTER TABLE storage_files ADD COLUMN has_thumbnail BOOLEAN NOT NULL DEFAULT false;

-- Down
ALTER TABLE storage_files DROP COLUMN has_thumbnail;
