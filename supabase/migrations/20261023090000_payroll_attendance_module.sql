begin;

-- Payroll v3: derive days, hours and overtime from attendance evidence.
--
-- What changed and why:
--  1. Attendance and published schedules are now read through the SAME
--     05:00 Africa/Tripoli business-day window. Previously attendance used the
--     05:00 boundary while schedules used midnight, so scheduled-versus-worked
--     comparisons were skewed at every month edge.
--  2. Worked days, scheduled days and overtime hours are derived and stored,
--     so the run shows where a number came from instead of asking the owner to
--     trust it.
--  3. Absence reduces salaried pay, but ONLY where a published schedule exists
--     to prove the absence. With no schedule the run flags the gap and deducts
--     nothing, rather than inventing a deduction from missing evidence.
--  4. Overtime is derived from attendance instead of existing only as a manual
--     adjustment. Overtime is paid at the plain hourly rate (x1, no premium) by
--     owner policy, which has a consequence worth stating: for HOURLY staff the
--     attendance pay already covers every hour worked, so derived overtime adds
--     no money and is recorded for visibility only. For SALARIED staff the base
--     is fixed, so overtime hours genuinely add pay.
--
-- Everything stays editable: the manual_* columns continue to override any
-- derived value, and base_lyd remains directly editable on a draft run.

alter table public.payroll_run_items
  add column if not exists worked_days numeric,
  add column if not exists scheduled_days numeric,
  add column if not exists absence_days numeric,
  add column if not exists absence_deduction_lyd numeric,
  add column if not exists overtime_hours numeric,
  add column if not exists standard_hours numeric,
  add column if not exists overtime_rate_lyd numeric;

comment on column public.payroll_run_items.worked_days is
  'Distinct 05:00 Africa/Tripoli business days with closed attendance.';
comment on column public.payroll_run_items.scheduled_days is
  'Distinct business days with a published schedule shift. Zero means no evidence to measure absence against.';
comment on column public.payroll_run_items.absence_deduction_lyd is
  'Informational: amount already removed from base_lyd for unworked scheduled days. Not subtracted again in net_lyd.';
comment on column public.payroll_run_items.overtime_hours is
  'Attendance hours beyond standard_hours. Paid at x1, so this adds pay for salaried staff only.';
comment on column public.payroll_run_items.overtime_rate_lyd is
  'The hourly rate this run used for overtime. Stored so the editor re-prices a manual hours change exactly as the run did, instead of re-deriving it from a base that absence may have reduced.';

create or replace function public.payroll_generate_run(p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  -- One window for every evidence source in this function.
  window_from timestamptz := (month_start::timestamp + interval '5 hours') at time zone 'Africa/Tripoli';
  window_to timestamptz := ((month_end + 1)::timestamp + interval '5 hours') at time zone 'Africa/Tripoli';
  standard_hours_per_day constant numeric := 9;
  standard_monthly_hours constant numeric := 9 * 26;
  v_run_id uuid;
  item_row record;
  issue_list jsonb;
  item_status text;
  pay_basis_value text;
  monthly_salary_value numeric;
  employment_base numeric;
  base_value numeric;
  attendance_hours numeric;
  attendance_pay numeric;
  worked_days_value numeric;
  schedule_hours numeric;
  scheduled_days_value numeric;
  absence_days_value numeric;
  absence_deduction numeric;
  day_rate numeric;
  overtime_rate numeric;
  standard_hours_value numeric;
  overtime_hours_value numeric;
  derived_overtime_pay numeric;
  adjustment_overtime numeric;
  adjustment_bonus numeric;
  adjustment_deduction numeric;
  run_total numeric;
  blocked_count integer;
  warning_count integer;
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid() and profile.role = 'owner'
  ) then
    raise exception 'owner only';
  end if;

  select id into v_run_id
  from public.payroll_runs
  where period_month = month_start
  for update;

  if v_run_id is not null and exists (
    select 1 from public.payroll_runs
    where id = v_run_id and status in ('completed', 'paid')
  ) then
    raise exception 'payroll run for % is already approved', to_char(month_start, 'YYYY-MM');
  end if;

  if v_run_id is null then
    insert into public.payroll_runs (period_month, status, evidence_status, created_by)
    values (month_start, 'draft', 'blocked', auth.uid())
    returning id into v_run_id;
  else
    delete from public.payroll_run_items where run_id = v_run_id;
  end if;

  for item_row in
    select profile.*
    from public.profiles profile
    where profile.is_employee
      and profile.payroll_enabled
      and (coalesce(profile.is_active, false) or profile.employment_end_date >= month_start)
      and (profile.start_date is null or profile.start_date <= month_end)
    order by profile.full_name
  loop
    issue_list := '[]'::jsonb;
    item_status := 'ready';
    attendance_hours := 0;
    attendance_pay := 0;
    worked_days_value := 0;
    schedule_hours := 0;
    scheduled_days_value := 0;
    absence_days_value := 0;
    absence_deduction := 0;
    overtime_hours_value := 0;
    derived_overtime_pay := 0;
    base_value := 0;
    employment_base := 0;

    monthly_salary_value := coalesce(item_row.monthly_salary, item_row.monthly_salary_lyd, 0);

    if monthly_salary_value > 0 then
      pay_basis_value := 'salary';
    elsif coalesce(item_row.hourly_rate_lyd, item_row.hourly_rate, 0) > 0 then
      pay_basis_value := 'hourly';
    else
      pay_basis_value := 'unconfigured';
      issue_list := issue_list || '["missing_pay_basis"]'::jsonb;
      item_status := 'blocked';
    end if;

    if item_row.start_date is null then
      issue_list := issue_list || '["missing_start_date"]'::jsonb;
      item_status := 'blocked';
    end if;

    if item_row.branch_id is null and item_row.payroll_cost_center_id is null then
      issue_list := issue_list || '["missing_cost_allocation"]'::jsonb;
      item_status := 'blocked';
    end if;

    -- Attendance: hours, pay and the distinct business days actually worked.
    select
      coalesce(sum(cost.hours), 0),
      coalesce(sum(cost.labor_cost_lyd), 0),
      count(distinct ((cost.clocked_in_at at time zone 'Africa/Tripoli') - interval '5 hours')::date)
    into attendance_hours, attendance_pay, worked_days_value
    from public.shift_labor_cost cost
    where cost.user_id = item_row.id
      and cost.clocked_in_at >= window_from
      and cost.clocked_in_at < window_to
      and cost.clocked_out_at is not null;

    -- Published schedule, read through the same window as attendance.
    select
      coalesce(sum(extract(epoch from schedule.ends_at - schedule.starts_at) / 3600), 0),
      count(distinct ((schedule.starts_at at time zone 'Africa/Tripoli') - interval '5 hours')::date)
    into schedule_hours, scheduled_days_value
    from public.workforce_schedule_shifts schedule
    where schedule.profile_id = item_row.id
      and schedule.status = 'published'
      and schedule.starts_at >= window_from
      and schedule.starts_at < window_to;

    if pay_basis_value = 'salary' and item_status <> 'blocked' then
      -- Pro-rate the month for a mid-month joiner or leaver first.
      employment_base := round(
        monthly_salary_value
        * (
            least(month_end, coalesce(item_row.employment_end_date, month_end))
            - greatest(month_start, item_row.start_date)
            + 1
          )::numeric
        / extract(day from month_end),
        2
      );

      -- Absence is only measurable against a published schedule.
      if scheduled_days_value > 0 then
        absence_days_value := greatest(0, scheduled_days_value - worked_days_value);
        if absence_days_value > 0 then
          day_rate := employment_base / scheduled_days_value;
          absence_deduction := round(absence_days_value * day_rate, 2);
        end if;
      end if;

      base_value := round(employment_base - absence_deduction, 2);
      overtime_rate := monthly_salary_value / standard_monthly_hours;
    elsif pay_basis_value = 'hourly' then
      base_value := round(attendance_pay, 2);
      employment_base := base_value;
      overtime_rate := coalesce(item_row.hourly_rate_lyd, item_row.hourly_rate, 0);
      if attendance_hours = 0 then
        issue_list := issue_list || '["no_closed_attendance"]'::jsonb;
        if item_status = 'ready' then item_status := 'warning'; end if;
      end if;
    else
      overtime_rate := 0;
    end if;

    -- Derived overtime: attendance beyond the standard day across worked days.
    standard_hours_value := round(worked_days_value * standard_hours_per_day, 2);
    overtime_hours_value := greatest(0, round(attendance_hours - standard_hours_value, 2));

    -- Overtime is paid at x1. Hourly attendance pay already includes every hour
    -- worked, so a x1 premium adds nothing; only salaried staff gain pay here.
    if pay_basis_value = 'salary' and overtime_hours_value > 0 then
      derived_overtime_pay := round(overtime_hours_value * overtime_rate, 2);
    end if;

    if scheduled_days_value = 0 then
      issue_list := issue_list || '["no_published_schedule"]'::jsonb;
      if item_status = 'ready' then item_status := 'warning'; end if;
    end if;

    if exists (
      select 1 from public.pos_shift_attendees attendee
      where attendee.user_id = item_row.id
        and attendee.clocked_out_at is null
        and attendee.clocked_in_at < window_to
    ) then
      issue_list := issue_list || '["open_attendance"]'::jsonb;
      item_status := 'blocked';
    end if;

    select
      coalesce(sum(amount_lyd) filter (where kind = 'overtime'), 0),
      coalesce(sum(amount_lyd) filter (where kind = 'bonus'), 0),
      coalesce(sum(amount_lyd) filter (where kind = 'deduction'), 0)
    into adjustment_overtime, adjustment_bonus, adjustment_deduction
    from public.labor_adjustments adjustment
    where adjustment.profile_id = item_row.id
      and adjustment.adjustment_date >= month_start
      and adjustment.adjustment_date <= month_end;

    insert into public.payroll_run_items (
      run_id, profile_id, branch_id,
      base_lyd, overtime_lyd, bonus_lyd, deduction_lyd, loan_repayment_lyd,
      pay_basis, source_hours, source_rate_lyd, scheduled_hours,
      worked_days, scheduled_days, absence_days, absence_deduction_lyd,
      overtime_hours, standard_hours, overtime_rate_lyd,
      data_status, data_issues
    )
    values (
      v_run_id, item_row.id, item_row.branch_id,
      base_value,
      round(derived_overtime_pay + adjustment_overtime, 2),
      adjustment_bonus, adjustment_deduction, 0,
      pay_basis_value, attendance_hours,
      coalesce(item_row.hourly_rate_lyd, item_row.hourly_rate), schedule_hours,
      worked_days_value, scheduled_days_value, absence_days_value, absence_deduction,
      overtime_hours_value, standard_hours_value,
      -- Hourly staff are already paid for every hour, so a x1 override must
      -- not add pay; the editor reads this rate and gets zero for them.
      case when pay_basis_value = 'salary' then round(overtime_rate, 4) else 0 end,
      item_status, issue_list
    )
    returning * into item_row;

    insert into public.payroll_loan_repayments (
      run_id, run_item_id, loan_id, profile_id, amount_lyd
    )
    select v_run_id, item_row.id, balance.loan_id, item_row.profile_id,
      least(balance.monthly_repayment_lyd, balance.remaining_lyd)
    from public.staff_loan_balances balance
    where balance.profile_id = item_row.profile_id
      and balance.status = 'active'
      and balance.start_month <= month_start
      and balance.remaining_lyd > 0;

    update public.payroll_run_items item
    set loan_repayment_lyd = coalesce((
      select sum(repayment.amount_lyd)
      from public.payroll_loan_repayments repayment
      where repayment.run_item_id = item.id
    ), 0)
    where item.id = item_row.id;
  end loop;

  select
    coalesce(sum(net_lyd), 0),
    count(*) filter (where data_status = 'blocked'),
    count(*) filter (where data_status = 'warning')
  into run_total, blocked_count, warning_count
  from public.payroll_run_items
  where run_id = v_run_id;

  update public.payroll_runs
  set total_lyd = run_total,
      evidence_status = case
        when not exists (
          select 1 from public.payroll_run_items item where item.run_id = v_run_id
        ) then 'blocked'
        when blocked_count > 0 then 'blocked'
        when warning_count > 0 then 'warning'
        else 'ready'
      end,
      source_snapshot = jsonb_build_object(
        'generated_at', now(),
        'timezone', 'Africa/Tripoli',
        'business_day_start', '05:00',
        'overtime_multiplier', 1,
        'standard_hours_per_day', standard_hours_per_day,
        'employee_count', (
          select count(*) from public.payroll_run_items item where item.run_id = v_run_id
        ),
        'blocked_items', blocked_count,
        'warning_items', warning_count,
        'closed_attendance_rows', (
          select count(*)
          from public.pos_shift_attendees attendee
          where attendee.clocked_out_at is not null
            and attendee.clocked_in_at >= window_from
            and attendee.clocked_in_at < window_to
        ),
        'published_schedule_rows', (
          select count(*)
          from public.workforce_schedule_shifts schedule
          where schedule.status = 'published'
            and schedule.starts_at >= window_from
            and schedule.starts_at < window_to
        )
      ),
      created_by = coalesce(created_by, auth.uid())
  where id = v_run_id;

  return v_run_id;
end $$;

grant execute on function public.payroll_generate_run(date) to authenticated;

commit;
