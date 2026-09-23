-- Make the physical-count picker useful before a stock row exists.
-- Products and ingredients can now establish their first safe baseline directly
-- from the Loss Control screen.

create or replace function public.inventory_loss_actor()
returns public.profiles
language sql stable security definer set search_path = public as $function$
  select p
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and p.role in ('owner', 'supervisor')
    and (p.role = 'owner' or coalesce(p.is_active, true))
  limit 1;
$function$;

create or replace function public.inventory_loss_count_items(p_branch_id uuid)
returns table(
  item_kind text,
  item_id uuid,
  item_name text,
  item_name_ar text,
  unit text,
  expected_qty numeric,
  ready_for_loss_check boolean,
  readiness_note text
) language plpgsql stable security definer set search_path = public as $function$
declare
  v_actor public.profiles;
begin
  v_actor := public.inventory_loss_actor();
  if v_actor.id is null then raise exception 'Owner or supervisor access required'; end if;
  if not exists (
    select 1 from public.pos_branches b
    where b.id = p_branch_id and b.is_active is true
  ) then
    raise exception 'Active branch not found';
  end if;

  return query
  with branch_location as (
    select l.id
    from public.inventory_locations l
    where l.branch_id = p_branch_id and l.location_type = 'branch' and l.is_active is true
    order by l.created_at limit 1
  )
  select 'product'::text, p.id, p.name, p.name_ar,
         coalesce(p.stock_base_unit, 'pc')::text, coalesce(lps.qty, 0)::numeric,
         true,
         null::text
  from public.pos_products p
  cross join branch_location bl
  left join public.location_product_stock lps
    on lps.location_id = bl.id and lps.product_id = p.id
  where (p.track_inventory is true or p.is_coffee_bean is true)
    and (
      p.branch_id = p_branch_id
      or p.branch_id is null
      or p_branch_id = any(coalesce(p.visible_branch_ids, '{}'::uuid[]))
      or lps.product_id is not null
    )
  union all
  select 'ingredient'::text, i.id, i.name, i.name_ar,
         coalesce(ils.unit, i.base_unit)::text,
         case when recipes.recipe_count > 0 then
           (coalesce(ils.qty_available, 0) - coalesce(usage.consumed, 0))::numeric
         else coalesce(ils.qty_available, 0)::numeric end,
         recipes.recipe_count > 0,
         case when recipes.recipe_count > 0 then null else 'Recipe link required' end
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

revoke all on function public.inventory_loss_count_items(uuid) from public;
grant execute on function public.inventory_loss_count_items(uuid) to authenticated;
