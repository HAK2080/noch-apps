-- Module 2: authoritative tender events, shift cash control, and safe closeout.
--
-- This migration is additive. Existing order, shift, audit, and cash-movement
-- records remain in place. Open shift counters are snapshotted before repair.

begin;

create table if not exists public.pos_tender_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.pos_branches(id) on delete restrict,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  order_id uuid not null references public.pos_orders(id) on delete restrict,
  event_type text not null
    check (event_type in ('sale', 'refund', 'void', 'payment_correction')),
  tender_type text not null
    check (tender_type in ('cash', 'card', 'presto', 'other')),
  signed_amount_lyd numeric(12,3) not null
    check (signed_amount_lyd <> 0),
  occurred_at timestamptz not null default now(),
  source_quality text not null default 'recorded'
    check (source_quality in ('recorded', 'reconstructed')),
  source_ref text not null unique,
  actor_user_id uuid references public.profiles(id) on delete set null,
  served_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pos_tender_events_branch_time_idx
  on public.pos_tender_events(branch_id, occurred_at);
create index if not exists pos_tender_events_shift_time_idx
  on public.pos_tender_events(shift_id, occurred_at)
  where shift_id is not null;
create index if not exists pos_tender_events_order_idx
  on public.pos_tender_events(order_id, occurred_at);

alter table public.pos_tender_events enable row level security;
drop policy if exists pos_tender_events_read on public.pos_tender_events;
create policy pos_tender_events_read
  on public.pos_tender_events
  for select
  to authenticated
  using (true);

revoke insert, update, delete on public.pos_tender_events from anon, authenticated;
grant select on public.pos_tender_events to authenticated;

alter table public.pos_shifts
  add column if not exists cash_counted boolean not null default false;

update public.pos_shifts
set cash_counted = (
  closing_cash is not null
  and coalesce(notes, '') not like '%[Cash count not entered at close]%'
)
where status = 'closed';

comment on column public.pos_shifts.cash_counted is
  'True only when closing_cash came from a physical drawer count.';

create or replace function public.pos_record_tender_legs(
  p_order_id uuid,
  p_shift_id uuid,
  p_event_type text,
  p_direction integer,
  p_amount numeric,
  p_order_total numeric,
  p_payment_method text,
  p_card_amount numeric,
  p_occurred_at timestamptz,
  p_source_quality text,
  p_source_ref text,
  p_served_by uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pos_orders;
  v_method text := lower(coalesce(p_payment_method, 'other'));
  v_amount numeric := round(abs(coalesce(p_amount, 0)), 3);
  v_total numeric := greatest(coalesce(p_order_total, 0), 0);
  v_card numeric := 0;
  v_cash numeric := 0;
begin
  if p_direction not in (-1, 1) then
    raise exception 'tender event direction must be -1 or 1';
  end if;
  if v_amount <= 0 then return; end if;
  if p_event_type not in ('sale', 'refund', 'void', 'payment_correction') then
    raise exception 'unsupported tender event type %', p_event_type;
  end if;
  if p_source_quality not in ('recorded', 'reconstructed') then
    raise exception 'unsupported tender source quality %', p_source_quality;
  end if;

  select * into v_order
  from public.pos_orders
  where id = p_order_id;
  if not found then raise exception 'order not found'; end if;

  if v_method = 'split' then
    if v_total <= 0 then
      v_cash := v_amount;
    else
      v_card := round(
        v_amount
          * greatest(least(coalesce(p_card_amount, 0), v_total), 0)
          / v_total,
        3
      );
      v_cash := v_amount - v_card;
    end if;
  elsif v_method = 'cash' then
    v_cash := v_amount;
  elsif v_method = 'card' then
    v_card := v_amount;
  end if;

  if v_cash > 0 then
    insert into public.pos_tender_events (
      branch_id, shift_id, order_id, event_type, tender_type,
      signed_amount_lyd, occurred_at, source_quality, source_ref,
      actor_user_id, served_by, metadata
    ) values (
      v_order.branch_id, p_shift_id, p_order_id, p_event_type, 'cash',
      p_direction * v_cash, coalesce(p_occurred_at, now()), p_source_quality,
      p_source_ref || ':cash', auth.uid(), p_served_by, p_metadata
    )
    on conflict (source_ref) do nothing;
  end if;

  if v_card > 0 then
    insert into public.pos_tender_events (
      branch_id, shift_id, order_id, event_type, tender_type,
      signed_amount_lyd, occurred_at, source_quality, source_ref,
      actor_user_id, served_by, metadata
    ) values (
      v_order.branch_id, p_shift_id, p_order_id, p_event_type, 'card',
      p_direction * v_card, coalesce(p_occurred_at, now()), p_source_quality,
      p_source_ref || ':card', auth.uid(), p_served_by, p_metadata
    )
    on conflict (source_ref) do nothing;
  end if;

  if v_method = 'presto' then
    insert into public.pos_tender_events (
      branch_id, shift_id, order_id, event_type, tender_type,
      signed_amount_lyd, occurred_at, source_quality, source_ref,
      actor_user_id, served_by, metadata
    ) values (
      v_order.branch_id, p_shift_id, p_order_id, p_event_type, 'presto',
      p_direction * v_amount, coalesce(p_occurred_at, now()), p_source_quality,
      p_source_ref || ':presto', auth.uid(), p_served_by, p_metadata
    )
    on conflict (source_ref) do nothing;
  elsif v_method not in ('cash', 'card', 'split') then
    insert into public.pos_tender_events (
      branch_id, shift_id, order_id, event_type, tender_type,
      signed_amount_lyd, occurred_at, source_quality, source_ref,
      actor_user_id, served_by, metadata
    ) values (
      v_order.branch_id, p_shift_id, p_order_id, p_event_type, 'other',
      p_direction * v_amount, coalesce(p_occurred_at, now()), p_source_quality,
      p_source_ref || ':other', auth.uid(), p_served_by, p_metadata
    )
    on conflict (source_ref) do nothing;
  end if;
end;
$$;

revoke all on function public.pos_record_tender_legs(
  uuid, uuid, text, integer, numeric, numeric, text, numeric,
  timestamptz, text, text, uuid, jsonb
) from public, anon, authenticated;

-- Backfill one immutable sale event per tender leg. Order rows are direct
-- evidence; historical refund/void tender allocation is reconstructed because
-- the old workflow did not store the return tender.
do $$
declare
  v_order public.pos_orders;
  v_refund_at timestamptz;
  v_remaining numeric;
begin
  for v_order in
    select *
    from public.pos_orders
    where status in ('completed', 'voided')
  loop
    perform public.pos_record_tender_legs(
      v_order.id,
      v_order.shift_id,
      'sale',
      1,
      v_order.total,
      v_order.total,
      v_order.payment_method,
      v_order.card_amount,
      v_order.created_at,
      'recorded',
      'order:' || v_order.id::text || ':sale',
      v_order.served_by,
      jsonb_build_object('backfilled', true)
    );

    if coalesce(v_order.refunded_amount_lyd, 0) > 0 then
      select max(a.created_at)
      into v_refund_at
      from public.pos_audit_log a
      where a.entity_type = 'pos_orders'
        and a.entity_id = v_order.id
        and a.action = 'partial_refund';

      perform public.pos_record_tender_legs(
        v_order.id,
        v_order.shift_id,
        'refund',
        -1,
        v_order.refunded_amount_lyd,
        v_order.total,
        v_order.payment_method,
        v_order.card_amount,
        coalesce(v_refund_at, v_order.created_at),
        'reconstructed',
        'order:' || v_order.id::text || ':refund:backfill',
        v_order.served_by,
        jsonb_build_object(
          'backfilled', true,
          'allocation_rule', 'original_tender_pro_rata'
        )
      );
    end if;

    if v_order.status = 'voided' then
      v_remaining := greatest(
        coalesce(v_order.total, 0) - coalesce(v_order.refunded_amount_lyd, 0),
        0
      );
      perform public.pos_record_tender_legs(
        v_order.id,
        v_order.shift_id,
        'void',
        -1,
        v_remaining,
        v_order.total,
        v_order.payment_method,
        v_order.card_amount,
        coalesce(v_order.voided_at, v_order.created_at),
        'reconstructed',
        'order:' || v_order.id::text || ':void:backfill',
        v_order.served_by,
        jsonb_build_object(
          'backfilled', true,
          'allocation_rule', 'remaining_original_tender_pro_rata'
        )
      );
    end if;
  end loop;
end;
$$;

create or replace function public.pos_capture_order_tender_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_remaining numeric;
begin
  if tg_op = 'INSERT' then
    if new.status in ('completed', 'voided') then
      perform public.pos_record_tender_legs(
        new.id, new.shift_id, 'sale', 1, new.total, new.total,
        new.payment_method, new.card_amount, new.created_at, 'recorded',
        'order:' || new.id::text || ':sale', new.served_by, '{}'::jsonb
      );
    end if;
    return new;
  end if;

  if new.status = 'completed'
     and (
       old.payment_method is distinct from new.payment_method
       or old.card_amount is distinct from new.card_amount
     ) then
    v_ref := 'order:' || new.id::text || ':payment-correction:' || gen_random_uuid()::text;
    v_remaining := greatest(
      coalesce(new.total, 0) - coalesce(new.refunded_amount_lyd, 0),
      0
    );
    perform public.pos_record_tender_legs(
      new.id, new.shift_id, 'payment_correction', -1, v_remaining, old.total,
      old.payment_method, old.card_amount, now(), 'recorded',
      v_ref || ':from', new.served_by,
      jsonb_build_object('from', old.payment_method, 'to', new.payment_method)
    );
    perform public.pos_record_tender_legs(
      new.id, new.shift_id, 'payment_correction', 1, v_remaining, new.total,
      new.payment_method, new.card_amount, now(), 'recorded',
      v_ref || ':to', new.served_by,
      jsonb_build_object('from', old.payment_method, 'to', new.payment_method)
    );
  end if;

  if old.status is distinct from new.status and new.status = 'voided' then
    v_remaining := greatest(
      coalesce(new.total, 0) - coalesce(new.refunded_amount_lyd, 0),
      0
    );
    perform public.pos_record_tender_legs(
      new.id, new.shift_id, 'void', -1, v_remaining, new.total,
      new.payment_method, new.card_amount, coalesce(new.voided_at, now()),
      'recorded', 'order:' || new.id::text || ':void',
      new.served_by,
      jsonb_build_object('allocation_rule', 'remaining_original_tender_pro_rata')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists pos_capture_order_tender_events on public.pos_orders;
create trigger pos_capture_order_tender_events
after insert or update of status, payment_method, card_amount
on public.pos_orders
for each row
execute function public.pos_capture_order_tender_events();

create or replace function public.refund_pos_order_lines_v2(
  p_order_id uuid,
  p_lines jsonb,
  p_reason text,
  p_refund_method text,
  p_refund_shift_id uuid,
  p_served_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pos_orders;
  v_line jsonb;
  v_item public.pos_order_items;
  v_qty int;
  v_unit numeric;
  v_refund_total numeric := 0;
  v_method text;
  v_target_shift uuid;
  v_cash_refund numeric := 0;
  v_card_refund numeric := 0;
  v_presto_refund numeric := 0;
  v_other_refund numeric := 0;
  v_audit_id uuid;
begin
  select * into v_order
  from public.pos_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status <> 'completed' then
    raise exception 'only completed orders can be refunded';
  end if;

  v_method := lower(coalesce(nullif(p_refund_method, ''), 'original'));
  if v_method = 'original' then
    v_method := lower(coalesce(v_order.payment_method, 'other'));
  end if;
  if v_method not in ('cash', 'card', 'split', 'presto', 'other') then
    raise exception 'unsupported refund tender %', v_method;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_item
    from public.pos_order_items
    where id = (v_line->>'order_item_id')::uuid
      and order_id = p_order_id
    for update;
    if not found then continue; end if;

    v_qty := (v_line->>'refund_qty')::int;
    if v_qty is null or v_qty <= 0 then continue; end if;
    if v_qty + coalesce(v_item.refunded_qty, 0) > v_item.quantity then
      raise exception 'refund qty exceeds remaining for line %', v_item.id;
    end if;

    v_unit := v_item.unit_price;
    v_refund_total := v_refund_total + (v_unit * v_qty);

    update public.pos_order_items
    set refunded_qty = coalesce(refunded_qty, 0) + v_qty
    where id = v_item.id;

    if v_item.product_id is not null then
      update public.pos_products
      set stock_qty = stock_qty + v_qty,
          updated_at = now()
      where id = v_item.product_id
        and track_inventory = true;

      insert into public.pos_inventory_movements (
        branch_id, product_id, movement_type, quantity, reference_id, notes
      )
      select
        v_order.branch_id,
        v_item.product_id,
        'refund',
        v_qty,
        v_order.id,
        'Partial refund of ' || v_order.order_number || ' line ' || v_item.id
      where exists (
        select 1
        from public.pos_products p
        where p.id = v_item.product_id
          and p.track_inventory = true
      );
    end if;
  end loop;

  if v_refund_total <= 0 then
    return jsonb_build_object('refunded', 0, 'order_number', v_order.order_number);
  end if;

  if coalesce(v_order.refunded_amount_lyd, 0) + v_refund_total
      > coalesce(v_order.total, 0) + 0.001 then
    raise exception 'refund total exceeds the remaining order value';
  end if;

  if v_method = 'split' then
    if coalesce(v_order.total, 0) <= 0 then
      v_cash_refund := v_refund_total;
    else
      v_card_refund := round(
        v_refund_total
          * greatest(least(coalesce(v_order.card_amount, 0), v_order.total), 0)
          / v_order.total,
        3
      );
      v_cash_refund := v_refund_total - v_card_refund;
    end if;
  elsif v_method = 'cash' then
    v_cash_refund := v_refund_total;
  elsif v_method = 'card' then
    v_card_refund := v_refund_total;
  elsif v_method = 'presto' then
    v_presto_refund := v_refund_total;
  else
    v_other_refund := v_refund_total;
  end if;

  if p_refund_shift_id is not null then
    select s.id into v_target_shift
    from public.pos_shifts s
    where s.id = p_refund_shift_id
      and s.branch_id = v_order.branch_id
      and s.status = 'open';
    if not found then
      raise exception 'refund shift is not an open shift for this branch';
    end if;
  elsif v_order.shift_id is not null then
    select s.id into v_target_shift
    from public.pos_shifts s
    where s.id = v_order.shift_id
      and s.status = 'open';
  end if;

  if v_cash_refund > 0 and v_target_shift is null then
    raise exception 'cash refund requires an open shift';
  end if;

  update public.pos_orders
  set refunded_amount_lyd = coalesce(refunded_amount_lyd, 0) + v_refund_total
  where id = p_order_id;

  if v_target_shift is not null then
    update public.pos_shifts
    set total_sales = coalesce(total_sales, 0) - v_refund_total,
        total_cash_sales = coalesce(total_cash_sales, 0) - v_cash_refund,
        total_card_sales = coalesce(total_card_sales, 0) - v_card_refund,
        total_presto_sales = coalesce(total_presto_sales, 0) - v_presto_refund,
        total_presto_uncollected = greatest(
          0,
          coalesce(total_presto_uncollected, 0)
            - case
                when v_method = 'presto'
                 and v_order.payment_method = 'presto'
                 and v_order.presto_collected is not true
                then v_presto_refund
                else 0
              end
        ),
        expected_cash = coalesce(expected_cash, 0) - v_cash_refund
    where id = v_target_shift
      and status = 'open';
  end if;

  insert into public.pos_audit_log (
    branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata
  ) values (
    v_order.branch_id,
    auth.uid(),
    p_served_by,
    'partial_refund',
    'pos_orders',
    p_order_id,
    jsonb_build_object(
      'reason', p_reason,
      'lines', p_lines,
      'refund_total', v_refund_total,
      'refund_method', v_method,
      'refund_shift_id', v_target_shift,
      'cash_refund', v_cash_refund,
      'card_refund', v_card_refund,
      'presto_refund', v_presto_refund,
      'other_refund', v_other_refund,
      'settlement_review_required',
        v_method = 'presto' and v_order.presto_collected is true
    )
  )
  returning id into v_audit_id;

  perform public.pos_record_tender_legs(
    v_order.id,
    v_target_shift,
    'refund',
    -1,
    v_refund_total,
    v_order.total,
    v_method,
    case when v_method = 'split' then v_order.card_amount else 0 end,
    now(),
    'recorded',
    'audit:' || v_audit_id::text || ':refund',
    p_served_by,
    jsonb_build_object(
      'reason', p_reason,
      'refund_shift_id', v_target_shift,
      'settlement_review_required',
        v_method = 'presto' and v_order.presto_collected is true
    )
  );

  return jsonb_build_object(
    'refunded', v_refund_total,
    'order_number', v_order.order_number,
    'refund_method', v_method,
    'refund_shift_id', v_target_shift,
    'cash_refund', v_cash_refund,
    'card_refund', v_card_refund,
    'presto_refund', v_presto_refund,
    'other_refund', v_other_refund
  );
end;
$$;

grant execute on function public.refund_pos_order_lines_v2(
  uuid, jsonb, text, text, uuid, uuid
) to authenticated;

create or replace function public.refund_pos_order_lines(
  p_order_id uuid,
  p_lines jsonb,
  p_reason text,
  p_served_by uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.refund_pos_order_lines_v2(
    p_order_id,
    p_lines,
    p_reason,
    'original',
    null,
    p_served_by
  );
$$;

grant execute on function public.refund_pos_order_lines(
  uuid, jsonb, text, uuid
) to authenticated;

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
  v_order public.pos_orders;
  v_shift_status text;
  v_remaining numeric;
  v_card_remaining numeric := 0;
  v_cash_remaining numeric := 0;
begin
  select * into v_order
  from public.pos_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'voided' then
    return jsonb_build_object('already_voided', true);
  end if;
  if v_order.status <> 'completed' then
    raise exception 'only completed orders can be voided';
  end if;

  if v_order.shift_id is not null then
    select status into v_shift_status
    from public.pos_shifts
    where id = v_order.shift_id;
    if v_shift_status is distinct from 'open' then
      raise exception 'closed shifts are immutable; use the refund workflow';
    end if;
  end if;

  v_remaining := greatest(
    coalesce(v_order.total, 0) - coalesce(v_order.refunded_amount_lyd, 0),
    0
  );

  if v_order.payment_method = 'cash' then
    v_cash_remaining := v_remaining;
  elsif v_order.payment_method = 'card' then
    v_card_remaining := v_remaining;
  elsif v_order.payment_method = 'split' and coalesce(v_order.total, 0) > 0 then
    v_card_remaining := round(
      v_remaining
        * greatest(least(coalesce(v_order.card_amount, 0), v_order.total), 0)
        / v_order.total,
      3
    );
    v_cash_remaining := v_remaining - v_card_remaining;
  end if;

  update public.pos_orders
  set status = 'voided',
      voided_at = now(),
      void_reason = p_reason
  where id = p_order_id;

  insert into public.pos_inventory_movements (
    branch_id, product_id, movement_type, quantity,
    stock_before, stock_after, reference_id, notes
  )
  select
    v_order.branch_id,
    oi.product_id,
    'void',
    oi.quantity - coalesce(oi.refunded_qty, 0),
    p.stock_qty,
    p.stock_qty + oi.quantity - coalesce(oi.refunded_qty, 0),
    v_order.id,
    'Void of order ' || v_order.order_number
  from public.pos_order_items oi
  join public.pos_products p on p.id = oi.product_id
  where oi.order_id = v_order.id
    and p.track_inventory = true
    and oi.quantity > coalesce(oi.refunded_qty, 0);

  update public.pos_products p
  set stock_qty = p.stock_qty + oi.quantity - coalesce(oi.refunded_qty, 0),
      updated_at = now()
  from public.pos_order_items oi
  where oi.order_id = v_order.id
    and p.id = oi.product_id
    and p.track_inventory = true
    and oi.quantity > coalesce(oi.refunded_qty, 0);

  if v_order.shift_id is not null then
    update public.pos_shifts
    set total_sales = coalesce(total_sales, 0) - v_remaining,
        total_orders = greatest(0, coalesce(total_orders, 0) - 1),
        total_cash_sales = coalesce(total_cash_sales, 0) - v_cash_remaining,
        total_card_sales = coalesce(total_card_sales, 0) - v_card_remaining,
        total_presto_sales = coalesce(total_presto_sales, 0)
          - case when v_order.payment_method = 'presto' then v_remaining else 0 end,
        total_presto_uncollected = greatest(
          0,
          coalesce(total_presto_uncollected, 0)
            - case
                when v_order.payment_method = 'presto'
                 and v_order.presto_collected is not true
                then v_remaining
                else 0
              end
        ),
        total_discounts = greatest(
          0,
          coalesce(total_discounts, 0) - coalesce(v_order.discount_amount, 0)
        ),
        expected_cash = coalesce(expected_cash, 0) - v_cash_remaining
    where id = v_order.shift_id
      and status = 'open';
  end if;

  if v_order.loyalty_stamps_awarded > 0
     and v_order.loyalty_customer_id is not null then
    begin
      update public.loyalty_customers
      set current_stamps = greatest(
            0,
            coalesce(current_stamps, 0) - v_order.loyalty_stamps_awarded
          ),
          total_stamps = greatest(
            0,
            coalesce(total_stamps, 0) - v_order.loyalty_stamps_awarded
          ),
          updated_at = now()
      where id = v_order.loyalty_customer_id;
    exception when others then
      null;
    end;
  end if;

  insert into public.pos_audit_log (
    branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata
  ) values (
    v_order.branch_id,
    auth.uid(),
    p_served_by,
    'order_voided',
    'pos_orders',
    p_order_id,
    jsonb_build_object(
      'reason', p_reason,
      'order_number', v_order.order_number,
      'remaining_value_reversed', v_remaining,
      'previous_refunds', coalesce(v_order.refunded_amount_lyd, 0)
    )
  );

  return jsonb_build_object(
    'voided', true,
    'order_number', v_order.order_number,
    'remaining_value_reversed', v_remaining
  );
end;
$$;

grant execute on function public.void_pos_order(uuid, text, uuid)
  to authenticated;

create or replace function public.switch_pos_order_payment(
  p_order_id uuid,
  p_new_method text,
  p_served_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.pos_orders;
  v_old text;
  v_amount numeric;
  v_shift_status text;
begin
  if p_new_method not in ('cash', 'card') then
    raise exception 'switch only supports cash or card, got %', p_new_method;
  end if;

  select * into v_order
  from public.pos_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status <> 'completed' then
    raise exception 'only completed orders can change payment method';
  end if;

  v_old := v_order.payment_method;
  if v_old not in ('cash', 'card') then
    raise exception 'only cash and card orders can be switched';
  end if;
  if v_old = p_new_method then
    return jsonb_build_object('changed', false, 'method', p_new_method);
  end if;

  if v_order.shift_id is not null then
    select status into v_shift_status
    from public.pos_shifts
    where id = v_order.shift_id;
    if v_shift_status is distinct from 'open' then
      raise exception 'closed shifts are immutable; record a finance adjustment';
    end if;
  end if;

  v_amount := greatest(
    coalesce(v_order.total, 0) - coalesce(v_order.refunded_amount_lyd, 0),
    0
  );

  update public.pos_orders
  set payment_method = p_new_method,
      cash_tendered = case when p_new_method = 'card' then null else cash_tendered end,
      change_due = case when p_new_method = 'card' then null else change_due end
  where id = p_order_id;

  if v_order.shift_id is not null then
    if p_new_method = 'card' then
      update public.pos_shifts
      set total_cash_sales = coalesce(total_cash_sales, 0) - v_amount,
          total_card_sales = coalesce(total_card_sales, 0) + v_amount,
          expected_cash = coalesce(expected_cash, 0) - v_amount
      where id = v_order.shift_id
        and status = 'open';
    else
      update public.pos_shifts
      set total_card_sales = coalesce(total_card_sales, 0) - v_amount,
          total_cash_sales = coalesce(total_cash_sales, 0) + v_amount,
          expected_cash = coalesce(expected_cash, 0) + v_amount
      where id = v_order.shift_id
        and status = 'open';
    end if;
  end if;

  insert into public.pos_audit_log (
    branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata
  ) values (
    v_order.branch_id,
    auth.uid(),
    p_served_by,
    'switch_payment_method',
    'pos_orders',
    p_order_id,
    jsonb_build_object('from', v_old, 'to', p_new_method, 'amount', v_amount)
  );

  return jsonb_build_object(
    'changed', true,
    'from', v_old,
    'to', p_new_method,
    'amount', v_amount,
    'order_number', v_order.order_number
  );
end;
$$;

grant execute on function public.switch_pos_order_payment(uuid, text, uuid)
  to authenticated, service_role;

create or replace function public.pos_sales_control_summary(
  p_branch_id uuid default null,
  p_from date default current_date,
  p_to date default current_date
)
returns table (
  order_count bigint,
  completed_sales numeric,
  linked_refunds numeric,
  net_sales numeric,
  gross_cash_tender numeric,
  gross_card_tender numeric,
  gross_presto_tender numeric,
  gross_other_tender numeric,
  period_cash_movement numeric,
  period_card_movement numeric,
  period_presto_movement numeric,
  period_other_movement numeric,
  period_refunds numeric,
  period_void_reversals numeric,
  period_net_tender_movement numeric,
  payment_reconciliation_variance numeric,
  period_event_variance numeric,
  timing_variance numeric,
  reconstructed_event_count bigint,
  untracked_order_count bigint,
  presto_unsettled_amount numeric,
  presto_unsettled_count bigint,
  card_settlement_status text,
  latest_order_at timestamptz,
  latest_tender_event_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      ((p_from::timestamp + interval '5 hours') at time zone 'Africa/Tripoli') as from_utc,
      (((p_to + 1)::timestamp + interval '5 hours') at time zone 'Africa/Tripoli') as to_utc
  ),
  finance as (
    select *
    from public.finance_payment_reconciliation(p_branch_id, p_from, p_to)
  ),
  events as (
    select e.*
    from public.pos_tender_events e
    cross join bounds
    where (p_branch_id is null or e.branch_id = p_branch_id)
      and e.occurred_at >= bounds.from_utc
      and e.occurred_at < bounds.to_utc
  ),
  event_totals as (
    select
      coalesce(sum(signed_amount_lyd) filter (where tender_type = 'cash'), 0) as cash_movement,
      coalesce(sum(signed_amount_lyd) filter (where tender_type = 'card'), 0) as card_movement,
      coalesce(sum(signed_amount_lyd) filter (where tender_type = 'presto'), 0) as presto_movement,
      coalesce(sum(signed_amount_lyd) filter (where tender_type = 'other'), 0) as other_movement,
      coalesce(-sum(signed_amount_lyd) filter (where event_type = 'refund'), 0) as refunds,
      coalesce(-sum(signed_amount_lyd) filter (where event_type = 'void'), 0) as voids,
      coalesce(sum(signed_amount_lyd), 0) as net_movement,
      count(*) filter (where source_quality = 'reconstructed') as reconstructed_count,
      max(occurred_at) as latest_event_at
    from events
  ),
  tracking as (
    select count(*) as untracked_count
    from public.pos_orders o
    cross join bounds
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.status in ('completed', 'voided')
      and o.created_at >= bounds.from_utc
      and o.created_at < bounds.to_utc
      and not exists (
        select 1
        from public.pos_tender_events e
        where e.order_id = o.id
          and e.event_type = 'sale'
      )
  ),
  presto as (
    select
      coalesce(sum(greatest(
        coalesce(o.total, 0) - coalesce(o.refunded_amount_lyd, 0),
        0
      )), 0) as unsettled_amount,
      count(*) as unsettled_count
    from public.pos_orders o
    cross join bounds
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.status = 'completed'
      and o.payment_method = 'presto'
      and o.presto_collected is not true
      and o.created_at >= bounds.from_utc
      and o.created_at < bounds.to_utc
  )
  select
    f.order_count,
    f.completed_sales,
    f.refunds,
    f.net_sales,
    f.cash_collected,
    f.card_collected,
    f.presto_collected,
    f.other_collected,
    e.cash_movement,
    e.card_movement,
    e.presto_movement,
    e.other_movement,
    e.refunds,
    e.voids,
    e.net_movement,
    f.completed_sales
      - (f.cash_collected + f.card_collected + f.presto_collected + f.other_collected),
    e.net_movement
      - (e.cash_movement + e.card_movement + e.presto_movement + e.other_movement),
    f.net_sales - e.net_movement,
    e.reconstructed_count,
    t.untracked_count,
    p.unsettled_amount,
    p.unsettled_count,
    'unavailable'::text,
    f.latest_order_at,
    e.latest_event_at
  from finance f
  cross join event_totals e
  cross join tracking t
  cross join presto p;
$$;

grant execute on function public.pos_sales_control_summary(uuid, date, date)
  to authenticated;

create or replace function public.pos_shift_control(
  p_branch_id uuid default null,
  p_shift_id uuid default null,
  p_from date default current_date,
  p_to date default current_date
)
returns table (
  shift_id uuid,
  branch_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  status text,
  opening_cash numeric,
  expected_drawer_cash numeric,
  counted_drawer_cash numeric,
  cash_counted boolean,
  cash_variance numeric,
  net_sales numeric,
  order_count bigint,
  net_cash_tender numeric,
  net_card_tender numeric,
  net_presto_tender numeric,
  net_other_tender numeric,
  refunds numeric,
  void_reversals numeric,
  payment_reconciliation_variance numeric,
  paid_in numeric,
  paid_out numeric,
  safe_drop numeric,
  tip_out numeric,
  stored_expected_cash numeric,
  stored_expected_variance numeric,
  stored_sales_variance numeric,
  reconstructed_event_count bigint,
  untracked_order_count bigint,
  latest_event_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      ((p_from::timestamp + interval '5 hours') at time zone 'Africa/Tripoli') as from_utc,
      (((p_to + 1)::timestamp + interval '5 hours') at time zone 'Africa/Tripoli') as to_utc
  ),
  shifts as (
    select s.*
    from public.pos_shifts s
    cross join bounds
    where (p_branch_id is null or s.branch_id = p_branch_id)
      and (p_shift_id is null or s.id = p_shift_id)
      and (
        p_shift_id is not null
        or (s.opened_at >= bounds.from_utc and s.opened_at < bounds.to_utc)
      )
  )
  select
    s.id,
    s.branch_id,
    s.opened_at,
    s.closed_at,
    s.status,
    coalesce(s.opening_cash, 0),
    coalesce(s.opening_cash, 0)
      + coalesce(e.cash_tender, 0)
      + coalesce(m.paid_in, 0)
      - coalesce(m.paid_out, 0)
      - coalesce(m.safe_drop, 0)
      - coalesce(m.tip_out, 0),
    case when s.cash_counted then s.closing_cash else null end,
    s.cash_counted,
    case
      when s.cash_counted then
        s.closing_cash - (
          coalesce(s.opening_cash, 0)
          + coalesce(e.cash_tender, 0)
          + coalesce(m.paid_in, 0)
          - coalesce(m.paid_out, 0)
          - coalesce(m.safe_drop, 0)
          - coalesce(m.tip_out, 0)
        )
      else null
    end,
    coalesce(e.net_sales, 0),
    coalesce(e.order_count, 0),
    coalesce(e.cash_tender, 0),
    coalesce(e.card_tender, 0),
    coalesce(e.presto_tender, 0),
    coalesce(e.other_tender, 0),
    coalesce(e.refunds, 0),
    coalesce(e.voids, 0),
    coalesce(e.net_sales, 0)
      - (
        coalesce(e.cash_tender, 0)
        + coalesce(e.card_tender, 0)
        + coalesce(e.presto_tender, 0)
        + coalesce(e.other_tender, 0)
      ),
    coalesce(m.paid_in, 0),
    coalesce(m.paid_out, 0),
    coalesce(m.safe_drop, 0),
    coalesce(m.tip_out, 0),
    coalesce(s.expected_cash, 0),
    coalesce(s.expected_cash, 0) - (
      coalesce(s.opening_cash, 0)
      + coalesce(e.cash_tender, 0)
      + coalesce(m.paid_in, 0)
      - coalesce(m.paid_out, 0)
      - coalesce(m.safe_drop, 0)
      - coalesce(m.tip_out, 0)
    ),
    coalesce(s.total_sales, 0) - coalesce(e.net_sales, 0),
    coalesce(e.reconstructed_count, 0),
    coalesce(u.untracked_count, 0),
    e.latest_event_at
  from shifts s
  left join lateral (
    select
      coalesce(sum(te.signed_amount_lyd), 0) as net_sales,
      count(distinct te.order_id) filter (where te.event_type = 'sale')
        - count(distinct te.order_id) filter (where te.event_type = 'void')
        as order_count,
      coalesce(sum(te.signed_amount_lyd) filter (where te.tender_type = 'cash'), 0)
        as cash_tender,
      coalesce(sum(te.signed_amount_lyd) filter (where te.tender_type = 'card'), 0)
        as card_tender,
      coalesce(sum(te.signed_amount_lyd) filter (where te.tender_type = 'presto'), 0)
        as presto_tender,
      coalesce(sum(te.signed_amount_lyd) filter (where te.tender_type = 'other'), 0)
        as other_tender,
      coalesce(-sum(te.signed_amount_lyd) filter (where te.event_type = 'refund'), 0)
        as refunds,
      coalesce(-sum(te.signed_amount_lyd) filter (where te.event_type = 'void'), 0)
        as voids,
      count(*) filter (where te.source_quality = 'reconstructed')
        as reconstructed_count,
      max(te.occurred_at) as latest_event_at
    from public.pos_tender_events te
    where te.shift_id = s.id
  ) e on true
  left join lateral (
    select
      coalesce(sum(cm.amount) filter (where cm.movement_type = 'paid_in'), 0)
        as paid_in,
      coalesce(sum(cm.amount) filter (where cm.movement_type = 'paid_out'), 0)
        as paid_out,
      coalesce(sum(cm.amount) filter (where cm.movement_type = 'safe_drop'), 0)
        as safe_drop,
      coalesce(sum(cm.amount) filter (where cm.movement_type = 'tip_out'), 0)
        as tip_out
    from public.pos_cash_movements cm
    where cm.shift_id = s.id
  ) m on true
  left join lateral (
    select count(*) as untracked_count
    from public.pos_orders o
    where o.shift_id = s.id
      and o.status in ('completed', 'voided')
      and not exists (
        select 1
        from public.pos_tender_events te
        where te.order_id = o.id
          and te.event_type = 'sale'
      )
  ) u on true
  order by s.opened_at desc;
$$;

grant execute on function public.pos_shift_control(uuid, uuid, date, date)
  to authenticated;

create table if not exists public.pos_shift_control_repair_archive_20260731
as
select s.*, now() as archived_at
from public.pos_shifts s
with no data;

alter table public.pos_shift_control_repair_archive_20260731
  enable row level security;

revoke all on public.pos_shift_control_repair_archive_20260731
  from public, anon, authenticated;

insert into public.pos_shift_control_repair_archive_20260731
select s.*, now()
from public.pos_shifts s
where s.status = 'open';

with event_totals as (
  select
    e.shift_id,
    coalesce(sum(e.signed_amount_lyd), 0) as net_sales,
    coalesce(sum(e.signed_amount_lyd) filter (where e.tender_type = 'cash'), 0)
      as cash_tender,
    coalesce(sum(e.signed_amount_lyd) filter (where e.tender_type = 'card'), 0)
      as card_tender,
    coalesce(sum(e.signed_amount_lyd) filter (where e.tender_type = 'presto'), 0)
      as presto_tender,
    count(distinct e.order_id) filter (where e.event_type = 'sale')
      - count(distinct e.order_id) filter (where e.event_type = 'void')
      as order_count
  from public.pos_tender_events e
  where e.shift_id is not null
  group by e.shift_id
),
movement_totals as (
  select
    cm.shift_id,
    coalesce(sum(cm.amount) filter (where cm.movement_type = 'paid_in'), 0)
      as paid_in,
    coalesce(sum(cm.amount) filter (where cm.movement_type = 'paid_out'), 0)
      as paid_out,
    coalesce(sum(cm.amount) filter (where cm.movement_type = 'safe_drop'), 0)
      as safe_drop,
    coalesce(sum(cm.amount) filter (where cm.movement_type = 'tip_out'), 0)
      as tip_out
  from public.pos_cash_movements cm
  where cm.shift_id is not null
  group by cm.shift_id
)
update public.pos_shifts s
set total_sales = coalesce(e.net_sales, 0),
    total_orders = greatest(0, coalesce(e.order_count, 0)),
    total_cash_sales = coalesce(e.cash_tender, 0),
    total_card_sales = coalesce(e.card_tender, 0),
    total_presto_sales = coalesce(e.presto_tender, 0),
    expected_cash = coalesce(s.opening_cash, 0)
      + coalesce(e.cash_tender, 0)
      + coalesce(m.paid_in, 0)
      - coalesce(m.paid_out, 0)
      - coalesce(m.safe_drop, 0)
      - coalesce(m.tip_out, 0)
from event_totals e
left join movement_totals m on m.shift_id = e.shift_id
where s.id = e.shift_id
  and s.status = 'open';

update public.pos_shifts s
set total_sales = 0,
    total_orders = 0,
    total_cash_sales = 0,
    total_card_sales = 0,
    total_presto_sales = 0,
    expected_cash = coalesce(s.opening_cash, 0)
      + coalesce((
          select sum(case
            when cm.movement_type = 'paid_in' then cm.amount
            when cm.movement_type in ('paid_out', 'safe_drop', 'tip_out') then -cm.amount
            else 0
          end)
          from public.pos_cash_movements cm
          where cm.shift_id = s.id
        ), 0)
where s.status = 'open'
  and not exists (
    select 1
    from public.pos_tender_events e
    where e.shift_id = s.id
  );

create or replace function public.close_pos_shift_v2(
  p_shift_id uuid,
  p_actual_cash numeric,
  p_cash_counted boolean,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.pos_shifts;
  v_sales numeric := 0;
  v_cash numeric := 0;
  v_card numeric := 0;
  v_presto numeric := 0;
  v_other numeric := 0;
  v_orders int := 0;
  v_expected numeric := 0;
  v_difference numeric := null;
  v_reconciliation numeric := 0;
  v_paid_in numeric := 0;
  v_paid_out numeric := 0;
  v_safe_drop numeric := 0;
  v_tip_out numeric := 0;
begin
  select * into v_shift
  from public.pos_shifts
  where id = p_shift_id
  for update;
  if not found then raise exception 'shift not found'; end if;
  if v_shift.status <> 'open' then
    raise exception 'shift is already %', v_shift.status using errcode = 'P0001';
  end if;
  if coalesce(p_cash_counted, false)
     and (p_actual_cash is null or p_actual_cash < 0) then
    raise exception 'counted cash must be zero or greater';
  end if;

  select
    coalesce(sum(e.signed_amount_lyd), 0),
    coalesce(sum(e.signed_amount_lyd) filter (where e.tender_type = 'cash'), 0),
    coalesce(sum(e.signed_amount_lyd) filter (where e.tender_type = 'card'), 0),
    coalesce(sum(e.signed_amount_lyd) filter (where e.tender_type = 'presto'), 0),
    coalesce(sum(e.signed_amount_lyd) filter (where e.tender_type = 'other'), 0),
    greatest(
      0,
      count(distinct e.order_id) filter (where e.event_type = 'sale')
        - count(distinct e.order_id) filter (where e.event_type = 'void')
    )
  into v_sales, v_cash, v_card, v_presto, v_other, v_orders
  from public.pos_tender_events e
  where e.shift_id = p_shift_id;

  select
    coalesce(sum(cm.amount) filter (where cm.movement_type = 'paid_in'), 0),
    coalesce(sum(cm.amount) filter (where cm.movement_type = 'paid_out'), 0),
    coalesce(sum(cm.amount) filter (where cm.movement_type = 'safe_drop'), 0),
    coalesce(sum(cm.amount) filter (where cm.movement_type = 'tip_out'), 0)
  into v_paid_in, v_paid_out, v_safe_drop, v_tip_out
  from public.pos_cash_movements cm
  where cm.shift_id = p_shift_id;

  v_expected := coalesce(v_shift.opening_cash, 0)
    + v_cash + v_paid_in - v_paid_out - v_safe_drop - v_tip_out;
  v_reconciliation := v_sales - (v_cash + v_card + v_presto + v_other);

  if coalesce(p_cash_counted, false) then
    v_difference := p_actual_cash - v_expected;
  end if;

  update public.pos_shifts
  set status = 'closed',
      closed_at = now(),
      closing_cash = case when p_cash_counted then p_actual_cash else null end,
      cash_counted = coalesce(p_cash_counted, false),
      cash_difference = v_difference,
      expected_cash = v_expected,
      total_sales = v_sales,
      total_orders = v_orders,
      total_cash_sales = v_cash,
      total_card_sales = v_card,
      total_presto_sales = v_presto,
      notes = p_notes
  where id = p_shift_id;

  insert into public.pos_audit_log (
    branch_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    v_shift.branch_id,
    auth.uid(),
    'shift_closed',
    'pos_shifts',
    p_shift_id,
    jsonb_build_object(
      'cash_counted', coalesce(p_cash_counted, false),
      'expected_cash', v_expected,
      'actual_cash', case when p_cash_counted then p_actual_cash else null end,
      'cash_difference', v_difference,
      'payment_reconciliation_variance', v_reconciliation,
      'orders_count', v_orders
    )
  );

  return jsonb_build_object(
    'shift_id', p_shift_id,
    'cash_counted', coalesce(p_cash_counted, false),
    'cash_difference', v_difference,
    'payment_reconciliation_variance', v_reconciliation,
    'orders_count', v_orders,
    'expected_cash', v_expected
  );
end;
$$;

grant execute on function public.close_pos_shift_v2(
  uuid, numeric, boolean, text
) to authenticated;

create or replace function public.close_pos_shift(
  p_shift_id uuid,
  p_actual_cash numeric,
  p_notes text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.close_pos_shift_v2(
    p_shift_id,
    p_actual_cash,
    true,
    p_notes
  );
$$;

grant execute on function public.close_pos_shift(uuid, numeric, text)
  to authenticated;

comment on table public.pos_tender_events is
  'Immutable source for customer tender movement. Split payments are stored as cash and card legs.';
comment on function public.pos_sales_control_summary(uuid, date, date) is
  'Owner sales and tender control using Tripoli 05:00 business-day boundaries.';
comment on function public.pos_shift_control(uuid, uuid, date, date) is
  'Authoritative shift closeout derived from tender events and cash movements.';

commit;
