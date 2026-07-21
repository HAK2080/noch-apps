-- Central warehouse product stock and branch transfer workflow.
--
-- 1. Seeds one 'Central Warehouse' inventory_locations row and one 'branch'
--    location per pos_branches row (idempotent). Warehouse stock is
--    PRODUCT-level in location_product_stock; branch stock stays
--    pos_products.stock_qty (the POS source of truth). Products are global
--    since 20260501080000, so a transfer receipt updates the product row
--    and logs a pos_inventory_movements row at the receiving branch.
-- 2. inventory_transfers is the warehouse audit trail (no separate warehouse
--    movement log in v1). In-transit quantity is COMPUTED by the
--    inventory_in_transit view (sum shipped - sum received), never stored.
-- 3. request_transfer / ship_transfer / receive_transfer / report_waste RPCs.
--    Ship and receive use the same atomic update ... returning idiom as
--    create_pos_order. All writes to inventory_transfers and
--    location_product_stock go through the RPCs (RLS: read authenticated,
--    no direct write grants).

-- ── 1. Seed locations (idempotent) ──────────────────────────────────────────
insert into inventory_locations (name, location_type)
select 'Central Warehouse', 'warehouse'
where not exists (
  select 1 from inventory_locations where location_type = 'warehouse'
);

insert into inventory_locations (branch_id, name, location_type)
select b.id, b.name, 'branch'
from pos_branches b
where not exists (
  select 1 from inventory_locations l where l.branch_id = b.id
);

-- ── 2. Product-level stock per location ──────────────────────────────────────
create table public.location_product_stock (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references inventory_locations(id) on delete cascade,
  product_id uuid not null references pos_products(id),
  qty numeric(12,3) not null default 0 check (qty >= 0),
  updated_at timestamptz default now(),
  unique (location_id, product_id)
);

-- ── 3. Transfers (warehouse audit trail) ─────────────────────────────────────
create table public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references pos_products(id),
  from_location_id uuid not null references inventory_locations(id),
  to_location_id uuid not null references inventory_locations(id),
  qty_requested numeric(12,3) not null check (qty_requested > 0),
  qty_shipped numeric(12,3),
  qty_received numeric(12,3),
  status text not null default 'requested'
    check (status in ('requested','shipped','received','partial','cancelled')),
  discrepancy_reason text,
  note text,
  requested_by uuid references profiles(id),
  requested_at timestamptz default now(),
  shipped_by uuid references profiles(id),
  shipped_at timestamptz,
  received_by uuid references profiles(id),
  received_at timestamptz
);

create index inventory_transfers_status_idx
  on public.inventory_transfers(status);
create index inventory_transfers_to_location_status_idx
  on public.inventory_transfers(to_location_id, status);

-- ── 4. Per-branch par levels ─────────────────────────────────────────────────
create table public.pos_product_branch_par (
  branch_id uuid not null references pos_branches(id),
  product_id uuid not null references pos_products(id),
  min_qty numeric(10,2) default 0,
  target_qty numeric(10,2) default 0,
  primary key (branch_id, product_id)
);

-- ── 5. In-transit view (computed, never stored) ──────────────────────────────
create or replace view public.inventory_in_transit as
select
  t.product_id,
  p.name as product_name,
  t.from_location_id,
  t.to_location_id,
  sum(t.qty_shipped - coalesce(t.qty_received, 0)) as qty_in_transit
from inventory_transfers t
join pos_products p on p.id = t.product_id
where t.status in ('shipped','partial')
group by t.product_id, p.name, t.from_location_id, t.to_location_id
having sum(t.qty_shipped - coalesce(t.qty_received, 0)) > 0;

-- ── 6. Request a transfer (any authenticated staff) ─────────────────────────
-- from_location is always the single warehouse location.
create or replace function public.request_transfer(
  p_product_id uuid,
  p_to_location_id uuid,
  p_qty numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_warehouse_id uuid;
  v_transfer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be positive';
  end if;

  select id into v_warehouse_id
    from inventory_locations
   where location_type = 'warehouse'
   order by created_at
   limit 1;
  if v_warehouse_id is null then
    raise exception 'no warehouse location configured';
  end if;
  if v_warehouse_id = p_to_location_id then
    raise exception 'destination cannot be the warehouse';
  end if;

  insert into inventory_transfers (
    product_id, from_location_id, to_location_id, qty_requested, note, requested_by
  ) values (
    p_product_id, v_warehouse_id, p_to_location_id, p_qty, p_note, auth.uid()
  )
  returning id into v_transfer_id;

  return v_transfer_id;
end;
$$;

grant execute on function public.request_transfer(uuid, uuid, numeric, text) to authenticated;

-- ── 7. Ship a transfer (owner/supervisor only) ───────────────────────────────
-- Atomically decrements warehouse stock; raises when the row is missing or
-- the on-hand qty cannot cover the shipment.
create or replace function public.ship_transfer(
  p_transfer_id uuid,
  p_qty numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer inventory_transfers;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('owner','supervisor')) then
    raise exception 'owner or supervisor only';
  end if;

  select * into v_transfer from inventory_transfers where id = p_transfer_id for update;
  if not found then raise exception 'transfer not found'; end if;
  if v_transfer.status <> 'requested' then
    raise exception 'transfer is not in requested status';
  end if;
  if p_qty is null or p_qty <= 0 or p_qty > v_transfer.qty_requested then
    raise exception 'qty must be > 0 and <= qty requested';
  end if;

  -- Make sure a stock row exists, then take the qty conditionally so a
  -- concurrent ship cannot drive qty below zero.
  insert into location_product_stock (location_id, product_id, qty)
  values (v_transfer.from_location_id, v_transfer.product_id, 0)
  on conflict (location_id, product_id) do nothing;

  update location_product_stock
     set qty = qty - p_qty,
         updated_at = now()
   where location_id = v_transfer.from_location_id
     and product_id = v_transfer.product_id
     and qty >= p_qty;
  if not found then
    raise exception 'insufficient warehouse stock';
  end if;

  update inventory_transfers
     set qty_shipped = p_qty,
         status = 'shipped',
         shipped_by = auth.uid(),
         shipped_at = now()
   where id = p_transfer_id;

  return p_transfer_id;
end;
$$;

grant execute on function public.ship_transfer(uuid, numeric) to authenticated;

-- ── 8. Receive a transfer (any authenticated staff) ─────────────────────────
-- When the destination location is linked to a branch, the received qty is
-- added to pos_products.stock_qty (global product row) and a
-- pos_inventory_movements 'transfer_in' row is logged at that branch using
-- the same update ... returning idiom as create_pos_order. A short receipt
-- (qty_received < qty_shipped) closes the transfer as 'partial' and requires
-- a discrepancy reason.
create or replace function public.receive_transfer(
  p_transfer_id uuid,
  p_qty_received numeric,
  p_discrepancy_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer inventory_transfers;
  v_branch_id uuid;
  v_stock_before numeric;
  v_stock_after numeric;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_transfer from inventory_transfers where id = p_transfer_id for update;
  if not found then raise exception 'transfer not found'; end if;
  if v_transfer.status <> 'shipped' then
    raise exception 'transfer is not in shipped status';
  end if;
  if p_qty_received is null or p_qty_received < 0 or p_qty_received > v_transfer.qty_shipped then
    raise exception 'qty received must be >= 0 and <= qty shipped';
  end if;
  if p_qty_received < v_transfer.qty_shipped
     and nullif(trim(coalesce(p_discrepancy_reason, '')), '') is null then
    raise exception 'discrepancy reason is required for a partial receipt';
  end if;

  select l.branch_id into v_branch_id
    from inventory_locations l
   where l.id = v_transfer.to_location_id;

  if v_branch_id is not null then
    update pos_products
       set stock_qty = coalesce(stock_qty, 0) + p_qty_received,
           updated_at = now()
     where id = v_transfer.product_id
    returning stock_qty - p_qty_received, stock_qty
      into v_stock_before, v_stock_after;
    if not found then
      raise exception 'product not found';
    end if;

    insert into pos_inventory_movements (
      branch_id, product_id, movement_type, quantity, stock_before, stock_after, reference_id, notes
    ) values (
      v_branch_id, v_transfer.product_id, 'transfer_in',
      p_qty_received, v_stock_before, v_stock_after,
      p_transfer_id, 'Transfer received'
    );
  end if;

  update inventory_transfers
     set qty_received = p_qty_received,
         status = case when p_qty_received = v_transfer.qty_shipped then 'received' else 'partial' end,
         discrepancy_reason = case
           when p_qty_received = v_transfer.qty_shipped then null
           else p_discrepancy_reason
         end,
         received_by = auth.uid(),
         received_at = now()
   where id = p_transfer_id;

  return p_transfer_id;
end;
$$;

grant execute on function public.receive_transfer(uuid, numeric, text) to authenticated;

-- ── 9. Report waste at a branch (any authenticated staff) ───────────────────
-- Decrements pos_products.stock_qty, never below zero; the movement logs the
-- true before/after (after is the clamped value actually stored).
create or replace function public.report_waste(
  p_branch_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_before numeric;
  v_stock_after numeric;
  v_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be positive';
  end if;
  if p_reason not in ('used','damaged','lost','thrown_away','expired','staff_meal','count_correction') then
    raise exception 'invalid waste reason';
  end if;

  select coalesce(stock_qty, 0) into v_stock_before
    from pos_products
   where id = p_product_id
   for update;
  if not found then
    raise exception 'product not found';
  end if;

  update pos_products
     set stock_qty = greatest(0, v_stock_before - p_qty),
         updated_at = now()
   where id = p_product_id
  returning stock_qty into v_stock_after;

  insert into pos_inventory_movements (
    branch_id, product_id, movement_type, quantity, stock_before, stock_after, notes
  ) values (
    p_branch_id, p_product_id, p_reason,
    -p_qty, v_stock_before, v_stock_after,
    p_note
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

grant execute on function public.report_waste(uuid, uuid, numeric, text, text) to authenticated;

-- ── 10. RLS ──────────────────────────────────────────────────────────────────
alter table public.location_product_stock enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.pos_product_branch_par enable row level security;

-- Transfers and warehouse stock are read-only for staff; every write goes
-- through the security-definer RPCs above (no insert/update/delete policies).
create policy "location_product_stock_read" on public.location_product_stock
  for select to authenticated
  using (true);

create policy "inventory_transfers_read" on public.inventory_transfers
  for select to authenticated
  using (true);

-- Par levels: read by staff, written by owner/supervisor.
create policy "pos_product_branch_par_read" on public.pos_product_branch_par
  for select to authenticated
  using (true);

create policy "pos_product_branch_par_owner_insert" on public.pos_product_branch_par
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')));

create policy "pos_product_branch_par_owner_update" on public.pos_product_branch_par
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')));

create policy "pos_product_branch_par_owner_delete" on public.pos_product_branch_par
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')));

grant select on public.location_product_stock to authenticated;
grant select on public.inventory_transfers to authenticated;
grant select on public.inventory_in_transit to authenticated;
grant select, insert, update, delete on public.pos_product_branch_par to authenticated;
