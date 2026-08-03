-- Payroll manual hours: attendance and schedules remain useful evidence, but
-- neither is required to prepare a draft. Owners can enter period hours/day,
-- worked days, scheduled hours, and overtime directly on a draft item.

alter table public.payroll_run_items
  add column if not exists manual_hours_per_day numeric,
  add column if not exists manual_worked_days numeric,
  add column if not exists manual_scheduled_hours numeric,
  add column if not exists manual_overtime_hours numeric;

alter table public.payroll_run_items
  drop constraint if exists payroll_run_items_manual_hours_nonnegative;
alter table public.payroll_run_items
  add constraint payroll_run_items_manual_hours_nonnegative
  check (
    (manual_hours_per_day is null or manual_hours_per_day >= 0)
    and (manual_worked_days is null or manual_worked_days >= 0)
    and (manual_scheduled_hours is null or manual_scheduled_hours >= 0)
    and (manual_overtime_hours is null or manual_overtime_hours >= 0)
  );

create or replace function public.payroll_update_item_hours_v2(
  p_item_id uuid,
  p_hours_per_day numeric default null,
  p_worked_days numeric default null,
  p_scheduled_hours numeric default null,
  p_overtime_hours numeric default null
)
returns public.payroll_run_items
language plpgsql
security definer
set search_path = public
as $$
declare
  item_row public.payroll_run_items;
  profile_rate numeric;
  worked_hours numeric;
  scheduled_hours_value numeric;
  overtime_hours numeric;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'owner'
  ) then
    raise exception 'owner only';
  end if;

  if (p_hours_per_day is not null and p_hours_per_day < 0)
    or (p_worked_days is not null and p_worked_days < 0)
    or (p_scheduled_hours is not null and p_scheduled_hours < 0)
    or (p_overtime_hours is not null and p_overtime_hours < 0)
  then
    raise exception 'payroll hours cannot be negative';
  end if;

  select item.*
  into item_row
  from public.payroll_run_items item
  join public.payroll_runs run on run.id = item.run_id
  where item.id = p_item_id
    and run.status = 'draft'
  for update;

  if not found then
    raise exception 'draft payroll item not found';
  end if;

  select coalesce(profile.hourly_rate_lyd, profile.hourly_rate, 0)
  into profile_rate
  from public.profiles profile
  where profile.id = item_row.profile_id;

  profile_rate := coalesce(item_row.source_rate_lyd, profile_rate, 0);
  worked_hours := case
    when p_hours_per_day is not null and p_worked_days is not null
      then p_hours_per_day * p_worked_days
    else coalesce(item_row.source_hours, 0)
  end;
  scheduled_hours_value := coalesce(p_scheduled_hours, item_row.scheduled_hours, 0);
  overtime_hours := coalesce(
    p_overtime_hours,
    greatest(worked_hours - scheduled_hours_value, 0)
  );

  update public.payroll_run_items item
  set manual_hours_per_day = p_hours_per_day,
      manual_worked_days = p_worked_days,
      manual_scheduled_hours = p_scheduled_hours,
      manual_overtime_hours = p_overtime_hours,
      base_lyd = case
        when item.pay_basis = 'hourly'
          then round(worked_hours * profile_rate, 2)
        else item.base_lyd
      end,
      overtime_lyd = case
        when item.pay_basis = 'hourly'
          then round(overtime_hours * profile_rate, 2)
        else item.overtime_lyd
      end
  where item.id = item_row.id
  returning * into item_row;

  return item_row;
end;
$$;

grant execute on function public.payroll_update_item_hours_v2(
  uuid, numeric, numeric, numeric, numeric
) to authenticated;
