-- Add image_url to pos_categories for category avatar / icon support
ALTER TABLE pos_categories
  ADD COLUMN IF NOT EXISTS image_url text;
