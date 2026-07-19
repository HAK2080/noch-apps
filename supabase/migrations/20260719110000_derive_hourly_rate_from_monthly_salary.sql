-- Keep the shift/overtime hourly rate in sync for monthly-paid employees.
-- 208 hours is the default (26 working days × 8 hours) and can be tailored
-- per employee when their agreed schedule differs.

alter table public.profiles
  add column if not exists monthly_hours numeric(7,2) not null default 208
    check (monthly_hours > 0 and monthly_hours <= 744);

create or replace function public.set_derived_profile_hourly_rate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.monthly_salary, 0) > 0 then
    new.monthly_hours := coalesce(nullif(new.monthly_hours, 0), 208);
    new.hourly_rate_lyd := round(new.monthly_salary / new.monthly_hours, 2);
    new.hourly_rate := new.hourly_rate_lyd;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_derive_hourly_rate on public.profiles;
create trigger profiles_derive_hourly_rate
  before insert or update of monthly_salary, monthly_hours, hourly_rate, hourly_rate_lyd
  on public.profiles
  for each row
  execute function public.set_derived_profile_hourly_rate();

-- Backfill existing salaried employees so the Finance → Shifts screen and
-- overtime calculations use the same derived hourly rate immediately.
update public.profiles
set monthly_hours = coalesce(nullif(monthly_hours, 0), 208),
    hourly_rate_lyd = round(monthly_salary / coalesce(nullif(monthly_hours, 0), 208), 2),
    hourly_rate = round(monthly_salary / coalesce(nullif(monthly_hours, 0), 208), 2)
where coalesce(monthly_salary, 0) > 0;
