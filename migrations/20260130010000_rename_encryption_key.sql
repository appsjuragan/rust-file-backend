-- Rename encryption_key to file_signature for obfuscation
ALTER TABLE user_files RENAME COLUMN encryption_key TO file_signature;
