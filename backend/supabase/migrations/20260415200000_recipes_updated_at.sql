-- Add updated_at column to recipes table if it doesn't exist
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
