# Fresh Start Cleanup Instructions

The backend is updated to run in **Plaintext Mode** (no encryption).
To ensure the system works correctly, you must clear old encrypted data.

## 1. Database Cleanup
Truncate the following tables to remove all file references and user keys:

```sql
-- Postgres / SQL
TRUNCATE TABLE user_files CASCADE;
TRUNCATE TABLE storage_files CASCADE;
TRUNCATE TABLE file_metadata CASCADE;
TRUNCATE TABLE file_tags CASCADE;
-- TRUNCATE TABLE users CASCADE; -- Optional: if you want to remove users too
```

## 2. S3 Cleanup
Empty your S3 bucket (e.g., `uploads`). 
All files currently in S3 are encrypted and will be unreadable by the new code.

```bash
# Example with AWS CLI or MinIO Client (mc)
mc rm --recursive --force minio/uploads/
```

## 3. Verify
1. Restart the backend (already running).
2. Create a new account or login.
3. Upload a file.
4. Check MinIO console: the file should be plaintext (readable).
5. Download the file: it should work.
