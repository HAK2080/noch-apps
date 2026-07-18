-- Accounting workflow additions:
-- - edit audit for expenses, manual journals, and procurement orders
-- - cash/bank payment posting for approved expenses
-- - procurement receipt posting to Inventory/AP
-- - procurement invoice payment posting from Cash/Bank
-- - correction flow for posted manual journals via void + replacement

create table if not exists finance_change_audit (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid not null,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid references profiles(id),
  changed_at  timestamptz not null default now()
);
create index if not exists finance_change_audit_entity_idx
  on finance_change_audit(entity_type, entity_id, changed_at desc);

alter table finance_change_audit enable row level security;
drop policy if exists "finance_change_audit_owner_read" on finance_change_audit;
create policy "finance_change_audit_owner_read" on finance_change_audit
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','accountant')));

-- Expense payment metadata. The legacy `paid_by` column is a person/source
-- label; these columns hold the actual cash/bank posting source.
alter table expenses
  add column if not exists paid_at date,
  add column if not exists payment_account_key text check (payment_account_key in ('cash','bank')),
  add column if not exists payment_reference text,
  add column if not exists payment_notes text,
  add column if not exists payment_journal_batch_id uuid references gl_journal_batches(id) on delete set null;

-- Procurement invoice/payment metadata.
alter table procurement_orders
  add column if not exists invoice_no text,
  add column if not exists invoice_date date,
  add column if not exists due_date date,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','paid')),
  add column if not exists paid_at date,
  add column if not exists payment_account_key text check (payment_account_key in ('cash','bank')),
  add column if not exists payment_reference text,
  add column if not exists received_journal_batch_id uuid references gl_journal_batches(id) on delete set null,
  add column if not exists payment_journal_batch_id uuid references gl_journal_batches(id) on delete set null;

-- Extend the GL source type vocabulary.
alter table gl_journal_batches
  drop constraint if exists gl_journal_batches_source_type_check;
alter table gl_journal_batches
  add constraint gl_journal_batches_source_type_check
  check (source_type in (
    'manual','opening','sales_daily','expense','payroll','cash','capex',
    'procurement_receipt','procurement_payment','journal_correction'
  ));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function gl_account_for_expense_name(p_category text) returns uuid
language plpgsql stable as $$
begin
  return case
    when p_category ilike 'rent%'                       then gl_acct('expense_rent')
    when p_category ilike 'utilit%'                     then gl_acct('expense_utilities')
    when p_category ilike 'marketing%'                  then gl_acct('expense_marketing')
    when p_category ilike 'supplies%' or p_category ilike '%equipment%' then gl_acct('expense_supplies')
    when p_category ilike 'maintenance%' or p_category ilike '%repair%' then gl_acct('expense_maintenance')
    when p_category ilike 'staff%' or p_category ilike 'salar%' or p_category ilike 'wage%' then gl_acct('expense_wages_one_off')
    when p_category ilike 'training%'                   then gl_acct('expense_professional_fees')
    when p_category ilike 'food%' or p_category ilike '%beverage%' then gl_acct('expense_supplies')
    else gl_acct('expense_other_opex')
  end;
end $$;

create or replace function finance_audit(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_old jsonb,
  p_new jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into finance_change_audit(entity_type, entity_id, action, old_data, new_data, changed_by)
  values (p_entity_type, p_entity_id, p_action, p_old, p_new, auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create or replace function update_expense_with_audit(
  p_id uuid,
  p_cost_center_id text,
  p_category_id uuid,
  p_amount numeric,
  p_currency text,
  p_exchange_rate_to_lyd numeric,
  p_amount_lyd numeric,
  p_vendor text,
  p_description text,
  p_paid_by text,
  p_expense_date date
) returns expenses
language plpgsql security definer set search_path = public as $$
declare
  v_old expenses;
  v_new expenses;
begin
  select * into v_old from expenses where id = p_id;
  if not found then raise exception 'Expense not found'; end if;

  update expenses set
    cost_center_id = p_cost_center_id,
    category_id = p_category_id,
    amount = p_amount,
    currency = p_currency,
    exchange_rate_to_lyd = p_exchange_rate_to_lyd,
    amount_lyd = p_amount_lyd,
    vendor = nullif(p_vendor, ''),
    description = nullif(p_description, ''),
    paid_by = coalesce(nullif(p_paid_by, ''), 'Business'),
    expense_date = p_expense_date,
    updated_at = now()
  where id = p_id
  returning * into v_new;

  perform finance_audit('expense', p_id, 'update', to_jsonb(v_old), to_jsonb(v_new));
  return v_new;
end $$;
grant execute on function update_expense_with_audit(uuid, text, uuid, numeric, text, numeric, numeric, text, text, text, date)
  to authenticated, service_role;

create or replace function mark_expense_paid(
  p_expense_id uuid,
  p_payment_account_key text,
  p_paid_at date default current_date,
  p_reference text default null,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_old expenses;
  v_new expenses;
  v_batch uuid;
  v_ref text := 'expenses:' || p_expense_id::text;
  v_acct uuid;
  v_pay_acct uuid;
  v_amount numeric(14,2);
  v_cat text;
  v_memo text;
begin
  if p_payment_account_key not in ('cash','bank') then
    raise exception 'Payment account must be cash or bank';
  end if;

  select * into v_old from expenses where id = p_expense_id;
  if not found then raise exception 'Expense not found'; end if;
  if v_old.status not in ('approved','paid') then
    raise exception 'Only approved expenses can be paid';
  end if;

  select coalesce(c.name, 'Expense')
    into v_cat
  from expenses e
  left join expense_categories c on c.id = e.category_id
  where e.id = p_expense_id;

  v_amount := coalesce(v_old.amount_lyd, v_old.amount * coalesce(v_old.exchange_rate_to_lyd, 1), 0);
  if v_amount <= 0 then raise exception 'Expense amount must be greater than zero'; end if;

  v_acct := gl_account_for_expense_name(v_cat);
  v_pay_acct := gl_acct(p_payment_account_key);
  v_memo := left(coalesce(v_old.vendor, v_old.description, v_cat, 'Expense payment'), 200);

  delete from gl_journal_batches where source_type = 'expense' and source_ref = v_ref;

  insert into gl_journal_batches (journal_date, source_type, source_ref, memo, status, created_by)
  values (coalesce(p_paid_at, current_date), 'expense', v_ref, v_memo, 'draft', auth.uid())
  returning id into v_batch;

  insert into gl_journal_lines(batch_id, account_id, line_no, debit_lyd, memo)
  values (v_batch, v_acct, 1, v_amount, v_memo);
  insert into gl_journal_lines(batch_id, account_id, line_no, credit_lyd, memo)
  values (v_batch, v_pay_acct, 2, v_amount, coalesce(p_reference, 'Paid'));

  update gl_journal_batches set status='posted' where id = v_batch;

  update expenses set
    status = 'paid',
    paid_at = coalesce(p_paid_at, current_date),
    payment_account_key = p_payment_account_key,
    payment_reference = nullif(p_reference, ''),
    payment_notes = nullif(p_notes, ''),
    payment_journal_batch_id = v_batch,
    updated_at = now()
  where id = p_expense_id
  returning * into v_new;

  perform finance_audit('expense', p_expense_id, 'mark_paid', to_jsonb(v_old), to_jsonb(v_new));
  return v_batch;
end $$;
grant execute on function mark_expense_paid(uuid, text, date, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Manual journal correction
-- ---------------------------------------------------------------------------

create or replace function void_gl_batch(p_batch_id uuid, p_reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_old gl_journal_batches;
  v_new gl_journal_batches;
begin
  select * into v_old from gl_journal_batches where id = p_batch_id;
  if not found then raise exception 'Journal batch not found'; end if;
  if v_old.source_type not in ('manual','journal_correction') then
    raise exception 'Only manual journals can be corrected here';
  end if;

  update gl_journal_batches set
    status = 'void',
    memo = trim(coalesce(memo, '') || case when p_reason is null or p_reason = '' then '' else ' | Void: ' || p_reason end)
  where id = p_batch_id
  returning * into v_new;

  perform finance_audit('gl_journal_batch', p_batch_id, 'void', to_jsonb(v_old), to_jsonb(v_new));
  return p_batch_id;
end $$;
grant execute on function void_gl_batch(uuid, text) to authenticated, service_role;

create or replace function replace_manual_journal(
  p_old_batch_id uuid,
  p_journal_date date,
  p_branch_id uuid,
  p_memo text,
  p_lines jsonb,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new_batch uuid;
  v_row jsonb;
  v_line int := 0;
  v_td numeric(14,2) := 0;
  v_tc numeric(14,2) := 0;
  v_d numeric(14,2);
  v_c numeric(14,2);
begin
  perform void_gl_batch(p_old_batch_id, coalesce(p_reason, 'Corrected journal'));

  insert into gl_journal_batches(journal_date, source_type, source_ref, branch_id, memo, status, created_by)
  values (p_journal_date, 'journal_correction', 'replaces:' || p_old_batch_id::text, p_branch_id, p_memo, 'draft', auth.uid())
  returning id into v_new_batch;

  for v_row in select * from jsonb_array_elements(p_lines) loop
    v_d := coalesce((v_row->>'debit_lyd')::numeric, 0);
    v_c := coalesce((v_row->>'credit_lyd')::numeric, 0);
    if coalesce(v_row->>'account_id','') = '' or (v_d = 0 and v_c = 0) then
      continue;
    end if;
    v_line := v_line + 1;
    v_td := v_td + v_d;
    v_tc := v_tc + v_c;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, credit_lyd, memo)
    values (v_new_batch, (v_row->>'account_id')::uuid, p_branch_id, v_line, v_d, v_c, nullif(v_row->>'memo', ''));
  end loop;

  if v_line = 0 or round(v_td,2) <> round(v_tc,2) then
    raise exception 'Replacement journal is not balanced';
  end if;

  update gl_journal_batches set status='posted' where id = v_new_batch;
  perform finance_audit('gl_journal_batch', v_new_batch, 'replacement', jsonb_build_object('old_batch_id', p_old_batch_id), jsonb_build_object('new_batch_id', v_new_batch));
  return v_new_batch;
end $$;
grant execute on function replace_manual_journal(uuid, date, uuid, text, jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Procurement receipt and payment
-- ---------------------------------------------------------------------------

create or replace function receive_procurement_order(
  p_order_id uuid,
  p_received_at timestamptz default now(),
  p_update_bulk_cost boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order procurement_orders;
  v_old procurement_orders;
  v_batch uuid;
  v_ref text := 'procurement_receipt:' || p_order_id::text;
  v_old_qty numeric;
  v_add_qty numeric;
  v_amount numeric(14,2);
begin
  select * into v_order from procurement_orders where id = p_order_id;
  if not found then raise exception 'Procurement order not found'; end if;
  v_old := v_order;
  if v_order.status = 'cancelled' then raise exception 'Cancelled orders cannot be received'; end if;

  v_add_qty := coalesce(v_order.quantity_ordered, 0);
  v_amount := coalesce(v_order.total_cost_lyd, 0);
  if v_add_qty <= 0 then raise exception 'Received quantity must be greater than zero'; end if;

  select qty_available into v_old_qty from stock where ingredient_id = v_order.ingredient_id for update;
  if found then
    update stock set qty_available = coalesce(v_old_qty, 0) + v_add_qty, unit = coalesce(v_order.unit, unit), updated_at = now()
    where ingredient_id = v_order.ingredient_id;
  else
    insert into stock(ingredient_id, qty_available, unit, min_threshold, updated_at)
    values (v_order.ingredient_id, v_add_qty, v_order.unit, 0, now());
  end if;

  insert into stock_logs(ingredient_id, qty_change, type, notes)
  values (v_order.ingredient_id, v_add_qty, 'restock', 'Procurement order received');

  if p_update_bulk_cost and v_order.unit_cost_lyd is not null then
    update ingredients set bulk_cost = v_order.unit_cost_lyd, bulk_unit = v_order.unit
    where id = v_order.ingredient_id;
  end if;

  delete from gl_journal_batches where source_type = 'procurement_receipt' and source_ref = v_ref;
  if v_amount > 0 then
    insert into gl_journal_batches(journal_date, source_type, source_ref, memo, status, created_by)
    values (coalesce(p_received_at, now())::date, 'procurement_receipt', v_ref, 'Procurement receipt', 'draft', auth.uid())
    returning id into v_batch;
    insert into gl_journal_lines(batch_id, account_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('inventory'), 1, v_amount, coalesce(v_order.supplier_name, 'Inventory purchase'));
    insert into gl_journal_lines(batch_id, account_id, line_no, credit_lyd, memo)
    values (v_batch, gl_acct('accounts_payable'), 2, v_amount, coalesce(v_order.invoice_no, 'Supplier invoice'));
    update gl_journal_batches set status='posted' where id = v_batch;
  end if;

  update procurement_orders set
    status = 'received',
    received_at = coalesce(p_received_at, now()),
    received_journal_batch_id = v_batch
  where id = p_order_id
  returning * into v_order;

  perform finance_audit('procurement_order', p_order_id, 'receive', to_jsonb(v_old), to_jsonb(v_order));
  return v_batch;
end $$;
grant execute on function receive_procurement_order(uuid, timestamptz, boolean) to authenticated, service_role;

create or replace function pay_procurement_order(
  p_order_id uuid,
  p_payment_account_key text,
  p_paid_at date default current_date,
  p_reference text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order procurement_orders;
  v_old procurement_orders;
  v_batch uuid;
  v_ref text := 'procurement_payment:' || p_order_id::text;
  v_amount numeric(14,2);
begin
  if p_payment_account_key not in ('cash','bank') then
    raise exception 'Payment account must be cash or bank';
  end if;

  select * into v_order from procurement_orders where id = p_order_id;
  if not found then raise exception 'Procurement order not found'; end if;
  v_old := v_order;
  if v_order.status <> 'received' then raise exception 'Receive the order before paying its invoice'; end if;
  v_amount := coalesce(v_order.total_cost_lyd, 0);
  if v_amount <= 0 then raise exception 'Invoice amount must be greater than zero'; end if;

  delete from gl_journal_batches where source_type = 'procurement_payment' and source_ref = v_ref;
  insert into gl_journal_batches(journal_date, source_type, source_ref, memo, status, created_by)
  values (coalesce(p_paid_at, current_date), 'procurement_payment', v_ref, 'Procurement invoice payment', 'draft', auth.uid())
  returning id into v_batch;

  insert into gl_journal_lines(batch_id, account_id, line_no, debit_lyd, memo)
  values (v_batch, gl_acct('accounts_payable'), 1, v_amount, coalesce(v_order.invoice_no, 'Supplier invoice'));
  insert into gl_journal_lines(batch_id, account_id, line_no, credit_lyd, memo)
  values (v_batch, gl_acct(p_payment_account_key), 2, v_amount, coalesce(p_reference, 'Paid'));
  update gl_journal_batches set status='posted' where id = v_batch;

  update procurement_orders set
    payment_status = 'paid',
    paid_at = coalesce(p_paid_at, current_date),
    payment_account_key = p_payment_account_key,
    payment_reference = nullif(p_reference, ''),
    payment_journal_batch_id = v_batch
  where id = p_order_id
  returning * into v_order;

  perform finance_audit('procurement_order', p_order_id, 'pay', to_jsonb(v_old), to_jsonb(v_order));
  return v_batch;
end $$;
grant execute on function pay_procurement_order(uuid, text, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Report RPC correction: only posted batches should contribute to balances.
-- Older report RPCs used LEFT JOIN filters that could still sum lines from
-- non-posted batches. These replacements keep zero-balance accounts visible
-- where useful while summing only posted lines.
-- ---------------------------------------------------------------------------

create or replace function gl_trial_balance(p_as_of date default current_date, p_branch uuid default null)
returns table (
  account_id uuid, code text, name_en text, name_ar text, type text,
  normal_balance text, total_debit numeric, total_credit numeric, balance numeric
)
language sql stable security definer set search_path = public as $$
  with posted as (
    select l.account_id, l.debit_lyd, l.credit_lyd
    from gl_journal_lines l
    join gl_journal_batches b on b.id = l.batch_id
    where b.status='posted'
      and b.journal_date <= p_as_of
      and (p_branch is null or b.branch_id = p_branch)
  )
  select a.id, a.code, a.name_en, a.name_ar, a.type, a.normal_balance,
         coalesce(sum(p.debit_lyd),0)  as total_debit,
         coalesce(sum(p.credit_lyd),0) as total_credit,
         case when a.normal_balance='debit'
              then coalesce(sum(p.debit_lyd),0) - coalesce(sum(p.credit_lyd),0)
              else coalesce(sum(p.credit_lyd),0) - coalesce(sum(p.debit_lyd),0) end as balance
  from gl_accounts a
  left join posted p on p.account_id = a.id
  where a.is_postable
  group by a.id, a.code, a.name_en, a.name_ar, a.type, a.normal_balance
  order by a.code;
$$;
grant execute on function gl_trial_balance(date, uuid) to authenticated, service_role;

create or replace function gl_balance_sheet(p_as_of date default current_date, p_branch uuid default null)
returns table (section text, code text, name_en text, name_ar text, balance numeric)
language sql stable security definer set search_path = public as $$
  with posted as (
    select l.account_id, l.debit_lyd, l.credit_lyd
    from gl_journal_lines l
    join gl_journal_batches b on b.id = l.batch_id
    where b.status='posted'
      and b.journal_date <= p_as_of
      and (p_branch is null or b.branch_id = p_branch)
  )
  select a.type as section, a.code, a.name_en, a.name_ar,
         case when a.normal_balance='debit'
              then coalesce(sum(p.debit_lyd),0) - coalesce(sum(p.credit_lyd),0)
              else coalesce(sum(p.credit_lyd),0) - coalesce(sum(p.debit_lyd),0) end as balance
  from gl_accounts a
  left join posted p on p.account_id = a.id
  where a.is_postable and a.type in ('asset','liability','equity')
  group by a.type, a.code, a.name_en, a.name_ar, a.normal_balance
  having coalesce(sum(p.debit_lyd),0) <> 0 or coalesce(sum(p.credit_lyd),0) <> 0
  order by a.code;
$$;
grant execute on function gl_balance_sheet(date, uuid) to authenticated, service_role;

create or replace function gl_income_statement(p_from date, p_to date, p_branch uuid default null)
returns table (section text, code text, name_en text, name_ar text, amount numeric)
language sql stable security definer set search_path = public as $$
  with posted as (
    select l.account_id, l.debit_lyd, l.credit_lyd
    from gl_journal_lines l
    join gl_journal_batches b on b.id = l.batch_id
    where b.status='posted'
      and b.journal_date between p_from and p_to
      and (p_branch is null or b.branch_id = p_branch)
  )
  select a.type as section, a.code, a.name_en, a.name_ar,
         case when a.normal_balance='credit'
              then coalesce(sum(p.credit_lyd),0) - coalesce(sum(p.debit_lyd),0)
              else coalesce(sum(p.debit_lyd),0) - coalesce(sum(p.credit_lyd),0) end as amount
  from gl_accounts a
  left join posted p on p.account_id = a.id
  where a.is_postable and a.type in ('revenue','cogs','expense')
  group by a.type, a.code, a.name_en, a.name_ar, a.normal_balance
  having coalesce(sum(p.debit_lyd),0) <> 0 or coalesce(sum(p.credit_lyd),0) <> 0
  order by a.code;
$$;
grant execute on function gl_income_statement(date, date, uuid) to authenticated, service_role;
