Task: Fix Deduplication Deletion Logic
Problem Statement
Deduplicated files cannot be deleted from S3 storage until the last user deletes their reference. Currently, the 
delete_item
 endpoint doesn't properly manage the 
ref_count
 on storage_files, leading to orphaned files in S3.

Checklist
Analysis
 Review current deletion logic in 
delete_item
 handler
 Review current upload deduplication logic
 Review storage_files entity structure
 Review Postman collection endpoints
 Identify the gap in reference counting
 User decisions: Recursive folder deletion, soft delete in DB, hard delete in S3, bulk delete endpoint
Implementation
 Add deleted_at column to user_files for soft delete
 Create 
StorageLifecycleService
 for centralized ref counting
 Implement 
decrement_ref_count
 with transactional safety (hard delete S3 when ref_count=0)
 Update 
delete_item
 to soft delete in DB and decrement ref counts
 Add recursive folder deletion with ref counting
 Implement bulk delete endpoint
 Add logging for ref count operations
 Update router and OpenAPI documentation
 Add database migration for deleted_at column
 Fix compilation errors and build successfully
Testing
 Test single file deletion (ref_count = 1, S3 deleted)
 Test deduplicated file deletion (ref_count > 1, S3 kept)
 Test final deletion (ref_count becomes 0, S3 cleanup)
 Test folder deletion with files (recursive)
 Test bulk delete endpoint
 Verify soft delete in DB (deleted_at set)
 Verify S3 cleanup occurs correctly
Documentation
 Update API documentation
 Add comments explaining ref counting logic
 Create comprehensive walkthrough