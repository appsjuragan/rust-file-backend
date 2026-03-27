-- Add original_parent_id for restoration
ALTER TABLE user_files ADD COLUMN original_parent_id VARCHAR(255);
ALTER TABLE user_files ADD COLUMN is_system BOOLEAN DEFAULT FALSE;

-- Create constraint to prevent deleting system folders (we'll also handle this in code for better error messages)
-- But a check constraint doesn't easily prevent deletion, it prevents invalid state.
-- We'll handle protection in the application logic.
