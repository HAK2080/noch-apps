-- Fresh stock start: preserve historical sales, clear only negative balances,
-- and do not manufacture stock from sales/refunds before a real branch upload.

create table if not exists public.inventory_stock_fresh_start_log (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  source_table text not null,
  location_id uuid,
  product_id uuid not null references public.pos_products(id),
  before_qty numeric(14,3) not null,
  after_qty numeric(14,3) not null default 0,
  reason text not null
);

alter table public.inventory_stock_fresh_start_log enable row level security;

do $reset$
declare
  v_row record;
  v_log_id uuid;
begin
  for v_row in
    select location_id, product_id, qty
    from public.location_product_stock where qty < 0
    order by location_id, product_id for update
  loop
    insert into public.inventory_stock_fresh_start_log
      (source_table, location_id, product_id, before_qty, reason)
    values ('location_product_stock', v_row.location_id, v_row.product_id,
      v_row.qty, 'Negative balance before reliable stock upload')
    returning id into v_log_id;

    update public.location_product_stock
    set qty = 0, updated_at = now()
    where location_id = v_row.location_id and product_id = v_row.product_id;

    insert into public.location_product_movements
      (location_id, product_id, movement_type, quantity, stock_before,
       stock_after, notes, source, source_ref, created_at)
    values (v_row.location_id, v_row.product_id, 'opening_reset', -v_row.qty,
      v_row.qty, 0, 'Fresh start: historical negative balance cleared; no stock received',
      'inventory_fresh_start', v_log_id::text, clock_timestamp());

    perform public.sync_product_branch_stock_total(v_row.product_id);
  end loop;

  -- A legacy catalogue total can be negative even when location tracking is off.
  for v_row in
    select p.id, p.stock_qty
    from public.pos_products p
    where p.stock_qty < 0 and p.track_inventory is not true
    order by p.id for update
  loop
    insert into public.inventory_stock_fresh_start_log
      (source_table, product_id, before_qty, reason)
    values ('pos_products', v_row.id, v_row.stock_qty,
      'Legacy untracked catalogue balance cleared')
    returning id into v_log_id;

    update public.pos_products
    set stock_qty = 0, updated_at = now()
    where id = v_row.id;
  end loop;
end;
$reset$;

-- Both existing sale writers update the location balance and then insert the
-- movement. Normalize that movement in one place, correcting the balance in
-- the same transaction. Zero-quantity movements keep the attempted sale visible.
create or replace function public.normalize_unstocked_product_movement()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_applied numeric;
  v_remaining numeric;
  v_order_ref uuid;
  v_cutover timestamptz;
  v_original numeric := new.quantity;
begin
  if new.movement_type not in
    ('sale', 'sale_consumption', 'refund', 'void', 'refund_reversal', 'void_reversal')
  then return new; end if;

  -- If strict blocking is enabled later, the existing guard must still reject
  -- overselling instead of silently turning the sale into an untracked sale.
  if new.quantity < 0 and public.strict_stock_enabled() then return new; end if;

  if new.quantity < 0 then
    v_applied := -least(-new.quantity, greatest(coalesce(new.stock_before, 0), 0));
  elsif new.quantity > 0 then
    select max(created_at) into v_cutover
    from public.location_product_movements
    where location_id = new.location_id and product_id = new.product_id
      and movement_type = 'opening_reset';

    if new.order_item_id is not null then
      select greatest(0, -coalesce(sum(m.quantity), 0)) into v_remaining
      from public.location_product_movements m
      where m.location_id = new.location_id and m.product_id = new.product_id
        and m.order_item_id = new.order_item_id
        and m.movement_type in ('sale_consumption', 'refund_reversal', 'void_reversal')
        and (v_cutover is null or m.created_at > v_cutover);
    elsif new.source = 'legacy_pos_mirror' and new.source_ref is not null then
      select pm.reference_id into v_order_ref
      from public.pos_inventory_movements pm where pm.id::text = new.source_ref;

      select greatest(0, -coalesce(sum(m.quantity), 0)) into v_remaining
      from public.location_product_movements m
      join public.pos_inventory_movements pm
        on pm.id::text = m.source_ref
      where m.location_id = new.location_id and m.product_id = new.product_id
        and m.source = 'legacy_pos_mirror'
        and pm.reference_id = v_order_ref
        and m.movement_type in ('sale', 'refund', 'void')
        and (v_cutover is null or m.created_at > v_cutover);
    end if;
    v_applied := least(new.quantity, coalesce(v_remaining, 0));
  else
    return new;
  end if;

  if v_applied is distinct from v_original then
    new.quantity := v_applied;
    new.stock_after := greatest(0, new.stock_before + v_applied);
    new.notes := concat_ws(' | ', nullif(new.notes, ''),
      'Fresh-stock tracking: requested ' || v_original || ', recorded ' || v_applied);
    update public.location_product_stock
      set qty = new.stock_after, updated_at = now()
      where location_id = new.location_id and product_id = new.product_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists a_normalize_unstocked_product_movement
  on public.location_product_movements;
create trigger a_normalize_unstocked_product_movement
before insert on public.location_product_movements
for each row execute function public.normalize_unstocked_product_movement();

create or replace function public.sync_coffee_stock_after_movement()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if new.movement_type in ('sale_consumption', 'refund_reversal', 'void_reversal') then
    perform public.sync_product_branch_stock_total(new.product_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_coffee_stock_after_movement
  on public.location_product_movements;
create trigger sync_coffee_stock_after_movement
after insert on public.location_product_movements
for each row execute function public.sync_coffee_stock_after_movement();

-- A receipt/transfer is the start of a reliable branch stock period. A reset
-- is deliberately not a receipt. Ingredient stock must also have an upload.
create or replace function public.inventory_loss_has_stock_upload(
  p_location_id uuid, p_item_kind text, p_item_id uuid
) returns boolean language plpgsql stable security definer set search_path = public as $function$
declare v_cutover timestamptz;
begin
  if p_item_kind = 'product' then
    select max(created_at) into v_cutover
    from public.location_product_movements
    where location_id = p_location_id and product_id = p_item_id
      and movement_type = 'opening_reset';
    return exists (
      select 1 from public.location_product_movements m
      where m.location_id = p_location_id and m.product_id = p_item_id
        and m.movement_type in ('branch_receipt', 'transfer_in')
        and m.quantity > 0
        and (v_cutover is null or m.created_at > v_cutover)
    );
  elsif p_item_kind = 'ingredient' then
    return exists (
      select 1 from public.inventory_location_stock_movements m
      where m.location_id = p_location_id and m.ingredient_id = p_item_id
        and m.movement_type in ('receipt', 'adjustment', 'physical_count')
        and m.quantity > 0
    );
  end if;
  return false;
end;
$function$;

create or replace function public.inventory_loss_count_items(p_branch_id uuid)
returns table(
  item_kind text, item_id uuid, item_name text, item_name_ar text,
  unit text, expected_qty numeric, ready_for_loss_check boolean, readiness_note text
) language plpgsql stable security definer set search_path = public as $function$
declare v_actor public.profiles;
begin
  v_actor := public.inventory_loss_actor();
  if v_actor.id is null then raise exception 'Owner or supervisor access required'; end if;
  if not exists (select 1 from public.pos_branches b
                 where b.id = p_branch_id and b.is_active is true) then
    raise exception 'Active branch not found';
  end if;

  return query
  with branch_location as (
    select l.id from public.inventory_locations l
    where l.branch_id = p_branch_id and l.location_type = 'branch' and l.is_active is true
    order by l.created_at limit 1
  )
  select 'product'::text, p.id, p.name, p.name_ar,
         coalesce(p.stock_base_unit, 'pc')::text, coalesce(lps.qty, 0)::numeric,
         public.inventory_loss_has_stock_upload(bl.id, 'product', p.id),
         case when public.inventory_loss_has_stock_upload(bl.id, 'product', p.id)
           then null::text else 'Stock upload required'::text end
  from public.pos_products p
  cross join branch_location bl
  left join public.location_product_stock lps
    on lps.location_id = bl.id and lps.product_id = p.id
  where (p.track_inventory is true or p.is_coffee_bean is true)
    and (p.branch_id = p_branch_id or p.branch_id is null
      or p_branch_id = any(coalesce(p.visible_branch_ids, '{}'::uuid[]))
      or lps.product_id is not null)
  union all
  select 'ingredient'::text, i.id, i.name, i.name_ar,
         coalesce(ils.unit, i.base_unit)::text,
         case when recipes.recipe_count > 0 then
           (coalesce(ils.qty_available, 0) - coalesce(usage.consumed, 0))::numeric
         else coalesce(ils.qty_available, 0)::numeric end,
         recipes.recipe_count > 0
           and public.inventory_loss_has_stock_upload(bl.id, 'ingredient', i.id),
         case when recipes.recipe_count = 0 then 'Recipe link required'::text
           when not public.inventory_loss_has_stock_upload(bl.id, 'ingredient', i.id)
           then 'Stock upload required'::text else null::text end
  from public.ingredients i
  cross join branch_location bl
  left join public.inventory_location_stock ils
    on ils.location_id = bl.id and ils.ingredient_id = i.id
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
  where coalesce(i.archived, false) is false
  order by 1, 3;
end;
$function$;

create or replace function public.guard_inventory_loss_stock_upload()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if not public.inventory_loss_has_stock_upload(
    new.location_id, new.item_kind, coalesce(new.product_id, new.ingredient_id)) then
    raise exception 'Upload stock before starting loss checks';
  end if;
  return new;
end;
$function$;

drop trigger if exists inventory_loss_checks_require_stock_upload
  on public.inventory_loss_checks;
create trigger inventory_loss_checks_require_stock_upload
before insert on public.inventory_loss_checks
for each row execute function public.guard_inventory_loss_stock_upload();

-- Owners/supervisors can upload a tracked branch product even when it is hidden
-- from the sales catalogue (for example Ghadamis beans). Inactive stays inactive.
create or replace function public.inventory_loss_upload_product_stock(
  p_branch_id uuid, p_product_id uuid, p_quantity numeric, p_unit text
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_actor public.profiles;
  v_product public.pos_products;
  v_location_id uuid;
  v_base_unit text;
  v_input_unit text;
  v_factor numeric;
  v_received numeric;
  v_before numeric;
  v_after numeric;
  v_movement_id uuid;
begin
  v_actor := public.inventory_loss_actor();
  if v_actor.id is null then raise exception 'Owner or supervisor access required'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then
    raise exception 'Enter a positive stock quantity';
  end if;
  if not exists (select 1 from public.pos_branches
                 where id = p_branch_id and is_active is true) then
    raise exception 'Active branch not found';
  end if;

  select p.* into v_product from public.pos_products p
  where p.id = p_product_id and (p.track_inventory is true or p.is_coffee_bean is true)
    and (p.branch_id = p_branch_id or p.branch_id is null
      or p_branch_id = any(coalesce(p.visible_branch_ids, '{}'::uuid[]))
      or exists (select 1 from public.location_product_stock s
                 join public.inventory_locations l on l.id = s.location_id
                 where l.branch_id = p_branch_id and s.product_id = p.id))
  for update;
  if v_product.id is null then raise exception 'Tracked product not found for this branch'; end if;

  select id into v_location_id from public.inventory_locations
  where branch_id = p_branch_id and location_type = 'branch' and is_active is true
  order by created_at limit 1;
  if v_location_id is null then raise exception 'Active branch stock location not found'; end if;

  v_base_unit := lower(coalesce(v_product.stock_base_unit, 'pc'));
  v_input_unit := lower(coalesce(nullif(trim(p_unit), ''), v_base_unit));
  if v_input_unit = v_base_unit then v_factor := 1;
  elsif (v_base_unit = 'g' and v_input_unit = 'kg')
     or (v_base_unit = 'ml' and v_input_unit = 'l') then v_factor := 1000;
  else raise exception 'Use a compatible stock unit'; end if;
  v_received := round(p_quantity * v_factor, 3);

  insert into public.location_product_stock(location_id, product_id, qty, updated_at)
  values (v_location_id, p_product_id, 0, now())
  on conflict (location_id, product_id) do nothing;
  select qty into v_before from public.location_product_stock
  where location_id = v_location_id and product_id = p_product_id for update;
  v_after := v_before + v_received;
  update public.location_product_stock set qty = v_after, updated_at = now()
  where location_id = v_location_id and product_id = p_product_id;
  insert into public.location_product_movements
    (location_id, product_id, movement_type, quantity, stock_before, stock_after,
     actor_profile_id, notes, source, entered_quantity, entered_unit, created_at)
  values (v_location_id, p_product_id, 'branch_receipt', v_received, v_before, v_after,
    v_actor.id, 'Stock uploaded for branch loss tracking',
    'loss_control_upload', round(p_quantity, 3), v_input_unit, clock_timestamp())
  returning id into v_movement_id;
  perform public.sync_product_branch_stock_total(p_product_id);
  return jsonb_build_object('movement_id', v_movement_id,
    'stock_before', v_before, 'stock_after', v_after, 'received_base', v_received,
    'base_unit', v_base_unit);
end;
$function$;

revoke all on function public.inventory_loss_upload_product_stock(uuid,uuid,numeric,text)
  from public, anon;
grant execute on function public.inventory_loss_upload_product_stock(uuid,uuid,numeric,text)
  to authenticated;
