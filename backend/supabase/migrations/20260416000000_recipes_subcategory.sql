-- Add subcategory column to recipes (was in form but missing from schema)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS subcategory text;
NOTIFY pgrst, 'reload schema';
