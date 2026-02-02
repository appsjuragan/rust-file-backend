DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_files' AND column_name = 'encryption_key') THEN
        ALTER TABLE user_files RENAME COLUMN encryption_key TO file_signature;
    END IF;
END $$;
