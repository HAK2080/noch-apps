-- Add default_category_id so the POS terminal opens on a chosen
-- category instead of hard-coded "matcha".
alter table pos_settings
  add column if not exists default_category_id uuid
    references pos_categories(id) on delete set null;
