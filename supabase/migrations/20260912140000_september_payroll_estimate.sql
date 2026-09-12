begin;

-- Planning amounts only: these never create payroll runs or cash payments.
create table public.finance_payroll_estimates (
  period_month date primary key check (extract(day from period_month)=1),
  amount_lyd numeric not null check (amount_lyd>=0),
  note text not null,
  created_at timestamptz not null default now()
);
alter table public.finance_payroll_estimates enable row level security;
revoke all on public.finance_payroll_estimates from anon, authenticated;

insert into public.finance_payroll_estimates(period_month,amount_lyd,note)
values ('2026-09-01',32460,'Owner requested August paid payroll as the provisional September estimate; no new payment.');

create or replace function public.ceo_money_overview(p_from date, p_to date)
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
  -- A payment-method correction reclassifies a receipt; it is not a payment.
  -- Positive corrections already belong in receipts. Move negative corrections
  -- from outflows to a reduction of receipts, preserving the net movement.
  select v_in - coalesce(sum(-signed_amount_lyd),0),
    v_out - coalesce(sum(-signed_amount_lyd),0) into v_in,v_out
  from pos_tender_events
  where event_type='payment_correction' and tender_type='cash' and signed_amount_lyd<0
    and occurred_at >= p_from::timestamp at time zone 'Africa/Tripoli'
    and occurred_at < (p_to+1)::timestamp at time zone 'Africa/Tripoli';
  -- Invoice date (including Receipt Snap), not upload date; rejected rows excluded.
  select coalesce(sum(coalesce(amount_lyd,amount*exchange_rate_to_lyd,0)),0),count(*)
    into v_invoices,v_invoice_count from expenses
    where expense_date between p_from and p_to and status<>'rejected';
  -- An estimate of base salaries earned during the selected days, never added to cash out.
  -- Stored monthly runs take precedence, including drafts; then owner estimates, then employee salaries.
  with months as (
    select d::date m, (d+interval '1 month'-interval '1 day')::date last_day
    from generate_series(date_trunc('month',p_from::timestamp),date_trunc('month',p_to::timestamp),interval '1 month') d
  ) select coalesce(sum(case when r.id is not null then
      coalesce((select sum(i.net_lyd) from payroll_run_items i where i.run_id=r.id),0)
      * (least(p_to,m.last_day)-greatest(p_from,m.m)+1)::numeric/(m.last_day-m.m+1)
    when e.period_month is not null then e.amount_lyd
      * (least(p_to,m.last_day)-greatest(p_from,m.m)+1)::numeric/(m.last_day-m.m+1)
    else coalesce((select sum(coalesce(p.monthly_salary,p.monthly_salary_lyd,0)
      * greatest(0,least(p_to,m.last_day,coalesce(p.employment_end_date,m.last_day))
        - greatest(p_from,m.m,coalesce(p.start_date,m.m))+1)::numeric/(m.last_day-m.m+1))
      from profiles p where p.is_employee and p.payroll_enabled
      and (coalesce(p.is_active,true) or p.employment_end_date is not null)),0) end),0)
    into v_payroll from months m left join payroll_runs r on r.period_month=m.m
      left join finance_payroll_estimates e on e.period_month=m.m;
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
commit;
