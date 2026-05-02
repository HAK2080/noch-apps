-- The profiles_role_check constraint on remote DB doesn't include all 5 roles
-- the app actually uses. Replace it with the canonical set.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'supervisor', 'accountant', 'staff', 'limited_staff'));
