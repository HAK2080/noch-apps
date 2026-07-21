-- Coffee drinks consume Ghadamis roasted beans from branch location stock.
-- Quantities are stored in grams. Central/branch movement uses the existing
-- product-transfer model introduced by 20260719180000.

alter table public.pos_products
  add column if not exists coffee_bean_product_id uuid references public.pos_products(id) on delete set null,
  add column if not exists coffee_grams_per_sale numeric(10,3),
  add column if not exists is_coffee_bean boolean not null default false,
  add column if not exists stock_cost_per_base_unit numeric(14,6),
  add column if not exists retail_pack_size_base_units numeric(14,3);

alter table public.pos_products
  drop constraint if exists pos_products_coffee_grams_per_sale_check;

alter table public.pos_products
  add constraint pos_products_coffee_grams_per_sale_check
    check (coffee_grams_per_sale is null or coffee_grams_per_sale > 0);

alter table public.pos_products
  drop constraint if exists pos_products_stock_cost_per_base_unit_check,
  drop constraint if exists pos_products_retail_pack_size_base_units_check;

alter table public.pos_products
  add constraint pos_products_stock_cost_per_base_unit_check
    check (stock_cost_per_base_unit is null or stock_cost_per_base_unit >= 0),
  add constraint pos_products_retail_pack_size_base_units_check
    check (retail_pack_size_base_units is null or retail_pack_size_base_units > 0);

comment on column public.pos_products.coffee_bean_product_id is
  'Stock product consumed when this menu product is sold.';
comment on column public.pos_products.coffee_grams_per_sale is
  'Grams of roasted coffee beans consumed per sold unit.';
comment on column public.pos_products.stock_cost_per_base_unit is
  'Inventory valuation cost in LYD for one stock base unit (for coffee, LYD per gram).';
comment on column public.pos_products.retail_pack_size_base_units is
  'Number of stock base units in one retail sale (for coffee bags, 250 grams).';

-- Branch theoretical stock may become negative when a receipt or transfer was
-- missed. Warehouse shipping still prevents negative stock atomically.
alter table public.location_product_stock
  drop constraint if exists location_product_stock_qty_check;

create table if not exists public.location_product_movements (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.inventory_locations(id),
  product_id uuid not null references public.pos_products(id),
  movement_type text not null,
  quantity numeric(14,3) not null,
  stock_before numeric(14,3) not null,
  stock_after numeric(14,3) not null,
  order_id uuid references public.pos_orders(id) on delete set null,
  order_item_id uuid references public.pos_order_items(id) on delete set null,
  transfer_id uuid references public.inventory_transfers(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists location_product_movements_product_location_idx
  on public.location_product_movements(product_id, location_id, created_at desc);
create index if not exists location_product_movements_order_idx
  on public.location_product_movements(order_id);

alter table public.location_product_movements enable row level security;
drop policy if exists "location_product_movements_read" on public.location_product_movements;
create policy "location_product_movements_read" on public.location_product_movements
  for select to authenticated using (true);
grant select on public.location_product_movements to authenticated;

-- Ensure the central roasted store and one stock location per branch exist.
insert into public.inventory_locations (name, location_type)
select 'Central Roasted Storage', 'warehouse'
where not exists (
  select 1 from public.inventory_locations where location_type = 'warehouse'
);

insert into public.inventory_locations (branch_id, name, location_type)
select b.id, b.name, 'branch'
from public.pos_branches b
where not exists (
  select 1 from public.inventory_locations l where l.branch_id = b.id and l.location_type = 'branch'
);

-- Coffee catalogue costs come from the supplied roasted-bean base-unit table.
-- Green/roasted planning quantities are deliberately not loaded as stock.
-- cost_price remains the cost of one 250 g retail bag; stock valuation uses
-- stock_cost_per_base_unit (LYD/g).
with bean_catalog(canonical_name, aliases, name_ar, unit_cost, retail_price) as (
  values
    ('Ethiopia Guji Uraga', array['ethiopia goji', 'ethiopia guji uraga'], 'إثيوبيا قوجي أوراقا', 0.118030::numeric, 75.000::numeric),
    ('Colombia Huila - Finca El Corozal', array['colombia finca', 'colombia huila - finca el corozal'], 'كولومبيا هويلا - فينكا إل كوروزال', 0.109480, 75.000),
    ('Colombia Antioquia - Giraldo Community', array['colombia antioquia - giraldo community'], 'كولومبيا أنتيوكيا - مجتمع جيرالدو', 0.120160, 75.000),
    ('Costa Rica Cinnamon', array['costa rica cinnabon', 'costa rica cinnamon'], 'كوستاريكا سينامون', 0.194910, 115.000),
    ('Brazil Mogiana Gold', array['برازيل موجيانا brazil', 'brazil mogiana gold'], 'برازيل موجيانا جولد', 0.098810, 65.000),
    ('Ghadamis Coffee Beans', array['ghadamis coffee', 'ghadamis coffee beans'], 'بن غدامس', 0.093470, 55.000),
    ('Ethiopia Sidama Bensa', array['ethiopia sidama', 'ethiopia sidama bensa'], 'إثيوبيا سيداما بنسا', 0.088130, 45.000)
)
update public.pos_products p
set name = c.canonical_name,
    name_ar = c.name_ar,
    price = c.retail_price,
    cost_price = round(c.unit_cost * 250, 2),
    is_coffee_bean = true,
    stock_cost_per_base_unit = c.unit_cost,
    retail_pack_size_base_units = 250,
    stock_base_unit = 'g',
    stock_display_unit = 'kg',
    track_inventory = false,
    updated_at = now()
from bean_catalog c
where lower(trim(p.name)) = any(c.aliases);

with bean_catalog(canonical_name, aliases, name_ar, unit_cost, retail_price) as (
  values
    ('Ethiopia Guji Uraga', array['ethiopia goji', 'ethiopia guji uraga'], 'إثيوبيا قوجي أوراقا', 0.118030::numeric, 75.000::numeric),
    ('Colombia Huila - Finca El Corozal', array['colombia finca', 'colombia huila - finca el corozal'], 'كولومبيا هويلا - فينكا إل كوروزال', 0.109480, 75.000),
    ('Colombia Antioquia - Giraldo Community', array['colombia antioquia - giraldo community'], 'كولومبيا أنتيوكيا - مجتمع جيرالدو', 0.120160, 75.000),
    ('Costa Rica Cinnamon', array['costa rica cinnabon', 'costa rica cinnamon'], 'كوستاريكا سينامون', 0.194910, 115.000),
    ('Brazil Mogiana Gold', array['برازيل موجيانا brazil', 'brazil mogiana gold'], 'برازيل موجيانا جولد', 0.098810, 65.000),
    ('Ghadamis Coffee Beans', array['ghadamis coffee', 'ghadamis coffee beans'], 'بن غدامس', 0.093470, 55.000),
    ('Ethiopia Sidama Bensa', array['ethiopia sidama', 'ethiopia sidama bensa'], 'إثيوبيا سيداما بنسا', 0.088130, 45.000)
), retail_category as (
  select category_id from public.pos_products
  where lower(trim(name)) in ('ethiopia guji uraga', 'costa rica cinnamon', 'brazil mogiana gold')
    and category_id is not null
  limit 1
)
insert into public.pos_products (
  name, name_ar, price, cost_price, category_id, is_active,
  is_coffee_bean, stock_cost_per_base_unit, retail_pack_size_base_units,
  stock_base_unit, stock_display_unit, track_inventory,
  visible_on_menu, visible_on_customer_menu, visible_on_website,
  visible_branch_ids, is_available
)
select c.canonical_name, c.name_ar, c.retail_price, round(c.unit_cost * 250, 2),
       (select category_id from retail_category), true,
       true, c.unit_cost, 250, 'g', 'kg', false,
       false, false, true,
       coalesce((select array_agg(id) from public.pos_branches where is_active is true), '{}'::uuid[]),
       false
from bean_catalog c
where not exists (
  select 1 from public.pos_products p where lower(trim(p.name)) = any(c.aliases)
);

-- Configure Ghadamis as the default roasted-bean stock source.
update public.pos_products
set stock_base_unit = 'g',
    stock_display_unit = 'kg',
    track_inventory = false,
    updated_at = now()
where id = (
  select id from public.pos_products
  where lower(name) like 'ghadamis coffee%'
  order by created_at
  limit 1
);

insert into public.location_product_stock (location_id, product_id, qty)
select l.id, bean.id, 0
from public.inventory_locations l
cross join lateral (select id from public.pos_products where is_coffee_bean is true) bean
where l.location_type in ('warehouse', 'branch')
on conflict (location_id, product_id) do nothing;

-- A retail bag consumes its configured 250 g from the same bean stock item.
update public.pos_products
set coffee_bean_product_id = id,
    coffee_grams_per_sale = retail_pack_size_base_units,
    updated_at = now()
where is_coffee_bean is true;

-- Most coffee drinks currently use three 9 g shots. V60 starts at 20 g,
-- Extra Coffee Shot at 9 g, and every value remains editable in Products.
with bean as (
  select id from public.pos_products
  where lower(name) like 'ghadamis coffee%'
  order by created_at
  limit 1
)
update public.pos_products p
set coffee_bean_product_id = bean.id,
    coffee_grams_per_sale = case
      when lower(p.name) = 'extra coffee shot' then 9
      when lower(p.name) like '%v60%' then 20
      else 27
    end,
    updated_at = now()
from public.pos_categories c, bean
where p.category_id = c.id
  and c.name in ('Hot Coffee', 'Iced Coffee')
  and p.is_active is true
  and lower(p.name) <> 'extra syrup pump';

create or replace function public.assign_default_coffee_bean()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_coffee_bean is true then
    new.stock_base_unit := 'g';
    new.coffee_bean_product_id := new.id;
    new.coffee_grams_per_sale := coalesce(new.retail_pack_size_base_units, 250);
  elsif new.coffee_grams_per_sale is null then
    new.coffee_bean_product_id := null;
  elsif new.coffee_bean_product_id is null then
    select id into new.coffee_bean_product_id
    from public.pos_products
    where lower(name) like 'ghadamis coffee%'
    order by created_at
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists pos_products_assign_default_coffee_bean on public.pos_products;
create trigger pos_products_assign_default_coffee_bean
before insert or update of coffee_grams_per_sale, coffee_bean_product_id, is_coffee_bean, retail_pack_size_base_units
on public.pos_products
for each row execute function public.assign_default_coffee_bean();

create or replace function public.adjust_order_item_coffee_stock(
  p_order_item_id uuid,
  p_serves_delta numeric,
  p_movement_type text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_branch_id uuid;
  v_order_number text;
  v_bean_product_id uuid;
  v_grams_per_sale numeric;
  v_location_id uuid;
  v_stock_before numeric;
  v_stock_after numeric;
  v_stock_delta numeric;
  v_actor uuid;
begin
  if coalesce(p_serves_delta, 0) = 0 then return; end if;

  select o.id, o.branch_id, o.order_number,
         p.coffee_bean_product_id, p.coffee_grams_per_sale
    into v_order_id, v_branch_id, v_order_number,
         v_bean_product_id, v_grams_per_sale
  from public.pos_order_items oi
  join public.pos_orders o on o.id = oi.order_id
  join public.pos_products p on p.id = oi.product_id
  where oi.id = p_order_item_id;

  if v_bean_product_id is null or coalesce(v_grams_per_sale, 0) <= 0 then return; end if;

  select id into v_location_id
  from public.inventory_locations
  where branch_id = v_branch_id and location_type = 'branch' and is_active is true
  order by created_at
  limit 1;

  if v_location_id is null then
    insert into public.inventory_locations (branch_id, name, location_type)
    select b.id, b.name, 'branch' from public.pos_branches b where b.id = v_branch_id
    returning id into v_location_id;
  end if;

  insert into public.location_product_stock (location_id, product_id, qty)
  values (v_location_id, v_bean_product_id, 0)
  on conflict (location_id, product_id) do nothing;

  select qty into v_stock_before
  from public.location_product_stock
  where location_id = v_location_id and product_id = v_bean_product_id
  for update;

  v_stock_delta := round((p_serves_delta * v_grams_per_sale)::numeric, 3);
  update public.location_product_stock
  set qty = qty + v_stock_delta,
      updated_at = now()
  where location_id = v_location_id and product_id = v_bean_product_id
  returning qty into v_stock_after;

  select id into v_actor from public.profiles where id = auth.uid();

  insert into public.location_product_movements (
    location_id, product_id, movement_type, quantity,
    stock_before, stock_after, order_id, order_item_id,
    actor_profile_id, notes
  ) values (
    v_location_id, v_bean_product_id, p_movement_type, v_stock_delta,
    v_stock_before, v_stock_after, v_order_id, p_order_item_id,
    v_actor, 'Order ' || coalesce(v_order_number, v_order_id::text)
  );
end;
$$;

create or replace function public.consume_coffee_on_order_item_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.pos_orders o where o.id = new.order_id and o.status = 'completed'
  ) then
    perform public.adjust_order_item_coffee_stock(new.id, -new.quantity, 'sale_consumption');
  end if;
  return new;
end;
$$;

drop trigger if exists pos_order_items_consume_coffee_insert on public.pos_order_items;
create trigger pos_order_items_consume_coffee_insert
after insert on public.pos_order_items
for each row execute function public.consume_coffee_on_order_item_insert();

create or replace function public.restore_coffee_on_item_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund_delta numeric;
begin
  v_refund_delta := coalesce(new.refunded_qty, 0) - coalesce(old.refunded_qty, 0);
  if v_refund_delta > 0 and exists (
    select 1 from public.pos_orders o where o.id = new.order_id and o.status = 'completed'
  ) then
    perform public.adjust_order_item_coffee_stock(new.id, v_refund_delta, 'refund_reversal');
  end if;
  return new;
end;
$$;

drop trigger if exists pos_order_items_restore_coffee_refund on public.pos_order_items;
create trigger pos_order_items_restore_coffee_refund
after update of refunded_qty on public.pos_order_items
for each row execute function public.restore_coffee_on_item_refund();

create or replace function public.adjust_coffee_on_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_remaining numeric;
begin
  if old.status is distinct from 'completed' and new.status = 'completed' then
    for v_item in
      select id, quantity, coalesce(refunded_qty, 0) as refunded_qty
      from public.pos_order_items where order_id = new.id
    loop
      v_remaining := v_item.quantity - v_item.refunded_qty;
      if v_remaining > 0 then
        perform public.adjust_order_item_coffee_stock(v_item.id, -v_remaining, 'sale_consumption');
      end if;
    end loop;
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    for v_item in
      select id, quantity, coalesce(refunded_qty, 0) as refunded_qty
      from public.pos_order_items where order_id = new.id
    loop
      v_remaining := v_item.quantity - v_item.refunded_qty;
      if v_remaining > 0 then
        perform public.adjust_order_item_coffee_stock(v_item.id, v_remaining, 'void_reversal');
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists pos_orders_adjust_coffee_status on public.pos_orders;
create trigger pos_orders_adjust_coffee_status
after update of status on public.pos_orders
for each row execute function public.adjust_coffee_on_order_status();

-- Transfer receipt adds stock to the destination location. The legacy product
-- quantity remains untouched for bean stock because location stock is the
-- source of truth for central and branch coffee inventory.
create or replace function public.record_received_location_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_before numeric;
  v_stock_after numeric;
  v_actor uuid;
begin
  if old.status <> 'shipped'
     or new.status not in ('received', 'partial')
     or coalesce(new.qty_received, 0) <= 0 then
    return new;
  end if;

  insert into public.location_product_stock (location_id, product_id, qty)
  values (new.to_location_id, new.product_id, 0)
  on conflict (location_id, product_id) do nothing;

  select qty into v_stock_before
  from public.location_product_stock
  where location_id = new.to_location_id and product_id = new.product_id
  for update;

  update public.location_product_stock
  set qty = qty + new.qty_received,
      updated_at = now()
  where location_id = new.to_location_id and product_id = new.product_id
  returning qty into v_stock_after;

  -- receive_transfer also updates the legacy global product quantity. Undo
  -- only that shadow update for stock products used as coffee beans.
  if exists (
    select 1 from public.pos_products p where p.coffee_bean_product_id = new.product_id
  ) then
    update public.pos_products
    set stock_qty = stock_qty - new.qty_received,
        updated_at = now()
    where id = new.product_id;
  end if;

  select id into v_actor from public.profiles where id = auth.uid();
  insert into public.location_product_movements (
    location_id, product_id, movement_type, quantity,
    stock_before, stock_after, transfer_id, actor_profile_id, notes
  ) values (
    new.to_location_id, new.product_id, 'transfer_in', new.qty_received,
    v_stock_before, v_stock_after, new.id, v_actor, 'Transfer received'
  );
  return new;
end;
$$;

drop trigger if exists inventory_transfers_record_destination_stock on public.inventory_transfers;
create trigger inventory_transfers_record_destination_stock
after update of status on public.inventory_transfers
for each row execute function public.record_received_location_stock();

-- Preserve the accidentally recorded Espresso balance as the initial City
-- Walk bean balance, then stop tracking Espresso cups as stock.
do $$
declare
  v_bean_id uuid;
  v_espresso_id uuid;
  v_branch_id uuid;
  v_location_id uuid;
  v_legacy_qty numeric;
  v_before numeric;
  v_after numeric;
begin
  select id into v_bean_id from public.pos_products
  where lower(name) like 'ghadamis coffee%' order by created_at limit 1;

  select p.id, p.branch_id, coalesce(p.stock_qty, 0)
    into v_espresso_id, v_branch_id, v_legacy_qty
  from public.pos_products p
  join public.pos_categories c on c.id = p.category_id
  where lower(p.name) = 'espresso' and c.name = 'Hot Coffee'
  order by p.updated_at desc
  limit 1;

  if v_bean_id is not null and v_branch_id is not null and v_legacy_qty >= 1000 then
    select id into v_location_id from public.inventory_locations
    where branch_id = v_branch_id and location_type = 'branch'
    order by created_at limit 1;

    select qty into v_before from public.location_product_stock
    where location_id = v_location_id and product_id = v_bean_id for update;

    update public.location_product_stock
    set qty = qty + v_legacy_qty, updated_at = now()
    where location_id = v_location_id and product_id = v_bean_id
    returning qty into v_after;

    insert into public.location_product_movements (
      location_id, product_id, movement_type, quantity,
      stock_before, stock_after, notes
    ) values (
      v_location_id, v_bean_id, 'opening_reclassification', v_legacy_qty,
      v_before, v_after, 'Reclassified legacy Espresso stock as Ghadamis coffee beans'
    );

    update public.pos_products
    set stock_qty = 0, track_inventory = false, updated_at = now()
    where id = v_espresso_id;
  end if;
end $$;

-- Replace the unsafe name-based fallback. Coffee consumption now comes only
-- from explicit per-product gram settings; other ingredients remain recipe-led.
create or replace function public.get_ingredient_consumption(
  p_ingredient_name text,
  p_start_date date default (current_date - 30),
  p_end_date date default current_date
)
returns table (
  ingredient_name text,
  total_consumed_g numeric,
  total_serves bigint,
  avg_daily_g numeric,
  source text,
  qty_per_serve_g numeric
)
language sql stable security definer set search_path = public as $$
  select
    bean.name,
    sum(oi.quantity * pp.coffee_grams_per_sale)::numeric,
    sum(oi.quantity)::bigint,
    round(
      sum(oi.quantity * pp.coffee_grams_per_sale)
      / greatest((p_end_date - p_start_date), 1),
      2
    )::numeric,
    'product_grams'::text,
    round(
      sum(oi.quantity * pp.coffee_grams_per_sale) / nullif(sum(oi.quantity), 0),
      2
    )::numeric
  from public.pos_orders o
  join public.pos_order_items oi on oi.order_id = o.id
  join public.pos_products pp on pp.id = oi.product_id
  join public.pos_products bean on bean.id = pp.coffee_bean_product_id
  where bean.name ilike '%' || p_ingredient_name || '%'
    and pp.coffee_grams_per_sale is not null
    and o.created_at::date between p_start_date and p_end_date
    and o.status = 'completed'
  group by bean.name

  union all

  select
    i.name,
    sum(oi.quantity * ri.qty_used)::numeric,
    sum(oi.quantity)::bigint,
    round(
      sum(oi.quantity * ri.qty_used) / greatest((p_end_date - p_start_date), 1),
      2
    )::numeric,
    'recipe'::text,
    round(sum(oi.quantity * ri.qty_used) / nullif(sum(oi.quantity), 0), 2)::numeric
  from public.pos_orders o
  join public.pos_order_items oi on oi.order_id = o.id
  join public.pos_products pp on pp.id = oi.product_id
  join public.cost_recipes cr on cr.id = pp.cost_recipe_id
  join public.recipe_ingredients ri on ri.recipe_id = cr.id
  join public.ingredients i on i.id = ri.ingredient_id
  where pp.coffee_bean_product_id is null
    and i.name ilike '%' || p_ingredient_name || '%'
    and o.created_at::date between p_start_date and p_end_date
    and o.status = 'completed'
  group by i.name;
$$;

grant execute on function public.get_ingredient_consumption(text, date, date) to authenticated;
