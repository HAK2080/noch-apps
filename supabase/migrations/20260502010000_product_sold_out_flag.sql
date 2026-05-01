-- Sold-out flag for menu items.
-- When false, the item still renders on the customer menu but appears
-- shaded with a "Sold out" badge and the +/add control is hidden.
-- Default true so existing products remain available.

alter table public.pos_products
  add column if not exists is_available boolean not null default true;

create index if not exists pos_products_is_available_idx
  on public.pos_products(is_available);
