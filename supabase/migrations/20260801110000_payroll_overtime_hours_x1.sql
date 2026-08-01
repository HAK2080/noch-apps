-- Manual overtime is paid at the employee's snapshotted hourly rate x1.
-- The calculation applies to salary and hourly payroll items alike. Existing
-- overtime money is preserved until an owner supplies manual overtime hours.

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

  -- Preserve the rate captured when the draft was generated so later profile
  -- edits cannot silently change the value of an in-progress payroll run.
  profile_rate := coalesce(item_row.source_rate_lyd, profile_rate, 0);
  worked_hours := case
    when p_hours_per_day is not null and p_worked_days is not null
      then p_hours_per_day * p_worked_days
    else coalesce(item_row.source_hours, 0)
  end;

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
        when p_overtime_hours is not null
          then round(p_overtime_hours * profile_rate * 1, 2)
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
