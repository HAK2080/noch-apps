-- Module 3: trustworthy inventory control.
--
-- Authoritative states:
--   * Ingredient physical balance: stock + stock_logs.
--   * Ingredient-by-location count: inventory_location_stock + count movements.
--   * Product-by-location balance: location_product_stock + location_product_movements.
--   * pos_products.stock_qty is retained only as a compatibility total of branch
--     location balances for products that opt into inventory tracking.
--   * Theoretical ingredient usage is available only from explicit recipes.

create table if not exists public.inventory_location_stock (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  qty_available numeric(12,3) not null default 0,
  unit text,
  notes text,
  last_counted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (ingredient_id, location_id)
);

create index if not exists inventory_location_stock_ingredient_idx
  on public.inventory_location_stock(ingredient_id);
create index if not exists inventory_location_stock_location_idx
  on public.inventory_location_stock(location_id);

alter table public.inventory_location_stock enable row level security;
drop policy if exists "inventory_location_stock_staff_read_owner_write"
  on public.inventory_location_stock;
drop policy if exists "inventory_location_stock_read"
  on public.inventory_location_stock;
drop policy if exists "inventory_location_stock_owner_write"
  on public.inventory_location_stock;
create policy "inventory_location_stock_read"
  on public.inventory_location_stock
  for select to authenticated
  using (true);
create policy "inventory_location_stock_owner_write"
  on public.inventory_location_stock
  for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and coalesce(p.is_active, true)
        and p.role in ('owner', 'supervisor')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and coalesce(p.is_active, true)
        and p.role in ('owner', 'supervisor')
    )
);

revoke delete on public.inventory_location_stock from authenticated;
grant select, insert, update on public.inventory_location_stock to authenticated;

create table if not exists public.inventory_location_stock_movements (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.inventory_locations(id),
  ingredient_id uuid not null references public.ingredients(id),
  movement_type text not null check (movement_type in ('physical_count', 'receipt', 'return', 'adjustment')),
  quantity numeric(14,3) not null,
  stock_before numeric(14,3) not null,
  stock_after numeric(14,3) not null,
  unit text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_location_stock_movements_lookup_idx
  on public.inventory_location_stock_movements(ingredient_id, location_id, created_at desc);

alter table public.inventory_location_stock_movements enable row level security;
drop policy if exists "inventory_location_stock_movements_read"
  on public.inventory_location_stock_movements;
create policy "inventory_location_stock_movements_read"
  on public.inventory_location_stock_movements
  for select to authenticated using (true);
grant select on public.inventory_location_stock_movements to authenticated;

create or replace function public.audit_inventory_location_stock_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor_id uuid;
  v_before numeric := 0;
  v_delta numeric;
  v_type text;
begin
  if tg_op = 'UPDATE' and new.qty_available is not distinct from old.qty_available then
    return new;
  end if;
  select p.id into v_actor_id
  from public.profiles p
  where p.id = auth.uid() or p.auth_user_id = auth.uid()
  limit 1;
  if tg_op = 'UPDATE' then v_before := old.qty_available; end if;
  v_delta := new.qty_available - coalesce(v_before, 0);
  v_type := case
    when new.last_counted_at is not null
      and (tg_op = 'INSERT' or new.last_counted_at is distinct from old.last_counted_at)
      then 'physical_count'
    else 'adjustment'
  end;
  insert into public.inventory_location_stock_movements (
    location_id, ingredient_id, movement_type, quantity,
    stock_before, stock_after, unit, actor_profile_id, notes
  ) values (
    new.location_id, new.ingredient_id, v_type, v_delta,
    coalesce(v_before, 0), new.qty_available, new.unit, v_actor_id, new.notes
  );
  return new;
end;
$function$;

drop trigger if exists inventory_location_stock_audit
  on public.inventory_location_stock;
create trigger inventory_location_stock_audit
after insert or update of qty_available on public.inventory_location_stock
for each row execute function public.audit_inventory_location_stock_change();

create or replace function public.record_inventory_location_count(
  p_ingredient_id uuid,
  p_location_id uuid,
  p_counted_qty numeric,
  p_unit text default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor public.profiles;
  v_before numeric := 0;
  v_after numeric;
  v_unit text;
begin
  select p.*
    into v_actor
    from public.profiles p
   where (p.id = auth.uid() or p.auth_user_id = auth.uid())
     and coalesce(p.is_active, true)
     and p.role in ('owner', 'supervisor')
   limit 1;
  if v_actor.id is null then
    raise exception 'Owner or supervisor access required';
  end if;
  if p_counted_qty is null or p_counted_qty < 0 then
    raise exception 'Count cannot be negative';
  end if;
  if not exists (
    select 1 from public.inventory_locations
    where id = p_location_id and is_active is true
  ) then
    raise exception 'Active inventory location not found';
  end if;
  if not exists (
    select 1 from public.ingredients
    where id = p_ingredient_id and coalesce(archived, false) is false
  ) then
    raise exception 'Active ingredient not found';
  end if;

  select qty_available, unit
    into v_before, v_unit
    from public.inventory_location_stock
   where ingredient_id = p_ingredient_id
     and location_id = p_location_id
   for update;
  v_before := coalesce(v_before, 0);
  v_after := round(p_counted_qty::numeric, 3);

  insert into public.inventory_location_stock (
    ingredient_id, location_id, qty_available, unit, notes,
    last_counted_at, updated_at
  ) values (
    p_ingredient_id, p_location_id, v_after,
    coalesce(nullif(trim(p_unit), ''), v_unit),
    nullif(trim(p_notes), ''), now(), now()
  )
  on conflict (ingredient_id, location_id) do update set
    qty_available = excluded.qty_available,
    unit = coalesce(excluded.unit, inventory_location_stock.unit),
    notes = excluded.notes,
    last_counted_at = now(),
    updated_at = now();

  return jsonb_build_object(
    'ingredient_id', p_ingredient_id,
    'location_id', p_location_id,
    'stock_before', v_before,
    'stock_after', v_after,
    'variance', v_after - v_before
  );
end;
$function$;

revoke all on function public.record_inventory_location_count(uuid, uuid, numeric, text, text)
  from public, anon;
grant execute on function public.record_inventory_location_count(uuid, uuid, numeric, text, text)
  to authenticated;

-- Remove the unsafe default-per-serve fallback from the compatibility report.
-- A missing recipe is missing evidence, not zero usage and not a licence to
-- apply one ingredient to every sold product.
create or replace function public.inventory_theoretical_status()
returns table (
  ingredient_id uuid,
  ingredient_name text,
  unit text,
  counted_qty numeric,
  consumed_since_count numeric,
  theoretical_qty numeric,
  min_threshold numeric,
  last_counted_at timestamptz,
  count_is_stale boolean
)
language sql stable security definer set search_path = public as $function$
  select
    i.id,
    i.name,
    coalesce(s.unit, i.base_unit),
    coalesce(s.qty_available, 0)::numeric,
    coalesce(usage.consumed, 0)::numeric,
    (coalesce(s.qty_available, 0) - coalesce(usage.consumed, 0))::numeric,
    coalesce(s.min_threshold, 0)::numeric,
    s.last_counted_at,
    coalesce(s.last_counted_at < now() - interval '7 days', true)
  from public.stock s
  join public.ingredients i on i.id = s.ingredient_id
  left join lateral (
    select sum(greatest(oi.quantity - coalesce(oi.refunded_qty, 0), 0) * ri.qty_used) as consumed
    from public.pos_orders o
    join public.pos_order_items oi on oi.order_id = o.id
    join public.pos_products pp on pp.id = oi.product_id
    join public.recipe_ingredients ri
      on ri.recipe_id = pp.cost_recipe_id
     and ri.ingredient_id = i.id
    where o.status = 'completed'
      and o.created_at >= coalesce(s.last_counted_at, s.updated_at, now())
  ) usage on true
  where coalesce(i.archived, false) is false;
$function$;

grant execute on function public.inventory_theoretical_status() to authenticated;

create or replace function public.inventory_control_status_v2()
returns table (
  ingredient_id uuid,
  ingredient_name text,
  ingredient_name_ar text,
  unit text,
  counted_qty numeric,
  consumed_since_count numeric,
  theoretical_qty numeric,
  min_threshold numeric,
  last_counted_at timestamptz,
  count_is_stale boolean,
  recipe_usage_status text,
  recipe_count integer,
  location_count integer,
  location_qty numeric,
  location_variance numeric
)
language sql stable security definer set search_path = public as $function$
  select
    i.id,
    i.name,
    i.name_ar,
    coalesce(s.unit, i.base_unit),
    coalesce(s.qty_available, 0)::numeric,
    case when recipes.recipe_count > 0 then coalesce(usage.consumed, 0)::numeric else null end,
    case
      when recipes.recipe_count > 0
        then (coalesce(s.qty_available, 0) - coalesce(usage.consumed, 0))::numeric
      else null
    end,
    coalesce(s.min_threshold, 0)::numeric,
    s.last_counted_at,
    coalesce(s.last_counted_at < now() - interval '7 days', true),
    case when recipes.recipe_count > 0 then 'available' else 'unavailable' end,
    recipes.recipe_count::integer,
    coalesce(locations.location_count, 0)::integer,
    coalesce(locations.location_qty, 0)::numeric,
    case
      when coalesce(locations.location_count, 0) = 0 then null
      else (coalesce(locations.location_qty, 0) - coalesce(s.qty_available, 0))::numeric
    end
  from public.stock s
  join public.ingredients i on i.id = s.ingredient_id
  left join lateral (
    select count(distinct ri.recipe_id) as recipe_count
    from public.recipe_ingredients ri
    where ri.ingredient_id = i.id
  ) recipes on true
  left join lateral (
    select sum(greatest(oi.quantity - coalesce(oi.refunded_qty, 0), 0) * ri.qty_used) as consumed
    from public.pos_orders o
    join public.pos_order_items oi on oi.order_id = o.id
    join public.pos_products pp on pp.id = oi.product_id
    join public.recipe_ingredients ri
      on ri.recipe_id = pp.cost_recipe_id
     and ri.ingredient_id = i.id
    where o.status = 'completed'
      and o.created_at >= coalesce(s.last_counted_at, s.updated_at, now())
  ) usage on true
  left join lateral (
    select count(*) as location_count, sum(ls.qty_available) as location_qty
    from public.inventory_location_stock ls
    where ls.ingredient_id = i.id
  ) locations on true
  where coalesce(i.archived, false) is false;
$function$;

grant execute on function public.inventory_control_status_v2() to authenticated;

create or replace function public.inventory_control_summary()
returns jsonb
language sql stable security definer set search_path = public as $function$
  with ingredient_status as (
    select * from public.inventory_control_status_v2()
  ),
  sold_products as (
    select distinct oi.product_id
    from public.pos_orders o
    join public.pos_order_items oi on oi.order_id = o.id
    where o.status = 'completed'
      and o.created_at >= now() - interval '30 days'
      and oi.product_id is not null
  ),
  recipe_coverage as (
    select
      count(*)::integer as sold_products,
      count(*) filter (
        where p.cost_recipe_id is not null
          and exists (
            select 1 from public.recipe_ingredients ri
            where ri.recipe_id = p.cost_recipe_id
          )
      )::integer as recipe_linked_products
    from sold_products sp
    join public.pos_products p on p.id = sp.product_id
  ),
  latest as (
    select greatest(
      coalesce((select max(created_at) from public.stock_logs), '-infinity'::timestamptz),
      coalesce((select max(created_at) from public.location_product_movements), '-infinity'::timestamptz),
      coalesce((select max(created_at) from public.inventory_location_stock_movements), '-infinity'::timestamptz)
    ) as latest_movement_at
  )
  select jsonb_build_object(
    'generated_at', now(),
    'ingredient_count', (select count(*) from ingredient_status),
    'stale_ingredient_counts', (select count(*) from ingredient_status where count_is_stale),
    'recipe_usage_unavailable', (select count(*) from ingredient_status where recipe_usage_status = 'unavailable'),
    'location_counts_missing', (select count(*) from ingredient_status where location_count = 0),
    'location_variances', (
      select count(*) from ingredient_status
      where location_variance is not null and abs(location_variance) > 0.001
    ),
    'negative_product_locations', (
      select count(*) from public.location_product_stock where qty < 0
    ),
    'open_procurement_orders', (
      select count(*) from public.procurement_orders
      where status not in ('received', 'cancelled', 'returned')
    ),
    'open_transfers', (
      select count(*) from public.inventory_transfers
      where status in ('requested', 'shipped', 'partial')
    ),
    'in_transit_lines', (select count(*) from public.inventory_in_transit),
    'sold_products_30d', (select sold_products from recipe_coverage),
    'recipe_linked_sold_products_30d', (select recipe_linked_products from recipe_coverage),
    'recipe_coverage_pct', (
      select case when sold_products = 0 then null
        else round(recipe_linked_products * 100.0 / sold_products)
      end from recipe_coverage
    ),
    'latest_movement_at', (select nullif(latest_movement_at, '-infinity'::timestamptz) from latest),
    'ingredient_source', 'stock + stock_logs',
    'ingredient_location_source', 'inventory_location_stock + inventory_location_stock_movements',
    'product_location_source', 'location_product_stock + location_product_movements',
    'transfer_source', 'inventory_transfers',
    'procurement_source', 'procurement_orders'
  );
$function$;

grant execute on function public.inventory_control_summary() to authenticated;

alter table public.location_product_movements
  add column if not exists source text,
  add column if not exists source_ref text,
  add column if not exists entered_quantity numeric(14,3),
  add column if not exists entered_unit text;

create unique index if not exists location_product_movements_source_ref_uidx
  on public.location_product_movements(source, source_ref)
  where source_ref is not null;

create or replace function public.sync_product_branch_stock_total(p_product_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_total numeric;
begin
  select coalesce(sum(lps.qty), 0)
    into v_total
    from public.location_product_stock lps
    join public.inventory_locations l on l.id = lps.location_id
   where lps.product_id = p_product_id
     and l.location_type = 'branch';

  update public.pos_products
     set stock_qty = round(v_total::numeric, 2),
         updated_at = now()
   where id = p_product_id
     and track_inventory is true;
  return v_total;
end;
$function$;

create or replace function public.receive_branch_product_stock(
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit text default null,
  p_source_ref text default null,
  p_actor_profile_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor public.profiles;
  v_reported_actor_id uuid;
  v_product public.pos_products;
  v_location_id uuid;
  v_input_unit text;
  v_input_base_unit text;
  v_base_unit text;
  v_display_unit text;
  v_factor numeric;
  v_base_quantity numeric;
  v_before numeric;
  v_after numeric;
  v_movement_id uuid;
  v_existing public.location_product_movements;
begin
  select p.*
    into v_actor
    from public.profiles p
   where (p.id = auth.uid() or p.auth_user_id = auth.uid())
     and coalesce(p.is_active, true)
   limit 1;
  if v_actor.id is null then
    raise exception 'Active staff sign-in required';
  end if;
  if p_actor_profile_id is not null and not exists (
    select 1 from public.profiles
    where id = p_actor_profile_id and coalesce(is_active, true)
  ) then
    raise exception 'Stock reporter was not found';
  end if;
  v_reported_actor_id := coalesce(p_actor_profile_id, v_actor.id);
  if v_actor.role not in ('owner', 'supervisor')
     and v_actor.branch_id is distinct from p_branch_id
     and not exists (
       select 1 from public.staff_branches sb
       where sb.user_id = v_actor.id and sb.branch_id = p_branch_id
     ) then
    raise exception 'You cannot receive stock for this branch';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Received quantity must be greater than zero';
  end if;

  select * into v_product
  from public.pos_products
  where id = p_product_id and is_active is true
    and (
      branch_id = p_branch_id
      or p_branch_id = any(coalesce(visible_branch_ids, '{}'::uuid[]))
    )
  for update;
  if not found then
    raise exception 'Product is not available at this branch';
  end if;

  select id into v_location_id
  from public.inventory_locations
  where branch_id = p_branch_id and location_type = 'branch' and is_active is true
  order by created_at
  limit 1;
  if v_location_id is null then
    raise exception 'Active branch stock location not found';
  end if;

  v_input_unit := lower(coalesce(nullif(trim(p_unit), ''), v_product.stock_display_unit, 'pc'));
  if v_input_unit not in ('pc', 'g', 'kg', 'ml', 'l') then
    raise exception 'Invalid stock unit';
  end if;
  v_input_base_unit := case
    when v_input_unit in ('g', 'kg') then 'g'
    when v_input_unit in ('ml', 'l') then 'ml'
    else 'pc'
  end;
  v_factor := case when v_input_unit in ('kg', 'l') then 1000 else 1 end;
  v_base_unit := coalesce(
    case when v_product.track_inventory is true then v_product.stock_base_unit end,
    v_input_base_unit
  );
  if v_input_base_unit <> v_base_unit then
    raise exception 'Use a unit compatible with this product stock';
  end if;
  v_display_unit := coalesce(v_product.stock_display_unit, v_input_unit);
  v_base_quantity := round((p_quantity * v_factor)::numeric, 3);

  if p_source_ref is not null then
    select * into v_existing
    from public.location_product_movements
    where source = 'pos' and source_ref = p_source_ref
    limit 1;
    if found then
      return jsonb_build_object(
        'movement_id', v_existing.id,
        'product_id', v_existing.product_id,
        'branch_id', p_branch_id,
        'stock_before', v_existing.stock_before,
        'stock_after', v_existing.stock_after,
        'quantity_received', coalesce(v_existing.entered_quantity, v_existing.quantity),
        'quantity_received_base', v_existing.quantity,
        'received_unit', coalesce(v_existing.entered_unit, v_input_unit),
        'stock_base_unit', v_base_unit,
        'stock_display_unit', v_display_unit,
        'duplicate', true
      );
    end if;
  end if;

  insert into public.location_product_stock(location_id, product_id, qty, updated_at)
  values (v_location_id, p_product_id, 0, now())
  on conflict (location_id, product_id) do nothing;

  select qty into v_before
  from public.location_product_stock
  where location_id = v_location_id and product_id = p_product_id
  for update;

  update public.location_product_stock
  set qty = qty + v_base_quantity, updated_at = now()
  where location_id = v_location_id and product_id = p_product_id
  returning qty into v_after;

  update public.pos_products
  set track_inventory = true,
      stock_base_unit = v_base_unit,
      stock_display_unit = v_display_unit,
      updated_at = now()
  where id = p_product_id;

  insert into public.location_product_movements (
    location_id, product_id, movement_type, quantity,
    stock_before, stock_after, actor_profile_id, notes,
    source, source_ref, entered_quantity, entered_unit
  ) values (
    v_location_id, p_product_id, 'branch_receipt', v_base_quantity,
    v_before, v_after, v_reported_actor_id, 'Product stock received at POS',
    'pos', nullif(p_source_ref, ''), round(p_quantity::numeric, 3), v_input_unit
  )
  returning id into v_movement_id;

  perform public.sync_product_branch_stock_total(p_product_id);

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'product_id', p_product_id,
    'branch_id', p_branch_id,
    'stock_before', v_before,
    'stock_after', v_after,
    'quantity_received', round(p_quantity::numeric, 3),
    'quantity_received_base', v_base_quantity,
    'received_unit', v_input_unit,
    'stock_base_unit', v_base_unit,
    'stock_display_unit', v_display_unit,
    'duplicate', false
  );
end;
$function$;

revoke all on function public.receive_branch_product_stock(uuid, uuid, numeric, text, text, uuid)
  from public, anon;
grant execute on function public.receive_branch_product_stock(uuid, uuid, numeric, text, text, uuid)
  to authenticated;

create or replace function public.adjust_pos_product_stock(
  p_product_id uuid,
  p_branch_id uuid,
  p_new_quantity numeric,
  p_notes text default 'Manual adjustment'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor public.profiles;
  v_product public.pos_products;
  v_location_id uuid;
  v_before numeric;
  v_after numeric;
  v_movement_id uuid;
begin
  select p.* into v_actor
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and coalesce(p.is_active, true)
  limit 1;
  if v_actor.id is null then raise exception 'Active staff sign-in required'; end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'Stock quantity cannot be negative';
  end if;
  if v_actor.role not in ('owner', 'supervisor')
     and v_actor.branch_id is distinct from p_branch_id
     and not exists (
       select 1 from public.staff_branches sb
       where sb.user_id = v_actor.id and sb.branch_id = p_branch_id
     ) then
    raise exception 'You cannot adjust stock for this branch';
  end if;

  select * into v_product
  from public.pos_products
  where id = p_product_id and is_active is true
    and (
      branch_id = p_branch_id
      or p_branch_id = any(coalesce(visible_branch_ids, '{}'::uuid[]))
    )
  for update;
  if not found then raise exception 'Product is not available at this branch'; end if;

  select id into v_location_id
  from public.inventory_locations
  where branch_id = p_branch_id and location_type = 'branch' and is_active is true
  order by created_at limit 1;
  if v_location_id is null then raise exception 'Active branch stock location not found'; end if;

  insert into public.location_product_stock(location_id, product_id, qty, updated_at)
  values (v_location_id, p_product_id, 0, now())
  on conflict (location_id, product_id) do nothing;
  select qty into v_before
  from public.location_product_stock
  where location_id = v_location_id and product_id = p_product_id
  for update;
  v_after := round(p_new_quantity::numeric, 3);

  update public.location_product_stock
  set qty = v_after, updated_at = now()
  where location_id = v_location_id and product_id = p_product_id;

  update public.pos_products
  set track_inventory = true, updated_at = now()
  where id = p_product_id;

  insert into public.location_product_movements (
    location_id, product_id, movement_type, quantity,
    stock_before, stock_after, actor_profile_id, notes,
    source, source_ref, entered_quantity, entered_unit
  ) values (
    v_location_id, p_product_id, 'adjustment', v_after - v_before,
    v_before, v_after, v_actor.id,
    coalesce(nullif(trim(p_notes), ''), 'Manual adjustment'),
    'pos', 'adjustment:' || gen_random_uuid()::text,
    v_after - v_before, coalesce(v_product.stock_base_unit, 'pc')
  )
  returning id into v_movement_id;

  perform public.sync_product_branch_stock_total(p_product_id);
  return jsonb_build_object(
    'movement_id', v_movement_id,
    'product_id', p_product_id,
    'branch_id', p_branch_id,
    'stock_before', v_before,
    'stock_after', v_after,
    'stock_base_unit', coalesce(v_product.stock_base_unit, 'pc')
  );
end;
$function$;

create or replace function public.receive_warehouse_stock(
  p_product_id uuid,
  p_qty numeric,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor public.profiles;
  v_location uuid;
  v_before numeric;
  v_after numeric;
  v_movement_id uuid;
begin
  select p.* into v_actor
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and coalesce(p.is_active, true)
    and p.role in ('owner', 'supervisor')
  limit 1;
  if v_actor.id is null then raise exception 'Owner or supervisor access required'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be positive'; end if;

  select id into v_location
  from public.inventory_locations
  where location_type = 'warehouse' and is_active is true
  order by created_at limit 1;
  if v_location is null then raise exception 'No central warehouse location found'; end if;

  insert into public.location_product_stock(location_id, product_id, qty, updated_at)
  values (v_location, p_product_id, 0, now())
  on conflict (location_id, product_id) do nothing;
  select qty into v_before
  from public.location_product_stock
  where location_id = v_location and product_id = p_product_id
  for update;
  update public.location_product_stock
  set qty = qty + p_qty, updated_at = now()
  where location_id = v_location and product_id = p_product_id
  returning qty into v_after;

  insert into public.location_product_movements (
    location_id, product_id, movement_type, quantity,
    stock_before, stock_after, actor_profile_id, notes
  ) values (
    v_location, p_product_id, 'warehouse_receipt', p_qty,
    v_before, v_after, v_actor.id, nullif(trim(p_note), '')
  )
  returning id into v_movement_id;
  return v_movement_id;
end;
$function$;

-- Receiving a transfer now updates only the transfer state. The trigger below
-- writes the destination location balance and movement exactly once.
create or replace function public.receive_transfer(
  p_transfer_id uuid,
  p_qty_received numeric,
  p_discrepancy_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor public.profiles;
  v_transfer public.inventory_transfers;
  v_branch_id uuid;
begin
  select p.* into v_actor
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and coalesce(p.is_active, true)
  limit 1;
  if v_actor.id is null then raise exception 'Active staff sign-in required'; end if;

  select * into v_transfer
  from public.inventory_transfers
  where id = p_transfer_id
  for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_transfer.status <> 'shipped' then raise exception 'Transfer is not shipped'; end if;
  if p_qty_received is null or p_qty_received < 0
     or p_qty_received > v_transfer.qty_shipped then
    raise exception 'Received quantity must be between zero and shipped quantity';
  end if;
  if p_qty_received < v_transfer.qty_shipped
     and nullif(trim(coalesce(p_discrepancy_reason, '')), '') is null then
    raise exception 'Discrepancy reason is required for a partial receipt';
  end if;

  select branch_id into v_branch_id
  from public.inventory_locations
  where id = v_transfer.to_location_id;
  if v_actor.role not in ('owner', 'supervisor')
     and v_actor.branch_id is distinct from v_branch_id
     and not exists (
       select 1 from public.staff_branches sb
       where sb.user_id = v_actor.id and sb.branch_id = v_branch_id
     ) then
    raise exception 'You cannot receive stock for this branch';
  end if;

  update public.inventory_transfers
  set qty_received = p_qty_received,
      status = case when p_qty_received = v_transfer.qty_shipped then 'received' else 'partial' end,
      discrepancy_reason = case
        when p_qty_received = v_transfer.qty_shipped then null
        else nullif(trim(p_discrepancy_reason), '')
      end,
      received_by = v_actor.id,
      received_at = now()
  where id = p_transfer_id;
  return p_transfer_id;
end;
$function$;

create or replace function public.record_received_location_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_before numeric;
  v_after numeric;
begin
  if old.status <> 'shipped'
     or new.status not in ('received', 'partial')
     or coalesce(new.qty_received, 0) <= 0 then
    return new;
  end if;

  insert into public.location_product_stock(location_id, product_id, qty, updated_at)
  values (new.to_location_id, new.product_id, 0, now())
  on conflict (location_id, product_id) do nothing;
  select qty into v_before
  from public.location_product_stock
  where location_id = new.to_location_id and product_id = new.product_id
  for update;
  update public.location_product_stock
  set qty = qty + new.qty_received, updated_at = now()
  where location_id = new.to_location_id and product_id = new.product_id
  returning qty into v_after;

  insert into public.location_product_movements (
    location_id, product_id, movement_type, quantity,
    stock_before, stock_after, transfer_id, actor_profile_id, notes
  ) values (
    new.to_location_id, new.product_id, 'transfer_in', new.qty_received,
    v_before, v_after, new.id, new.received_by, 'Transfer received'
  );
  perform public.sync_product_branch_stock_total(new.product_id);
  return new;
end;
$function$;

drop trigger if exists inventory_transfers_record_destination_stock
  on public.inventory_transfers;
create trigger inventory_transfers_record_destination_stock
after update of status on public.inventory_transfers
for each row execute function public.record_received_location_stock();

create or replace function public.record_shipped_location_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_after numeric;
  v_before numeric;
begin
  if old.status <> 'requested'
     or new.status <> 'shipped'
     or coalesce(new.qty_shipped, 0) <= 0 then
    return new;
  end if;
  select qty into v_after
  from public.location_product_stock
  where location_id = new.from_location_id and product_id = new.product_id;
  v_before := coalesce(v_after, 0) + new.qty_shipped;
  insert into public.location_product_movements (
    location_id, product_id, movement_type, quantity,
    stock_before, stock_after, transfer_id, actor_profile_id, notes
  ) values (
    new.from_location_id, new.product_id, 'transfer_out', -new.qty_shipped,
    v_before, coalesce(v_after, 0), new.id, new.shipped_by, 'Transfer shipped'
  );
  return new;
end;
$function$;

drop trigger if exists inventory_transfers_record_origin_movement
  on public.inventory_transfers;
create trigger inventory_transfers_record_origin_movement
after update of status on public.inventory_transfers
for each row execute function public.record_shipped_location_stock();

create or replace function public.report_waste(
  p_branch_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_reason text,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor public.profiles;
  v_location_id uuid;
  v_before numeric;
  v_after numeric;
  v_movement_id uuid;
begin
  select p.* into v_actor
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and coalesce(p.is_active, true)
  limit 1;
  if v_actor.id is null then raise exception 'Active staff sign-in required'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be positive'; end if;
  if p_reason not in ('used','damaged','lost','thrown_away','expired','staff_meal','count_correction') then
    raise exception 'Invalid waste reason';
  end if;
  if v_actor.role not in ('owner', 'supervisor')
     and v_actor.branch_id is distinct from p_branch_id
     and not exists (
       select 1 from public.staff_branches sb
       where sb.user_id = v_actor.id and sb.branch_id = p_branch_id
     ) then
    raise exception 'You cannot report waste for this branch';
  end if;

  select id into v_location_id
  from public.inventory_locations
  where branch_id = p_branch_id and location_type = 'branch' and is_active is true
  order by created_at limit 1;
  if v_location_id is null then raise exception 'Active branch stock location not found'; end if;

  insert into public.location_product_stock(location_id, product_id, qty, updated_at)
  values (v_location_id, p_product_id, 0, now())
  on conflict (location_id, product_id) do nothing;
  select qty into v_before
  from public.location_product_stock
  where location_id = v_location_id and product_id = p_product_id
  for update;
  v_after := v_before - p_qty;
  update public.location_product_stock
  set qty = v_after, updated_at = now()
  where location_id = v_location_id and product_id = p_product_id;

  insert into public.location_product_movements (
    location_id, product_id, movement_type, quantity,
    stock_before, stock_after, actor_profile_id, notes
  ) values (
    v_location_id, p_product_id, p_reason, -p_qty,
    v_before, v_after, v_actor.id, nullif(trim(p_note), '')
  )
  returning id into v_movement_id;
  perform public.sync_product_branch_stock_total(p_product_id);
  return v_movement_id;
end;
$function$;

-- Mirror future sale/refund/void movements into the branch location ledger.
-- Historical rows remain untouched and visible as legacy evidence.
create or replace function public.mirror_pos_movement_to_location_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_location_id uuid;
  v_before numeric;
  v_after numeric;
begin
  if new.branch_id is null
     or new.product_id is null
     or new.movement_type not in ('sale', 'refund', 'void')
     or not exists (
       select 1 from public.pos_products
       where id = new.product_id and track_inventory is true
     ) then
    return new;
  end if;

  select id into v_location_id
  from public.inventory_locations
  where branch_id = new.branch_id and location_type = 'branch' and is_active is true
  order by created_at limit 1;
  if v_location_id is null then return new; end if;

  insert into public.location_product_stock(location_id, product_id, qty, updated_at)
  values (v_location_id, new.product_id, 0, now())
  on conflict (location_id, product_id) do nothing;
  select qty into v_before
  from public.location_product_stock
  where location_id = v_location_id and product_id = new.product_id
  for update;
  v_after := v_before + new.quantity;
  update public.location_product_stock
  set qty = v_after, updated_at = now()
  where location_id = v_location_id and product_id = new.product_id;

  insert into public.location_product_movements (
    location_id, product_id, movement_type, quantity,
    stock_before, stock_after, actor_profile_id, notes, source, source_ref
  ) values (
    v_location_id, new.product_id, new.movement_type, new.quantity,
    v_before, v_after, new.actor_profile_id, new.notes,
    'legacy_pos_mirror', new.id::text
  )
  on conflict (source, source_ref) where source_ref is not null do nothing;
  perform public.sync_product_branch_stock_total(new.product_id);
  return new;
end;
$function$;

drop trigger if exists pos_inventory_movements_mirror_location
  on public.pos_inventory_movements;
create trigger pos_inventory_movements_mirror_location
after insert on public.pos_inventory_movements
for each row execute function public.mirror_pos_movement_to_location_stock();

-- Safe rollback evidence. No historical quantity is rewritten by this module.
create table if not exists public.inventory_control_rollout_log (
  id uuid primary key default gen_random_uuid(),
  deployed_at timestamptz not null default now(),
  legacy_product_rows integer not null,
  legacy_product_balance numeric not null,
  location_product_rows integer not null,
  location_product_balance numeric not null,
  ingredient_rows integer not null,
  note text not null
);

insert into public.inventory_control_rollout_log (
  legacy_product_rows, legacy_product_balance,
  location_product_rows, location_product_balance,
  ingredient_rows, note
)
select
  (select count(*) from public.pos_products),
  (select coalesce(sum(stock_qty), 0) from public.pos_products),
  (select count(*) from public.location_product_stock),
  (select coalesce(sum(qty), 0) from public.location_product_stock),
  (select count(*) from public.stock),
  'Module 3 authority switch; historical balances and movements preserved';

alter table public.inventory_control_rollout_log enable row level security;
drop policy if exists "inventory_control_rollout_log_owner_read"
  on public.inventory_control_rollout_log;
create policy "inventory_control_rollout_log_owner_read"
  on public.inventory_control_rollout_log
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'owner'
    )
  );
grant select on public.inventory_control_rollout_log to authenticated;
