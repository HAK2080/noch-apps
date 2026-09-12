begin;
create table public.pos_global_settings (
  id boolean primary key default true check(id),
  block_unavailable_stock boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.pos_global_settings(id) values(true);
alter table public.pos_global_settings enable row level security;
create policy read_stock_policy on public.pos_global_settings for select to anon,authenticated using(true);
grant select on public.pos_global_settings to anon,authenticated;
revoke insert,update,delete on public.pos_global_settings from anon,authenticated;
create function public.set_global_stock_block(p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
declare v_actor uuid;
begin
  select id into v_actor from profiles where (id=auth.uid() or auth_user_id=auth.uid()) and role='owner';
  if v_actor is null then raise exception 'Owner access required'; end if;
  if p_enabled is null then raise exception 'Choose on or off'; end if;
  update pos_global_settings set block_unavailable_stock=p_enabled,updated_at=now(),updated_by=v_actor where id;
end $$;
revoke all on function public.set_global_stock_block(boolean) from public,anon;
grant execute on function public.set_global_stock_block(boolean) to authenticated;

create function public.strict_stock_enabled() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select block_unavailable_stock from pos_global_settings where id),true)
$$;
revoke all on function public.strict_stock_enabled() from public,anon,authenticated;

-- Only stock that is actually consumed by the sale qualifies. Cost-only recipes do not.
create function public.sale_stock_requirements(p_items jsonb)
returns table(product_id uuid,qty numeric)
language sql stable security definer set search_path=public as $$
  with items as (select p.*, (i->>'quantity')::numeric units
    from jsonb_array_elements(p_items) i join pos_products p on p.id=(i->>'product_id')::uuid),
  needs as (
    select id product_id,units qty from items where track_inventory
    union all
    select coffee_bean_product_id,round(units*coffee_grams_per_sale,3) from items
    where coffee_bean_product_id is not null and coffee_grams_per_sale>0
  ) select product_id,sum(qty) from needs group by product_id
$$;
revoke all on function public.sale_stock_requirements(jsonb) from public,anon,authenticated;

create function public.assert_sale_stock(p_branch uuid,p_items jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v_item jsonb; v_product pos_products; v_location uuid; v_need record; v_stock numeric;
begin
  if not strict_stock_enabled() then return; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from pos_products where id=(v_item->>'product_id')::uuid;
    if not found or not coalesce(v_product.is_active,false) or coalesce(v_product.is_sold_out,false) then
      raise exception 'STOCK_BLOCKED: Product is unavailable';
    end if;
    if (v_item->>'quantity') is null or (v_item->>'quantity')::numeric<=0
      or (v_item->>'quantity')::numeric::text in ('NaN','Infinity','-Infinity') then
      raise exception 'STOCK_BLOCKED: Invalid sale quantity';
    end if;
    if not coalesce(v_product.track_inventory,false)
      and not (v_product.coffee_bean_product_id is not null and coalesce(v_product.coffee_grams_per_sale,0)>0) then
      raise exception 'STOCK_BLOCKED: Set up stock for % before selling',v_product.name;
    end if;
  end loop;
  select id into v_location from inventory_locations where branch_id=p_branch and location_type='branch' and is_active order by created_at,id limit 1;
  if v_location is null then raise exception 'STOCK_BLOCKED: Set up branch stock first'; end if;
  -- Locks are held through checkout and the existing inventory-consumption triggers.
  for v_need in select * from sale_stock_requirements(p_items) order by product_id loop
    select qty into v_stock from location_product_stock where location_id=v_location and product_id=v_need.product_id for update;
    if not found or v_stock<v_need.qty or v_stock<=0 then
      raise exception 'STOCK_BLOCKED: Insufficient stock for %', (select name from pos_products where id=v_need.product_id);
    end if;
  end loop;
end $$;
revoke all on function public.assert_sale_stock(uuid,jsonb) from public,anon,authenticated;

create function public.guard_order_item_stock() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_order pos_orders; v_items jsonb;
begin
  if not strict_stock_enabled() then return new; end if;
  select * into v_order from pos_orders where id=new.order_id;
  if tg_op='UPDATE' then
    if new.product_id is distinct from old.product_id or new.quantity is distinct from old.quantity or new.order_id is distinct from old.order_id then
      raise exception 'STOCK_BLOCKED: Refund and create a new sale to change sold quantities';
    end if;
    return new;
  end if;
  v_items:=jsonb_build_array(jsonb_build_object('product_id',new.product_id,'quantity',new.quantity));
  if v_order.status<>'completed' then
    select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity)),'[]'::jsonb)||v_items
      into v_items from pos_order_items where order_id=new.order_id;
  end if;
  perform assert_sale_stock(v_order.branch_id,v_items);
  return new;
end $$;
create trigger pos_order_items_guard_stock before insert or update of product_id,quantity,order_id on pos_order_items
  for each row execute function guard_order_item_stock();

-- Pending online orders are checked again at completion. Their tracked products
-- previously had no consumption path; use the canonical movement mirror.
create function public.guard_order_completion_stock() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_items jsonb; v_item record;
begin
  if old.status='completed' or new.status<>'completed' or not strict_stock_enabled() then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity-coalesce(refunded_qty,0)))
    filter(where quantity>coalesce(refunded_qty,0)),'[]'::jsonb) into v_items from pos_order_items where order_id=new.id;
  perform assert_sale_stock(new.branch_id,v_items);
  for v_item in select i.product_id,sum(i.quantity-coalesce(i.refunded_qty,0)) qty
    from pos_order_items i join pos_products p on p.id=i.product_id
    where i.order_id=new.id and p.track_inventory and i.quantity>coalesce(i.refunded_qty,0) group by i.product_id loop
    insert into pos_inventory_movements(branch_id,product_id,movement_type,quantity,stock_before,stock_after,reference_id,notes)
      values(new.branch_id,v_item.product_id,'sale',-v_item.qty,0,0,new.id,'Stock-controlled order completion');
  end loop;
  return new;
end $$;
create trigger pos_orders_guard_completion_stock before update of status on pos_orders
  for each row execute function guard_order_completion_stock();

-- Enforce at the actual ledger write too (coffee and tracked goods). An exception
-- rolls back the entire sale; waste and physical stock corrections remain possible.
create function public.guard_sale_stock_movement() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if strict_stock_enabled() and new.movement_type in ('sale','sale_consumption') and new.quantity<0 and new.stock_after<0 then
    raise exception 'STOCK_BLOCKED: Sale exceeds available stock';
  end if;
  return new;
end $$;
create trigger location_product_movements_guard_sale before insert on location_product_movements
  for each row execute function guard_sale_stock_movement();

-- Never trust a stale/offline client's track_inventory flag. Preserve each installed
-- RPC's signature and loyalty logic, changing only this legacy inventory condition.
do $$
declare v_function record; v_definition text; v_count int:=0;
begin
  for v_function in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'create_pos_order%' and p.prokind='f' loop
    v_definition:=pg_get_functiondef(v_function.oid);
    if position('coalesce((v_item->>''track_inventory'')::boolean, false)' in v_definition)>0 then
      execute replace(v_definition,'coalesce((v_item->>''track_inventory'')::boolean, false)',
        'coalesce((select track_inventory from public.pos_products where id = (v_item->>''product_id'')::uuid), false)');
      v_count:=v_count+1;
    end if;
  end loop;
  if v_count=0 then raise exception 'Could not locate POS inventory condition; migration needs review'; end if;
end $$;

-- Public availability exposes saleability, not stock quantities or costs.
create function public.get_sale_availability(p_branch uuid)
returns table(product_id uuid,blocked boolean,reason text)
language sql stable security definer set search_path=public as $$
  with location as (select id from inventory_locations where branch_id=p_branch and location_type='branch' and is_active order by created_at,id limit 1),
  products as (select p.*, case
    when not coalesce(p.track_inventory,false) and not (p.coffee_bean_product_id is not null and coalesce(p.coffee_grams_per_sale,0)>0) then 'Stock not set up'
    when not exists(select 1 from location) then 'Branch stock not set up'
    when exists(select 1 from sale_stock_requirements(jsonb_build_array(jsonb_build_object('product_id',p.id,'quantity',1))) n
      left join location_product_stock s on s.location_id=(select id from location) and s.product_id=n.product_id
      where coalesce(s.qty,0)<n.qty or coalesce(s.qty,0)<=0) then 'Out of stock'
    else null end stock_reason
    from pos_products p where p.is_active and (p_branch is null or p.branch_id=p_branch or p.branch_id is null or p_branch=any(p.visible_branch_ids)))
  select id,coalesce(is_sold_out,false) or (strict_stock_enabled() and stock_reason is not null),
    case when is_sold_out then 'Sold out' when strict_stock_enabled() then stock_reason else null end from products
$$;
revoke all on function public.get_sale_availability(uuid) from public;
grant execute on function public.get_sale_availability(uuid) to anon,authenticated;
commit;
