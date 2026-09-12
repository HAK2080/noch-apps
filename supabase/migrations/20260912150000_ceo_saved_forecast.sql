begin;

-- Owner planning only. No expense, payment, payroll or journal writes.
create table public.ceo_forecast_plans (
  period_month date primary key,
  target_date date not null,
  items jsonb not null,
  rent_covered boolean not null default false,
  bills_covered boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id)
);
alter table public.ceo_forecast_plans enable row level security;
revoke all on public.ceo_forecast_plans from anon, authenticated;

create function public.get_ceo_forecast() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  v_today date := (now() at time zone 'Africa/Tripoli')::date;
  v_month date := date_trunc('month',v_today)::date;
  v_end date := (v_month+interval '1 month' - interval '1 day')::date;
  v_plan ceo_forecast_plans; v_observation finance_balance_observations;
  v_items jsonb; v_payroll numeric; v_movement numeric := 0;
  v_in numeric; v_out numeric; v_base numeric;
begin
  if not exists(select 1 from profiles where (id=auth.uid() or auth_user_id=auth.uid()) and role='owner') then
    raise exception 'Owner access required';
  end if;
  select * into v_plan from ceo_forecast_plans where period_month=v_month;
  v_payroll := (ceo_money_overview(v_month,v_end)->>'payroll_estimate')::numeric;
  if exists(select 1 from payroll_runs where period_month=v_month and paid_at is not null) then v_payroll:=0; end if;
  v_items := coalesce(v_plan.items,case when v_payroll>0 then jsonb_build_array(jsonb_build_object(
    'id','payroll','label','Payroll estimate — review remaining amount','direction','out',
    'amount',v_payroll,'due_date',v_end,'included',true)) else '[]'::jsonb end);
  -- A past saved target rolls forward to today; overdue included items remain due.
  v_end := greatest(v_today,coalesce(v_plan.target_date,v_end));
  select * into v_observation from finance_balance_observations where as_of<=v_today
    order by as_of desc,created_at desc,id desc limit 1;
  if v_observation.id is not null then
    select coalesce(sum(cash_lyd+bank_lyd),0) into v_movement
      from ceo_money_movements(v_observation.as_of+1,v_today);
    v_base := v_observation.cash_lyd+v_observation.bank_lyd+v_movement;
  end if;
  select coalesce(sum((i->>'amount')::numeric) filter(where i->>'direction'='in'),0),
    coalesce(sum((i->>'amount')::numeric) filter(where i->>'direction'='out'),0)
    into v_in,v_out from jsonb_array_elements(v_items) i
    where (i->>'included')::boolean and (i->>'due_date')::date<=v_end;
  return jsonb_build_object('today',v_today,'month_end',(v_month+interval '1 month' - interval '1 day')::date,
    'target_date',v_end,'items',v_items,'rent_covered',coalesce(v_plan.rent_covered,false),
    'bills_covered',coalesce(v_plan.bills_covered,false),'saved_at',v_plan.updated_at,
    'balance_date',v_observation.as_of,'starting_funds',round(v_base,2),
    'recorded_movement_since_count',round(v_movement,2),'expected_income',round(v_in,2),
    'expected_payments',round(v_out,2),'cash_left',round(v_base+v_in-v_out,2));
end $$;
revoke all on function public.get_ceo_forecast() from public,anon;
grant execute on function public.get_ceo_forecast() to authenticated;

create function public.save_ceo_forecast(p_target date,p_items jsonb,p_rent_covered boolean,p_bills_covered boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_today date := (now() at time zone 'Africa/Tripoli')::date;
  v_month date := date_trunc('month',v_today)::date;
  v_actor uuid; v_item jsonb; v_items jsonb := '[]'::jsonb; v_amount numeric; v_due date;
begin
  select id into v_actor from profiles where (id=auth.uid() or auth_user_id=auth.uid()) and role='owner';
  if v_actor is null then raise exception 'Owner access required'; end if;
  if p_target is null or p_target<v_today or p_target>=(v_month+interval '1 month')::date then
    raise exception 'Choose a forecast date from today to the end of this month';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Provide forecast items'; end if;
  if jsonb_array_length(p_items)>100 then raise exception 'Use at most 100 forecast items'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' or coalesce(length(trim(v_item->>'label')),0) not between 1 and 150
      or coalesce(length(v_item->>'id'),0) not between 1 and 100
      or coalesce(v_item->>'direction','') not in ('in','out')
      or coalesce(v_item->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$'
      or coalesce(jsonb_typeof(v_item->'included'),'')<>'boolean'
      or coalesce(v_item->>'due_date','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Each item needs a name, direction, positive amount, date and include choice';
    end if;
    v_amount := (v_item->>'amount')::numeric; v_due := (v_item->>'due_date')::date;
    if v_amount<=0 or v_amount>1000000000 then raise exception 'Enter an amount above zero and at most 1 billion LYD'; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('id',v_item->>'id','label',trim(v_item->>'label'),
      'direction',v_item->>'direction','amount',v_amount,'due_date',v_due,'included',(v_item->>'included')::boolean));
  end loop;
  if (select count(distinct i->>'id') from jsonb_array_elements(v_items) i)<>jsonb_array_length(v_items) then
    raise exception 'Forecast item identifiers must be unique';
  end if;
  insert into ceo_forecast_plans(period_month,target_date,items,rent_covered,bills_covered,updated_by)
    values(v_month,p_target,v_items,coalesce(p_rent_covered,false),coalesce(p_bills_covered,false),v_actor)
    on conflict(period_month) do update set target_date=excluded.target_date,items=excluded.items,
      rent_covered=excluded.rent_covered,bills_covered=excluded.bills_covered,updated_at=now(),updated_by=v_actor;
  return get_ceo_forecast();
end $$;
revoke all on function public.save_ceo_forecast(date,jsonb,boolean,boolean) from public,anon;
grant execute on function public.save_ceo_forecast(date,jsonb,boolean,boolean) to authenticated;
commit;
