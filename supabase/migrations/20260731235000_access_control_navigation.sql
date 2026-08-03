-- Module 7: authoritative account access and role permissions.
-- Existing profiles and legacy role rows are preserved. `data_entry` remains
-- historical only and is intentionally not included in supported assignments.

alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists access_enabled boolean not null default false,
  add column if not exists access_disabled_at timestamptz,
  add column if not exists access_disabled_reason text;

create index if not exists profiles_auth_user_id_idx
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

-- Workforce lifecycle is not login state. Owners remain enabled even though
-- they are not employees; former employees retain records but lose app entry.
update public.profiles
set access_enabled = case
  when role = 'owner' then true
  when coalesce(is_active, true)
    and exists (
      select 1 from auth.users account
      where account.id = profiles.id or account.id = profiles.auth_user_id
    ) then true
  else false
end,
access_disabled_at = case
  when role <> 'owner'
    and not coalesce(is_active, true)
    and (id in (select id from auth.users) or auth_user_id in (select id from auth.users))
  then coalesce(access_disabled_at, now())
  else access_disabled_at
end,
access_disabled_reason = case
  when role <> 'owner'
    and not coalesce(is_active, true)
    and (id in (select id from auth.users) or auth_user_id in (select id from auth.users))
  then coalesce(access_disabled_reason, 'Backfilled from former employee status')
  else access_disabled_reason
end;

create table if not exists public.access_control_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('account_access', 'role_change', 'role_request', 'role_request_denied', 'permission_change')),
  role text,
  feature text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists access_control_events_created_idx
  on public.access_control_events(created_at desc);

create or replace function public.access_control_profile_id_v2()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.id
  from public.profiles profile
  where profile.id = auth.uid() or profile.auth_user_id = auth.uid()
  order by (profile.id = auth.uid()) desc
  limit 1
$$;

create or replace function public.access_control_is_owner_v2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles profile
    where (profile.id = auth.uid() or profile.auth_user_id = auth.uid())
      and profile.role = 'owner'
      and profile.access_enabled
  )
$$;

revoke all on function public.access_control_profile_id_v2() from public;
revoke all on function public.access_control_is_owner_v2() from public;
grant execute on function public.access_control_profile_id_v2() to authenticated;
grant execute on function public.access_control_is_owner_v2() to authenticated;

alter table public.access_control_events enable row level security;
drop policy if exists access_control_events_owner_read on public.access_control_events;
create policy access_control_events_owner_read
  on public.access_control_events for select to authenticated
  using (public.access_control_is_owner_v2());

-- Complete the active feature matrix. Existing decisions win; missing rows are
-- explicit false rather than a silent absence.
with supported_roles(role) as (
  values ('supervisor'), ('accountant'), ('staff'), ('limited_staff')
), active_features(feature) as (
  values
    ('dashboard'), ('expenses'), ('expenses_approve'), ('inventory'),
    ('suppliers'), ('products'), ('recipes'), ('ops'), ('pos'), ('pos_eod'),
    ('pos_void'), ('pos_discounts'), ('sales'), ('reports'), ('finance'),
    ('accounting'), ('marketing'), ('ideas'), ('vestaboard')
)
insert into public.role_permissions(role, feature, can_access, can_edit)
select role, feature, false, false
from supported_roles cross join active_features
on conflict (role, feature) do nothing;

update public.role_permissions
set can_access = true
where can_edit and not can_access;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'role_permissions_edit_requires_access'
      and conrelid = 'public.role_permissions'::regclass
  ) then
    alter table public.role_permissions
      add constraint role_permissions_edit_requires_access
      check (not can_edit or can_access);
  end if;
end;
$$;

-- Permission reads expose only the caller's role. Owners can inspect the full
-- matrix. All writes go through the audited RPC below.
alter table public.role_permissions enable row level security;
drop policy if exists "role_permissions_read" on public.role_permissions;
drop policy if exists "role_permissions_owner_all" on public.role_permissions;
drop policy if exists role_permissions_read on public.role_permissions;
drop policy if exists role_permissions_owner_all on public.role_permissions;
create policy role_permissions_read_v2
  on public.role_permissions for select to authenticated
  using (
    public.access_control_is_owner_v2()
    or role = (
      select profile.role from public.profiles profile
      where profile.id = auth.uid() or profile.auth_user_id = auth.uid()
      order by (profile.id = auth.uid()) desc
      limit 1
    )
  );

revoke insert, update, delete on public.role_permissions from authenticated;
grant select on public.role_permissions to authenticated;

create or replace function public.update_role_permission_v2(
  p_role text,
  p_feature text,
  p_can_access boolean,
  p_can_edit boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row public.role_permissions%rowtype;
  new_row public.role_permissions%rowtype;
begin
  if not public.access_control_is_owner_v2() then
    raise exception 'Owner access required';
  end if;
  if p_role not in ('supervisor', 'accountant', 'staff', 'limited_staff') then
    raise exception 'Unsupported or archived role';
  end if;
  if p_feature not in (
    'dashboard', 'expenses', 'expenses_approve', 'inventory', 'suppliers',
    'products', 'recipes', 'ops', 'pos', 'pos_eod', 'pos_void',
    'pos_discounts', 'sales', 'reports', 'finance', 'accounting',
    'marketing', 'ideas', 'vestaboard'
  ) then
    raise exception 'Unsupported feature';
  end if;
  if p_can_edit and not p_can_access then
    raise exception 'Edit authority requires module access';
  end if;

  select * into old_row
  from public.role_permissions
  where role = p_role and feature = p_feature;

  insert into public.role_permissions(role, feature, can_access, can_edit, updated_at)
  values (p_role, p_feature, p_can_access, p_can_edit, now())
  on conflict (role, feature) do update
    set can_access = excluded.can_access,
        can_edit = excluded.can_edit,
        updated_at = excluded.updated_at
  returning * into new_row;

  insert into public.access_control_events(
    actor_profile_id, event_type, role, feature, old_value, new_value
  ) values (
    public.access_control_profile_id_v2(), 'permission_change', p_role, p_feature,
    jsonb_build_object('can_access', old_row.can_access, 'can_edit', old_row.can_edit),
    jsonb_build_object('can_access', new_row.can_access, 'can_edit', new_row.can_edit)
  );
end;
$$;

revoke all on function public.update_role_permission_v2(text, text, boolean, boolean) from public;
grant execute on function public.update_role_permission_v2(text, text, boolean, boolean) to authenticated;

create or replace function public.set_profile_access_v2(
  p_profile_id uuid,
  p_enabled boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  if not public.access_control_is_owner_v2() then
    raise exception 'Owner access required';
  end if;
  select * into target from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if target.role = 'owner' and not p_enabled then
    raise exception 'Owner access cannot be disabled';
  end if;
  if p_enabled and not exists (
    select 1 from auth.users account
    where account.id = target.id or account.id = target.auth_user_id
  ) then
    raise exception 'Profile has no linked login';
  end if;

  update public.profiles
  set access_enabled = p_enabled,
      access_disabled_at = case when p_enabled then null else now() end,
      access_disabled_reason = case when p_enabled then null else coalesce(nullif(trim(p_reason), ''), 'Disabled by owner') end,
      updated_at = now()
  where id = p_profile_id;

  insert into public.access_control_events(
    actor_profile_id, target_profile_id, event_type, old_value, new_value, reason
  ) values (
    public.access_control_profile_id_v2(), p_profile_id, 'account_access',
    jsonb_build_object('access_enabled', target.access_enabled),
    jsonb_build_object('access_enabled', p_enabled), p_reason
  );
end;
$$;

revoke all on function public.set_profile_access_v2(uuid, boolean, text) from public;
grant execute on function public.set_profile_access_v2(uuid, boolean, text) to authenticated;

create or replace function public.set_profile_role_v2(
  p_profile_id uuid,
  p_role text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  if not public.access_control_is_owner_v2() then
    raise exception 'Owner access required';
  end if;
  if p_role not in ('supervisor', 'accountant', 'staff', 'limited_staff') then
    raise exception 'Unsupported or archived role';
  end if;
  select * into target from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if target.role = 'owner' then raise exception 'Owner role cannot be changed here'; end if;

  update public.profiles
  set role = p_role, role_requested = null, role_approved = true, updated_at = now()
  where id = p_profile_id;

  insert into public.access_control_events(
    actor_profile_id, target_profile_id, event_type, old_value, new_value, reason
  ) values (
    public.access_control_profile_id_v2(), p_profile_id, 'role_change',
    jsonb_build_object('role', target.role), jsonb_build_object('role', p_role), p_reason
  );
end;
$$;

revoke all on function public.set_profile_role_v2(uuid, text, text) from public;
grant execute on function public.set_profile_role_v2(uuid, text, text) to authenticated;

create or replace function public.request_my_role_change_v2(p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_id uuid := public.access_control_profile_id_v2();
begin
  if profile_id is null then raise exception 'Profile not found'; end if;
  if p_role not in ('supervisor', 'accountant', 'staff', 'limited_staff') then
    raise exception 'Unsupported or archived role';
  end if;
  update public.profiles
  set role_requested = p_role, role_approved = false, updated_at = now()
  where id = profile_id and role <> 'owner';
  if not found then raise exception 'Owner role cannot request a role change'; end if;

  insert into public.access_control_events(actor_profile_id, target_profile_id, event_type, new_value)
  values (profile_id, profile_id, 'role_request', jsonb_build_object('role', p_role));
end;
$$;

revoke all on function public.request_my_role_change_v2(text) from public;
grant execute on function public.request_my_role_change_v2(text) to authenticated;

create or replace function public.deny_profile_role_request_v2(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
begin
  if not public.access_control_is_owner_v2() then raise exception 'Owner access required'; end if;
  select role_requested into requested
  from public.profiles
  where id = p_profile_id
  for update;
  if not found then raise exception 'Profile not found'; end if;
  update public.profiles
  set role_requested = null, role_approved = false, updated_at = now()
  where id = p_profile_id;
  insert into public.access_control_events(actor_profile_id, target_profile_id, event_type, old_value)
  values (public.access_control_profile_id_v2(), p_profile_id, 'role_request_denied', jsonb_build_object('role', requested));
end;
$$;

revoke all on function public.deny_profile_role_request_v2(uuid) from public;
grant execute on function public.deny_profile_role_request_v2(uuid) to authenticated;

create or replace function public.access_control_accounts_v2()
returns table (
  profile_id uuid,
  full_name text,
  role text,
  access_enabled boolean,
  auth_linked boolean,
  is_employee boolean,
  workforce_active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.access_control_is_owner_v2() then raise exception 'Owner access required'; end if;
  return query
  select
    profile.id,
    profile.full_name,
    profile.role,
    profile.access_enabled,
    exists (
      select 1 from auth.users account
      where account.id = profile.id or account.id = profile.auth_user_id
    ),
    coalesce(profile.is_employee, false),
    coalesce(profile.is_active, true)
  from public.profiles profile
  order by profile.role = 'owner' desc, profile.full_name;
end;
$$;

revoke all on function public.access_control_accounts_v2() from public;
grant execute on function public.access_control_accounts_v2() to authenticated;

-- Self-service profile updates are limited to identity/contact presentation.
-- Owners and service-role operations retain their existing administrative paths.
create or replace function public.protect_profile_access_fields_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.access_control_is_owner_v2() then return new; end if;

  if tg_op = 'INSERT' then
    if new.id <> auth.uid() and new.auth_user_id is distinct from auth.uid() then
      raise exception 'A profile can only be created for the signed-in account';
    end if;
    new.role := 'staff';
    new.role_requested := null;
    new.role_approved := false;
    new.access_enabled := false;
    new.is_employee := false;
    new.payroll_enabled := false;
    return new;
  end if;

  if old.id <> auth.uid() and old.auth_user_id is distinct from auth.uid() then
    raise exception 'Profile update not permitted';
  end if;

  if new.id is distinct from old.id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.role is distinct from old.role
    or new.role_requested is distinct from old.role_requested
    or new.role_approved is distinct from old.role_approved
    or new.access_enabled is distinct from old.access_enabled
    or new.access_disabled_at is distinct from old.access_disabled_at
    or new.access_disabled_reason is distinct from old.access_disabled_reason
    or new.is_employee is distinct from old.is_employee
    or new.is_active is distinct from old.is_active
    or new.payroll_enabled is distinct from old.payroll_enabled
    or new.employment_type is distinct from old.employment_type
    or new.start_date is distinct from old.start_date
    or new.employment_end_date is distinct from old.employment_end_date
    or new.department is distinct from old.department
    or new.branch_id is distinct from old.branch_id
    or new.monthly_salary is distinct from old.monthly_salary
    or new.hourly_rate is distinct from old.hourly_rate
    or new.hourly_rate_lyd is distinct from old.hourly_rate_lyd
    or new.monthly_hours is distinct from old.monthly_hours
  then
    raise exception 'Sensitive profile fields require owner access';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_access_fields_v2 on public.profiles;
create trigger profiles_protect_access_fields_v2
  before insert or update on public.profiles
  for each row execute function public.protect_profile_access_fields_v2();

-- Existing broad self-update policies may remain for compatibility; the trigger
-- is the final column-level authority and prevents role/access escalation.
comment on column public.profiles.access_enabled is
  'Login/workspace access state. Independent from workforce is_active.';
comment on table public.access_control_events is
  'Append-only audit evidence for account, role, and permission changes.';
