-- Backfill: mark all currently active products as visible on website.
-- The visible_on_website column already existed with DEFAULT false (predates today).
-- The ADD COLUMN IF NOT EXISTS migration (20260513040000) was a no-op on the default.
-- This fixes all existing products so they appear on the customer ordering menu.
UPDATE pos_products
SET visible_on_website = true
WHERE is_active = true AND visible_on_website = false;

-- Also fix inactive products so they show correctly if re-activated
UPDATE pos_products
SET visible_on_website = true
WHERE visible_on_website = false;

-- Ensure future new products default to true
ALTER TABLE pos_products
  ALTER COLUMN visible_on_website SET DEFAULT true;
