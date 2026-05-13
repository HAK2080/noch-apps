-- Add per-category visibility flags
-- show_in_pos     : category + its products appear in the POS terminal food menu
-- show_on_website : category + its products appear in the customer ordering menu

ALTER TABLE pos_categories
  ADD COLUMN IF NOT EXISTS show_in_pos     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_on_website boolean NOT NULL DEFAULT true;

-- Tools category: online store only (not in POS food menu)
UPDATE pos_categories
SET show_in_pos = false
WHERE name ILIKE 'tools' OR name_ar = 'أدوات';
