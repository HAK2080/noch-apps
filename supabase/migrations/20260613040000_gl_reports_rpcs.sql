-- GL reporting RPCs: trial balance, account ledger, balance sheet, income
-- statement. All read posted journal lines. security definer + granted.

-- ── TRIAL BALANCE (ميزان المراجعة) ──────────────────────────────────────────
-- Per postable account up to p_as_of (optionally one branch).
-- balance is signed by the account's normal_balance.
create or replace function gl_trial_balance(p_as_of date default current_date, p_branch uuid default null)
returns table (
  account_id uuid, code text, name_en text, name_ar text, type text,
  normal_balance text, total_debit numeric, total_credit numeric, balance numeric
)
language sql stable security definer set search_path = public as $$
  select a.id, a.code, a.name_en, a.name_ar, a.type, a.normal_balance,
         coalesce(sum(l.debit_lyd),0)  as total_debit,
         coalesce(sum(l.credit_lyd),0) as total_credit,
         case when a.normal_balance='debit'
              then coalesce(sum(l.debit_lyd),0) - coalesce(sum(l.credit_lyd),0)
              else coalesce(sum(l.credit_lyd),0) - coalesce(sum(l.debit_lyd),0) end as balance
  from gl_accounts a
  left join gl_journal_lines l on l.account_id = a.id
  left join gl_journal_batches b on b.id = l.batch_id
       and b.status='posted' and b.journal_date <= p_as_of
       and (p_branch is null or b.branch_id = p_branch)
  where a.is_postable
  group by a.id, a.code, a.name_en, a.name_ar, a.type, a.normal_balance
  order by a.code;
$$;
grant execute on function gl_trial_balance(date, uuid) to authenticated, service_role;

-- ── ACCOUNT LEDGER (دفتر الأستاذ) — running balance for one account ─────────
create or replace function gl_account_ledger(p_account_id uuid, p_from date, p_to date, p_branch uuid default null)
returns table (
  journal_date date, batch_id uuid, batch_no text, source_type text,
  memo text, debit_lyd numeric, credit_lyd numeric, running_balance numeric
)
language sql stable security definer set search_path = public as $$
  with nb as (select normal_balance from gl_accounts where id = p_account_id),
  lines as (
    select b.journal_date, b.id as batch_id, b.batch_no, b.source_type,
           coalesce(l.memo, b.memo) as memo, l.debit_lyd, l.credit_lyd,
           b.created_at
    from gl_journal_lines l
    join gl_journal_batches b on b.id = l.batch_id
    where l.account_id = p_account_id and b.status='posted'
      and b.journal_date between p_from and p_to
      and (p_branch is null or b.branch_id = p_branch)
  )
  select journal_date, batch_id, batch_no, source_type, memo, debit_lyd, credit_lyd,
         sum(case when (select normal_balance from nb)='debit'
                  then debit_lyd - credit_lyd else credit_lyd - debit_lyd end)
             over (order by journal_date, created_at
                   rows between unbounded preceding and current row) as running_balance
  from lines
  order by journal_date, created_at;
$$;
grant execute on function gl_account_ledger(uuid, date, date, uuid) to authenticated, service_role;

-- ── BALANCE SHEET ───────────────────────────────────────────────────────────
create or replace function gl_balance_sheet(p_as_of date default current_date, p_branch uuid default null)
returns table (section text, code text, name_en text, name_ar text, balance numeric)
language sql stable security definer set search_path = public as $$
  select a.type as section, a.code, a.name_en, a.name_ar,
         case when a.normal_balance='debit'
              then coalesce(sum(l.debit_lyd),0) - coalesce(sum(l.credit_lyd),0)
              else coalesce(sum(l.credit_lyd),0) - coalesce(sum(l.debit_lyd),0) end as balance
  from gl_accounts a
  left join gl_journal_lines l on l.account_id = a.id
  left join gl_journal_batches b on b.id = l.batch_id
       and b.status='posted' and b.journal_date <= p_as_of
       and (p_branch is null or b.branch_id = p_branch)
  where a.is_postable and a.type in ('asset','liability','equity')
  group by a.type, a.code, a.name_en, a.name_ar, a.normal_balance
  having coalesce(sum(l.debit_lyd),0) <> 0 or coalesce(sum(l.credit_lyd),0) <> 0
  order by a.code;
$$;
grant execute on function gl_balance_sheet(date, uuid) to authenticated, service_role;

-- ── INCOME STATEMENT (from the ledger) ──────────────────────────────────────
create or replace function gl_income_statement(p_from date, p_to date, p_branch uuid default null)
returns table (section text, code text, name_en text, name_ar text, amount numeric)
language sql stable security definer set search_path = public as $$
  select a.type as section, a.code, a.name_en, a.name_ar,
         case when a.normal_balance='credit'
              then coalesce(sum(l.credit_lyd),0) - coalesce(sum(l.debit_lyd),0)
              else coalesce(sum(l.debit_lyd),0) - coalesce(sum(l.credit_lyd),0) end as amount
  from gl_accounts a
  left join gl_journal_lines l on l.account_id = a.id
  left join gl_journal_batches b on b.id = l.batch_id
       and b.status='posted' and b.journal_date between p_from and p_to
       and (p_branch is null or b.branch_id = p_branch)
  where a.is_postable and a.type in ('revenue','cogs','expense')
  group by a.type, a.code, a.name_en, a.name_ar, a.normal_balance
  having coalesce(sum(l.debit_lyd),0) <> 0 or coalesce(sum(l.credit_lyd),0) <> 0
  order by a.code;
$$;
grant execute on function gl_income_statement(date, date, uuid) to authenticated, service_role;
