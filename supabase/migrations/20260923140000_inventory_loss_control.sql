-- Simple, auditable stock-loss checks for management.
-- A check snapshots the ledger expectation before replacing it with the
-- physical quantity. Historical checks are immutable evidence.

create table if not exists public.inventory_loss_checks (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.pos_branches(id),
  location_id uuid not null references public.inventory_locations(id),
  item_kind text not null check (item_kind in ('product', 'ingredient')),
  product_id uuid references public.pos_products(id),
  ingredient_id uuid references public.ingredients(id),
  period_started_at timestamptz not null,
  counted_at timestamptz not null default now(),
  expected_qty numeric(14,3) not null,
  counted_qty numeric(14,3) not null,
  unaccounted_qty numeric(14,3) not null,
  unit text not null,
  unit_cost_lyd numeric(14,6),
  unaccounted_cost_lyd numeric(14,2),
  counted_by uuid references public.profiles(id),
  notes text,
  constraint inventory_loss_checks_item_check check (
    (item_kind = 'product' and product_id is not null and ingredient_id is null)
    or (item_kind = 'ingredient' and ingredient_id is not null and product_id is null)
  )
);

create index if not exists inventory_loss_checks_branch_date_idx
  on public.inventory_loss_checks(branch_id, counted_at desc);
create index if not exists inventory_loss_checks_product_idx
  on public.inventory_loss_checks(product_id, counted_at desc) where product_id is not null;
create index if not exists inventory_loss_checks_ingredient_idx
  on public.inventory_loss_checks(ingredient_id, counted_at desc) where ingredient_id is not null;

alter table public.inventory_loss_checks enable row level security;
revoke all on public.inventory_loss_checks from public, anon, authenticated;

create or replace function public.inventory_loss_actor()
returns public.profiles
language sql stable security definer set search_path = public as $function$
  select p
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and coalesce(p.is_active, true)
    and p.role in ('owner', 'supervisor')
  limit 1;
$function$;

create or replace function public.inventory_loss_count_items(p_branch_id uuid)
returns table (
  item_kind text,
  item_id uuid,
  item_name text,
  item_name_ar text,
  unit text,
  expected_qty numeric,
  ready_for_loss_check boolean,
  readiness_note text
)
language plpgsql stable security definer set search_path = public as $function$
declare
  v_actor public.profiles;
begin
  v_actor := public.inventory_loss_actor();
  if v_actor.id is null then raise exception 'Owner or supervisor access required'; end if;

  return query
  with branch_location as (
    select l.id
    from public.inventory_locations l
    where l.branch_id = p_branch_id and l.location_type = 'branch' and l.is_active is true
    order by l.created_at limit 1
  )
  select 'product'::text, p.id, p.name, p.name_ar,
         coalesce(p.stock_base_unit, 'pc')::text, lps.qty::numeric,
         true,
         null::text
  from branch_location bl
  join public.location_product_stock lps on lps.location_id = bl.id
  join public.pos_products p on p.id = lps.product_id
  where p.track_inventory is true or p.is_coffee_bean is true
  union all
  select 'ingredient'::text, i.id, i.name, i.name_ar,
         coalesce(ils.unit, i.base_unit)::text,
         case when recipes.recipe_count > 0 then
           (ils.qty_available - coalesce(usage.consumed, 0))::numeric
         else ils.qty_available::numeric end,
         recipes.recipe_count > 0,
         case when recipes.recipe_count > 0 then null else 'Recipe link required' end
  from branch_location bl
  join public.inventory_location_stock ils on ils.location_id = bl.id
  join public.ingredients i on i.id = ils.ingredient_id and coalesce(i.archived, false) is false
  left join lateral (
    select count(distinct ri.recipe_id) as recipe_count
    from public.recipe_ingredients ri where ri.ingredient_id = i.id
  ) recipes on true
  left join lateral (
    select sum(greatest(oi.quantity - coalesce(oi.refunded_qty, 0), 0) * ri.qty_used) as consumed
    from public.pos_orders o
    join public.pos_order_items oi on oi.order_id = o.id
    join public.pos_products pp on pp.id = oi.product_id
    join public.recipe_ingredients ri
      on ri.recipe_id = pp.cost_recipe_id and ri.ingredient_id = i.id
    where o.status = 'completed' and o.branch_id = p_branch_id
      and o.created_at >= coalesce((
        select max(c.counted_at) from public.inventory_loss_checks c
        where c.branch_id = p_branch_id and c.item_kind = 'ingredient' and c.ingredient_id = i.id
      ), now())
  ) usage on true
  order by 1, 3;
end;
$function$;

create or replace function public.record_inventory_loss_count(
  p_branch_id uuid,
  p_item_kind text,
  p_item_id uuid,
  p_counted_qty numeric,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $function$
declare
  v_actor public.profiles;
  v_location_id uuid;
  v_check_id uuid := gen_random_uuid();
  v_balance_before numeric;
  v_expected numeric;
  v_period_start timestamptz;
  v_unit text;
  v_unit_cost numeric;
  v_recipe_count integer;
  v_consumed numeric;
  v_product public.pos_products;
  v_ingredient public.ingredients;
begin
  v_actor := public.inventory_loss_actor();
  if v_actor.id is null then raise exception 'Owner or supervisor access required'; end if;
  if p_counted_qty is null or p_counted_qty < 0 then raise exception 'Physical count cannot be negative'; end if;
  if p_item_kind not in ('product', 'ingredient') then raise exception 'Invalid stock item type'; end if;

  select l.id into v_location_id
  from public.inventory_locations l
  where l.branch_id = p_branch_id and l.location_type = 'branch' and l.is_active is true
  order by l.created_at limit 1;
  if v_location_id is null then raise exception 'Active branch stock location not found'; end if;

  if p_item_kind = 'product' then
    select p.* into v_product from public.pos_products p where p.id = p_item_id;
    if v_product.id is null then raise exception 'Product not found'; end if;

    insert into public.location_product_stock(location_id, product_id, qty, updated_at)
    values (v_location_id, p_item_id, 0, now()) on conflict (location_id, product_id) do nothing;
    select qty into v_balance_before from public.location_product_stock
    where location_id = v_location_id and product_id = p_item_id for update;

    select max(counted_at) into v_period_start from public.inventory_loss_checks
    where branch_id = p_branch_id and item_kind = 'product' and product_id = p_item_id;
    if v_period_start is null then
      v_period_start := now();
      v_expected := round(p_counted_qty, 3);
    else
      v_expected := v_balance_before;
    end if;
    v_unit := coalesce(v_product.stock_base_unit, 'pc');
    v_unit_cost := coalesce(v_product.stock_cost_per_base_unit,
      case when v_unit = 'pc' then v_product.cost_lyd else null end, 0);

    insert into public.inventory_loss_checks(
      id, branch_id, location_id, item_kind, product_id, period_started_at,
      expected_qty, counted_qty, unaccounted_qty, unit, unit_cost_lyd,
      unaccounted_cost_lyd, counted_by, notes
    ) values (
      v_check_id, p_branch_id, v_location_id, 'product', p_item_id, v_period_start,
      v_expected, round(p_counted_qty, 3), greatest(v_expected - p_counted_qty, 0), v_unit, v_unit_cost,
      round(greatest(v_expected - p_counted_qty, 0) * v_unit_cost, 2), v_actor.id, nullif(trim(p_notes), '')
    );

    update public.location_product_stock set qty = round(p_counted_qty, 3), updated_at = now()
    where location_id = v_location_id and product_id = p_item_id;
    insert into public.location_product_movements(
      location_id, product_id, movement_type, quantity, stock_before, stock_after,
      actor_profile_id, notes, source, source_ref, entered_quantity, entered_unit
    ) values (
      v_location_id, p_item_id, 'physical_count', round(p_counted_qty - v_balance_before, 3),
      v_balance_before, round(p_counted_qty, 3), v_actor.id,
      coalesce(nullif(trim(p_notes), ''), 'Loss control physical count'),
      'loss_control_count', v_check_id::text, round(p_counted_qty, 3), v_unit
    );
    perform public.sync_product_branch_stock_total(p_item_id);
  else
    select i.* into v_ingredient from public.ingredients i
    where i.id = p_item_id and coalesce(i.archived, false) is false;
    if v_ingredient.id is null then raise exception 'Ingredient not found'; end if;

    select count(distinct ri.recipe_id) into v_recipe_count
    from public.recipe_ingredients ri where ri.ingredient_id = p_item_id;
    if coalesce(v_recipe_count, 0) = 0 then raise exception 'Link this ingredient to a sold recipe before loss checks'; end if;

    insert into public.inventory_location_stock(location_id, ingredient_id, qty_available, unit, updated_at)
    values (v_location_id, p_item_id, 0, v_ingredient.base_unit, now())
    on conflict (ingredient_id, location_id) do nothing;
    select qty_available, coalesce(unit, v_ingredient.base_unit)
      into v_balance_before, v_unit
    from public.inventory_location_stock
    where location_id = v_location_id and ingredient_id = p_item_id for update;

    select max(counted_at) into v_period_start from public.inventory_loss_checks
    where branch_id = p_branch_id and item_kind = 'ingredient' and ingredient_id = p_item_id;
    if v_period_start is null then
      v_period_start := now();
      v_consumed := 0;
      v_expected := round(p_counted_qty, 3);
    else
      select coalesce(sum(greatest(oi.quantity - coalesce(oi.refunded_qty, 0), 0) * ri.qty_used), 0)
        into v_consumed
      from public.pos_orders o
      join public.pos_order_items oi on oi.order_id = o.id
      join public.pos_products pp on pp.id = oi.product_id
      join public.recipe_ingredients ri
        on ri.recipe_id = pp.cost_recipe_id and ri.ingredient_id = p_item_id
      where o.status = 'completed' and o.branch_id = p_branch_id and o.created_at >= v_period_start;
      v_expected := v_balance_before - coalesce(v_consumed, 0);
    end if;
    v_unit_cost := case
      when coalesce(v_ingredient.purchase_currency, 'LYD') = 'LYD'
       and coalesce(v_ingredient.bulk_qty, 0) > 0
      then v_ingredient.bulk_cost / (
        v_ingredient.bulk_qty * case
          when lower(coalesce(v_ingredient.bulk_unit, '')) in ('kg', 'l')
           and lower(coalesce(v_ingredient.base_unit, '')) in ('g', 'ml') then 1000
          else 1 end
      )
      else 0 end;

    insert into public.inventory_loss_checks(
      id, branch_id, location_id, item_kind, ingredient_id, period_started_at,
      expected_qty, counted_qty, unaccounted_qty, unit, unit_cost_lyd,
      unaccounted_cost_lyd, counted_by, notes
    ) values (
      v_check_id, p_branch_id, v_location_id, 'ingredient', p_item_id, v_period_start,
      v_expected, round(p_counted_qty, 3), greatest(v_expected - p_counted_qty, 0), v_unit, v_unit_cost,
      round(greatest(v_expected - p_counted_qty, 0) * v_unit_cost, 2), v_actor.id, nullif(trim(p_notes), '')
    );

    update public.inventory_location_stock
    set qty_available = round(p_counted_qty, 3), unit = v_unit,
        last_counted_at = now(), notes = nullif(trim(p_notes), ''), updated_at = now()
    where location_id = v_location_id and ingredient_id = p_item_id;
  end if;

  return v_check_id;
end;
$function$;

create or replace function public.inventory_loss_control_report(
  p_branch_id uuid default null,
  p_limit integer default 200
) returns table (
  check_id uuid,
  item_kind text,
  item_id uuid,
  item_name text,
  item_name_ar text,
  category_name text,
  branch_id uuid,
  branch_name text,
  period_started_at timestamptz,
  counted_at timestamptz,
  expected_qty numeric,
  counted_qty numeric,
  unaccounted_qty numeric,
  unit text,
  unit_cost_lyd numeric,
  unaccounted_cost_lyd numeric,
  counted_by_name text,
  notes text
)
language plpgsql stable security definer set search_path = public as $function$
declare v_actor public.profiles;
begin
  v_actor := public.inventory_loss_actor();
  if v_actor.id is null then raise exception 'Owner or supervisor access required'; end if;
  return query
  select c.id, c.item_kind, coalesce(c.product_id, c.ingredient_id),
         coalesce(p.name, i.name), coalesce(p.name_ar, i.name_ar),
         coalesce(cat.name, 'Ingredients'), c.branch_id, b.name,
         c.period_started_at, c.counted_at, c.expected_qty, c.counted_qty,
         c.unaccounted_qty, c.unit, c.unit_cost_lyd, c.unaccounted_cost_lyd,
         pr.full_name, c.notes
  from public.inventory_loss_checks c
  join public.pos_branches b on b.id = c.branch_id
  left join public.pos_products p on p.id = c.product_id
  left join public.pos_categories cat on cat.id = p.category_id
  left join public.ingredients i on i.id = c.ingredient_id
  left join public.profiles pr on pr.id = c.counted_by
  where c.unaccounted_qty > 0.001 and (p_branch_id is null or c.branch_id = p_branch_id)
  order by c.counted_at desc, c.unaccounted_cost_lyd desc nulls last
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$function$;

create or replace function public.inventory_loss_control_detail(p_check_id uuid)
returns table (
  event_at timestamptz,
  event_type text,
  quantity numeric,
  stock_after numeric,
  actor_name text,
  notes text
)
language plpgsql stable security definer set search_path = public as $function$
declare v_actor public.profiles; v_check public.inventory_loss_checks;
begin
  v_actor := public.inventory_loss_actor();
  if v_actor.id is null then raise exception 'Owner or supervisor access required'; end if;
  select * into v_check from public.inventory_loss_checks where id = p_check_id;
  if v_check.id is null then raise exception 'Loss check not found'; end if;

  if v_check.item_kind = 'product' then
    return query
    select m.created_at, m.movement_type, m.quantity, m.stock_after, p.full_name, m.notes
    from public.location_product_movements m
    left join public.profiles p on p.id = m.actor_profile_id
    where m.location_id = v_check.location_id and m.product_id = v_check.product_id
      and m.created_at >= v_check.period_started_at and m.created_at <= v_check.counted_at + interval '1 second'
    order by m.created_at desc;
  else
    return query
    select m.created_at, m.movement_type, m.quantity, m.stock_after, p.full_name, m.notes
    from public.inventory_location_stock_movements m
    left join public.profiles p on p.id = m.actor_profile_id
    where m.location_id = v_check.location_id and m.ingredient_id = v_check.ingredient_id
      and m.created_at >= v_check.period_started_at and m.created_at <= v_check.counted_at + interval '1 second'
    order by m.created_at desc;
  end if;
end;
$function$;

revoke all on function public.inventory_loss_actor() from public, anon, authenticated;
revoke all on function public.inventory_loss_count_items(uuid) from public, anon;
revoke all on function public.record_inventory_loss_count(uuid,text,uuid,numeric,text) from public, anon;
revoke all on function public.inventory_loss_control_report(uuid,integer) from public, anon;
revoke all on function public.inventory_loss_control_detail(uuid) from public, anon;
grant execute on function public.inventory_loss_count_items(uuid) to authenticated;
grant execute on function public.record_inventory_loss_count(uuid,text,uuid,numeric,text) to authenticated;
grant execute on function public.inventory_loss_control_report(uuid,integer) to authenticated;
grant execute on function public.inventory_loss_control_detail(uuid) to authenticated;

comment on table public.inventory_loss_checks is
  'Immutable expected-versus-physical snapshots used to identify unaccounted stock.';
