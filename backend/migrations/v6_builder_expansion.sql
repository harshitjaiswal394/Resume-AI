-- Migration: Expand Builder Sections
-- Adds support for Phone Number, Certifications, Languages, Achievements, Internships and Section Ordering.

ALTER TABLE resumes ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'::jsonb;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS languages JSONB DEFAULT '[]'::jsonb;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '[]'::jsonb;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS internships JSONB DEFAULT '[]'::jsonb;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS section_order TEXT[] DEFAULT '{ "summary", "skills", "experience", "education", "projects", "certifications", "languages", "achievements", "internships" }';

-- Note: Ensure any existing rows get these defaults if they are NULL
UPDATE resumes SET certifications = '[]'::jsonb WHERE certifications IS NULL;
UPDATE resumes SET languages = '[]'::jsonb WHERE languages IS NULL;
UPDATE resumes SET achievements = '[]'::jsonb WHERE achievements IS NULL;
UPDATE resumes SET internships = '[]'::jsonb WHERE internships IS NULL;
UPDATE resumes SET section_order = '{ "summary", "skills", "experience", "education", "projects", "certifications", "languages", "achievements", "internships" }' WHERE section_order IS NULL;
