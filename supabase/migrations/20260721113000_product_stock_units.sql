-- Add explicit units to product stock while keeping all calculations in stable
-- base units: pieces, grams, or millilitres.

alter table public.pos_products
  add column if not exists stock_base_unit text not null default 'pc',
  add column if not exists stock_display_unit text not null default 'pc';

alter table public.pos_products
  drop constraint if exists pos_products_stock_base_unit_check,
  drop constraint if exists pos_products_stock_display_unit_check,
  drop constraint if exists pos_products_stock_unit_pair_check;

alter table public.pos_products
  add constraint pos_products_stock_base_unit_check
    check (stock_base_unit in ('pc', 'g', 'ml')),
  add constraint pos_products_stock_display_unit_check
    check (stock_display_unit in ('pc', 'g', 'kg', 'ml', 'l')),
  add constraint pos_products_stock_unit_pair_check check (
    (stock_base_unit = 'pc' and stock_display_unit = 'pc')
    or (stock_base_unit = 'g' and stock_display_unit in ('g', 'kg'))
    or (stock_base_unit = 'ml' and stock_display_unit in ('ml', 'l'))
  );

alter table public.pos_inventory_movements
  alter column branch_id drop not null,
  add column if not exists entered_quantity numeric(14,3),
  add column if not exists entered_unit text;

alter table public.pos_inventory_movements
  drop constraint if exists pos_inventory_movements_entered_unit_check;

alter table public.pos_inventory_movements
  add constraint pos_inventory_movements_entered_unit_check
    check (entered_unit is null or entered_unit in ('pc', 'g', 'kg', 'ml', 'l'));

alter table public.telegram_stock_requests
  add column if not exists unit text;

alter table public.telegram_stock_requests
  drop constraint if exists telegram_stock_requests_unit_check;

alter table public.telegram_stock_requests
  add constraint telegram_stock_requests_unit_check
    check (unit is null or unit in ('pc', 'g', 'kg', 'ml', 'l'));

drop function if exists public.receive_pos_product_stock(uuid, numeric, text, text, uuid);

create function public.receive_pos_product_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_source text default 'pos',
  p_source_ref text default null,
  p_actor_profile_id uuid default null,
  p_unit text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_product public.pos_products;
  v_existing public.pos_inventory_movements;
  v_actor uuid;
  v_input_unit text;
  v_input_base_unit text;
  v_base_unit text;
  v_display_unit text;
  v_factor numeric;
  v_base_quantity numeric(10,2);
  v_new_qty numeric(10,2);
  v_movement_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Received quantity must be greater than zero';
  end if;
  if p_source not in ('pos', 'telegram') then
    raise exception 'Invalid stock source';
  end if;

  v_actor := coalesce(p_actor_profile_id, auth.uid());

  select * into v_product
  from public.pos_products
  where id = p_product_id and is_active = true
  for update;

  if not found then
    raise exception 'Product not found or inactive';
  end if;

  if p_source = 'telegram' then
    if auth.role() <> 'service_role' then
      raise exception 'Telegram stock updates require the service role';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = v_actor
        and p.is_active is true
        and p.branch_id = v_product.branch_id
    ) then
      raise exception 'Employee is not active at this branch';
    end if;
  else
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_active is true
    ) then
      raise exception 'Your profile is inactive. Reactivate it before receiving stock';
    end if;

    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('owner', 'supervisor')
          or p.branch_id = v_product.branch_id
          or exists (
            select 1 from public.staff_branches sb
            where sb.user_id = p.id and sb.branch_id = v_product.branch_id
          )
        )
    ) then
      raise exception 'You cannot receive stock for this branch';
    end if;
  end if;

  if p_actor_profile_id is not null and not exists (
    select 1 from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.is_active is true
      and (
        actor.role in ('owner', 'supervisor')
        or actor.branch_id = v_product.branch_id
        or exists (
          select 1 from public.staff_branches actor_branch
          where actor_branch.user_id = actor.id
            and actor_branch.branch_id = v_product.branch_id
        )
      )
  ) then
    raise exception 'Stock reporter is not active at this branch';
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

  if v_product.track_inventory is not true and coalesce(v_product.stock_qty, 0) = 0 then
    v_base_unit := v_input_base_unit;
    v_display_unit := v_input_unit;
  else
    v_base_unit := coalesce(v_product.stock_base_unit, 'pc');
    v_display_unit := coalesce(v_product.stock_display_unit, v_base_unit);
    if v_input_base_unit <> v_base_unit then
      raise exception 'Use a unit compatible with this product stock';
    end if;
  end if;

  v_base_quantity := round((p_quantity * v_factor)::numeric, 2);
  v_new_qty := round((coalesce(v_product.stock_qty, 0) + v_base_quantity)::numeric, 2);

  if p_source_ref is not null then
    select * into v_existing
    from public.pos_inventory_movements
    where source = p_source and source_ref = p_source_ref
    limit 1;

    if found then
      return jsonb_build_object(
        'movement_id', v_existing.id,
        'product_id', v_product.id,
        'branch_id', v_product.branch_id,
        'stock_before', v_existing.stock_before,
        'stock_after', v_existing.stock_after,
        'quantity_received', coalesce(v_existing.entered_quantity, v_existing.quantity),
        'quantity_received_base', v_existing.quantity,
        'received_unit', coalesce(v_existing.entered_unit, v_base_unit),
        'stock_base_unit', v_base_unit,
        'stock_display_unit', v_display_unit,
        'duplicate', true
      );
    end if;
  end if;

  update public.pos_products
  set stock_qty = v_new_qty,
      stock_base_unit = v_base_unit,
      stock_display_unit = v_display_unit,
      track_inventory = true,
      updated_at = now()
  where id = v_product.id;

  insert into public.pos_inventory_movements (
    branch_id, product_id, movement_type, quantity,
    stock_before, stock_after, notes,
    actor_profile_id, source, source_ref,
    entered_quantity, entered_unit
  ) values (
    v_product.branch_id, v_product.id, 'restock', v_base_quantity,
    coalesce(v_product.stock_qty, 0), v_new_qty, 'Product stock received',
    v_actor, p_source, nullif(p_source_ref, ''),
    round(p_quantity::numeric, 3), v_input_unit
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'product_id', v_product.id,
    'branch_id', v_product.branch_id,
    'product_name', v_product.name,
    'product_name_ar', v_product.name_ar,
    'stock_before', coalesce(v_product.stock_qty, 0),
    'stock_after', v_new_qty,
    'quantity_received', round(p_quantity::numeric, 3),
    'quantity_received_base', v_base_quantity,
    'received_unit', v_input_unit,
    'stock_base_unit', v_base_unit,
    'stock_display_unit', v_display_unit,
    'duplicate', false
  );
exception
  when unique_violation then
    select * into v_existing
    from public.pos_inventory_movements
    where source = p_source and source_ref = p_source_ref
    limit 1;
    return jsonb_build_object(
      'movement_id', v_existing.id,
      'product_id', v_existing.product_id,
      'branch_id', v_existing.branch_id,
      'stock_before', v_existing.stock_before,
      'stock_after', v_existing.stock_after,
      'quantity_received', coalesce(v_existing.entered_quantity, v_existing.quantity),
      'quantity_received_base', v_existing.quantity,
      'received_unit', v_existing.entered_unit,
      'duplicate', true
    );
end;
$function$;

revoke all on function public.receive_pos_product_stock(uuid, numeric, text, text, uuid, text) from public, anon;
grant execute on function public.receive_pos_product_stock(uuid, numeric, text, text, uuid, text)
  to authenticated, service_role;
