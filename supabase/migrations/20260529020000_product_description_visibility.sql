-- Product description fields + per-surface visibility flags (2026-05-29).
--
-- menu_description / menu_description_ar already existed in the product
-- editor UI but the columns were never created in the DB — entries were
-- silently dropped. This migration adds them.
--
-- Two visibility flags control where the description is shown:
--   show_description_on_menu    → customer ordering page (apps.noch.cloud/menu/:id)
--   show_description_on_website → storefront menu page (noch.cloud/menu)
--
-- Both default to TRUE so existing products that already have descriptions
-- entered will show them immediately without any extra action.

alter table pos_products
  add column if not exists menu_description       text,
  add column if not exists menu_description_ar    text,
  add column if not exists show_description_on_menu     boolean default true,
  add column if not exists show_description_on_website  boolean default true;
