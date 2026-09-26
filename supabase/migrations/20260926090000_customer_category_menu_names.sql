-- Customer-facing category labels can differ from staff/POS category names.
alter table public.pos_categories
  add column if not exists customer_menu_name text,
  add column if not exists customer_menu_name_ar text;

update public.pos_categories
set customer_menu_name = 'Fresh pastries, sweets & sandwiches',
    customer_menu_name_ar = 'مخبوزات فرش'
where id = 'd9b8a7e0-b244-4178-8127-4c59e4391fbf'
  and name = 'Pastry & Cakes';
