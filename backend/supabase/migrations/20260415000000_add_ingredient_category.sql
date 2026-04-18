-- Add category and Arabic name to ingredients
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category text DEFAULT 'uncategorized';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS name_ar text;

-- Index for fast category filtering
CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category);
