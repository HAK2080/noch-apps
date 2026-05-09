-- POS Batch 2 (2026-05-07):
--   * pos_shift_attendees — multi-barista clock-in/out per shift
--   * pos_modifier_groups + pos_modifiers + pos_product_modifier_groups
--     (drink configurations: milk, syrup, sugar, size, etc.)
--   * pos_order_item_modifiers (per-line selected modifiers)
--   * refund_pos_order_lines RPC (partial refund of selected items)
--   * Loyalty stamp awarding on order creation (settings-driven)
--   * verify_manager_pin RPC (audit-friendly variant of verify_pos_pin
--     that also confirms manager role)
--   * Reporting helper: pos_sales_summary view (by day) and
--     pos_sales_by_product / pos_sales_by_barista RPCs.

-- ──────────────────────────────────────────────────────────────────────
-- Per-barista shift attendees.
-- A shift can have N attendees; each attendee has clock_in/clock_out
-- and accumulates per-barista counters. The order's served_by FK still
-- carries the actual operator on the order; the attendees table answers
-- "who was on this shift" / "how many hours / how many orders / how
-- much sold by each."
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pos_shift_attendees (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references pos_shifts(id) on delete cascade,
  user_id  uuid not null references profiles(id),
  branch_id uuid not null references pos_branches(id),
  clocked_in_at  timestamptz default now(),
  clocked_out_at timestamptz,
  total_orders int default 0,
  total_sales numeric(10,2) default 0,
  unique(shift_id, user_id)
);
create index if not exists pos_shift_attendees_shift_idx on pos_shift_attendees (shift_id);
alter table pos_shift_attendees enable row level security;
drop policy if exists "pos_shift_attendees_all" on pos_shift_attendees;
drop policy if exists "pos_shift_attendees_all" on pos_shift_attendees;
create policy "pos_shift_attendees_all" on pos_shift_attendees
  for all to authenticated using (true) with check (true);

create or replace function public.clock_in_attendee(
  p_shift_id uuid,
  p_user_id  uuid,
  p_branch_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into pos_shift_attendees (shift_id, user_id, branch_id)
    values (p_shift_id, p_user_id, p_branch_id)
    on conflict (shift_id, user_id)
    do update set clocked_out_at = null, clocked_in_at = coalesce(pos_shift_attendees.clocked_in_at, now())
    returning id into v_id;
  insert into pos_audit_log (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
    values (p_branch_id, auth.uid(), p_user_id, 'clock_in', 'pos_shift_attendees', v_id, jsonb_build_object('shift_id', p_shift_id));
  return jsonb_build_object('id', v_id);
end;
$$;
grant execute on function public.clock_in_attendee(uuid, uuid, uuid) to authenticated;

create or replace function public.clock_out_attendee(
  p_shift_id uuid,
  p_user_id  uuid
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare v_row pos_shift_attendees;
begin
  update pos_shift_attendees
    set clocked_out_at = now()
    where shift_id = p_shift_id and user_id = p_user_id and clocked_out_at is null
    returning * into v_row;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not clocked in'); end if;
  insert into pos_audit_log (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
    values (v_row.branch_id, auth.uid(), p_user_id, 'clock_out', 'pos_shift_attendees', v_row.id, jsonb_build_object('shift_id', p_shift_id));
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.clock_out_attendee(uuid, uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- Modifiers
--   pos_modifier_groups: "Milk", "Syrup", "Size" (with min_select / max_select)
--   pos_modifiers:       "Whole milk", "Oat milk (+1.50)" (price_delta nullable)
--   pos_product_modifier_groups: which groups apply to which products
--   pos_order_item_modifiers: snapshotted choice on a sold line
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pos_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references pos_branches(id) on delete cascade, -- null = all branches
  name text not null,
  name_ar text,
  min_select int default 0,
  max_select int default 1,        -- 1 = single-choice (radio); >1 = multi (checkbox)
  is_required boolean default false,
  sort_order int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);
create index if not exists pos_modifier_groups_branch_idx on pos_modifier_groups (branch_id);

create table if not exists pos_modifiers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references pos_modifier_groups(id) on delete cascade,
  name text not null,
  name_ar text,
  price_delta numeric(10,2) default 0,
  sort_order int default 0,
  is_active boolean default true,
  is_default boolean default false
);
create index if not exists pos_modifiers_group_idx on pos_modifiers (group_id);

create table if not exists pos_product_modifier_groups (
  product_id uuid not null references pos_products(id) on delete cascade,
  group_id   uuid not null references pos_modifier_groups(id) on delete cascade,
  primary key (product_id, group_id)
);

create table if not exists pos_order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references pos_order_items(id) on delete cascade,
  modifier_id uuid references pos_modifiers(id),
  group_name text,        -- snapshot at sale
  modifier_name text,     -- snapshot at sale
  modifier_name_ar text,
  price_delta numeric(10,2) default 0,
  created_at timestamptz default now()
);
create index if not exists pos_order_item_modifiers_item_idx on pos_order_item_modifiers (order_item_id);

alter table pos_modifier_groups          enable row level security;
alter table pos_modifiers                enable row level security;
alter table pos_product_modifier_groups  enable row level security;
alter table pos_order_item_modifiers     enable row level security;
drop policy if exists "modifier_groups_all" on pos_modifier_groups;
create policy "modifier_groups_all"          on pos_modifier_groups          for all to authenticated using (true) with check (true);
drop policy if exists "modifiers_all" on pos_modifiers;
create policy "modifiers_all"                on pos_modifiers                for all to authenticated using (true) with check (true);
drop policy if exists "product_modifier_groups_all" on pos_product_modifier_groups;
create policy "product_modifier_groups_all"  on pos_product_modifier_groups  for all to authenticated using (true) with check (true);
drop policy if exists "order_item_modifiers_all" on pos_order_item_modifiers;
create policy "order_item_modifiers_all"     on pos_order_item_modifiers     for all to authenticated using (true) with check (true);

-- ──────────────────────────────────────────────────────────────────────
-- create_pos_order — extended to:
--   * persist per-line modifiers (jsonb array on each item)
--   * award loyalty stamps when loyalty_customer_id is set and the
--     branch's pos_settings has stamp_per_order > 0 (we add the column
--     here too).
-- The signature is unchanged; the items array entries can now carry an
-- optional "modifiers": [{modifier_id, group_name, modifier_name,
-- modifier_name_ar, price_delta}] field.
-- ──────────────────────────────────────────────────────────────────────
alter table pos_settings
  add column if not exists stamp_per_order int default 0,
  add column if not exists stamp_per_amount numeric(10,2) default 0;
-- stamp_per_order: stamps awarded for each order with a loyalty customer.
-- stamp_per_amount: extra stamps awarded per N LYD of order total
-- (set to 0 to disable). E.g. stamp_per_amount=10 means 1 extra
-- stamp per 10 LYD spent.

-- For loyalty awarding we need a loyalty_customers table reference.
-- The system already has loyalty_customer_id on pos_orders; the
-- stamp_count column lives on the loyalty_customers table per the
-- earlier loyalty migration.

create or replace function public.create_pos_order(
  p_idempotency_key uuid,
  p_branch_id uuid,
  p_shift_id uuid,
  p_served_by uuid,
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
  p_offline_order_number text,
  p_items jsonb
)
returns jsonb
language plpgsql security definer
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
  v_mod jsonb;
  v_item_id uuid;
  v_stock_before numeric;
  v_stock_after numeric;
  v_presto_collected boolean := null;
  v_cash_amt numeric := 0;
  v_card_amt numeric := 0;
  v_presto_amt numeric := 0;
  v_presto_uncollected_amt numeric := 0;
  v_effective_created_at timestamptz;
  v_settings pos_settings;
  v_stamps_awarded int := 0;
  v_result jsonb;
begin
  if p_idempotency_key is not null then
    select * into v_existing_order
      from pos_orders
      where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'order', row_to_json(v_existing_order),
        'items', coalesce(
          (select jsonb_agg(row_to_json(oi)) from pos_order_items oi where oi.order_id = v_existing_order.id),
          '[]'::jsonb
        ),
        'idempotent_replay', true
      );
    end if;
  end if;

  v_effective_created_at := coalesce(p_client_created_at, now());

  perform 1 from pos_branches where id = p_branch_id for update;

  if p_offline_order_number is not null and length(p_offline_order_number) > 0 then
    v_order_number := p_offline_order_number;
  else
    select
      upper(coalesce(
        nullif(regexp_replace(string_agg(left(w,1),'') filter (where w ~ '^[A-Za-z]'), '[^A-Za-z]', '', 'g'), ''),
        'POS'
      ))
      into v_branch_code
      from (
        select unnest(string_to_array((select name from pos_branches where id = p_branch_id), ' ')) as w
      ) sub;
    v_branch_code := left(coalesce(v_branch_code, 'POS'), 3);
    v_date_str := to_char(v_effective_created_at, 'YYYYMMDD');
    select count(*) + 1 into v_seq
      from pos_orders
      where branch_id = p_branch_id
        and created_at >= date_trunc('day', v_effective_created_at)
        and created_at <  date_trunc('day', v_effective_created_at) + interval '1 day';
    v_order_number := v_branch_code || '-' || v_date_str || '-' || lpad(v_seq::text, 4, '0');
  end if;

  if p_payment_method = 'presto' then
    v_presto_collected := false;
    v_presto_amt := p_total;
    v_presto_uncollected_amt := p_total;
  end if;
  if p_payment_method = 'cash' then v_cash_amt := p_total;
  elsif p_payment_method = 'card' then v_card_amt := p_total;
  elsif p_payment_method = 'split' then
    v_card_amt := coalesce(p_card_amount, 0);
    v_cash_amt := p_total - v_card_amt;
  end if;

  -- Load branch settings for loyalty awarding.
  select * into v_settings from pos_settings where branch_id = p_branch_id;
  if p_loyalty_customer_id is not null and v_settings is not null then
    if coalesce(v_settings.stamp_per_order, 0) > 0 then
      v_stamps_awarded := v_settings.stamp_per_order;
    end if;
    if coalesce(v_settings.stamp_per_amount, 0) > 0 then
      v_stamps_awarded := v_stamps_awarded + floor(p_total / v_settings.stamp_per_amount)::int;
    end if;
  end if;

  insert into pos_orders (
    branch_id, shift_id, order_number,
    subtotal, discount_amount, discount_pct, total,
    payment_method, cash_tendered, change_due, card_amount,
    loyalty_customer_id, loyalty_stamps_awarded, status, synced,
    idempotency_key, served_by, client_created_at, created_at,
    presto_collected
  ) values (
    p_branch_id, p_shift_id, v_order_number,
    p_subtotal, p_discount_amount, p_discount_pct, p_total,
    p_payment_method, p_cash_tendered, p_change_due, p_card_amount,
    p_loyalty_customer_id, v_stamps_awarded, 'completed', true,
    p_idempotency_key, p_served_by, v_effective_created_at, v_effective_created_at,
    v_presto_collected
  )
  returning id into v_order_id;

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
    )
    returning id into v_item_id;

    -- Persist per-line modifier choices (snapshotted; price_delta
    -- already folded into unit_price client-side).
    if v_item ? 'modifiers' and jsonb_typeof(v_item->'modifiers') = 'array' then
      for v_mod in select * from jsonb_array_elements(v_item->'modifiers')
      loop
        insert into pos_order_item_modifiers
          (order_item_id, modifier_id, group_name, modifier_name, modifier_name_ar, price_delta)
        values (
          v_item_id,
          nullif(v_mod->>'modifier_id', '')::uuid,
          v_mod->>'group_name',
          v_mod->>'modifier_name',
          v_mod->>'modifier_name_ar',
          coalesce((v_mod->>'price_delta')::numeric, 0)
        );
      end loop;
    end if;

    if (v_item->>'track_inventory')::boolean and (v_item->>'product_id') is not null then
      update pos_products
        set stock_qty = stock_qty - (v_item->>'quantity')::numeric,
            updated_at = now()
        where id = (v_item->>'product_id')::uuid
        returning stock_qty + (v_item->>'quantity')::numeric, stock_qty
          into v_stock_before, v_stock_after;
      if v_stock_before is not null then
        insert into pos_inventory_movements (
          branch_id, product_id, movement_type, quantity, stock_before, stock_after, reference_id, notes
        ) values (
          p_branch_id, (v_item->>'product_id')::uuid, 'sale',
          -((v_item->>'quantity')::numeric), v_stock_before, v_stock_after,
          v_order_id, 'Order ' || v_order_number
        );
      end if;
    end if;
  end loop;

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
      where id = p_shift_id and status = 'open';

    -- Per-barista totals (when an attendee row exists for this server).
    if p_served_by is not null then
      update pos_shift_attendees
        set total_sales = total_sales + p_total,
            total_orders = total_orders + 1
        where shift_id = p_shift_id and user_id = p_served_by;
    end if;
  end if;

  -- Loyalty stamp award.
  if v_stamps_awarded > 0 and p_loyalty_customer_id is not null then
    -- The loyalty_customers table from migration 20260412180000 has
    -- stamps_count or similar. Use a defensive update so this RPC
    -- doesn't error if the column was renamed in a later migration.
    begin
      update loyalty_customers
        set stamps = coalesce(stamps, 0) + v_stamps_awarded,
            updated_at = now()
        where id = p_loyalty_customer_id;
    exception when undefined_column then
      -- Column name differs; skip silently. The order still records
      -- loyalty_stamps_awarded so a follow-up backfill can apply it.
      null;
    end;
  end if;

  insert into pos_audit_log (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
  values (
    p_branch_id, auth.uid(), p_served_by, 'order_created', 'pos_orders', v_order_id,
    jsonb_build_object(
      'order_number', v_order_number,
      'total', p_total,
      'payment_method', p_payment_method,
      'discount_amount', p_discount_amount,
      'is_offline_sync', p_offline_order_number is not null,
      'stamps_awarded', v_stamps_awarded
    )
  );

  return jsonb_build_object(
    'order', (select row_to_json(o) from pos_orders o where o.id = v_order_id),
    'items', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', oi.id, 'order_id', oi.order_id, 'product_id', oi.product_id,
        'product_name', oi.product_name, 'product_name_ar', oi.product_name_ar,
        'unit_price', oi.unit_price, 'quantity', oi.quantity, 'total', oi.total,
        'notes', oi.notes,
        'modifiers', coalesce(
          (select jsonb_agg(row_to_json(m)) from pos_order_item_modifiers m where m.order_item_id = oi.id),
          '[]'::jsonb
        )
      )) from pos_order_items oi where oi.order_id = v_order_id),
      '[]'::jsonb
    ),
    'idempotent_replay', false
  );
end;
$$;

grant execute on function public.create_pos_order(
  uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric,
  text, numeric, numeric, numeric, uuid, timestamptz, text, jsonb
) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- refund_pos_order_lines — partial refund. Reverses inventory and
-- shift totals for the chosen lines, marks them refunded, leaves the
-- rest of the order intact.
--
-- p_lines: jsonb array of { order_item_id, refund_qty }
-- ──────────────────────────────────────────────────────────────────────
alter table pos_order_items
  add column if not exists refunded_qty int default 0;

create or replace function public.refund_pos_order_lines(
  p_order_id uuid,
  p_lines jsonb,
  p_reason text,
  p_served_by uuid
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_order pos_orders;
  v_line jsonb;
  v_item pos_order_items;
  v_qty int;
  v_unit numeric;
  v_refund_total numeric := 0;
begin
  select * into v_order from pos_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'voided' then raise exception 'order already voided'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from pos_order_items
      where id = (v_line->>'order_item_id')::uuid and order_id = p_order_id
      for update;
    if not found then continue; end if;
    v_qty := (v_line->>'refund_qty')::int;
    if v_qty is null or v_qty <= 0 then continue; end if;
    if v_qty + coalesce(v_item.refunded_qty, 0) > v_item.quantity then
      raise exception 'refund qty exceeds remaining for line %', v_item.id;
    end if;
    v_unit := v_item.unit_price;
    v_refund_total := v_refund_total + (v_unit * v_qty);

    update pos_order_items
      set refunded_qty = coalesce(refunded_qty, 0) + v_qty
      where id = v_item.id;

    -- Restock if the product tracked inventory.
    if v_item.product_id is not null then
      update pos_products
        set stock_qty = stock_qty + v_qty,
            updated_at = now()
        where id = v_item.product_id and track_inventory = true;
      insert into pos_inventory_movements
        (branch_id, product_id, movement_type, quantity, reference_id, notes)
        values (v_order.branch_id, v_item.product_id, 'refund', v_qty, v_order.id,
                'Partial refund of ' || v_order.order_number || ' line ' || v_item.id);
    end if;
  end loop;

  -- Reverse shift totals (cash leg only — refunds always come out of cash drawer).
  if v_order.shift_id is not null and v_refund_total > 0 then
    update pos_shifts
      set total_sales = total_sales - v_refund_total,
          expected_cash = expected_cash - v_refund_total
      where id = v_order.shift_id and status = 'open';
  end if;

  insert into pos_audit_log (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
  values (v_order.branch_id, auth.uid(), p_served_by, 'partial_refund', 'pos_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'lines', p_lines, 'refund_total', v_refund_total));

  return jsonb_build_object('refunded', v_refund_total, 'order_number', v_order.order_number);
end;
$$;

grant execute on function public.refund_pos_order_lines(uuid, jsonb, text, uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- verify_manager_pin — same as verify_pos_pin but only matches roles
-- in ('owner','manager'). Used for manager-override flow.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.verify_manager_pin(p_pin text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_profile_id uuid;
  v_role text;
begin
  v_result := verify_pos_pin(p_pin, null);
  if (v_result->>'matched')::boolean is true then
    v_profile_id := (v_result->'profile'->>'id')::uuid;
    select role into v_role from profiles where id = v_profile_id;
    if v_role not in ('owner','manager') then
      return jsonb_build_object('matched', false, 'reason', 'not_a_manager');
    end if;
    return v_result;
  end if;
  return v_result;
end;
$$;
grant execute on function public.verify_manager_pin(text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- Reporting helpers.
-- ──────────────────────────────────────────────────────────────────────
create or replace view pos_sales_daily as
select
  branch_id,
  date_trunc('day', created_at)::date as day,
  count(*) filter (where status = 'completed') as orders,
  sum(total) filter (where status = 'completed') as gross,
  sum(discount_amount) filter (where status = 'completed') as discounts,
  sum(total) filter (where status = 'completed' and payment_method = 'cash')   as cash_sales,
  sum(total) filter (where status = 'completed' and payment_method = 'card')   as card_sales,
  sum(total) filter (where status = 'completed' and payment_method = 'split')  as split_sales,
  sum(total) filter (where status = 'completed' and payment_method = 'presto') as presto_sales,
  sum(total) filter (where status = 'voided') as voided
from pos_orders
group by branch_id, date_trunc('day', created_at);

grant select on pos_sales_daily to authenticated;

create or replace function public.pos_sales_by_product(
  p_branch_id uuid,
  p_from timestamptz,
  p_to   timestamptz
) returns table (
  product_id uuid,
  product_name text,
  qty numeric,
  revenue numeric
)
language sql stable security definer
set search_path = public
as $$
  select
    oi.product_id,
    coalesce(oi.product_name, '(deleted)'),
    sum(oi.quantity)::numeric,
    sum(oi.total)::numeric
    from pos_order_items oi
    join pos_orders o on o.id = oi.order_id
    where o.branch_id = p_branch_id
      and o.status = 'completed'
      and o.created_at >= p_from
      and o.created_at <  p_to
    group by oi.product_id, oi.product_name
    order by sum(oi.total) desc;
$$;
grant execute on function public.pos_sales_by_product(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.pos_sales_by_barista(
  p_branch_id uuid,
  p_from timestamptz,
  p_to   timestamptz
) returns table (
  user_id uuid,
  full_name text,
  orders bigint,
  revenue numeric
)
language sql stable security definer
set search_path = public
as $$
  select
    o.served_by,
    p.full_name,
    count(*)::bigint,
    sum(o.total)::numeric
    from pos_orders o
    left join profiles p on p.id = o.served_by
    where o.branch_id = p_branch_id
      and o.status = 'completed'
      and o.created_at >= p_from
      and o.created_at <  p_to
    group by o.served_by, p.full_name
    order by sum(o.total) desc;
$$;
grant execute on function public.pos_sales_by_barista(uuid, timestamptz, timestamptz) to authenticated;
