-- Noch Cafe V2 roadmap follow-up:
-- - additive procurement receipt / return tracking with partial and over/under handling
-- - inventory purchasing signals already exposed as views now get event tables + RPCs
-- - POS audit annotations for manager discount overrides and shared-terminal shift close identity

alter table procurement_orders
  add column if not exists quantity_received numeric(12,3) not null default 0,
  add column if not exists quantity_returned numeric(12,3) not null default 0,
  add column if not exists last_received_qty numeric(12,3),
  add column if not exists last_returned_qty numeric(12,3),
  add column if not exists last_received_at timestamptz,
  add column if not exists last_returned_at timestamptz,
  add column if not exists receiving_notes text,
  add column if not exists return_notes text;

update procurement_orders
set quantity_received = coalesce(quantity_ordered, 0),
    last_received_qty = coalesce(quantity_ordered, 0),
    last_received_at = coalesce(received_at, created_at)
where status = 'received'
  and coalesce(quantity_received, 0) = 0
  and coalesce(quantity_ordered, 0) > 0;

create table if not exists procurement_receipt_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references procurement_orders(id) on delete cascade,
  location_id uuid references inventory_locations(id) on delete set null,
  received_qty numeric(12,3) not null check (received_qty > 0),
  landed_unit_cost_lyd numeric(12,4) not null default 0,
  total_cost_lyd numeric(12,2) not null default 0,
  variance text not null check (variance in ('partial', 'matched', 'over')),
  notes text,
  journal_batch_id uuid references gl_journal_batches(id) on delete set null,
  received_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create index if not exists procurement_receipt_events_order_idx
  on procurement_receipt_events(order_id, received_at desc);

create table if not exists procurement_return_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references procurement_orders(id) on delete cascade,
  location_id uuid references inventory_locations(id) on delete set null,
  return_qty numeric(12,3) not null check (return_qty > 0),
  landed_unit_cost_lyd numeric(12,4) not null default 0,
  total_cost_lyd numeric(12,2) not null default 0,
  reason text,
  journal_batch_id uuid references gl_journal_batches(id) on delete set null,
  returned_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create index if not exists procurement_return_events_order_idx
  on procurement_return_events(order_id, returned_at desc);

alter table procurement_receipt_events enable row level security;
alter table procurement_return_events enable row level security;

drop policy if exists "procurement_receipt_events_all" on procurement_receipt_events;
create policy "procurement_receipt_events_all" on procurement_receipt_events
  for all to authenticated using (true) with check (true);

drop policy if exists "procurement_return_events_all" on procurement_return_events;
create policy "procurement_return_events_all" on procurement_return_events
  for all to authenticated using (true) with check (true);

alter table gl_journal_batches
  drop constraint if exists gl_journal_batches_source_type_check;
alter table gl_journal_batches
  add constraint gl_journal_batches_source_type_check
  check (source_type in (
    'manual','opening','sales_daily','expense','payroll','cash','capex',
    'procurement_receipt','procurement_payment','procurement_return','journal_correction'
  ));

create or replace function public.receive_procurement_order_v2(
  p_order_id uuid,
  p_received_qty numeric,
  p_received_at timestamptz default now(),
  p_update_bulk_cost boolean default false,
  p_receipt_notes text default null,
  p_location_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order procurement_orders;
  v_old procurement_orders;
  v_batch uuid;
  v_old_qty numeric;
  v_old_loc_qty numeric;
  v_received_qty numeric(12,3);
  v_prev_received numeric(12,3);
  v_new_received numeric(12,3);
  v_variance text;
  v_unit_cost numeric(12,4);
  v_amount numeric(12,2);
  v_event_id uuid := gen_random_uuid();
  v_ref text := 'procurement_receipt:' || v_event_id::text;
begin
  select * into v_order from procurement_orders where id = p_order_id for update;
  if not found then raise exception 'Procurement order not found'; end if;
  if v_order.status = 'cancelled' then raise exception 'Cancelled orders cannot be received'; end if;

  v_received_qty := round(coalesce(p_received_qty, 0)::numeric, 3);
  if v_received_qty <= 0 then
    raise exception 'Received quantity must be greater than zero';
  end if;

  v_old := v_order;
  v_prev_received := coalesce(v_order.quantity_received, 0);
  v_new_received := v_prev_received + v_received_qty;

  select qty_available
    into v_old_qty
  from stock
  where ingredient_id = v_order.ingredient_id
  for update;

  if found then
    update stock
    set qty_available = coalesce(v_old_qty, 0) + v_received_qty,
        unit = coalesce(v_order.unit, unit),
        updated_at = now()
    where ingredient_id = v_order.ingredient_id;
  else
    insert into stock(ingredient_id, qty_available, unit, min_threshold, updated_at)
    values (v_order.ingredient_id, v_received_qty, v_order.unit, 0, now());
  end if;

  if p_location_id is not null then
    select qty_available
      into v_old_loc_qty
    from inventory_location_stock
    where ingredient_id = v_order.ingredient_id and location_id = p_location_id
    for update;

    if found then
      update inventory_location_stock
      set qty_available = coalesce(v_old_loc_qty, 0) + v_received_qty,
          unit = coalesce(v_order.unit, unit),
          notes = coalesce(nullif(p_receipt_notes, ''), notes),
          last_counted_at = coalesce(p_received_at, now()),
          updated_at = now()
      where ingredient_id = v_order.ingredient_id and location_id = p_location_id;
    else
      insert into inventory_location_stock(
        ingredient_id, location_id, qty_available, unit, notes, last_counted_at, updated_at
      )
      values (
        v_order.ingredient_id, p_location_id, v_received_qty, v_order.unit,
        nullif(p_receipt_notes, ''), coalesce(p_received_at, now()), now()
      );
    end if;
  end if;

  insert into stock_logs(ingredient_id, qty_change, type, notes)
  values (
    v_order.ingredient_id,
    v_received_qty,
    'restock',
    trim(
      'Procurement receipt'
      || case when p_location_id is null then '' else ' @location ' || p_location_id::text end
      || case when p_receipt_notes is null or btrim(p_receipt_notes) = '' then '' else ' | ' || btrim(p_receipt_notes) end
    )
  );

  v_unit_cost := case
    when coalesce(v_order.quantity_ordered, 0) > 0 and coalesce(v_order.total_cost_lyd, 0) > 0
      then round((v_order.total_cost_lyd / v_order.quantity_ordered)::numeric, 4)
    else coalesce(v_order.unit_cost_lyd, 0)
  end;
  v_amount := round(v_received_qty * coalesce(v_unit_cost, 0), 2);

  if v_amount > 0 then
    insert into gl_journal_batches(journal_date, source_type, source_ref, memo, status, created_by)
    values (
      coalesce(p_received_at, now())::date,
      'procurement_receipt',
      v_ref,
      'Procurement receipt',
      'draft',
      auth.uid()
    )
    returning id into v_batch;

    insert into gl_journal_lines(batch_id, account_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('inventory'), 1, v_amount, coalesce(v_order.supplier_name, 'Inventory purchase'));

    insert into gl_journal_lines(batch_id, account_id, line_no, credit_lyd, memo)
    values (v_batch, gl_acct('accounts_payable'), 2, v_amount, coalesce(v_order.invoice_no, 'Supplier invoice'));

    update gl_journal_batches set status = 'posted' where id = v_batch;
  end if;

  if v_new_received < coalesce(v_order.quantity_ordered, 0) then
    v_variance := 'partial';
  elsif v_new_received = coalesce(v_order.quantity_ordered, 0) then
    v_variance := 'matched';
  else
    v_variance := 'over';
  end if;

  update procurement_orders
  set status = case
        when v_variance = 'partial' then 'partially_received'
        when v_variance = 'matched' then 'received'
        else 'over_received'
      end,
      received_at = coalesce(p_received_at, now()),
      quantity_received = v_new_received,
      last_received_qty = v_received_qty,
      last_received_at = coalesce(p_received_at, now()),
      receiving_notes = coalesce(nullif(p_receipt_notes, ''), receiving_notes),
      received_journal_batch_id = coalesce(v_batch, received_journal_batch_id)
  where id = p_order_id
  returning * into v_order;

  if p_update_bulk_cost and v_order.unit_cost_lyd is not null then
    update ingredients
    set bulk_cost = v_order.unit_cost_lyd,
        bulk_unit = v_order.unit
    where id = v_order.ingredient_id;
  end if;

  insert into procurement_receipt_events(
    id, order_id, location_id, received_qty, landed_unit_cost_lyd, total_cost_lyd,
    variance, notes, journal_batch_id, received_at, created_by
  )
  values (
    v_event_id, p_order_id, p_location_id, v_received_qty, coalesce(v_unit_cost, 0), coalesce(v_amount, 0),
    v_variance, nullif(p_receipt_notes, ''), v_batch, coalesce(p_received_at, now()), auth.uid()
  );

  perform finance_audit('procurement_order', p_order_id, 'receive_v2', to_jsonb(v_old), to_jsonb(v_order));
  return v_batch;
end $$;

grant execute on function public.receive_procurement_order_v2(uuid, numeric, timestamptz, boolean, text, uuid)
  to authenticated, service_role;

create or replace function public.return_procurement_order(
  p_order_id uuid,
  p_return_qty numeric,
  p_returned_at timestamptz default now(),
  p_reason text default null,
  p_location_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order procurement_orders;
  v_old procurement_orders;
  v_batch uuid;
  v_old_qty numeric;
  v_old_loc_qty numeric;
  v_return_qty numeric(12,3);
  v_available_to_return numeric(12,3);
  v_unit_cost numeric(12,4);
  v_amount numeric(12,2);
  v_event_id uuid := gen_random_uuid();
  v_ref text := 'procurement_return:' || v_event_id::text;
begin
  select * into v_order from procurement_orders where id = p_order_id for update;
  if not found then raise exception 'Procurement order not found'; end if;
  if v_order.status = 'cancelled' then raise exception 'Cancelled orders cannot be returned'; end if;

  v_return_qty := round(coalesce(p_return_qty, 0)::numeric, 3);
  if v_return_qty <= 0 then
    raise exception 'Return quantity must be greater than zero';
  end if;

  v_available_to_return := round((coalesce(v_order.quantity_received, 0) - coalesce(v_order.quantity_returned, 0))::numeric, 3);
  if v_available_to_return <= 0 then
    raise exception 'Nothing available to return';
  end if;
  if v_return_qty > v_available_to_return then
    raise exception 'Return quantity exceeds received quantity';
  end if;

  v_old := v_order;

  select qty_available
    into v_old_qty
  from stock
  where ingredient_id = v_order.ingredient_id
  for update;

  if coalesce(v_old_qty, 0) < v_return_qty then
    raise exception 'Not enough stock on hand to return this quantity safely';
  end if;

  update stock
  set qty_available = qty_available - v_return_qty,
      updated_at = now()
  where ingredient_id = v_order.ingredient_id;

  if p_location_id is not null then
    select qty_available
      into v_old_loc_qty
    from inventory_location_stock
    where ingredient_id = v_order.ingredient_id and location_id = p_location_id
    for update;

    if not found then
      raise exception 'Select a stocked location before processing a purchase return';
    end if;
    if coalesce(v_old_loc_qty, 0) < v_return_qty then
      raise exception 'Selected location does not have enough stock to return';
    end if;

    update inventory_location_stock
    set qty_available = qty_available - v_return_qty,
        notes = coalesce(nullif(p_reason, ''), notes),
        last_counted_at = coalesce(p_returned_at, now()),
        updated_at = now()
    where ingredient_id = v_order.ingredient_id and location_id = p_location_id;
  end if;

  insert into stock_logs(ingredient_id, qty_change, type, notes)
  values (
    v_order.ingredient_id,
    -v_return_qty,
    'adjustment',
    trim(
      'Procurement return'
      || case when p_location_id is null then '' else ' @location ' || p_location_id::text end
      || case when p_reason is null or btrim(p_reason) = '' then '' else ' | ' || btrim(p_reason) end
    )
  );

  v_unit_cost := case
    when coalesce(v_order.quantity_ordered, 0) > 0 and coalesce(v_order.total_cost_lyd, 0) > 0
      then round((v_order.total_cost_lyd / v_order.quantity_ordered)::numeric, 4)
    else coalesce(v_order.unit_cost_lyd, 0)
  end;
  v_amount := round(v_return_qty * coalesce(v_unit_cost, 0), 2);

  if v_amount > 0 then
    insert into gl_journal_batches(journal_date, source_type, source_ref, memo, status, created_by)
    values (
      coalesce(p_returned_at, now())::date,
      'procurement_return',
      v_ref,
      'Procurement return',
      'draft',
      auth.uid()
    )
    returning id into v_batch;

    insert into gl_journal_lines(batch_id, account_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('accounts_payable'), 1, v_amount, coalesce(v_order.invoice_no, 'Supplier return'));

    insert into gl_journal_lines(batch_id, account_id, line_no, credit_lyd, memo)
    values (v_batch, gl_acct('inventory'), 2, v_amount, coalesce(v_order.supplier_name, 'Inventory return'));

    update gl_journal_batches set status = 'posted' where id = v_batch;
  end if;

  update procurement_orders
  set quantity_returned = coalesce(quantity_returned, 0) + v_return_qty,
      last_returned_qty = v_return_qty,
      last_returned_at = coalesce(p_returned_at, now()),
      return_notes = coalesce(nullif(p_reason, ''), return_notes)
  where id = p_order_id
  returning * into v_order;

  insert into procurement_return_events(
    id, order_id, location_id, return_qty, landed_unit_cost_lyd, total_cost_lyd,
    reason, journal_batch_id, returned_at, created_by
  )
  values (
    v_event_id, p_order_id, p_location_id, v_return_qty, coalesce(v_unit_cost, 0), coalesce(v_amount, 0),
    nullif(p_reason, ''), v_batch, coalesce(p_returned_at, now()), auth.uid()
  );

  perform finance_audit('procurement_order', p_order_id, 'return', to_jsonb(v_old), to_jsonb(v_order));
  return v_batch;
end $$;

grant execute on function public.return_procurement_order(uuid, numeric, timestamptz, text, uuid)
  to authenticated, service_role;

alter table pos_orders
  add column if not exists manager_override_by uuid references profiles(id),
  add column if not exists manager_override_note text;

alter table pos_shifts
  add column if not exists closed_by uuid references profiles(id);

alter table pos_audit_log
  add column if not exists approved_by uuid references profiles(id);

create or replace function public.annotate_pos_sale_override(
  p_order_id uuid,
  p_manager_override_by uuid,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order pos_orders;
begin
  if p_manager_override_by is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_manager');
  end if;

  select * into v_order from pos_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  update pos_orders
  set manager_override_by = p_manager_override_by,
      manager_override_note = nullif(p_note, '')
  where id = p_order_id;

  insert into pos_audit_log(
    branch_id, actor_user_id, served_by, approved_by, action, entity_type, entity_id, metadata
  )
  values (
    v_order.branch_id,
    auth.uid(),
    v_order.served_by,
    p_manager_override_by,
    'manager_override_applied',
    'pos_orders',
    p_order_id,
    jsonb_build_object(
      'discount_amount', v_order.discount_amount,
      'discount_pct', v_order.discount_pct,
      'note', nullif(p_note, '')
    )
  );

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.annotate_pos_sale_override(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.annotate_shift_close_operator(
  p_shift_id uuid,
  p_served_by uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shift pos_shifts;
begin
  if p_served_by is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_served_by');
  end if;

  select * into v_shift from pos_shifts where id = p_shift_id for update;
  if not found then raise exception 'Shift not found'; end if;

  update pos_shifts
  set closed_by = p_served_by
  where id = p_shift_id;

  insert into pos_audit_log(
    branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata
  )
  values (
    v_shift.branch_id,
    auth.uid(),
    p_served_by,
    'shift_close_operator_recorded',
    'pos_shifts',
    p_shift_id,
    jsonb_build_object('closed_at', v_shift.closed_at)
  );

  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.annotate_shift_close_operator(uuid, uuid)
  to authenticated, service_role;
