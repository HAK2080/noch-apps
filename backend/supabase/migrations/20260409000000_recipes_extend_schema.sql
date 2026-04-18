-- Add missing columns to recipes table
-- Run this once in Supabase SQL Editor → https://supabase.com/dashboard/project/kxqjasdvoohiexedtfqw/sql

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS name_ar        text,
  ADD COLUMN IF NOT EXISTS description_ar text,
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS notes_ar       text,
  ADD COLUMN IF NOT EXISTS glass_type     text,
  ADD COLUMN IF NOT EXISTS glass_type_ar  text,
  ADD COLUMN IF NOT EXISTS yield_ml       integer,
  ADD COLUMN IF NOT EXISTS layers         jsonb DEFAULT '[]'::jsonb;

SELECT 'Done: ' || column_name AS status
FROM information_schema.columns
WHERE table_name = 'recipes'
  AND column_name IN ('layers','name_ar','notes','glass_type','yield_ml')
ORDER BY column_name;
