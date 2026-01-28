Fix Deduplication Deletion Logic
Problem
The current 
delete_item
 endpoint (DELETE /files/:id) does not properly manage reference counting for deduplicated files. When a user deletes a file that has been deduplicated (multiple users uploaded the same file), the ref_count on the storage_files table is not decremented, and the file is never deleted from S3 storage even when the last user deletes their reference.

Current Issues:

delete_item
 handler only deletes the user_files record
No decrement of storage_files.ref_count
No S3 cleanup when ref_count reaches 0
Folder deletion doesn't handle children or their storage references
Expected Behavior:

When a user deletes a file, decrement storage_files.ref_count
When ref_count reaches 0, delete the file from S3 and remove the storage_files record
Folder deletion should recursively delete all children and properly manage ref counts
Proposed Changes
1. Create Storage Lifecycle Service
[NEW] 
src/services/storage_lifecycle.rs
Create a new service to centralize reference counting logic:

pub struct StorageLifecycleService;
impl StorageLifecycleService {
    /// Decrement ref_count for a storage file and delete from S3 if count reaches 0
    /// Returns true if the storage file was deleted
    pub async fn decrement_ref_count(
        db: &DatabaseConnection,
        storage: &StorageService,
        storage_file_id: &str,
    ) -> Result<bool, anyhow::Error>
    
    /// Recursively delete a folder and all its children, managing ref counts
    pub async fn delete_folder_recursive(
        db: &DatabaseConnection,
        storage: &StorageService,
        folder_id: &str,
    ) -> Result<(), anyhow::Error>
}
Key Features:

Transactional safety using db.begin() and txn.commit()
Proper error handling with rollback on failure
Detailed logging for debugging ref count operations
Returns deletion status for verification
2. Update Delete Item Handler
[MODIFY] 
src/handlers/files.rs:625-647
Replace the current 
delete_item
 implementation with proper ref counting:

Changes:

Check if item is a folder → call delete_folder_recursive
For files, call decrement_ref_count after deleting user_files record
Add logging for deletion operations
Return appropriate error messages
Before:

item.delete(&state.db).await.map_err(...)?;
// TODO: Recursive delete for folders?
// Decrement ref count for storage but do NOT delete...
Ok(StatusCode::OK)
After:

if item.is_folder {
    StorageLifecycleService::delete_folder_recursive(&state.db, &state.storage, &item.id).await?;
} else {
    item.delete(&state.db).await?;
    if let Some(storage_file_id) = item.storage_file_id {
        StorageLifecycleService::decrement_ref_count(&state.db, &state.storage, &storage_file_id).await?;
    }
}
Ok(StatusCode::OK)
3. Update Module Exports
[MODIFY] 
src/services/mod.rs
Add the new service module:

pub mod storage_lifecycle;
4. Add Integration Test
[NEW] 
tests/deduplication_deletion_test.rs
Create comprehensive test for deduplication deletion scenarios:

Test Cases:

Single file deletion - ref_count = 1, verify S3 cleanup
Deduplicated file partial deletion - ref_count = 2 → 1, verify S3 NOT deleted
Deduplicated file final deletion - ref_count = 1 → 0, verify S3 cleanup
Folder deletion with files - verify recursive deletion and ref counting
Verification Plan
Automated Tests
1. Run Existing Tests
Ensure no regressions in current functionality:

cargo test
2. Run New Deduplication Deletion Test
cargo test --test deduplication_deletion_test -- --nocapture
Expected Output:

All test cases pass
Logs show ref_count decrements
S3 cleanup occurs when ref_count = 0
S3 files remain when ref_count > 0
3. Run Upload Test (Deduplication Verification)
cargo test --test upload_test test_upload_flow -- --nocapture
Verify:

Deduplication still works (ref_count = 2 after duplicate upload)
No regressions in upload flow
Manual Testing with Postman
IMPORTANT

These manual tests use the Postman collection at 
postman_collection.json

Test Scenario 1: Single File Deletion
Register → Run "Register" request
Login → Run "Login" request (token auto-saved)
Upload File → Run "Upload File" with a test file
Save the file_id from response
Verify Upload → Run "List Files" to see the file
Delete File → Run "Delete Item" with the file_id
Expected: 200 OK
Verify Deletion → Run "List Files"
Expected: File not in list
Check Database → Verify storage_files table is empty
Check S3 → Verify file deleted from MinIO
Test Scenario 2: Deduplicated File Deletion
Login → Use existing user
Upload File #1 → Upload test.txt with content "Hello World"
Save file_id_1
Upload File #2 → Upload same test.txt again
Save file_id_2
Verify Deduplication → Check database
Expected: 2 user_files records, 1 storage_files record with ref_count = 2
Delete First File → DELETE /files/{file_id_1}
Expected: 200 OK
Check Database → Verify storage_files.ref_count = 1
Check S3 → Verify file STILL EXISTS in MinIO
Delete Second File → DELETE /files/{file_id_2}
Expected: 200 OK
Check Database → Verify storage_files table is empty
Check S3 → Verify file DELETED from MinIO
Test Scenario 3: Folder Deletion
Create Folder → Run "Create Folder" request
Save folder_id
Upload File to Folder → Upload file with parent_id = folder_id
Save file_id
Delete Folder → DELETE /files/{folder_id}
Expected: 200 OK
Verify Cascade → Run "List Files"
Expected: Both folder and file are deleted
Check Database → Verify ref_count decremented properly
User Review Required
WARNING

Breaking Change Consideration The folder deletion will now recursively delete all children. If the frontend expects a different behavior (e.g., move children to root), we need to adjust the implementation.

Questions for User:

Should folder deletion recursively delete all children, or should it fail if folder is not empty?
Do you want a "soft delete" feature (mark as deleted but keep in DB) or hard delete?
Should we add a bulk delete endpoint for efficiency?
Implementation Order
✅ Create storage_lifecycle.rs service
✅ Update 
delete_item
 handler
✅ Update module exports
✅ Write integration test
✅ Run automated tests
✅ Manual Postman testing
✅ Update documentation if needed