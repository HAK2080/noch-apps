-- Owner authority is independent from the employee active/paused flag.
-- Active status still gates delegated cost access for accountants and data entry.
create or replace function public.replace_pos_product_cost_components(
  p_product_id uuid,
  p_components jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.profiles profile
    where (profile.id = auth.uid() or profile.auth_user_id = auth.uid())
      and (
        profile.role = 'owner'
        or (
          profile.role in ('accountant', 'data_entry')
          and coalesce(profile.is_active, true)
        )
      )
  ) then
    raise exception 'You do not have permission to update product costs';
  end if;

  if not exists (select 1 from public.pos_products where id = p_product_id) then
    raise exception 'Product not found';
  end if;

  delete from public.pos_product_cost_components
  where product_id = p_product_id;

  insert into public.pos_product_cost_components (
    product_id,
    inventory_product_id,
    custom_name,
    quantity,
    unit,
    manual_unit_cost_lyd,
    sort_order
  )
  select
    p_product_id,
    nullif(component.inventory_product_id, '')::uuid,
    nullif(trim(component.custom_name), ''),
    component.quantity,
    lower(component.unit),
    component.manual_unit_cost_lyd,
    component.sort_order
  from jsonb_to_recordset(coalesce(p_components, '[]'::jsonb)) as component(
    inventory_product_id text,
    custom_name text,
    quantity numeric,
    unit text,
    manual_unit_cost_lyd numeric,
    sort_order integer
  );

  v_result := public.recalculate_pos_product_cost(p_product_id);
  if v_result->>'status' = 'incomplete' then
    raise exception 'Every ingredient needs an automatic inventory cost or a manual unit cost';
  end if;

  return v_result;
end;
$$;

grant execute on function public.replace_pos_product_cost_components(uuid, jsonb) to authenticated;
