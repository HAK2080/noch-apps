-- Close anon-key data exposure on tables that lacked RLS or had RLS without policies.
-- Edge functions use service_role and bypass RLS automatically, so policies only
-- need to cover frontend (anon + authenticated) callers.
--
-- Idempotent + tolerant of missing tables (uses to_regclass guards) because the
-- live DB has migration drift — some tables defined in earlier migrations were
-- never applied to prod.

-- ────────────────────────────────────────────────────────────────────────────
-- LOYALTY: customer-facing data. Owner sees all; authenticated staff read for
-- POS / loyalty stamping. Anon has no read access. Writes happen via edge fns.
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'loyalty_settings','loyalty_customers','loyalty_stamps','loyalty_rewards',
    'loyalty_feedback','loyalty_challenges','loyalty_challenge_progress','loyalty_qr_tokens'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %: table does not exist', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "loyalty_owner_all"  on public.%I', t);
    execute format('drop policy if exists "loyalty_staff_read" on public.%I', t);
    execute format($f$create policy "loyalty_owner_all" on public.%I
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))$f$, t);
    execute format($f$create policy "loyalty_staff_read" on public.%I
      for select to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','supervisor','accountant','limited_staff')))$f$, t);
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- role_requests: owner full access; authenticated may insert + read.
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.role_requests') is null then
    raise notice 'skipping role_requests: table does not exist';
  else
    alter table public.role_requests enable row level security;
    drop policy if exists "rr_owner_all"   on public.role_requests;
    drop policy if exists "rr_self_insert" on public.role_requests;
    drop policy if exists "rr_self_read"   on public.role_requests;
    create policy "rr_owner_all" on public.role_requests
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
    create policy "rr_self_insert" on public.role_requests
      for insert to authenticated with check (auth.uid() is not null);
    create policy "rr_self_read" on public.role_requests
      for select to authenticated using (true);
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- sales_transactions: owner full; authenticated read.
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.sales_transactions') is null then
    raise notice 'skipping sales_transactions: table does not exist';
  else
    alter table public.sales_transactions enable row level security;
    drop policy if exists "sales_owner_all"  on public.sales_transactions;
    drop policy if exists "sales_staff_read" on public.sales_transactions;
    create policy "sales_owner_all" on public.sales_transactions
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
    create policy "sales_staff_read" on public.sales_transactions
      for select to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid()));
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- suppliers: authenticated read; owner writes.
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.suppliers') is null then
    raise notice 'skipping suppliers: table does not exist';
  else
    alter table public.suppliers enable row level security;
    drop policy if exists "sup_owner_write" on public.suppliers;
    drop policy if exists "sup_auth_read"   on public.suppliers;
    create policy "sup_owner_write" on public.suppliers
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
    create policy "sup_auth_read" on public.suppliers
      for select to authenticated using (true);
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- business_lines: authenticated read; owner writes.
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.business_lines') is null then
    raise notice 'skipping business_lines: table does not exist';
  else
    alter table public.business_lines enable row level security;
    drop policy if exists "bl_owner_write" on public.business_lines;
    drop policy if exists "bl_auth_read"   on public.business_lines;
    create policy "bl_owner_write" on public.business_lines
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
    create policy "bl_auth_read" on public.business_lines
      for select to authenticated using (true);
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- idea_attachments: any authenticated user can read/write.
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.idea_attachments') is null then
    raise notice 'skipping idea_attachments: table does not exist';
  else
    alter table public.idea_attachments enable row level security;
    drop policy if exists "ia_auth_all" on public.idea_attachments;
    create policy "ia_auth_all" on public.idea_attachments
      for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- app_roles, app_permissions: authenticated may read; only owners write.
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['app_roles','app_permissions'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %: table does not exist', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "ap_owner_write" on public.%I', t);
    execute format('drop policy if exists "ap_auth_read"   on public.%I', t);
    execute format($f$create policy "ap_owner_write" on public.%I
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))$f$, t);
    execute format($f$create policy "ap_auth_read" on public.%I
      for select to authenticated using (true)$f$, t);
  end loop;
end $$;
