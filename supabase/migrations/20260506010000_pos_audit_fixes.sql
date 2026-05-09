-- POS Audit Fixes (2026-05-06)
-- Addresses findings from docs/audit/00-summary.md:
--   B. Atomic order RPC + idempotency + UNIQUE(order_number per branch)
--   C. Shift close lock with status guard
--   E. PIN gate → served_by + pos_audit_log table; remove Skip in client
--   F. Presto: separate aggregator total + uncollected flag (still in grand total)
--   A. Foundation for branch-scoped RLS via staff_branches (table only — policies
--      stay open in this migration; flip to scoped policies in a follow-up after
--      assignments are populated).

-- ──────────────────────────────────────────────────────────────────────
-- F. Presto collection tracking (kept in grand totals, flagged uncollected)
-- ──────────────────────────────────────────────────────────────────────
alter table pos_orders
  add column if not exists presto_collected boolean default null;
-- semantics: null = not a presto order; false = presto, money still owed by Presto;
-- true = presto, money received from Presto.

alter table pos_shifts
  add column if not exists total_presto_sales decimal(10,2) default 0;
alter table pos_shifts
  add column if not exists total_presto_uncollected decimal(10,2) default 0;

-- ──────────────────────────────────────────────────────────────────────
-- B/E. Order columns: idempotency, served_by, client timestamp
-- ──────────────────────────────────────────────────────────────────────
alter table pos_orders
  add column if not exists idempotency_key uuid;

alter table pos_orders
  add column if not exists served_by uuid references profiles(id);

alter table pos_orders
  add column if not exists client_created_at timestamptz;

create unique index if not exists pos_orders_idempotency_key_uidx
  on pos_orders (idempotency_key)
  where idempotency_key is not null;

-- B. Order number must be unique per branch.
create unique index if not exists pos_orders_branch_order_number_uidx
  on pos_orders (branch_id, order_number);

-- C. Shift close lock predicate is enforced inside close_pos_shift() below.

-- ──────────────────────────────────────────────────────────────────────
-- E. POS audit log
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pos_audit_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references pos_branches(id),
  actor_user_id uuid references profiles(id), -- supabase auth user
  served_by uuid references profiles(id),     -- PIN-verified barista (if any)
  action text not null,   -- 'order_created'|'order_voided'|'discount_applied'|
                          -- 'shift_opened'|'shift_closed'|'stock_adjusted'|
                          -- 'price_changed'|'presto_collected'
  entity_type text,       -- 'pos_orders' | 'pos_products' | 'pos_shifts' | ...
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists pos_audit_log_branch_idx on pos_audit_log (branch_id, created_at desc);
create index if not exists pos_audit_log_entity_idx on pos_audit_log (entity_type, entity_id);

alter table pos_audit_log enable row level security;
drop policy if exists "pos_audit_log_all" on pos_audit_log;
create policy "pos_audit_log_all" on pos_audit_log
  for all to authenticated using (true) with check (true);

-- ──────────────────────────────────────────────────────────────────────
-- A. staff_branches scaffolding (RLS policies remain permissive until
--    assignments are populated; flip in a follow-up migration).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists staff_branches (
  user_id uuid not null references profiles(id) on delete cascade,
  branch_id uuid not null references pos_branches(id) on delete cascade,
  role text default 'staff', -- 'staff' | 'manager'
  created_at timestamptz default now(),
  primary key (user_id, branch_id)
);

alter table staff_branches enable row level security;
drop policy if exists "staff_branches_owner_all" on staff_branches;
create policy "staff_branches_owner_all" on staff_branches
  for all to authenticated
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
    or user_id = auth.uid()
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- Helper: does the calling user have access to a branch?
create or replace function public.user_has_branch_access(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from profiles where id = auth.uid() and role = 'owner')
    or exists (select 1 from staff_branches where user_id = auth.uid() and branch_id = p_branch_id);
$$;

-- ──────────────────────────────────────────────────────────────────────
-- B. create_pos_order RPC — atomic, idempotent, race-safe
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.create_pos_order(
  p_idempotency_key uuid,
  p_branch_id uuid,
  p_shift_id uuid,
  p_served_by uuid,                -- PIN-verified barista (nullable)
  p_subtotal numeric,
  p_discount_amount numeric,
  p_discount_pct numeric,
  p_total numeric,
  p_payment_method text,
  p_cash_tendered numeric,
  p_change_due numeric,
  p_card_amount numeric,
  p_loyalty_customer_id uuid,
  p_client_created_at timestamptz,
  p_offline_order_number text,     -- if non-null, preserve client-side number
  p_items jsonb                    -- [{product_id, product_name, product_name_ar, unit_price, quantity, notes, track_inventory}]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_order pos_orders;
  v_order_id uuid;
  v_order_number text;
  v_branch_code text;
  v_date_str text;
  v_seq int;
  v_item jsonb;
  v_stock_before numeric;
  v_stock_after numeric;
  v_presto_collected boolean := null;
  v_cash_amt numeric := 0;
  v_card_amt numeric := 0;
  v_presto_amt numeric := 0;
  v_presto_uncollected_amt numeric := 0;
  v_result jsonb;
begin
  -- Idempotency: if this key already produced an order, return it unchanged.
  if p_idempotency_key is not null then
    select * into v_existing_order
      from pos_orders
      where idempotency_key = p_idempotency_key;
    if found then
      select jsonb_build_object(
        'order', row_to_json(v_existing_order),
        'items', coalesce(
          (select jsonb_agg(row_to_json(oi)) from pos_order_items oi where oi.order_id = v_existing_order.id),
          '[]'::jsonb
        ),
        'idempotent_replay', true
      ) into v_result;
      return v_result;
    end if;
  end if;

  -- Lock the branch row to serialize order_number generation per branch.
  perform 1 from pos_branches where id = p_branch_id for update;

  -- Compute order_number (or use client-supplied OFFLINE-* number).
  if p_offline_order_number is not null and length(p_offline_order_number) > 0 then
    v_order_number := p_offline_order_number;
  else
    select
      upper(
        coalesce(
          nullif(regexp_replace(string_agg(left(w,1),'') filter (where w ~ '^[A-Za-z]'), '[^A-Za-z]', '', 'g'), ''),
          'POS'
        )
      )
      into v_branch_code
      from (
        select unnest(string_to_array((select name from pos_branches where id = p_branch_id), ' ')) as w
      ) sub;
    v_branch_code := left(coalesce(v_branch_code, 'POS'), 3);
    v_date_str := to_char(current_date, 'YYYYMMDD');

    select count(*) + 1 into v_seq
      from pos_orders
      where branch_id = p_branch_id
        and created_at >= date_trunc('day', now());

    v_order_number := v_branch_code || '-' || v_date_str || '-' || lpad(v_seq::text, 4, '0');
  end if;

  -- Presto handling.
  if p_payment_method = 'presto' then
    v_presto_collected := false;       -- still owed by Presto
    v_presto_amt := p_total;
    v_presto_uncollected_amt := p_total;
  end if;

  -- Cash/card breakdown for shift totals.
  if p_payment_method = 'cash' then
    v_cash_amt := p_total;
  elsif p_payment_method = 'card' then
    v_card_amt := p_total;
  elsif p_payment_method = 'split' then
    v_card_amt := coalesce(p_card_amount, 0);
    v_cash_amt := p_total - v_card_amt;
  end if;
  -- presto: neither cash nor card; tracked separately via v_presto_amt.

  -- Insert order.
  insert into pos_orders (
    branch_id, shift_id, order_number,
    subtotal, discount_amount, discount_pct, total,
    payment_method, cash_tendered, change_due, card_amount,
    loyalty_customer_id, status, synced,
    idempotency_key, served_by, client_created_at,
    presto_collected
  ) values (
    p_branch_id, p_shift_id, v_order_number,
    p_subtotal, p_discount_amount, p_discount_pct, p_total,
    p_payment_method, p_cash_tendered, p_change_due, p_card_amount,
    p_loyalty_customer_id, 'completed', true,
    p_idempotency_key, p_served_by, coalesce(p_client_created_at, now()),
    v_presto_collected
  )
  returning id into v_order_id;

  -- Insert items.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into pos_order_items (
      order_id, product_id, product_name, product_name_ar,
      unit_price, quantity, total, notes
    ) values (
      v_order_id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      v_item->>'product_name_ar',
      (v_item->>'unit_price')::numeric,
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric * (v_item->>'quantity')::int,
      v_item->>'notes'
    );

    -- Atomic stock decrement for tracked items (no lost updates).
    if (v_item->>'track_inventory')::boolean and (v_item->>'product_id') is not null then
      update pos_products
        set stock_qty = stock_qty - (v_item->>'quantity')::numeric,
            updated_at = now()
        where id = (v_item->>'product_id')::uuid
        returning stock_qty + (v_item->>'quantity')::numeric, stock_qty
          into v_stock_before, v_stock_after;

      if v_stock_before is not null then
        insert into pos_inventory_movements (
          branch_id, product_id, movement_type, quantity,
          stock_before, stock_after, reference_id, notes
        ) values (
          p_branch_id, (v_item->>'product_id')::uuid, 'sale',
          -((v_item->>'quantity')::numeric),
          v_stock_before, v_stock_after,
          v_order_id, 'Order ' || v_order_number
        );
      end if;
    end if;
  end loop;

  -- Atomic shift totals (no read-modify-write).
  if p_shift_id is not null then
    update pos_shifts
      set total_sales = total_sales + p_total,
          total_orders = total_orders + 1,
          total_cash_sales = total_cash_sales + v_cash_amt,
          total_card_sales = total_card_sales + v_card_amt,
          total_presto_sales = coalesce(total_presto_sales, 0) + v_presto_amt,
          total_presto_uncollected = coalesce(total_presto_uncollected, 0) + v_presto_uncollected_amt,
          total_discounts = total_discounts + coalesce(p_discount_amount, 0),
          expected_cash = expected_cash + v_cash_amt
      where id = p_shift_id
        and status = 'open';   -- C. don't append to a closed shift
  end if;

  -- Audit log.
  insert into pos_audit_log (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
  values (
    p_branch_id, auth.uid(), p_served_by, 'order_created', 'pos_orders', v_order_id,
    jsonb_build_object(
      'order_number', v_order_number,
      'total', p_total,
      'payment_method', p_payment_method,
      'discount_amount', p_discount_amount
    )
  );

  -- Return the fully-formed order + items.
  select jsonb_build_object(
    'order', row_to_json(o),
    'items', coalesce(
      (select jsonb_agg(row_to_json(oi)) from pos_order_items oi where oi.order_id = v_order_id),
      '[]'::jsonb
    ),
    'idempotent_replay', false
  )
  into v_result
  from pos_orders o
  where o.id = v_order_id;

  return v_result;
end;
$$;

grant execute on function public.create_pos_order(
  uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric,
  text, numeric, numeric, numeric, uuid, timestamptz, text, jsonb
) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- C. close_pos_shift RPC — refuses to close twice; returns reconciliation diff.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.close_pos_shift(
  p_shift_id uuid,
  p_actual_cash numeric,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift pos_shifts;
  v_orders_total numeric;
  v_orders_count int;
  v_diff numeric;
  v_recon_diff numeric;
begin
  -- Lock the shift row.
  select * into v_shift from pos_shifts where id = p_shift_id for update;
  if not found then
    raise exception 'shift not found';
  end if;
  if v_shift.status <> 'open' then
    raise exception 'shift is already %', v_shift.status using errcode = 'P0001';
  end if;

  -- Reconcile against pos_orders (defensive: shift counters could drift).
  select
    coalesce(sum(total), 0),
    count(*)
    into v_orders_total, v_orders_count
    from pos_orders
    where shift_id = p_shift_id and status = 'completed';

  v_recon_diff := v_orders_total - coalesce(v_shift.total_sales, 0);
  v_diff := p_actual_cash - coalesce(v_shift.expected_cash, 0);

  update pos_shifts
    set status = 'closed',
        closed_at = now(),
        closing_cash = p_actual_cash,
        cash_difference = v_diff,
        notes = p_notes
    where id = p_shift_id;

  insert into pos_audit_log (branch_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_shift.branch_id, auth.uid(), 'shift_closed', 'pos_shifts', p_shift_id,
    jsonb_build_object(
      'expected_cash', v_shift.expected_cash,
      'actual_cash', p_actual_cash,
      'cash_difference', v_diff,
      'reconciliation_diff', v_recon_diff,
      'orders_count', v_orders_count
    )
  );

  return jsonb_build_object(
    'shift_id', p_shift_id,
    'cash_difference', v_diff,
    'reconciliation_diff', v_recon_diff,
    'orders_count', v_orders_count
  );
end;
$$;

grant execute on function public.close_pos_shift(uuid, numeric, text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- F. mark_presto_collected RPC — flips presto_collected and decrements
--    the shift's uncollected counter.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.mark_presto_collected(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order pos_orders;
begin
  select * into v_order from pos_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.payment_method <> 'presto' then
    raise exception 'order is not a Presto order';
  end if;
  if v_order.presto_collected is true then
    return jsonb_build_object('already_collected', true);
  end if;

  update pos_orders set presto_collected = true where id = p_order_id;

  if v_order.shift_id is not null then
    update pos_shifts
      set total_presto_uncollected = greatest(0, coalesce(total_presto_uncollected, 0) - v_order.total)
      where id = v_order.shift_id;
  end if;

  insert into pos_audit_log (branch_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_order.branch_id, auth.uid(), 'presto_collected', 'pos_orders', p_order_id,
    jsonb_build_object('amount', v_order.total)
  );

  return jsonb_build_object('already_collected', false, 'amount', v_order.total);
end;
$$;

grant execute on function public.mark_presto_collected(uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- B. void_pos_order RPC — atomic void with audit log.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.void_pos_order(
  p_order_id uuid,
  p_reason text,
  p_served_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order pos_orders;
begin
  select * into v_order from pos_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'voided' then
    return jsonb_build_object('already_voided', true);
  end if;

  update pos_orders
    set status = 'voided',
        voided_at = now(),
        void_reason = p_reason
    where id = p_order_id;

  -- Reverse stock + shift totals.
  -- (Items already inserted; reverse their inventory effect.)
  insert into pos_inventory_movements (
    branch_id, product_id, movement_type, quantity, stock_before, stock_after, reference_id, notes
  )
  select
    v_order.branch_id, oi.product_id, 'void',
    oi.quantity,
    p.stock_qty,
    p.stock_qty + oi.quantity,
    v_order.id,
    'Void of order ' || v_order.order_number
    from pos_order_items oi
    join pos_products p on p.id = oi.product_id
    where oi.order_id = v_order.id;

  update pos_products p
    set stock_qty = p.stock_qty + oi.quantity,
        updated_at = now()
    from pos_order_items oi
    where oi.order_id = v_order.id and p.id = oi.product_id;

  if v_order.shift_id is not null then
    update pos_shifts
      set total_sales = total_sales - v_order.total,
          total_orders = greatest(0, total_orders - 1),
          total_cash_sales = total_cash_sales - case when v_order.payment_method='cash' then v_order.total
                                                    when v_order.payment_method='split' then v_order.total - coalesce(v_order.card_amount,0)
                                                    else 0 end,
          total_card_sales = total_card_sales - case when v_order.payment_method='card' then v_order.total
                                                    when v_order.payment_method='split' then coalesce(v_order.card_amount,0)
                                                    else 0 end,
          total_presto_sales = total_presto_sales - case when v_order.payment_method='presto' then v_order.total else 0 end,
          total_presto_uncollected = greatest(0, total_presto_uncollected - case
            when v_order.payment_method='presto' and v_order.presto_collected is not true then v_order.total else 0 end),
          total_discounts = total_discounts - coalesce(v_order.discount_amount, 0),
          expected_cash = expected_cash - case when v_order.payment_method='cash' then v_order.total
                                              when v_order.payment_method='split' then v_order.total - coalesce(v_order.card_amount,0)
                                              else 0 end
      where id = v_order.shift_id and status = 'open';
  end if;

  insert into pos_audit_log (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
  values (
    v_order.branch_id, auth.uid(), p_served_by, 'order_voided', 'pos_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'order_number', v_order.order_number, 'total', v_order.total)
  );

  return jsonb_build_object('voided', true, 'order_number', v_order.order_number);
end;
$$;

grant execute on function public.void_pos_order(uuid, text, uuid) to authenticated;
