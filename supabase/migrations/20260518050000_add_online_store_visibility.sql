-- Three independent visibility channels for pos_categories:
--   show_in_pos          → POS staff terminal (in-store)
--   show_on_website      → Customer cafe menu (noch.cloud/menu)
--   show_in_online_store → Online retail store (noch.cloud/#shop)
-- A category can be in any combination; an item could be cafe-only,
-- retail-only, or both.

ALTER TABLE pos_categories
  ADD COLUMN IF NOT EXISTS show_in_online_store boolean NOT NULL DEFAULT false;

-- Tools is the only existing retail category — flag it for the online store
UPDATE pos_categories
SET show_in_online_store = true
WHERE name = 'Tools';
