-- Add per-category display style for the customer menu (2026-05-23).
-- Controls how each category section is rendered on apps.noch.cloud/menu/:id
--
-- Values:
--   scroll  — horizontal scroll cards with big images (default, like "Signature Drinks")
--   list    — compact rows: small circular image + name + price (like "Tea")
--   grid    — 2-column image grid (like "Pancakes & Desserts")
--   addons  — small icon strip at the bottom (like "Add-ons")
--
-- Managed per-category via POS admin → Products → Categories → edit.

alter table pos_categories
  add column if not exists menu_display_style text default 'scroll'
    check (menu_display_style in ('scroll', 'list', 'grid', 'addons'));
