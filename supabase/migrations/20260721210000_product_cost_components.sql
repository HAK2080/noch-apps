-- Product-owned ingredient costing.
-- Automatic stock-item base cost wins; a manual component unit cost is the
-- fallback. The legacy product manual cost remains the fallback only when a
-- product has no configured components or coffee consumption.

alter table public.pos_products
  add column if not exists manual_cost_lyd numeric(14,3);

update public.pos_products
set manual_cost_lyd = coalesce(cost_price, cost_lyd)
where manual_cost_lyd is null;

create table if not exists public.pos_product_cost_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.pos_products(id) on delete cascade,
  inventory_product_id uuid references public.pos_products(id) on delete set null,
  custom_name text,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in ('pc', 'g', 'kg', 'ml', 'l')),
  manual_unit_cost_lyd numeric(14,6) check (manual_unit_cost_lyd is null or manual_unit_cost_lyd >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (inventory_product_id is not null or nullif(trim(custom_name), '') is not null),
  check (inventory_product_id is null or inventory_product_id <> product_id)
);

create index if not exists pos_product_cost_components_product_idx
  on public.pos_product_cost_components(product_id, sort_order);

create index if not exists pos_product_cost_components_inventory_product_idx
  on public.pos_product_cost_components(inventory_product_id)
  where inventory_product_id is not null;

alter table public.pos_product_cost_components enable row level security;

drop policy if exists pos_product_cost_components_read on public.pos_product_cost_components;
create policy pos_product_cost_components_read on public.pos_product_cost_components
  for select to authenticated using (true);

grant select on public.pos_product_cost_components to authenticated;

comment on table public.pos_product_cost_components is
  'Ingredients entered directly on a menu product for one-sale cost calculation.';
comment on column public.pos_product_cost_components.manual_unit_cost_lyd is
  'Cost per selected display unit, used only when the linked stock item has no positive base-unit cost.';

create or replace function public.recalculate_pos_product_cost(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.pos_products%rowtype;
  v_component_count integer := 0;
  v_incomplete_count integer := 0;
  v_coffee_incomplete integer := 0;
  v_component_cost numeric := 0;
  v_coffee_cost numeric := 0;
  v_resolved_cost numeric;
  v_source text;
begin
  select * into v_product
  from public.pos_products
  where id = p_product_id;

  if not found then
    raise exception 'Product not found';
  end if;

  select
    count(*),
    count(*) filter (
      where coalesce(source.stock_cost_per_base_unit, 0) <= 0
        and component.manual_unit_cost_lyd is null
    ),
    coalesce(sum(
      case
        when coalesce(source.stock_cost_per_base_unit, 0) > 0 then
          component.quantity
          * case component.unit when 'kg' then 1000 when 'l' then 1000 else 1 end
          * source.stock_cost_per_base_unit
        when component.manual_unit_cost_lyd is not null then
          component.quantity * component.manual_unit_cost_lyd
        else 0
      end
    ), 0)
  into v_component_count, v_incomplete_count, v_component_cost
  from public.pos_product_cost_components component
  left join public.pos_products source on source.id = component.inventory_product_id
  where component.product_id = p_product_id;

  if coalesce(v_product.coffee_grams_per_sale, 0) > 0 then
    select
      case when coalesce(bean.stock_cost_per_base_unit, 0) > 0
        then v_product.coffee_grams_per_sale * bean.stock_cost_per_base_unit
        else 0
      end,
      case when coalesce(bean.stock_cost_per_base_unit, 0) > 0 then 0 else 1 end
    into v_coffee_cost, v_coffee_incomplete
    from public.pos_products product
    left join public.pos_products bean on bean.id = v_product.coffee_bean_product_id
    where product.id = p_product_id;

    v_incomplete_count := v_incomplete_count + v_coffee_incomplete;
  end if;

  if v_product.is_coffee_bean
    and coalesce(v_product.stock_cost_per_base_unit, 0) > 0
    and coalesce(v_product.retail_pack_size_base_units, 0) > 0 then
    v_resolved_cost := v_product.stock_cost_per_base_unit * v_product.retail_pack_size_base_units;
    v_source := 'automatic';
  elsif v_component_count > 0 or coalesce(v_product.coffee_grams_per_sale, 0) > 0 then
    if v_incomplete_count > 0 then
      return jsonb_build_object(
        'status', 'incomplete',
        'incomplete_count', v_incomplete_count,
        'cost', null
      );
    end if;
    v_resolved_cost := v_component_cost + v_coffee_cost;
    v_source := 'automatic';
  else
    v_resolved_cost := v_product.manual_cost_lyd;
    v_source := case when v_resolved_cost is null then 'incomplete' else 'manual' end;
  end if;

  update public.pos_products
  set cost_price = case when v_resolved_cost is null then null else round(v_resolved_cost, 3) end,
      cost_lyd = case when v_resolved_cost is null then null else round(v_resolved_cost, 2) end,
      updated_at = now()
  where id = p_product_id;

  return jsonb_build_object(
    'status', v_source,
    'incomplete_count', v_incomplete_count,
    'cost', case when v_resolved_cost is null then null else round(v_resolved_cost, 3) end
  );
end;
$$;

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
      and profile.role in ('owner', 'accountant', 'data_entry')
      and coalesce(profile.is_active, true)
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
grant execute on function public.recalculate_pos_product_cost(uuid) to authenticated;

create or replace function public.recalculate_cost_component_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_pos_product_cost(coalesce(new.product_id, old.product_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists pos_product_cost_components_recalculate on public.pos_product_cost_components;
create trigger pos_product_cost_components_recalculate
after insert or update or delete on public.pos_product_cost_components
for each row execute function public.recalculate_cost_component_product();

create or replace function public.recalculate_products_using_stock_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  perform public.recalculate_pos_product_cost(new.id);

  for v_product_id in
    select component.product_id
    from public.pos_product_cost_components component
    where component.inventory_product_id = new.id
    union
    select product.id
    from public.pos_products product
    where product.coffee_bean_product_id = new.id
  loop
    perform public.recalculate_pos_product_cost(v_product_id);
  end loop;

  return new;
end;
$$;

drop trigger if exists pos_products_recalculate_stock_cost_dependents on public.pos_products;
create trigger pos_products_recalculate_stock_cost_dependents
after update of stock_cost_per_base_unit, retail_pack_size_base_units on public.pos_products
for each row
when (
  old.stock_cost_per_base_unit is distinct from new.stock_cost_per_base_unit
  or old.retail_pack_size_base_units is distinct from new.retail_pack_size_base_units
)
execute function public.recalculate_products_using_stock_cost();

create or replace function public.recalculate_product_own_composition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_pos_product_cost(new.id);
  return new;
end;
$$;

drop trigger if exists pos_products_recalculate_own_composition on public.pos_products;
create trigger pos_products_recalculate_own_composition
after update of coffee_grams_per_sale, coffee_bean_product_id, manual_cost_lyd on public.pos_products
for each row
when (
  old.coffee_grams_per_sale is distinct from new.coffee_grams_per_sale
  or old.coffee_bean_product_id is distinct from new.coffee_bean_product_id
  or old.manual_cost_lyd is distinct from new.manual_cost_lyd
)
execute function public.recalculate_product_own_composition();
