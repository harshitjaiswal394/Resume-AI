-- Migration: Add missing scores and experience columns
-- These columns are required by the AI Resume Builder's persistence logic.

ALTER TABLE resumes ADD COLUMN IF NOT EXISTS original_score FLOAT DEFAULT 0.0;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS resume_score FLOAT DEFAULT 0.0;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS years_of_experience INTEGER DEFAULT 0;

-- Update any null values to defaults
UPDATE resumes SET original_score = 0.0 WHERE original_score IS NULL;
UPDATE resumes SET resume_score = 0.0 WHERE resume_score IS NULL;
UPDATE resumes SET years_of_experience = 0 WHERE years_of_experience IS NULL;
