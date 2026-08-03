-- Module 8: close the broad profile-read boundary before whole-system acceptance.
-- Profile rows remain intact. Signed-in users can read their own full profile;
-- owners retain administrative access; daily staff pickers use a safe directory.

create or replace function public.my_profile_v2()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select profile.*
  from public.profiles profile
  where profile.id = auth.uid() or profile.auth_user_id = auth.uid()
  order by (profile.id = auth.uid()) desc
  limit 1
$$;

revoke all on function public.my_profile_v2() from public;
grant execute on function public.my_profile_v2() to authenticated;

create or replace function public.profile_directory_v2(
  p_active_only boolean default true,
  p_pin_only boolean default false,
  p_branch_id uuid default null
)
returns table (
  id uuid,
  full_name text,
  role text,
  photo_url text,
  department text,
  branch_id uuid,
  is_active boolean,
  pin_configured boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.access_control_profile_id_v2() is null then
    raise exception 'Authenticated profile required';
  end if;
  if not exists (
    select 1 from public.profiles caller
    where (caller.id = auth.uid() or caller.auth_user_id = auth.uid())
      and (caller.role = 'owner' or caller.access_enabled)
  ) then
    raise exception 'Account access is not enabled';
  end if;

  return query
  select
    profile.id,
    profile.full_name,
    profile.role,
    profile.photo_url,
    profile.department,
    profile.branch_id,
    coalesce(profile.is_active, true),
    profile.pin_code is not null
  from public.profiles profile
  where (
      not p_active_only
      or (coalesce(profile.is_employee, false) and coalesce(profile.is_active, true))
    )
    and (not p_pin_only or profile.pin_code is not null)
    and (p_branch_id is null or profile.branch_id = p_branch_id or profile.branch_id is null)
  order by profile.full_name;
end;
$$;

revoke all on function public.profile_directory_v2(boolean, boolean, uuid) from public;
grant execute on function public.profile_directory_v2(boolean, boolean, uuid) to authenticated;

drop policy if exists profiles_select on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
create policy profiles_select_v2
  on public.profiles for select to authenticated
  using (
    public.access_control_is_owner_v2()
    or id = auth.uid()
    or auth_user_id = auth.uid()
  );

comment on function public.profile_directory_v2(boolean, boolean, uuid) is
  'Safe staff directory. Never exposes phone, Telegram, PIN, payroll, or access-control fields.';
