-- Keep a manual POS stock adjustment and its audit movement in one database
-- transaction. Quantities use the product's stable base unit.

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
  v_product public.pos_products;
  v_before numeric(10,2);
  v_after numeric(10,2);
  v_movement_id uuid;
  v_actor public.profiles;
begin
  select p.*
    into v_actor
    from public.profiles p
   where (p.id = auth.uid() or p.auth_user_id = auth.uid())
     and coalesce(p.is_active, true)
     and p.role in ('owner', 'supervisor', 'staff', 'accountant', 'data_entry')
   limit 1;
  if v_actor.id is null then
    raise exception 'Active staff sign-in required';
  end if;
  if p_product_id is null or p_branch_id is null then
    raise exception 'Product and branch are required';
  end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'Stock quantity cannot be negative';
  end if;
  if v_actor.role not in ('owner', 'supervisor')
     and v_actor.branch_id is distinct from p_branch_id
     and not exists (
       select 1
       from public.staff_branches sb
       where sb.user_id = v_actor.id
         and sb.branch_id = p_branch_id
     ) then
    raise exception 'You cannot adjust stock for this branch';
  end if;

  select *
    into v_product
    from public.pos_products
   where id = p_product_id
     and is_active is true
     and (
       branch_id = p_branch_id
       or p_branch_id = any(coalesce(visible_branch_ids, '{}'::uuid[]))
     )
   for update;

  if not found then
    raise exception 'Product is not available at this branch';
  end if;

  v_before := round(coalesce(v_product.stock_qty, 0)::numeric, 2);
  v_after := round(p_new_quantity::numeric, 2);

  update public.pos_products
     set stock_qty = v_after,
         track_inventory = true,
         updated_at = now()
   where id = v_product.id;

  insert into public.pos_inventory_movements (
    branch_id,
    product_id,
    movement_type,
    quantity,
    stock_before,
    stock_after,
    notes,
    actor_profile_id,
    source,
    source_ref,
    entered_quantity,
    entered_unit
  ) values (
    p_branch_id,
    v_product.id,
    'adjustment',
    v_after - v_before,
    v_before,
    v_after,
    coalesce(nullif(trim(p_notes), ''), 'Manual adjustment'),
    v_actor.id,
    'pos',
    'adjustment:' || gen_random_uuid()::text,
    v_after - v_before,
    coalesce(v_product.stock_base_unit, 'pc')
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'product_id', v_product.id,
    'branch_id', p_branch_id,
    'stock_before', v_before,
    'stock_after', v_after,
    'stock_base_unit', coalesce(v_product.stock_base_unit, 'pc')
  );
end;
$function$;

revoke all on function public.adjust_pos_product_stock(uuid, uuid, numeric, text)
  from public, anon;
grant execute on function public.adjust_pos_product_stock(uuid, uuid, numeric, text)
  to authenticated, service_role;
