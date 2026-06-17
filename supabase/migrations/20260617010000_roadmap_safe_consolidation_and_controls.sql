-- Roadmap execution (safe/additive only)
-- - unify finance reads across expenses + expense_entries without replacing either table
-- - expose AP aging / supplier statements / cash-flow reporting for Accounting
-- - add recurring-expense scaffolding
-- - expose inventory price-history / valuation / reorder views

create or replace view finance_expense_documents as
select
  'expenses'::text as source_table,
  e.id,
  null::uuid as branch_id,
  e.expense_date as booked_at,
  coalesce(e.amount_lyd, e.amount * coalesce(e.exchange_rate_to_lyd, 1), 0)::numeric(12,2) as amount_lyd,
  e.vendor,
  coalesce(ec.name, 'Uncategorised') as category_name,
  coalesce(cc.name, e.cost_center_id::text, '—') as cost_center_name,
  e.status,
  e.paid_at,
  e.payment_account_key,
  e.payment_reference,
  e.payment_notes,
  e.paid_by as legacy_paid_by,
  e.description as notes,
  e.receipt_url,
  e.submitted_by as actor_id,
  e.submitted_at as created_at,
  e.updated_at,
  (e.status = 'paid') as is_paid,
  true as is_canonical_workflow
from expenses e
left join expense_categories ec on ec.id = e.category_id
left join cost_centers cc on cc.id::text = e.cost_center_id::text

union all

select
  'expense_entries'::text as source_table,
  x.id,
  x.branch_id,
  x.paid_at as booked_at,
  x.amount_lyd::numeric(12,2) as amount_lyd,
  x.vendor,
  initcap(replace(x.category, '_', ' ')) as category_name,
  coalesce(pb.name, 'All branches') as cost_center_name,
  'paid'::text as status,
  x.paid_at,
  case when x.bank_transaction_id is null then 'cash' else 'bank' end as payment_account_key,
  null::text as payment_reference,
  null::text as payment_notes,
  null::text as legacy_paid_by,
  x.notes,
  x.receipt_url,
  x.created_by as actor_id,
  x.created_at,
  x.updated_at,
  true as is_paid,
  false as is_canonical_workflow
from expense_entries x
left join pos_branches pb on pb.id = x.branch_id;

grant select on finance_expense_documents to authenticated;

create or replace view procurement_payables_status as
select
  po.id,
  po.branch_id,
  pb.name as branch_name,
  po.ingredient_id,
  i.name as ingredient_name,
  po.supplier_name,
  po.invoice_no,
  po.invoice_date,
  po.due_date,
  po.created_at,
  po.received_at,
  po.paid_at,
  po.status,
  po.payment_status,
  coalesce(po.total_cost_lyd, 0)::numeric(12,2) as total_cost_lyd,
  case
    when po.payment_status = 'paid' then 0::numeric(12,2)
    when po.status = 'cancelled' then 0::numeric(12,2)
    else coalesce(po.total_cost_lyd, 0)::numeric(12,2)
  end as outstanding_amount_lyd,
  greatest(0, (current_date - coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date)))::int as days_past_due,
  case
    when po.payment_status = 'paid' then 'paid'
    when po.status = 'cancelled' then 'cancelled'
    when coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date) > current_date then 'current'
    when current_date - coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date) <= 30 then '1-30'
    when current_date - coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date) <= 60 then '31-60'
    when current_date - coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date) <= 90 then '61-90'
    else '90+'
  end as aging_bucket
from procurement_orders po
left join pos_branches pb on pb.id = po.branch_id
left join ingredients i on i.id = po.ingredient_id;

grant select on procurement_payables_status to authenticated;

create or replace function gl_ap_aging(
  p_as_of date default current_date,
  p_branch uuid default null
) returns table (
  order_id uuid,
  branch_id uuid,
  branch_name text,
  supplier_name text,
  invoice_no text,
  invoice_date date,
  due_date date,
  received_at timestamptz,
  status text,
  payment_status text,
  outstanding_amount_lyd numeric,
  days_past_due int,
  aging_bucket text
)
language sql stable security definer set search_path = public as $$
  select
    po.id as order_id,
    po.branch_id,
    pb.name as branch_name,
    coalesce(po.supplier_name, 'Unspecified supplier') as supplier_name,
    po.invoice_no,
    po.invoice_date,
    po.due_date,
    po.received_at,
    po.status,
    po.payment_status,
    case
      when po.payment_status = 'paid' or po.status = 'cancelled' then 0::numeric(12,2)
      else coalesce(po.total_cost_lyd, 0)::numeric(12,2)
    end as outstanding_amount_lyd,
    greatest(0, (p_as_of - coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date)))::int as days_past_due,
    case
      when po.payment_status = 'paid' then 'paid'
      when po.status = 'cancelled' then 'cancelled'
      when coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date) > p_as_of then 'current'
      when p_as_of - coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date) <= 30 then '1-30'
      when p_as_of - coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date) <= 60 then '31-60'
      when p_as_of - coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date) <= 90 then '61-90'
      else '90+'
    end as aging_bucket
  from procurement_orders po
  left join pos_branches pb on pb.id = po.branch_id
  where (p_branch is null or po.branch_id = p_branch)
    and po.status <> 'cancelled'
  order by
    coalesce(po.due_date, po.invoice_date, po.received_at::date, po.created_at::date) asc nulls last,
    coalesce(po.supplier_name, 'Unspecified supplier'),
    po.created_at desc;
$$;
grant execute on function gl_ap_aging(date, uuid) to authenticated, service_role;

create or replace function gl_supplier_statement(
  p_supplier_name text,
  p_as_of date default current_date,
  p_branch uuid default null
) returns table (
  supplier_name text,
  event_date date,
  event_type text,
  invoice_no text,
  memo text,
  debit_lyd numeric,
  credit_lyd numeric,
  running_balance_lyd numeric
)
language sql stable security definer set search_path = public as $$
  with events as (
    select
      coalesce(po.supplier_name, 'Unspecified supplier') as supplier_name,
      coalesce(po.invoice_date, po.received_at::date, po.created_at::date) as event_date,
      'invoice'::text as event_type,
      po.invoice_no,
      coalesce(i.name, 'Inventory purchase') as memo,
      coalesce(po.total_cost_lyd, 0)::numeric(12,2) as debit_lyd,
      0::numeric(12,2) as credit_lyd,
      po.created_at as sort_at
    from procurement_orders po
    left join ingredients i on i.id = po.ingredient_id
    where coalesce(po.supplier_name, 'Unspecified supplier') = coalesce(p_supplier_name, coalesce(po.supplier_name, 'Unspecified supplier'))
      and (p_branch is null or po.branch_id = p_branch)
      and po.status <> 'cancelled'
      and coalesce(po.invoice_date, po.received_at::date, po.created_at::date) <= p_as_of

    union all

    select
      coalesce(po.supplier_name, 'Unspecified supplier') as supplier_name,
      po.paid_at as event_date,
      'payment'::text as event_type,
      po.invoice_no,
      coalesce(po.payment_reference, 'Supplier payment') as memo,
      0::numeric(12,2) as debit_lyd,
      coalesce(po.total_cost_lyd, 0)::numeric(12,2) as credit_lyd,
      coalesce(po.paid_at::timestamptz, po.created_at) as sort_at
    from procurement_orders po
    where coalesce(po.supplier_name, 'Unspecified supplier') = coalesce(p_supplier_name, coalesce(po.supplier_name, 'Unspecified supplier'))
      and (p_branch is null or po.branch_id = p_branch)
      and po.payment_status = 'paid'
      and po.paid_at is not null
      and po.paid_at <= p_as_of
  )
  select
    supplier_name,
    event_date,
    event_type,
    invoice_no,
    memo,
    debit_lyd,
    credit_lyd,
    sum(debit_lyd - credit_lyd) over (
      partition by supplier_name
      order by event_date, sort_at, event_type
      rows between unbounded preceding and current row
    ) as running_balance_lyd
  from events
  order by event_date, sort_at, event_type;
$$;
grant execute on function gl_supplier_statement(text, date, uuid) to authenticated, service_role;

create or replace function gl_cash_flow_statement(
  p_from date,
  p_to date,
  p_branch uuid default null
) returns table (
  source_type text,
  line_label text,
  inflow_lyd numeric,
  outflow_lyd numeric,
  net_lyd numeric
)
language sql stable security definer set search_path = public as $$
  with cash_accounts as (
    select gl_acct('cash') as account_id
    union
    select gl_acct('bank') as account_id
  ),
  raw as (
    select
      b.source_type,
      case b.source_type
        when 'sales_daily' then 'Sales receipts'
        when 'expense' then 'Expense payments'
        when 'cash' then 'Drawer cash movement'
        when 'procurement_payment' then 'Supplier payments'
        when 'procurement_receipt' then 'Inventory received on credit'
        when 'manual' then 'Manual journal'
        when 'journal_correction' then 'Journal correction'
        when 'payroll' then 'Payroll'
        when 'capex' then 'Capital expenditure'
        else initcap(replace(b.source_type, '_', ' '))
      end as line_label,
      sum(l.debit_lyd) as inflow_lyd,
      sum(l.credit_lyd) as outflow_lyd
    from gl_journal_batches b
    join gl_journal_lines l on l.batch_id = b.id
    join cash_accounts c on c.account_id = l.account_id
    where b.status = 'posted'
      and b.journal_date between p_from and p_to
      and (p_branch is null or b.branch_id = p_branch)
    group by b.source_type
  )
  select
    source_type,
    line_label,
    coalesce(inflow_lyd, 0)::numeric(14,2) as inflow_lyd,
    coalesce(outflow_lyd, 0)::numeric(14,2) as outflow_lyd,
    (coalesce(inflow_lyd, 0) - coalesce(outflow_lyd, 0))::numeric(14,2) as net_lyd
  from raw
  order by line_label;
$$;
grant execute on function gl_cash_flow_statement(date, date, uuid) to authenticated, service_role;

create or replace function gl_statement_lines(
  p_from date,
  p_to date,
  p_branch uuid default null
) returns table (
  account_id uuid,
  section text,
  code text,
  name_en text,
  name_ar text,
  amount numeric
)
language sql stable security definer set search_path = public as $$
  with posted as (
    select l.account_id, l.debit_lyd, l.credit_lyd
    from gl_journal_lines l
    join gl_journal_batches b on b.id = l.batch_id
    where b.status = 'posted'
      and b.journal_date between p_from and p_to
      and (p_branch is null or b.branch_id = p_branch)
  )
  select
    a.id as account_id,
    a.type as section,
    a.code,
    a.name_en,
    a.name_ar,
    case
      when a.normal_balance = 'credit'
        then coalesce(sum(p.credit_lyd),0) - coalesce(sum(p.debit_lyd),0)
      else
        coalesce(sum(p.debit_lyd),0) - coalesce(sum(p.credit_lyd),0)
    end as amount
  from gl_accounts a
  left join posted p on p.account_id = a.id
  where a.is_postable
    and a.type in ('revenue','cogs','expense')
  group by a.id, a.type, a.code, a.name_en, a.name_ar, a.normal_balance
  having coalesce(sum(p.debit_lyd),0) <> 0 or coalesce(sum(p.credit_lyd),0) <> 0
  order by a.code;
$$;
grant execute on function gl_statement_lines(date, date, uuid) to authenticated, service_role;

create table if not exists recurring_expense_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor text,
  category_id uuid references expense_categories(id) on delete set null,
  cost_center_id text,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'LYD',
  exchange_rate_to_lyd numeric(12,6) not null default 1,
  amount_lyd numeric(12,2) not null check (amount_lyd >= 0),
  paid_by text default 'Business',
  cadence text not null check (cadence in ('weekly','monthly','quarterly','yearly')),
  next_due_on date not null,
  notes text,
  is_active boolean not null default true,
  last_created_expense_id uuid references expenses(id) on delete set null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recurring_expense_templates_due_idx
  on recurring_expense_templates(next_due_on, is_active);

alter table recurring_expense_templates enable row level security;
drop policy if exists "recurring_expense_templates_owner_accountant_read" on recurring_expense_templates;
create policy "recurring_expense_templates_owner_accountant_read" on recurring_expense_templates
  for select to authenticated
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','accountant')
  ));
drop policy if exists "recurring_expense_templates_owner_write" on recurring_expense_templates;
create policy "recurring_expense_templates_owner_write" on recurring_expense_templates
  for all to authenticated
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'
  ))
  with check (exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'
  ));

create or replace view recurring_expense_due as
select
  t.*,
  ec.name as category_name,
  coalesce(cc.name, t.cost_center_id, '—') as cost_center_name,
  greatest(0, (t.next_due_on - current_date))::int as days_until_due
from recurring_expense_templates t
left join expense_categories ec on ec.id = t.category_id
left join cost_centers cc on cc.id::text = t.cost_center_id::text
where t.is_active = true;

grant select on recurring_expense_due to authenticated;

create or replace view inventory_supplier_price_history as
select
  po.id as procurement_order_id,
  po.branch_id,
  pb.name as branch_name,
  po.ingredient_id,
  i.name as ingredient_name,
  po.supplier_name,
  po.invoice_no,
  coalesce(po.invoice_date, po.received_at::date, po.created_at::date) as effective_date,
  po.unit,
  po.quantity_ordered,
  po.unit_cost_lyd,
  po.total_cost_lyd,
  lag(po.unit_cost_lyd) over (
    partition by po.ingredient_id, coalesce(po.supplier_name, 'Unspecified supplier')
    order by coalesce(po.invoice_date, po.received_at::date, po.created_at::date), po.created_at
  ) as previous_unit_cost_lyd
from procurement_orders po
left join ingredients i on i.id = po.ingredient_id
left join pos_branches pb on pb.id = po.branch_id
where po.status in ('received', 'ordered')
  and po.unit_cost_lyd is not null;

grant select on inventory_supplier_price_history to authenticated;

create or replace view inventory_stock_valuation as
select
  s.ingredient_id,
  i.name as ingredient_name,
  s.unit,
  coalesce(s.qty_available, 0)::numeric(14,3) as qty_available,
  coalesce(i.bulk_cost, 0)::numeric(14,3) as unit_cost_lyd,
  (coalesce(s.qty_available, 0) * coalesce(i.bulk_cost, 0))::numeric(14,2) as stock_value_lyd,
  coalesce(s.min_threshold, 0)::numeric(14,3) as reorder_threshold
from stock s
join ingredients i on i.id = s.ingredient_id;

grant select on inventory_stock_valuation to authenticated;

create or replace view inventory_reorder_suggestions as
select
  s.ingredient_id,
  i.name as ingredient_name,
  s.unit,
  coalesce(s.qty_available, 0)::numeric(14,3) as qty_available,
  coalesce(s.min_threshold, 0)::numeric(14,3) as min_threshold,
  greatest(coalesce(s.min_threshold, 0) - coalesce(s.qty_available, 0), 0)::numeric(14,3) as suggested_reorder_qty,
  case
    when coalesce(s.qty_available, 0) <= 0 then 'critical'
    when coalesce(s.qty_available, 0) < coalesce(s.min_threshold, 0) then 'low'
    else 'ok'
  end as priority
from stock s
join ingredients i on i.id = s.ingredient_id
where coalesce(s.qty_available, 0) <= coalesce(s.min_threshold, 0);

grant select on inventory_reorder_suggestions to authenticated;
