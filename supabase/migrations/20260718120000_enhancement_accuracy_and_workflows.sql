-- Accuracy and workflow recommendations from ENHANCEMENTS.md.

-- POS reports: expose split tenders and refunds in the same business-day bucket.
create or replace view public.pos_sales_daily as
select
  branch_id,
  (date_trunc('day', (created_at at time zone 'Africa/Tripoli') - interval '5 hours'))::date as day,
  count(*) filter (where status = 'completed') as orders,
  sum(total) filter (where status = 'completed') as gross,
  sum(discount_amount) filter (where status = 'completed') as discounts,
  sum(total) filter (where status = 'completed' and payment_method = 'cash') as cash_sales,
  sum(total) filter (where status = 'completed' and payment_method = 'card') as card_sales,
  sum(total) filter (where status = 'completed' and payment_method = 'split') as split_sales,
  sum(total) filter (where status = 'completed' and payment_method = 'presto') as presto_sales,
  sum(total) filter (where status = 'voided') as voided,
  sum(coalesce(refunded_amount_lyd, 0)) filter (where status = 'completed') as refunds
from public.pos_orders
group by branch_id, (date_trunc('day', (created_at at time zone 'Africa/Tripoli') - interval '5 hours'));

grant select on public.pos_sales_daily to authenticated;

-- Join expense cost centres to the branch identity used by POS and reporting.
alter table public.cost_centers
  add column if not exists pos_branch_id uuid references public.pos_branches(id) on delete set null;
create index if not exists cost_centers_pos_branch_idx on public.cost_centers(pos_branch_id);
update public.cost_centers
set pos_branch_id = (select id from public.pos_branches where name ilike '%Hay Alandlous%' limit 1)
where id = 'CC01' and pos_branch_id is null;
update public.cost_centers
set pos_branch_id = (select id from public.pos_branches where name ilike '%Jaraba%' limit 1)
where id = 'CC02' and pos_branch_id is null;
update public.cost_centers
set pos_branch_id = (select id from public.pos_branches where name ilike 'Bloom%' limit 1)
where id = 'CC03' and pos_branch_id is null;

-- Map the expense taxonomy into finance reporting without renaming operational categories.
alter table public.expense_categories
  add column if not exists finance_class text not null default 'opex'
    check (finance_class in ('opex', 'capex', 'prepaid', 'exclude'));

-- Checkout is the loyalty integration hub. Claim each order once, then use the
-- canonical loyalty RPC so ledger, reward, tier, streak and visit fields agree.
create table if not exists public.loyalty_order_awards (
  order_id uuid primary key references public.pos_orders(id) on delete cascade,
  customer_id uuid not null references public.loyalty_customers(id) on delete cascade,
  stamp_count int not null check (stamp_count > 0),
  awarded_at timestamptz not null default now()
);

alter table public.loyalty_order_awards enable row level security;
drop policy if exists "loyalty_order_awards_read" on public.loyalty_order_awards;
create policy "loyalty_order_awards_read" on public.loyalty_order_awards
  for select to authenticated using (true);

create or replace function public.award_checkout_loyalty_stamps()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_i int;
begin
  if new.status <> 'completed' or new.loyalty_customer_id is null then
    return new;
  end if;

  v_count := greatest(1, coalesce(new.loyalty_stamps_awarded, 0));
  insert into loyalty_order_awards(order_id, customer_id, stamp_count)
  values (new.id, new.loyalty_customer_id, v_count)
  on conflict (order_id) do nothing;

  if not found then return new; end if;

  for v_i in 1..v_count loop
    perform award_loyalty_stamp(
      new.loyalty_customer_id,
      coalesce(new.served_by, auth.uid()),
      'POS order ' || coalesce(new.order_number::text, new.id::text)
    );
  end loop;
  return new;
end $$;

drop trigger if exists trg_award_checkout_loyalty_stamps on public.pos_orders;
create trigger trg_award_checkout_loyalty_stamps
after insert on public.pos_orders
for each row execute function public.award_checkout_loyalty_stamps();

-- Batch settlement keeps the existing audited/accounting-aware single-expense RPC.
create or replace function public.mark_expenses_paid_batch(
  p_expense_ids uuid[],
  p_payment_account_key text,
  p_paid_at date default current_date,
  p_reference text default null,
  p_notes text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  if coalesce(array_length(p_expense_ids, 1), 0) = 0 then
    raise exception 'Select at least one expense';
  end if;
  foreach v_id in array p_expense_ids loop
    perform mark_expense_paid(v_id, p_payment_account_key, p_paid_at, p_reference, p_notes);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

grant execute on function public.mark_expenses_paid_batch(uuid[], text, date, text, text)
  to authenticated, service_role;
