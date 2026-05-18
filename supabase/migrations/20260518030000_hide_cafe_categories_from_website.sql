-- Cafe drink/food categories are for the in-cafe menu only, not the online store.
-- Only Tools (retail) should appear on the website.
UPDATE pos_categories
SET show_on_website = false
WHERE name IN (
  'Hot Coffee',
  'Iced Coffee',
  'Iced Tea',
  'Matcha',
  'Tea',
  'Food',
  'Pastry & Cakes',
  'Nochi''s Favorites'
);

-- Confirm Tools stays visible (already true, but be explicit)
UPDATE pos_categories
SET show_on_website = true
WHERE name = 'Tools';
