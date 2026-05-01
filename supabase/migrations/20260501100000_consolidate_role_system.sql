-- Consolidate role system: profiles.role enum is the sole source of truth.
-- Retire app_roles table + profiles.app_role_id column.
-- role_permissions table stays (already keyed on `role text`).

-- Drop FK + column on profiles
alter table public.profiles
  drop column if exists app_role_id;

-- Drop the now-unused table
drop table if exists public.app_roles cascade;

-- Drop app_permissions table too (it was for the broken System A; we only need role_permissions)
drop table if exists public.app_permissions cascade;
