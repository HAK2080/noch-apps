-- Payroll runs, payroll run items, and staff loans.
--
-- 1. payroll_runs: one draft/completed run per calendar month (period_month is
--    the first-of-month). total_lyd is the sum of item nets at last compute.
-- 2. payroll_run_items: per-profile pay components for a run; net_lyd is a
--    generated column. branch_id null = consolidated only.
-- 3. staff_loans: owner-managed loans with monthly repayment; the
--    staff_loan_balances view exposes repaid/remaining from COMPLETED runs.
-- 4. payroll_generate_run / payroll_complete_run / payroll_delete_run RPCs
--    (owner only). Completing a run posts ONE balanced GL batch:
--    Dr 6600 Wages (expense) / Cr 2100 Wages payable, source_type 'payroll'.
-- 5. finance_pnl: the labor_salary leg uses a COMPLETED run's item nets
--    (prorated by overlap days) for any month that has one, and falls back to
--    the monthly_salary proration for months without a run.

-- ── 1. Payroll runs ──────────────────────────────────────────────────────────
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,  -- first of month
  status text not null default 'draft' check (status in ('draft', 'completed')),
  total_lyd numeric not null default 0,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  completed_at timestamptz,
  completed_by uuid references profiles(id)
);

-- ── 2. Payroll run items ─────────────────────────────────────────────────────
create table public.payroll_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references payroll_runs(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  branch_id uuid references pos_branches(id),  -- null = consolidated only
  base_lyd numeric not null default 0,
  overtime_lyd numeric not null default 0,
  bonus_lyd numeric not null default 0,
  deduction_lyd numeric not null default 0,
  loan_repayment_lyd numeric not null default 0,
  other_lyd numeric not null default 0,
  net_lyd numeric generated always as (
    base_lyd + overtime_lyd + bonus_lyd + other_lyd - deduction_lyd - loan_repayment_lyd
  ) stored,
  note text,
  unique (run_id, profile_id)
);

-- ── 3. Staff loans ───────────────────────────────────────────────────────────
create table public.staff_loans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  amount_lyd numeric not null check (amount_lyd > 0),
  monthly_repayment_lyd numeric not null check (monthly_repayment_lyd > 0),
  start_month date not null,  -- first month a repayment is due
  status text not null default 'active' check (status in ('active', 'paid_off', 'cancelled')),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Remaining balance = amount − repayments booked in COMPLETED runs for that
-- profile (item-level loan_repayment_lyd is per profile, not per loan).
create or replace view public.staff_loan_balances as
select
  l.id as loan_id,
  l.profile_id,
  l.amount_lyd,
  l.monthly_repayment_lyd,
  l.start_month,
  l.status,
  coalesce((
    select sum(i.loan_repayment_lyd)
    from payroll_run_items i
    join payroll_runs r on r.id = i.run_id
    where i.profile_id = l.profile_id
      and r.status = 'completed'
      and r.period_month >= date_trunc('month', l.start_month)::date
  ), 0) as repaid_lyd,
  greatest(0, l.amount_lyd - coalesce((
    select sum(i.loan_repayment_lyd)
    from payroll_run_items i
    join payroll_runs r on r.id = i.run_id
    where i.profile_id = l.profile_id
      and r.status = 'completed'
      and r.period_month >= date_trunc('month', l.start_month)::date
  ), 0)) as remaining_lyd
from staff_loans l;

-- ── 4. Generate (or regenerate a draft) payroll run ─────────────────────────
create or replace function public.payroll_generate_run(p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_run_id uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'owner') then
    raise exception 'owner only';
  end if;

  if exists (select 1 from payroll_runs where period_month = v_month and status = 'completed') then
    raise exception 'payroll run for % is already completed', to_char(v_month, 'YYYY-MM');
  end if;

  -- Keep an existing draft run row; regenerate its items from scratch.
  select id into v_run_id from payroll_runs where period_month = v_month;
  if v_run_id is null then
    insert into payroll_runs (period_month, created_by)
    values (v_month, auth.uid())
    returning id into v_run_id;
  else
    delete from payroll_run_items where run_id = v_run_id;
  end if;

  insert into payroll_run_items (
    run_id, profile_id, branch_id,
    base_lyd, overtime_lyd, bonus_lyd, deduction_lyd, loan_repayment_lyd
  )
  select
    v_run_id,
    pr.id,
    -- the branch with the most shift hours this month; null when no hours
    (select slc.branch_id
       from shift_labor_cost slc
      where slc.user_id = pr.id
        and slc.clocked_in_at >= v_month::timestamptz
        and slc.clocked_in_at < (v_month + interval '1 month')::timestamptz
      group by slc.branch_id
      order by sum(slc.hours) desc
      limit 1),
    pr.monthly_salary,
    coalesce((select sum(la.amount_lyd) from labor_adjustments la
      where la.profile_id = pr.id and la.kind = 'overtime'
        and la.adjustment_date >= v_month
        and la.adjustment_date < (v_month + interval '1 month')::date), 0),
    coalesce((select sum(la.amount_lyd) from labor_adjustments la
      where la.profile_id = pr.id and la.kind = 'bonus'
        and la.adjustment_date >= v_month
        and la.adjustment_date < (v_month + interval '1 month')::date), 0),
    coalesce((select sum(la.amount_lyd) from labor_adjustments la
      where la.profile_id = pr.id and la.kind = 'deduction'
        and la.adjustment_date >= v_month
        and la.adjustment_date < (v_month + interval '1 month')::date), 0),
    coalesce((select sum(least(b.monthly_repayment_lyd, b.remaining_lyd))
      from staff_loan_balances b
      where b.profile_id = pr.id
        and b.status = 'active'
        and date_trunc('month', b.start_month)::date <= v_month), 0)
  from profiles pr
  where coalesce(pr.monthly_salary, 0) > 0;

  update payroll_runs
     set total_lyd = coalesce((
       select sum(i.net_lyd) from payroll_run_items i where i.run_id = v_run_id
     ), 0)
   where id = v_run_id;

  return v_run_id;
end;
$$;

grant execute on function public.payroll_generate_run(date) to authenticated;

-- ── 5. Complete a run and post the GL batch ─────────────────────────────────
-- Posts exactly one balanced batch (the gl_journal_batches source unique index
-- makes a second post for the same run impossible): Dr wages expense for the
-- run total, Cr wages payable, journal date = last day of the period month.
create or replace function public.payroll_complete_run(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run payroll_runs;
  v_total numeric;
  v_batch uuid;
  v_wages_expense uuid;
  v_wages_payable uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'owner') then
    raise exception 'owner only';
  end if;

  select * into v_run from payroll_runs where id = p_run_id for update;
  if not found then raise exception 'payroll run not found'; end if;
  if v_run.status <> 'draft' then raise exception 'payroll run is not in draft status'; end if;

  select coalesce(sum(net_lyd), 0) into v_total
    from payroll_run_items
   where run_id = p_run_id;

  update payroll_runs
     set status = 'completed',
         total_lyd = v_total,
         completed_at = now(),
         completed_by = auth.uid()
   where id = p_run_id;

  -- gl_journal_lines requires a positive amount on one side, so a zero-total
  -- run completes without a GL posting.
  if v_total = 0 then
    return p_run_id;
  end if;

  -- Owner-remappable via gl_account_map; fall back to the seeded codes.
  v_wages_expense := coalesce(gl_acct('payroll_wages'), (select id from gl_accounts where code = '6600'));
  v_wages_payable := coalesce(gl_acct('wages_payable'), (select id from gl_accounts where code = '2100'));
  if v_wages_expense is null or v_wages_payable is null then
    raise exception 'payroll GL accounts are not configured (wages expense 6600 / wages payable 2100)';
  end if;

  insert into gl_journal_batches (journal_date, source_type, source_ref, branch_id, memo, status)
  values (
    (v_run.period_month + interval '1 month - 1 day')::date,
    'payroll', p_run_id::text, null,
    'Payroll ' || to_char(v_run.period_month, 'YYYY-MM'),
    'draft'
  )
  returning id into v_batch;

  insert into gl_journal_lines (batch_id, account_id, branch_id, line_no, debit_lyd, memo)
  values (v_batch, v_wages_expense, null, 1, v_total, 'Payroll ' || to_char(v_run.period_month, 'YYYY-MM'));
  insert into gl_journal_lines (batch_id, account_id, branch_id, line_no, credit_lyd, memo)
  values (v_batch, v_wages_payable, null, 2, v_total, 'Payroll ' || to_char(v_run.period_month, 'YYYY-MM'));

  update gl_journal_batches set status = 'posted' where id = v_batch;

  return p_run_id;
end;
$$;

grant execute on function public.payroll_complete_run(uuid) to authenticated;

-- ── 6. Delete a draft run ────────────────────────────────────────────────────
create or replace function public.payroll_delete_run(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'owner') then
    raise exception 'owner only';
  end if;

  delete from payroll_runs where id = p_run_id and status = 'draft';
  if not found then raise exception 'payroll run not found or not in draft status'; end if;

  return p_run_id;
end;
$$;

grant execute on function public.payroll_delete_run(uuid) to authenticated;

-- ── 7. RLS ───────────────────────────────────────────────────────────────────
alter table public.payroll_runs enable row level security;
alter table public.payroll_run_items enable row level security;
alter table public.staff_loans enable row level security;

create policy "payroll_runs_read" on public.payroll_runs
  for select to authenticated
  using (true);

create policy "payroll_runs_owner_insert" on public.payroll_runs
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create policy "payroll_runs_owner_update" on public.payroll_runs
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create policy "payroll_runs_owner_delete" on public.payroll_runs
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create policy "payroll_run_items_read" on public.payroll_run_items
  for select to authenticated
  using (true);

create policy "payroll_run_items_owner_insert" on public.payroll_run_items
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create policy "payroll_run_items_owner_update" on public.payroll_run_items
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create policy "payroll_run_items_owner_delete" on public.payroll_run_items
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create policy "staff_loans_read" on public.staff_loans
  for select to authenticated
  using (true);

create policy "staff_loans_owner_insert" on public.staff_loans
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create policy "staff_loans_owner_update" on public.staff_loans
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create policy "staff_loans_owner_delete" on public.staff_loans
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

grant select, insert, update, delete on public.payroll_runs to authenticated;
grant select, insert, update, delete on public.payroll_run_items to authenticated;
grant select, insert, update, delete on public.staff_loans to authenticated;
grant select on public.staff_loan_balances to authenticated;

-- ── 8. GL account map key for the payroll wages expense leg ─────────────────
-- The seeded chart already has 6600 Wages (expense); this key only lets the
-- owner remap the payroll debit without code changes.
insert into gl_account_map (key, account_id, label)
select 'payroll_wages', a.id, 'Payroll — wages expense'
from gl_accounts a
where a.code = '6600'
on conflict (key) do nothing;

-- ── 9. finance_pnl: labor_salary uses completed runs when present ────────────
-- Only the labor_salary CTE changes versus 20260719100000: per calendar month
-- overlapping [p_from, p_to], a COMPLETED payroll run's item nets (prorated by
-- overlap days ÷ days-in-month; branch view counts only items at that branch,
-- null-branch items are consolidated-only) replace the monthly_salary
-- estimate for that month. Every other CTE and output field is unchanged.
create or replace function public.finance_pnl(
  p_branch_id      uuid,
  p_from           date,
  p_to             date,
  p_net_of_refunds boolean default false
) returns jsonb
language sql stable security definer
set search_path = public
as $$
  with sales as (
    select
      coalesce(sum(case when status = 'completed' then total else 0 end), 0)
        - case when p_net_of_refunds then coalesce(sum(refunded_amount_lyd), 0) else 0 end as net_revenue,
      coalesce(sum(case when status = 'completed' then discount_amount else 0 end), 0) as discounts,
      coalesce(sum(refunded_amount_lyd), 0) as refunds,
      count(*) filter (where status = 'completed') as orders_count
    from pos_orders
    where (p_branch_id is null or branch_id = p_branch_id)
      and created_at >= p_from::timestamptz
      and created_at < (p_to + interval '1 day')::timestamptz
  ),
  cogs as (
    select coalesce(sum(coalesce(pp.cost_lyd, 0) * oi.quantity), 0) as cogs_lyd
    from pos_orders o
    join pos_order_items oi on oi.order_id = o.id
    left join pos_products pp on pp.id = oi.product_id
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.created_at >= p_from::timestamptz
      and o.created_at < (p_to + interval '1 day')::timestamptz
      and o.status = 'completed'
  ),
  modifier_cogs as (
    select coalesce(sum(coalesce(m.cost_delta_lyd, 0) * oi.quantity), 0) as mod_cogs_lyd
    from pos_order_item_modifiers oim
    join pos_modifiers m on m.id = oim.modifier_id
    join pos_order_items oi on oi.id = oim.order_item_id
    join pos_orders o on o.id = oi.order_id
    where (p_branch_id is null or o.branch_id = p_branch_id)
      and o.created_at >= p_from::timestamptz
      and o.created_at < (p_to + interval '1 day')::timestamptz
      and o.status = 'completed'
  ),
  -- Hourly leg: shift pay for staff WITHOUT a monthly salary only. Salaried
  -- staff are costed in labor_salary below (one-pay-path rule).
  labor_hourly as (
    select coalesce(sum(slc.labor_cost_lyd), 0) as hourly_lyd
    from shift_labor_cost slc
    where (p_branch_id is null or slc.branch_id = p_branch_id)
      and slc.clocked_in_at >= p_from::timestamptz
      and slc.clocked_in_at < (p_to + interval '1 day')::timestamptz
      and not exists (
        select 1 from profiles pr
        where pr.id = slc.user_id
          and coalesce(pr.monthly_salary, 0) > 0
      )
  ),
  -- Shift hours per staff member in the period, for branch allocation of
  -- salaries. Hours come from shift_labor_cost (the pos_shift_attendees view).
  shift_hours as (
    select
      slc.user_id,
      coalesce(sum(slc.hours) filter (where slc.branch_id = p_branch_id), 0) as branch_hours,
      coalesce(sum(slc.hours), 0) as total_hours
    from shift_labor_cost slc
    where slc.clocked_in_at >= p_from::timestamptz
      and slc.clocked_in_at < (p_to + interval '1 day')::timestamptz
    group by slc.user_id
  ),
  -- Salary leg: per calendar month overlapping [p_from, p_to]. When a
  -- COMPLETED payroll run exists for the month, its item nets prorated by
  -- overlap days ÷ days-in-month are the labor cost — branch P&L counts only
  -- items booked at that branch; null-branch items are consolidated-only.
  -- Otherwise fall back to each salaried profile's monthly_salary prorated
  -- day-by-day; branch P&L takes the person's share of shift hours at that
  -- branch, no hours logged anywhere in the period means 0 for branches,
  -- full amount for the consolidated view.
  labor_salary as (
    select coalesce(sum(per_month.amount_lyd), 0) as salary_lyd
    from (
      select
        case
          when exists (
            select 1 from payroll_runs r
            where r.period_month = m.month_start
              and r.status = 'completed'
          ) then (
            select coalesce(sum(
              i.net_lyd
              * (least(p_to, (m.month_start + interval '1 month' - interval '1 day')::date)
                 - greatest(p_from, m.month_start) + 1)::numeric
              / extract(day from (m.month_start + interval '1 month' - interval '1 day')::date)
            ), 0)
            from payroll_runs r
            join payroll_run_items i on i.run_id = r.id
            where r.period_month = m.month_start
              and r.status = 'completed'
              and (p_branch_id is null or i.branch_id = p_branch_id)
          )
          else (
            select coalesce(sum(
              pr.monthly_salary
              * (least(p_to, (m.month_start + interval '1 month' - interval '1 day')::date)
                 - greatest(p_from, m.month_start) + 1)::numeric
              / extract(day from (m.month_start + interval '1 month' - interval '1 day')::date)
              * case
                  when p_branch_id is null then 1
                  when coalesce(sh.total_hours, 0) = 0 then 0
                  else sh.branch_hours / sh.total_hours
                end
            ), 0)
            from profiles pr
            left join shift_hours sh on sh.user_id = pr.id
            where coalesce(pr.monthly_salary, 0) > 0
          )
        end as amount_lyd
      from (
        select generate_series(
          date_trunc('month', p_from)::date,
          date_trunc('month', p_to)::date,
          interval '1 month'
        )::date as month_start
      ) m
    ) per_month
  ),
  -- Adjustments leg: overtime and bonus add, deductions subtract. Months with
  -- a completed payroll run are excluded — those adjustments are already
  -- inside the run's net_lyd, so counting them here would double-count.
  labor_adjustments_total as (
    select
      coalesce(sum(la.amount_lyd) filter (where la.kind in ('overtime', 'bonus')), 0)
        - coalesce(sum(la.amount_lyd) filter (where la.kind = 'deduction'), 0) as adjustments_lyd
    from labor_adjustments la
    where la.adjustment_date >= p_from
      and la.adjustment_date <= p_to
      and (p_branch_id is null or la.branch_id = p_branch_id)
      and not exists (
        select 1 from payroll_runs pr
        where pr.status = 'completed'
          and pr.period_month = date_trunc('month', la.adjustment_date)::date
      )
  ),
  labor as (
    select
      (select hourly_lyd from labor_hourly)
      + (select salary_lyd from labor_salary)
      + (select adjustments_lyd from labor_adjustments_total) as labor_lyd
  ),
  opex as (
    select
      coalesce(sum(amount_lyd) filter (where is_capex = false), 0) as opex_lyd,
      coalesce(sum(amount_lyd) filter (where is_capex = true), 0) as capex_lyd
    from (
      -- Finance-module entries without a branch are consolidated-only. This
      -- prevents shared entries from being double-counted in branch views.
      select
        coalesce(ee.amount_lyd, 0) as amount_lyd,
        (ee.category = 'capex') as is_capex
      from expense_entries ee
      where (p_branch_id is null or ee.branch_id = p_branch_id)
        and ee.paid_at >= p_from
        and ee.paid_at <= p_to
        and (ee.status is null or ee.status = 'approved')

      union all

      -- Canonical expenses are allocated through their cost center. Expenses
      -- without a branch mapping remain visible in consolidated P&L only.
      -- Prepaid rows (coverage_months > 1) are amortized day-by-day over
      -- [coverage_start, coverage_start + coverage_months - 1 day]; rows with
      -- a single month (or no coverage_start) keep the expense_date behavior.
      select
        coalesce(
          case
            when e.coverage_months > 1 and e.coverage_start is not null then
              e.amount_lyd
              * (greatest(0,
                  least(p_to, (e.coverage_start + (e.coverage_months || ' months')::interval - interval '1 day')::date)
                  - greatest(p_from, e.coverage_start) + 1))::numeric
              / greatest(1,
                  ((e.coverage_start + (e.coverage_months || ' months')::interval - interval '1 day')::date
                   - e.coverage_start + 1))
            else e.amount_lyd
          end,
          0
        ) as amount_lyd,
        false as is_capex
      from expenses e
      left join cost_centers cc on cc.id::text = e.cost_center_id::text
      where e.status in ('approved', 'paid')
        and (
          case
            when e.coverage_months > 1 and e.coverage_start is not null then
              e.coverage_start <= p_to
              and (e.coverage_start + (e.coverage_months || ' months')::interval - interval '1 day')::date >= p_from
            else
              e.expense_date >= p_from
              and e.expense_date <= p_to
          end
        )
        and (p_branch_id is null or cc.pos_branch_id = p_branch_id)
    ) combined
  )
  select jsonb_build_object(
    'period_from', p_from,
    'period_to', p_to,
    'branch_id', p_branch_id,
    'net_of_refunds', p_net_of_refunds,
    'orders', (select orders_count from sales),
    'revenue_net', (select net_revenue from sales),
    'discounts', (select discounts from sales),
    'refunds', (select refunds from sales),
    'cogs', (select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs),
    'cogs_base', (select cogs_lyd from cogs),
    'cogs_modifiers', (select mod_cogs_lyd from modifier_cogs),
    'labor', (select labor_lyd from labor),
    'labor_hourly', (select hourly_lyd from labor_hourly),
    'labor_salary', (select salary_lyd from labor_salary),
    'labor_adjustments', (select adjustments_lyd from labor_adjustments_total),
    'opex', (select opex_lyd from opex),
    'capex', (select capex_lyd from opex),
    'prime_cost', (select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs) + (select labor_lyd from labor),
    'net_contribution',
      (select net_revenue from sales)
      - ((select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs))
      - (select labor_lyd from labor)
      - (select opex_lyd from opex)
  );
$$;

grant execute on function public.finance_pnl(uuid, date, date, boolean) to authenticated;
