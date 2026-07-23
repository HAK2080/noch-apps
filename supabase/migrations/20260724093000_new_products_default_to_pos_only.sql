-- New products start on the staff POS only. Existing products are unchanged.
alter table public.pos_products
  alter column visible_on_menu set default true,
  alter column visible_on_customer_menu set default false,
  alter column visible_on_website set default false;
