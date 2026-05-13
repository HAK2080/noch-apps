-- Add per-product website visibility flag, independent of visible_on_menu (POS screen flag).
-- Default true so all existing products appear on the website immediately.
-- Admin can toggle per-product in the Products admin UI.
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS visible_on_website boolean NOT NULL DEFAULT true;
