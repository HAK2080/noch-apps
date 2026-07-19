-- Shared Services cost allocation.
--
-- Cross-branch expenses and management payroll are assigned to the SHARED
-- cost center. Versioned rules allocate those costs to branch P&Ls while the
-- consolidated P&L continues to count every cost exactly once.

begin;

-- ── 1. Cost-center scope and payroll assignment ────────────────────────────
alter table public.cost_centers
  add column if not exists scope text not null default 'unallocated';

do $$
begin
  alter table public.cost_centers
    add constraint cost_centers_scope_check
    check (scope in ('direct', 'shared', 'unallocated'));
exception
  when duplicate_object then null;
end $$;

update public.cost_centers
set scope = case when pos_branch_id is null then 'unallocated' else 'direct' end
where scope is null or scope = 'unallocated';

insert into public.cost_centers(id, name, include_in_split, pos_branch_id, scope)
values ('SHARED', 'Shared Services', false, null, 'shared')
on conflict (id) do update
set name = excluded.name,
    include_in_split = false,
    pos_branch_id = null,
    scope = 'shared';

alter table public.profiles
  add column if not exists payroll_cost_center_id text
    references public.cost_centers(id) on delete set null;

create index if not exists profiles_payroll_cost_center_idx
  on public.profiles(payroll_cost_center_id)
  where payroll_cost_center_id is not null;

-- ── 2. Versioned allocation policies ───────────────────────────────────────
create table if not exists public.shared_cost_allocation_policies (
  id uuid primary key default gen_random_uuid(),
  source_cost_center_id text not null references public.cost_centers(id),
  method text not null check (method in ('revenue', 'equal', 'fixed')),
  effective_from date not null,
  effective_to date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_cost_center_id, effective_from),
  check (effective_from = date_trunc('month', effective_from::timestamp)::date),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.shared_cost_allocation_targets (
  policy_id uuid not null references public.shared_cost_allocation_policies(id) on delete cascade,
  branch_id uuid not null references public.pos_branches(id),
  fixed_weight_pct numeric(7,4),
  primary key(policy_id, branch_id),
  check (fixed_weight_pct is null or (fixed_weight_pct >= 0 and fixed_weight_pct <= 100))
);

create index if not exists shared_cost_policies_lookup_idx
  on public.shared_cost_allocation_policies(source_cost_center_id, effective_from, effective_to);

alter table public.shared_cost_allocation_policies enable row level security;
alter table public.shared_cost_allocation_targets enable row level security;

drop policy if exists shared_cost_policies_read on public.shared_cost_allocation_policies;
create policy shared_cost_policies_read on public.shared_cost_allocation_policies
  for select to authenticated using (true);

drop policy if exists shared_cost_policies_owner_write on public.shared_cost_allocation_policies;
create policy shared_cost_policies_owner_write on public.shared_cost_allocation_policies
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

drop policy if exists shared_cost_targets_read on public.shared_cost_allocation_targets;
create policy shared_cost_targets_read on public.shared_cost_allocation_targets
  for select to authenticated using (true);

drop policy if exists shared_cost_targets_owner_write on public.shared_cost_allocation_targets;
create policy shared_cost_targets_owner_write on public.shared_cost_allocation_targets
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

grant select, insert, update, delete on public.shared_cost_allocation_policies to authenticated;
grant select, insert, update, delete on public.shared_cost_allocation_targets to authenticated;

-- Seed the recommended rule: all active branches, allocated by monthly net
-- revenue. A branch with no revenue receives 0%; if every target has no
-- revenue, the function falls back to an equal split.
with inserted as (
  insert into public.shared_cost_allocation_policies(
    source_cost_center_id, method, effective_from
  )
  values ('SHARED', 'revenue', date_trunc('month', current_date)::date)
  on conflict (source_cost_center_id, effective_from) do nothing
  returning id
), policy as (
  select id from inserted
  union all
  select id
  from public.shared_cost_allocation_policies
  where source_cost_center_id = 'SHARED'
    and effective_from = date_trunc('month', current_date)::date
  limit 1
)
insert into public.shared_cost_allocation_targets(policy_id, branch_id)
select policy.id, branch.id
from policy
cross join public.pos_branches branch
where branch.is_active = true
on conflict (policy_id, branch_id) do nothing;

-- ── 3. Deep allocation module: save rule + calculate one branch share ───────
create or replace function public.save_shared_cost_allocation_policy(
  p_source_cost_center_id text,
  p_method text,
  p_effective_from date,
  p_targets jsonb
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_policy_id uuid;
  v_existing_to date;
  v_next_from date;
  v_weight_total numeric;
  v_target_count int;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'owner') then
    raise exception 'only owners can manage shared-cost allocations';
  end if;
  if p_method not in ('revenue', 'equal', 'fixed') then
    raise exception 'allocation method must be revenue, equal, or fixed';
  end if;
  if p_effective_from <> date_trunc('month', p_effective_from::timestamp)::date then
    raise exception 'effective date must be the first day of a month';
  end if;
  if not exists (
    select 1 from cost_centers
    where id = p_source_cost_center_id and scope = 'shared'
  ) then
    raise exception 'shared cost center not found';
  end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'select at least one target branch';
  end if;

  select count(*) into v_target_count
  from jsonb_to_recordset(p_targets) as target(branch_id uuid, weight_pct numeric)
  join pos_branches branch on branch.id = target.branch_id and branch.is_active = true;
  if v_target_count <> jsonb_array_length(p_targets) then
    raise exception 'one or more target branches are invalid or inactive';
  end if;

  if p_method = 'fixed' then
    select coalesce(sum(weight_pct), 0) into v_weight_total
    from jsonb_to_recordset(p_targets) as target(branch_id uuid, weight_pct numeric);
    if abs(v_weight_total - 100) > 0.01 then
      raise exception 'fixed allocation percentages must total 100%%';
    end if;
  end if;

  select id, effective_to into v_policy_id, v_existing_to
  from shared_cost_allocation_policies
  where source_cost_center_id = p_source_cost_center_id
    and effective_from = p_effective_from;

  if v_policy_id is null then
    select min(effective_from) into v_next_from
    from shared_cost_allocation_policies
    where source_cost_center_id = p_source_cost_center_id
      and effective_from > p_effective_from;

    update shared_cost_allocation_policies
    set effective_to = p_effective_from - 1,
        updated_at = now()
    where id = (
      select id
      from shared_cost_allocation_policies
      where source_cost_center_id = p_source_cost_center_id
        and effective_from < p_effective_from
      order by effective_from desc
      limit 1
    );

    insert into shared_cost_allocation_policies(
      source_cost_center_id, method, effective_from, effective_to, created_by
    ) values (
      p_source_cost_center_id,
      p_method,
      p_effective_from,
      case when v_next_from is null then null else v_next_from - 1 end,
      auth.uid()
    ) returning id into v_policy_id;
  else
    update shared_cost_allocation_policies
    set method = p_method,
        updated_at = now()
    where id = v_policy_id;
    delete from shared_cost_allocation_targets where policy_id = v_policy_id;
  end if;

  insert into shared_cost_allocation_targets(policy_id, branch_id, fixed_weight_pct)
  select
    v_policy_id,
    target.branch_id,
    case when p_method = 'fixed' then target.weight_pct else null end
  from jsonb_to_recordset(p_targets) as target(branch_id uuid, weight_pct numeric);

  return v_policy_id;
end;
$$;

grant execute on function public.save_shared_cost_allocation_policy(text, text, date, jsonb)
  to authenticated;

create or replace function public.finance_shared_allocation_share(
  p_source_cost_center_id text,
  p_branch_id uuid,
  p_as_of_date date
) returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_policy shared_cost_allocation_policies;
  v_target_count int;
  v_fixed_weight numeric;
  v_branch_revenue numeric;
  v_total_revenue numeric;
  v_month_start date := date_trunc('month', p_as_of_date)::date;
  v_month_end date := (date_trunc('month', p_as_of_date) + interval '1 month')::date;
begin
  select * into v_policy
  from shared_cost_allocation_policies
  where source_cost_center_id = p_source_cost_center_id
    and effective_from <= p_as_of_date
    and (effective_to is null or effective_to >= p_as_of_date)
  order by effective_from desc
  limit 1;

  if v_policy.id is null then return 0; end if;
  if not exists (
    select 1 from shared_cost_allocation_targets
    where policy_id = v_policy.id and branch_id = p_branch_id
  ) then return 0; end if;

  select count(*) into v_target_count
  from shared_cost_allocation_targets
  where policy_id = v_policy.id;
  if v_target_count = 0 then return 0; end if;

  if v_policy.method = 'fixed' then
    select coalesce(fixed_weight_pct, 0) into v_fixed_weight
    from shared_cost_allocation_targets
    where policy_id = v_policy.id and branch_id = p_branch_id;
    return v_fixed_weight / 100;
  end if;

  if v_policy.method = 'equal' then
    return 1::numeric / v_target_count;
  end if;

  select
    coalesce(sum(greatest(coalesce(o.total, 0) - coalesce(o.refunded_amount_lyd, 0), 0))
      filter (where o.branch_id = p_branch_id), 0),
    coalesce(sum(greatest(coalesce(o.total, 0) - coalesce(o.refunded_amount_lyd, 0), 0)), 0)
  into v_branch_revenue, v_total_revenue
  from pos_orders o
  join shared_cost_allocation_targets target
    on target.policy_id = v_policy.id and target.branch_id = o.branch_id
  where o.status = 'completed'
    and (o.created_at at time zone 'Africa/Tripoli')::date >= v_month_start
    and (o.created_at at time zone 'Africa/Tripoli')::date < v_month_end;

  if v_total_revenue <= 0 then return 1::numeric / v_target_count; end if;
  return v_branch_revenue / v_total_revenue;
end;
$$;

grant execute on function public.finance_shared_allocation_share(text, uuid, date)
  to authenticated;

create or replace function public.finance_allocation_basis(p_as_of_date date)
returns table(branch_id uuid, branch_name text, revenue_lyd numeric)
language sql stable security definer
set search_path = public
as $$
  select
    branch.id,
    branch.name,
    coalesce(sum(greatest(coalesce(o.total, 0) - coalesce(o.refunded_amount_lyd, 0), 0)), 0)
  from pos_branches branch
  left join pos_orders o
    on o.branch_id = branch.id
   and o.status = 'completed'
   and (o.created_at at time zone 'Africa/Tripoli')::date >= date_trunc('month', p_as_of_date)::date
   and (o.created_at at time zone 'Africa/Tripoli')::date < (date_trunc('month', p_as_of_date) + interval '1 month')::date
  where branch.is_active = true
  group by branch.id, branch.name
  order by branch.name;
$$;

grant execute on function public.finance_allocation_basis(date) to authenticated;

-- ── 4. P&L: direct contribution + allocated Shared Services ────────────────
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
  report_months as (
    select generate_series(
      date_trunc('month', p_from)::date,
      date_trunc('month', p_to)::date,
      interval '1 month'
    )::date as month_start
  ),
  shared_shares as (
    select
      cc.id as cost_center_id,
      month.month_start,
      case
        when p_branch_id is null then 1::numeric
        else finance_shared_allocation_share(cc.id, p_branch_id, month.month_start)
      end as branch_share
    from cost_centers cc
    cross join report_months month
    where cc.scope = 'shared'
  ),
  labor_hourly as (
    select coalesce(sum(slc.labor_cost_lyd), 0) as hourly_lyd
    from shift_labor_cost slc
    where (p_branch_id is null or slc.branch_id = p_branch_id)
      and slc.clocked_in_at >= p_from::timestamptz
      and slc.clocked_in_at < (p_to + interval '1 day')::timestamptz
      and not exists (
        select 1 from profiles pr
        where pr.id = slc.user_id and coalesce(pr.monthly_salary, 0) > 0
      )
  ),
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
  salary_months as (
    select
      pr.id,
      pr.payroll_cost_center_id,
      cc.scope as payroll_scope,
      month.month_start,
      pr.monthly_salary
        * (least(p_to, (month.month_start + interval '1 month' - interval '1 day')::date)
           - greatest(p_from, month.month_start) + 1)::numeric
        / extract(day from (month.month_start + interval '1 month' - interval '1 day')::date) as amount_lyd
    from profiles pr
    cross join report_months month
    left join cost_centers cc on cc.id = pr.payroll_cost_center_id
    where coalesce(pr.monthly_salary, 0) > 0
  ),
  salary_allocated as (
    select
      salary.*,
      case
        when p_branch_id is null then 1::numeric
        when salary.payroll_scope = 'shared' then coalesce(share.branch_share, 0)
        when coalesce(hours.total_hours, 0) = 0 then 0
        else hours.branch_hours / hours.total_hours
      end as branch_share
    from salary_months salary
    left join shift_hours hours on hours.user_id = salary.id
    left join shared_shares share
      on share.cost_center_id = salary.payroll_cost_center_id
     and share.month_start = salary.month_start
  ),
  labor_salary as (
    select
      coalesce(sum(amount_lyd * branch_share), 0) as salary_lyd,
      coalesce(sum(amount_lyd * branch_share) filter (where payroll_scope = 'shared'), 0) as shared_salary_lyd
    from salary_allocated
  ),
  labor_adjustments_total as (
    select
      coalesce(sum(la.amount_lyd) filter (where la.kind in ('overtime', 'bonus')), 0)
        - coalesce(sum(la.amount_lyd) filter (where la.kind = 'deduction'), 0) as adjustments_lyd
    from labor_adjustments la
    where la.adjustment_date >= p_from
      and la.adjustment_date <= p_to
      and (p_branch_id is null or la.branch_id = p_branch_id)
  ),
  labor as (
    select
      (select hourly_lyd from labor_hourly)
        + (select salary_lyd from labor_salary)
        + (select adjustments_lyd from labor_adjustments_total) as labor_lyd,
      (select hourly_lyd from labor_hourly)
        + ((select salary_lyd from labor_salary) - (select shared_salary_lyd from labor_salary))
        + (select adjustments_lyd from labor_adjustments_total) as direct_labor_lyd,
      (select shared_salary_lyd from labor_salary) as shared_labor_lyd
  ),
  canonical_expense_base as (
    select
      e.id,
      e.cost_center_id,
      cc.scope,
      cc.pos_branch_id,
      coalesce(e.amount_lyd, 0) as amount_lyd,
      case
        when e.coverage_months > 1 and e.coverage_start is not null then e.coverage_start
        else e.expense_date
      end as recognition_start,
      case
        when e.coverage_months > 1 and e.coverage_start is not null
          then (e.coverage_start + (e.coverage_months || ' months')::interval - interval '1 day')::date
        else e.expense_date
      end as recognition_end
    from expenses e
    left join cost_centers cc on cc.id = e.cost_center_id
    where e.status in ('approved', 'paid')
  ),
  canonical_expense_months as (
    select
      expense.id,
      expense.cost_center_id,
      expense.scope,
      expense.pos_branch_id,
      month.month_start,
      expense.amount_lyd
        * greatest(
            0,
            least(
              p_to,
              expense.recognition_end,
              (month.month_start + interval '1 month' - interval '1 day')::date
            ) - greatest(p_from, expense.recognition_start, month.month_start) + 1
          )::numeric
        / greatest(1, expense.recognition_end - expense.recognition_start + 1) as recognized_lyd
    from canonical_expense_base expense
    cross join report_months month
    where expense.recognition_start <= p_to
      and expense.recognition_end >= p_from
      and expense.recognition_start <= (month.month_start + interval '1 month' - interval '1 day')::date
      and expense.recognition_end >= month.month_start
  ),
  opex_rows as (
    select
      coalesce(ee.amount_lyd, 0) as amount_lyd,
      (ee.category = 'capex') as is_capex,
      false as is_shared
    from expense_entries ee
    where (p_branch_id is null or ee.branch_id = p_branch_id)
      and ee.paid_at >= p_from
      and ee.paid_at <= p_to
      and (ee.status is null or ee.status = 'approved')

    union all

    select
      expense.recognized_lyd * case
        when p_branch_id is null then 1
        when expense.scope = 'direct' and expense.pos_branch_id = p_branch_id then 1
        when expense.scope = 'shared' then coalesce(share.branch_share, 0)
        else 0
      end as amount_lyd,
      false as is_capex,
      expense.scope = 'shared' as is_shared
    from canonical_expense_months expense
    left join shared_shares share
      on share.cost_center_id = expense.cost_center_id
     and share.month_start = expense.month_start
  ),
  opex as (
    select
      coalesce(sum(amount_lyd) filter (where is_capex = false), 0) as opex_lyd,
      coalesce(sum(amount_lyd) filter (where is_capex = false and is_shared), 0) as shared_opex_lyd,
      coalesce(sum(amount_lyd) filter (where is_capex = true), 0) as capex_lyd
    from opex_rows
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
    'labor_direct', (select direct_labor_lyd from labor),
    'labor_shared_allocated', (select shared_labor_lyd from labor),
    'labor_hourly', (select hourly_lyd from labor_hourly),
    'labor_salary', (select salary_lyd from labor_salary),
    'labor_adjustments', (select adjustments_lyd from labor_adjustments_total),
    'opex', (select opex_lyd from opex),
    'opex_direct', (select opex_lyd from opex) - (select shared_opex_lyd from opex),
    'opex_shared_allocated', (select shared_opex_lyd from opex),
    'shared_costs_allocated',
      (select shared_labor_lyd from labor) + (select shared_opex_lyd from opex),
    'capex', (select capex_lyd from opex),
    'prime_cost',
      (select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs)
      + (select direct_labor_lyd from labor),
    'net_contribution_before_shared',
      (select net_revenue from sales)
      - ((select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs))
      - (select direct_labor_lyd from labor)
      - ((select opex_lyd from opex) - (select shared_opex_lyd from opex)),
    'net_contribution',
      (select net_revenue from sales)
      - ((select cogs_lyd from cogs) + (select mod_cogs_lyd from modifier_cogs))
      - (select labor_lyd from labor)
      - (select opex_lyd from opex)
  );
$$;

grant execute on function public.finance_pnl(uuid, date, date, boolean) to authenticated;

commit;
