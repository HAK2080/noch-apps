-- Add 'text' as a valid menu_display_style (2026-05-29).
-- Text-only list: product name + price, no images, collapsible after 4 items.

alter table pos_categories
  drop constraint if exists pos_categories_menu_display_style_check;

alter table pos_categories
  add constraint pos_categories_menu_display_style_check
  check (menu_display_style in ('scroll', 'list', 'grid', 'addons', 'text'));
