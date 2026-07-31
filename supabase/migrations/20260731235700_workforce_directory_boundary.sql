-- workforce_team_v2 contains employment and access-request fields. Keep the
-- interface for owner workforce screens, but return no rows to accounts that
-- do not manage the workforce. Daily staff pickers use profile_directory_v2.

create or replace function public.workforce_team_v2()
returns table (
  id uuid,
  full_name text,
  role text,
  phone text,
  email text,
  telegram_chat_id text,
  branch_id uuid,
  department text,
  employment_type text,
  start_date date,
  employment_end_date date,
  is_active boolean,
  is_employee boolean,
  photo_url text,
  monthly_salary numeric,
  monthly_hours numeric,
  hourly_rate_lyd numeric,
  payroll_cost_center_id text,
  payroll_enabled boolean,
  days_off smallint[],
  overtime_exempt boolean,
  role_requested text,
  role_approved boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.full_name,
    profile.role,
    profile.phone,
    profile.email,
    profile.telegram_chat_id,
    profile.branch_id,
    profile.department,
    profile.employment_type,
    profile.start_date,
    profile.employment_end_date,
    profile.is_active,
    profile.is_employee,
    profile.photo_url,
    coalesce(profile.monthly_salary, profile.monthly_salary_lyd),
    profile.monthly_hours,
    coalesce(profile.hourly_rate_lyd, profile.hourly_rate),
    profile.payroll_cost_center_id,
    profile.payroll_enabled,
    profile.days_off,
    profile.overtime_exempt,
    profile.role_requested,
    profile.role_approved,
    profile.created_at,
    profile.updated_at
  from public.profiles profile
  where profile.is_employee
    and public.workforce_can_manage()
  order by profile.full_name;
$$;

revoke all on function public.workforce_team_v2() from public;
grant execute on function public.workforce_team_v2() to authenticated;

comment on function public.workforce_team_v2() is
  'Owner workforce administration directory. Non-managers receive no rows; daily staff pickers use profile_directory_v2.';
