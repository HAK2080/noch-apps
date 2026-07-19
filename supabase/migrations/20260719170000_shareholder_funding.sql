-- Shareholder funding: tag expenses paid out-of-pocket by a person as a
-- shareholder loan or a capital injection, track repayments, and post the
-- matching GL legs.
--
-- 1. expenses.funding_type: 'business' (paid from company cash — unchanged
--    behavior), 'shareholder_loan' (person paid on the company's behalf →
--    credit 2300 Shareholder loans payable), 'capital_injection' (credit 3000
--    Owner capital). Existing rows with a non-'Business' paid_by are
--    backfilled to 'shareholder_loan'.
-- 2. GL account 2300 + gl_account_map keys 'shareholder_loan' / 'owner_capital'.
-- 3. shareholder_repayments table (repay a person in cash) + RLS.
-- 4. shareholder_funding_balances view: loans / capital / repayments /
--    outstanding per person.
-- 5. gl_post_expense: only the credit leg changes — expenses-source rows
--    credit 2300/3000 per funding_type; everything else is byte-identical.
-- 6. record_shareholder_repayment RPC (owner/accountant): inserts the
--    repayment and posts one balanced GL batch, Dr 2300 / Cr 1010 cash.

-- ── 1. expenses.funding_type ─────────────────────────────────────────────────
alter table public.expenses
  add column if not exists funding_type text not null default 'business'
    check (funding_type in ('business', 'shareholder_loan', 'capital_injection'));

-- Rows someone else paid out of pocket are shareholder loans until re-tagged.
update public.expenses
   set funding_type = 'shareholder_loan'
 where coalesce(nullif(trim(paid_by), ''), 'Business') <> 'Business'
   and funding_type = 'business';

-- ── 2. GL account 2300 + account map keys ────────────────────────────────────
insert into gl_accounts (code, name_en, name_ar, type, normal_balance, is_postable) values
  ('2300', 'Shareholder loans payable', 'قروض المساهمين مستحقة', 'liability', 'credit', true)
on conflict (code) do nothing;

-- Parent link (by code) — idempotent, same rule as the chart seed.
update gl_accounts c set parent_id = p.id
from gl_accounts p
where p.code = left(c.code, 1) || '000'
  and c.code <> p.code
  and c.parent_id is distinct from p.id;

insert into gl_account_map (key, account_id, label)
select v.key, a.id, v.label
from (values
  ('shareholder_loan', '2300', 'Shareholder loans payable'),
  ('owner_capital',    '3000', 'Owner capital')
) as v(key, code, label)
join gl_accounts a on a.code = v.code
on conflict (key) do nothing;

-- ── 3. Shareholder repayments ────────────────────────────────────────────────
create table public.shareholder_repayments (
  id uuid primary key default gen_random_uuid(),
  paid_to text not null,  -- person name, matches expenses.paid_by style
  amount numeric not null check (amount > 0),
  currency text not null default 'LYD',
  exchange_rate_to_lyd numeric not null default 1 check (exchange_rate_to_lyd > 0),
  amount_lyd numeric not null,
  repayment_date date not null default current_date,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table public.shareholder_repayments enable row level security;

create policy "shareholder_repayments_read" on public.shareholder_repayments
  for select to authenticated
  using (true);

create policy "shareholder_repayments_insert" on public.shareholder_repayments
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'accountant')));

create policy "shareholder_repayments_delete" on public.shareholder_repayments
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner', 'accountant')));

grant select, insert, delete on public.shareholder_repayments to authenticated;

-- ── 4. Per-person funding balances ───────────────────────────────────────────
-- Outstanding = loans − repayments, floored at 0. Capital injections are
-- equity (never repaid), so they are shown but not netted against loans.
create or replace view public.shareholder_funding_balances as
with people as (
  select e.paid_by as person
  from public.expenses e
  where e.funding_type in ('shareholder_loan', 'capital_injection')
    and e.status in ('approved', 'paid')
    and coalesce(nullif(trim(e.paid_by), ''), 'Business') <> 'Business'
  union
  select r.paid_to as person
  from public.shareholder_repayments r
)
select
  p.person,
  coalesce((select sum(e.amount_lyd) from public.expenses e
    where e.paid_by = p.person
      and e.funding_type = 'shareholder_loan'
      and e.status in ('approved', 'paid')), 0) as loans_lyd,
  coalesce((select sum(e.amount_lyd) from public.expenses e
    where e.paid_by = p.person
      and e.funding_type = 'capital_injection'
      and e.status in ('approved', 'paid')), 0) as capital_lyd,
  coalesce((select sum(r.amount_lyd) from public.shareholder_repayments r
    where r.paid_to = p.person), 0) as repayments_lyd,
  greatest(0,
    coalesce((select sum(e.amount_lyd) from public.expenses e
      where e.paid_by = p.person
        and e.funding_type = 'shareholder_loan'
        and e.status in ('approved', 'paid')), 0)
    - coalesce((select sum(r.amount_lyd) from public.shareholder_repayments r
      where r.paid_to = p.person), 0)
  ) as outstanding_lyd
from people p;

grant select on public.shareholder_funding_balances to authenticated;

-- ── 5. gl_post_expense: funding-aware credit leg ─────────────────────────────
-- Identical to 20260613030000 except: the 'expenses' branch also reads
-- funding_type, and the credit line posts to 2300 (shareholder_loan) or 3000
-- (capital_injection) instead of cash for expenses-source rows so tagged.
-- expense_entries rows have no funding_type and keep the cash credit.
create or replace function gl_post_expense(p_id uuid, p_source text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_batch   uuid;
  v_ref     text := p_source || ':' || p_id::text;
  v_amount  numeric(14,2);
  v_date    date;
  v_branch  uuid;
  v_acct    uuid;
  v_memo    text;
  v_cat     text;
  v_funding text;
begin
  delete from gl_journal_batches where source_type='expense' and source_ref=v_ref;

  if p_source = 'expense_entries' then
    select amount_lyd, paid_at, branch_id, category,
           coalesce(vendor, notes, 'Expense')
      into v_amount, v_date, v_branch, v_cat, v_memo
    from expense_entries
    where id = p_id and (status is null or status = 'approved');
    if not found then return null; end if;
    -- category enum → map key 'expense_<category>' (capex handled separately below)
    if v_cat = 'capex' then
      v_acct := gl_acct('capex_fixed_assets');
    else
      v_acct := coalesce(gl_acct('expense_' || v_cat), gl_acct('expense_other_opex'));
    end if;

  elsif p_source = 'expenses' then
    select e.amount_lyd, e.expense_date, null::uuid,
           coalesce(c.name, 'Expense'), e.funding_type
      into v_amount, v_date, v_branch, v_cat, v_funding
    from expenses e
    left join expense_categories c on c.id = e.category_id
    where e.id = p_id and e.status in ('approved','paid');
    if not found then return null; end if;
    v_memo := v_cat;
    -- Free-text category name → account (best-effort; default Other opex).
    v_acct := case
      when v_cat ilike 'rent%'                 then gl_acct('expense_rent')
      when v_cat ilike 'utilit%'               then gl_acct('expense_utilities')
      when v_cat ilike 'marketing%'            then gl_acct('expense_marketing')
      when v_cat ilike 'supplies%' or v_cat ilike '%equipment%' then gl_acct('expense_supplies')
      when v_cat ilike 'maintenance%' or v_cat ilike '%repair%' then gl_acct('expense_maintenance')
      when v_cat ilike 'staff%' or v_cat ilike 'salar%' or v_cat ilike 'wage%' then gl_acct('expense_wages_one_off')
      when v_cat ilike 'training%'             then gl_acct('expense_professional_fees')
      when v_cat ilike 'food%' or v_cat ilike '%beverage%' then gl_acct('expense_supplies')
      else gl_acct('expense_other_opex')
    end;
  else
    raise exception 'unknown expense source %', p_source;
  end if;

  if coalesce(v_amount,0) = 0 then return null; end if;

  insert into gl_journal_batches (journal_date, source_type, source_ref, branch_id, memo, status)
  values (coalesce(v_date, current_date), 'expense', v_ref, v_branch, left(coalesce(v_memo,'Expense'),200), 'draft')
  returning id into v_batch;

  insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
  values (v_batch, v_acct, v_branch, 1, v_amount, v_memo);
  -- Credit leg: out-of-pocket funding credits the shareholder-loan / owner
  -- capital account instead of cash (map-key first, seeded code as fallback).
  insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
  values (v_batch, case
    when p_source = 'expenses' and v_funding = 'shareholder_loan'
      then coalesce(gl_acct('shareholder_loan'), (select id from gl_accounts where code = '2300'))
    when p_source = 'expenses' and v_funding = 'capital_injection'
      then coalesce(gl_acct('owner_capital'), (select id from gl_accounts where code = '3000'))
    else gl_acct('cash')
  end, v_branch, 2, v_amount, 'Paid');

  update gl_journal_batches set status='posted' where id = v_batch;
  return v_batch;
end $$;
grant execute on function gl_post_expense(uuid, text) to authenticated, service_role;

-- ── 6. Record a cash repayment to a shareholder ─────────────────────────────
-- Inserts the repayment row and posts one balanced batch:
-- Dr 2300 Shareholder loans payable / Cr 1010 cash, journal_date = p_date.
create or replace function public.record_shareholder_repayment(
  p_paid_to text,
  p_amount numeric,
  p_currency text default 'LYD',
  p_exchange_rate numeric default 1,
  p_amount_lyd numeric default null,
  p_date date default current_date,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_batch uuid;
  v_amount_lyd numeric;
  v_loan uuid;
  v_cash uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'accountant')) then
    raise exception 'owner or accountant only';
  end if;

  v_amount_lyd := coalesce(p_amount_lyd, p_amount * coalesce(p_exchange_rate, 1));
  if coalesce(v_amount_lyd, 0) <= 0 then
    raise exception 'repayment amount must be positive';
  end if;

  insert into shareholder_repayments (paid_to, amount, currency, exchange_rate_to_lyd, amount_lyd, repayment_date, note, created_by)
  values (p_paid_to, p_amount, coalesce(p_currency, 'LYD'), coalesce(p_exchange_rate, 1), v_amount_lyd, coalesce(p_date, current_date), p_note, auth.uid())
  returning id into v_id;

  -- Owner-remappable via gl_account_map; fall back to the seeded codes.
  v_loan := coalesce(gl_acct('shareholder_loan'), (select id from gl_accounts where code = '2300'));
  v_cash := coalesce(gl_acct('cash'), (select id from gl_accounts where code = '1010'));
  if v_loan is null or v_cash is null then
    raise exception 'shareholder GL accounts are not configured (shareholder loans 2300 / cash 1010)';
  end if;

  insert into gl_journal_batches (journal_date, source_type, source_ref, branch_id, memo, status)
  values (coalesce(p_date, current_date), 'cash', 'shareholder-repayment:' || v_id::text, null,
          left('Shareholder loan repayment — ' || p_paid_to, 200), 'draft')
  returning id into v_batch;

  insert into gl_journal_lines (batch_id, account_id, branch_id, line_no, debit_lyd, memo)
  values (v_batch, v_loan, null, 1, v_amount_lyd, 'Shareholder loan repayment — ' || p_paid_to);
  insert into gl_journal_lines (batch_id, account_id, branch_id, line_no, credit_lyd, memo)
  values (v_batch, v_cash, null, 2, v_amount_lyd, 'Shareholder loan repayment — ' || p_paid_to);

  update gl_journal_batches set status = 'posted' where id = v_batch;

  return v_id;
end;
$$;

grant execute on function public.record_shareholder_repayment(text, numeric, text, numeric, numeric, date, text) to authenticated;
