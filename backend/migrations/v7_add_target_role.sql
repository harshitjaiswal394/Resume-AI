-- Migration: Add Target Role column
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS target_role TEXT;
