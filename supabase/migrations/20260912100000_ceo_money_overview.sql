begin;

-- Observations are evidence, never balancing journal entries. Keep every edit.
create table public.finance_balance_observations (
  id uuid primary key default gen_random_uuid(),
  as_of date not null,
  cash_lyd numeric(16,2) not null,
  bank_lyd numeric(16,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id)
);
alter table public.finance_balance_observations enable row level security;
create policy owner_read on public.finance_balance_observations for select to authenticated
  using (exists (select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role='owner'));
grant select on public.finance_balance_observations to authenticated;
revoke insert, update, delete on public.finance_balance_observations from anon, authenticated;

-- Cash tender events are already net of separately dated refund/void events.
-- Card/Presto remain receivables until an actual settlement is posted to bank/cash.
-- Exclude daily sales journals and canonical expense journals to count each source once.
create function public.ceo_money_movements(p_from date, p_to date)
returns table(event_date date, source text, cash_lyd numeric, bank_lyd numeric)
language sql stable security definer set search_path=public as $$
  select (t.occurred_at at time zone 'Africa/Tripoli')::date, 'pos:'||t.id,
    t.signed_amount_lyd, 0::numeric
  from pos_tender_events t
  where t.tender_type='cash'
    and t.occurred_at >= p_from::timestamp at time zone 'Africa/Tripoli'
    and t.occurred_at < (p_to+1)::timestamp at time zone 'Africa/Tripoli'
  union all
  select e.paid_at, 'expense:'||e.id,
    case when e.payment_account_key='cash' then -coalesce(e.amount_lyd,e.amount*e.exchange_rate_to_lyd,0) else 0 end,
    case when e.payment_account_key='bank' then -coalesce(e.amount_lyd,e.amount*e.exchange_rate_to_lyd,0) else 0 end
  from expenses e
  where e.status='paid' and e.paid_at between p_from and p_to
    and e.payment_account_key in ('cash','bank')
  union all
  select b.journal_date, 'journal:'||b.id,
    coalesce(sum(l.debit_lyd-l.credit_lyd) filter(where l.account_id=gl_acct('cash')),0),
    coalesce(sum(l.debit_lyd-l.credit_lyd) filter(where l.account_id=gl_acct('bank')),0)
  from gl_journal_batches b join gl_journal_lines l on l.batch_id=b.id
  where b.status='posted' and b.source_type not in ('sales_daily','opening')
    and b.journal_date between p_from and p_to
    and l.account_id in (gl_acct('cash'),gl_acct('bank'))
    and not exists(select 1 from expenses e where e.payment_journal_batch_id=b.id
      or (b.source_type='expense' and b.source_ref='expenses:'||e.id::text))
  group by b.id
$$;
revoke all on function public.ceo_money_movements(date,date) from public, anon, authenticated;

create function public.save_ceo_balances(p_as_of date, p_cash numeric, p_bank numeric, p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid; v_id uuid;
begin
  select p.id into v_actor from profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role='owner';
  if v_actor is null then raise exception 'Owner access required'; end if;
  if p_as_of is null or p_as_of > (now() at time zone 'Africa/Tripoli')::date
    or p_cash is null or p_bank is null or p_cash::text in ('NaN','Infinity','-Infinity')
    or p_bank::text in ('NaN','Infinity','-Infinity') or p_cash<0 then
    raise exception 'Enter a valid date, cash count and bank balance';
  end if;
  insert into finance_balance_observations(as_of,cash_lyd,bank_lyd,notes,created_by)
  values(p_as_of,p_cash,p_bank,nullif(trim(p_notes),''),v_actor) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.save_ceo_balances(date,numeric,numeric,text) from public, anon;
grant execute on function public.save_ceo_balances(date,numeric,numeric,text) to authenticated;

create function public.ceo_money_overview(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_in numeric; v_out numeric; v_invoices numeric; v_invoice_count int;
  v_payroll numeric; v_current finance_balance_observations; v_previous finance_balance_observations;
  v_cash_change numeric; v_bank_change numeric; v_reconstructed int; v_missing_start int;
begin
  if not exists(select 1 from profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role='owner') then
    raise exception 'Owner access required';
  end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>1095 then
    raise exception 'Choose a valid date range of up to three years';
  end if;
  if gl_acct('cash') is null or gl_acct('bank') is null or gl_acct('cash')=gl_acct('bank') then
    raise exception 'Configure separate cash and bank accounts in Accounting';
  end if;
  select coalesce(sum(greatest(cash_lyd+bank_lyd,0)),0),
    coalesce(sum(greatest(-cash_lyd-bank_lyd,0)),0) into v_in,v_out
  from ceo_money_movements(p_from,p_to);
  -- Invoice date (including Receipt Snap), not upload date; rejected rows excluded.
  select coalesce(sum(coalesce(amount_lyd,amount*exchange_rate_to_lyd,0)),0),count(*)
    into v_invoices,v_invoice_count from expenses
    where expense_date between p_from and p_to and status<>'rejected';
  -- An estimate of base salaries earned during the selected days, never added to cash out.
  -- Stored monthly runs take precedence, including drafts; otherwise use employee salaries.
  with months as (
    select d::date m, (d+interval '1 month'-interval '1 day')::date last_day
    from generate_series(date_trunc('month',p_from::timestamp),date_trunc('month',p_to::timestamp),interval '1 month') d
  ) select coalesce(sum(case when r.id is not null then
      coalesce((select sum(i.net_lyd) from payroll_run_items i where i.run_id=r.id),0)
      * (least(p_to,m.last_day)-greatest(p_from,m.m)+1)::numeric/(m.last_day-m.m+1)
    else coalesce((select sum(coalesce(p.monthly_salary,p.monthly_salary_lyd,0)
      * greatest(0,least(p_to,m.last_day,coalesce(p.employment_end_date,m.last_day))
        - greatest(p_from,m.m,coalesce(p.start_date,m.m))+1)::numeric/(m.last_day-m.m+1))
      from profiles p where p.is_employee and p.payroll_enabled
      and (coalesce(p.is_active,true) or p.employment_end_date is not null)),0) end),0)
    into v_payroll from months m left join payroll_runs r on r.period_month=m.m;
  select count(*) into v_missing_start from profiles where is_employee and payroll_enabled and start_date is null;
  select count(*) into v_reconstructed from pos_tender_events
    where source_quality='reconstructed' and tender_type='cash'
      and occurred_at >= p_from::timestamp at time zone 'Africa/Tripoli'
      and occurred_at < (p_to+1)::timestamp at time zone 'Africa/Tripoli';
  select * into v_current from finance_balance_observations where as_of<=p_to order by as_of desc,created_at desc,id desc limit 1;
  select * into v_previous from finance_balance_observations where as_of<v_current.as_of order by as_of desc,created_at desc,id desc limit 1;
  if v_previous.id is not null then
    select coalesce(sum(cash_lyd),0),coalesce(sum(bank_lyd),0) into v_cash_change,v_bank_change
      from ceo_money_movements(v_previous.as_of+1,v_current.as_of);
  end if;
  return jsonb_build_object('money_in',round(v_in,2),'money_out',round(v_out,2),'balance',round(v_in-v_out,2),
    'invoice_total',round(v_invoices,2),'invoice_count',v_invoice_count,'payroll_estimate',round(v_payroll,2),
    'missing_payroll_start_dates',v_missing_start,'reconstructed_cash_events',v_reconstructed,
    'observation',case when v_current.id is null then null else to_jsonb(v_current) end,
    'baseline_date',v_previous.as_of,
    'expected_cash',v_previous.cash_lyd+v_cash_change,'expected_bank',v_previous.bank_lyd+v_bank_change,
    'cash_difference',v_current.cash_lyd-v_previous.cash_lyd-v_cash_change,
    'bank_difference',v_current.bank_lyd-v_previous.bank_lyd-v_bank_change);
end $$;
revoke all on function public.ceo_money_overview(date,date) from public,anon;
grant execute on function public.ceo_money_overview(date,date) to authenticated;
commit;
