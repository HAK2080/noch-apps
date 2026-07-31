-- Existing legacy RLS policies consistently treat profiles.id as auth.uid().
-- Current linked rows already follow that invariant. Preserve it explicitly
-- until every historical policy is migrated to the dual-link helper.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_auth_identity_alignment'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_auth_identity_alignment
      check (auth_user_id is null or auth_user_id = id)
      not valid;
  end if;
end;
$$;

alter table public.profiles
  validate constraint profiles_auth_identity_alignment;

comment on constraint profiles_auth_identity_alignment on public.profiles is
  'Prevents a linked Auth identity from diverging from profiles.id while legacy RLS policies remain id-based.';
