-- Warehouse stock intake + transfer cancellation.
--
-- 20260719180000 shipped request/ship/receive but no way to put stock INTO
-- the central warehouse, and no way to cancel a requested transfer (RLS is
-- read-only for clients). This adds both as RPCs (owner/supervisor only).

-- ── 1. Receive stock into the central warehouse ──────────────────────────────
create or replace function public.receive_warehouse_stock(
  p_product_id uuid,
  p_qty numeric,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'supervisor')) then
    raise exception 'owner or supervisor only';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'quantity must be positive';
  end if;

  select id into v_location from inventory_locations
    where location_type = 'warehouse' and is_active = true
    order by created_at limit 1;
  if v_location is null then
    raise exception 'no central warehouse location found';
  end if;

  insert into location_product_stock (location_id, product_id, qty, updated_at)
  values (v_location, p_product_id, p_qty, now())
  on conflict (location_id, product_id)
  do update set qty = location_product_stock.qty + excluded.qty,
                updated_at = now();

  return v_location;
end;
$$;

grant execute on function public.receive_warehouse_stock(uuid, numeric, text) to authenticated;

-- ── 2. Cancel a requested transfer ───────────────────────────────────────────
-- Sets status to 'cancelled' (audit trail preserved) — only while still
-- 'requested' (nothing has shipped, so no stock to unwind).
create or replace function public.cancel_transfer(p_transfer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'supervisor')) then
    raise exception 'owner or supervisor only';
  end if;

  update inventory_transfers
     set status = 'cancelled'
   where id = p_transfer_id
     and status = 'requested';
  if not found then
    raise exception 'transfer not found or already shipped';
  end if;

  return p_transfer_id;
end;
$$;

grant execute on function public.cancel_transfer(uuid) to authenticated;
