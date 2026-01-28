Deduplication Deletion Fix - Implementation Walkthrough
Overview
Successfully implemented proper reference counting and deletion logic for deduplicated files. The system now supports:

Soft delete in database - Files are marked as deleted (deleted_at timestamp) for historical tracking
Hard delete in S3 - Physical files are deleted from S3 when the last user deletes their reference (
ref_count
 reaches 0)
Recursive folder deletion - Folders and all children are properly deleted with ref counting
Bulk delete endpoint - Efficient batch deletion of multiple files/folders
Changes Made
1. New Service: StorageLifecycleService
[NEW] 
storage_lifecycle.rs
Created a centralized service for managing storage file lifecycle and reference counting:

Key Functions:

decrement_ref_count()
 - Decrements ref_count and deletes from S3 when count reaches 0
delete_folder_recursive()
 - Recursively deletes folders and children (uses #[async_recursion])
soft_delete_user_file()
 - Sets deleted_at timestamp and decrements ref_count
bulk_delete()
 - Batch deletion of multiple items
Features:

Transactional safety using db.begin() and txn.commit()
Comprehensive logging for debugging
Returns deletion status for verification
2. Database Schema Updates
[MODIFY] 
user_files.rs
Added deleted_at column for soft delete:

pub deleted_at: Option<DateTimeUtc>,
[MODIFY] 
main.rs
Added database migration:

"ALTER TABLE user_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL",
"CREATE INDEX IF NOT EXISTS idx_user_files_deleted_at ON user_files(deleted_at)",
3. Updated Delete Handler
[MODIFY] 
files.rs:delete_item
Before:

Only deleted user_files record
No ref_count management
No folder recursion
After:

Filters out already deleted items (deleted_at IS NULL)
Recursive folder deletion for folders
Soft delete + ref_count decrement for files
S3 cleanup when 
ref_count
 reaches 0
4. New Bulk Delete Endpoint
[NEW] 
files.rs:bulk_delete
Endpoint: POST /files/bulk-delete

Request:

{
  "item_ids": ["file-id-1", "file-id-2", "folder-id-1"]
}
Response:

{
  "deleted_count": 3
}
Features:

Validates ownership for all items
Handles both files and folders
Returns count of successfully deleted items
5. Updated List Files Filter
[MODIFY] 
files.rs:list_files
Added filter to exclude soft-deleted items:

.add(user_files::Column::DeletedAt.is_null())
Impact: Deleted files no longer appear in file listings

6. Router and API Documentation
[MODIFY] 
lib.rs
Added:

bulk_delete
 to OpenAPI paths
BulkDeleteRequest
 and 
BulkDeleteResponse
 to schemas
Route: POST /files/bulk-delete
7. Dependencies
[MODIFY] 
Cargo.toml
Added:

async-recursion = "1.0"
Purpose: Enables recursive async functions without manual boxing

How It Works
Deduplication Flow
Upload #1 - User A uploads test.txt

Creates storage_files record with ref_count = 1
Creates user_files record pointing to storage file
Upload #2 - User B uploads same test.txt

Finds existing storage_files by hash
Increments 
ref_count
 to 2
Creates new user_files record (different ID, same storage_file_id)
Deletion Flow
Delete #1 - User A deletes their file

Sets user_files.deleted_at = NOW()
Decrements storage_files.ref_count to 1
S3 file remains (ref_count > 0)
Delete #2 - User B deletes their file

Sets user_files.deleted_at = NOW()
Decrements storage_files.ref_count to 0
S3 file deleted (ref_count = 0)
Deletes storage_files record
Testing Instructions
Manual Testing with Postman
IMPORTANT

Use the Postman collection at 
postman_collection.json

Test 1: Single File Deletion
Login → Run "Login" request
Upload → Run "Upload File" with test.txt
Save file_id
Delete → Run "Delete Item" with file_id
Verify DB → Check user_files.deleted_at IS NOT NULL
Verify S3 → File should be deleted from MinIO
Test 2: Deduplicated File Deletion
Upload #1 → Upload test.txt (content: "Hello World")
Save file_id_1
Upload #2 → Upload same test.txt again
Save file_id_2
Check DB → Verify storage_files.ref_count = 2
Delete #1 → DELETE /files/{file_id_1}
Check DB → Verify storage_files.ref_count = 1
Check S3 → File should still exist in MinIO
Delete #2 → DELETE /files/{file_id_2}
Check DB → Verify storage_files record deleted
Check S3 → File should be deleted from MinIO
Test 3: Folder Deletion
Create Folder → Run "Create Folder"
Save folder_id
Upload to Folder → Upload file with parent_id = folder_id
Delete Folder → DELETE /files/{folder_id}
Verify → Both folder and file should have deleted_at set
Check ref_count → Should be decremented properly
Test 4: Bulk Delete
Upload 3 files → Get file_id_1, file_id_2, file_id_3
Bulk Delete → POST /files/bulk-delete
{
  "item_ids": ["file_id_1", "file_id_2", "file_id_3"]
}
Verify Response → deleted_count: 3
Check DB → All files should have deleted_at set
Verification Checklist
Database Checks
-- Check soft delete
SELECT id, filename, deleted_at FROM user_files WHERE deleted_at IS NOT NULL;
-- Check ref_count
SELECT id, hash, ref_count FROM storage_files;
-- Check orphaned storage files (should be 0)
SELECT * FROM storage_files WHERE ref_count <= 0;
S3 Checks
Access MinIO console at http://127.0.0.1:9000 and verify:

Files with ref_count > 0 exist in bucket
Files with ref_count = 0 are deleted
API Checks
GET /files should NOT return deleted items
DELETE /files/{id} on already deleted item returns 404
POST /files/bulk-delete with empty array returns 400
Logging Output
When deleting files, you should see logs like:

INFO  Soft deleting user_file: abc-123
INFO  Decrementing ref_count for storage_file xyz-789 from 2 to 1
DEBUG ref_count is 1, keeping storage_file xyz-789 in S3
INFO  Soft deleting user_file: def-456
INFO  Decrementing ref_count for storage_file xyz-789 from 1 to 0
INFO  ref_count reached 0, deleting from S3: abc123.../test.txt
INFO  Successfully deleted storage_file xyz-789 from S3 and DB
Build Status
✅ Build successful with no errors

Warnings:

None (unused import fixed)
Dependencies added:

async-recursion = "1.0"
Next Steps
Run the server → cargo run
Test with Postman → Follow test scenarios above
Monitor logs → Check ref_count operations
Verify S3 cleanup → Confirm files deleted when ref_count = 0
API Documentation
Updated Swagger UI available at: http://127.0.0.1:3000/swagger-ui

New endpoints:

POST /files/bulk-delete - Bulk delete files/folders
Updated endpoints:

DELETE /files/{id} - Now performs soft delete + ref counting
GET /files - Filters out deleted items