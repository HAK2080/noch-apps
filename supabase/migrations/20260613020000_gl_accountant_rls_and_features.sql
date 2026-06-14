-- GL access for the accountant role + the 'accounting' RBAC feature key.
--
-- Accountant: may READ the whole ledger and CREATE/POST journal entries
-- (batches + lines), but may NOT edit the chart of accounts, the account
-- map, or GL settings (owner-only). Mirrors the finance accountant_read
-- pattern, with extra insert/update policies on the journal tables.

-- ── Accountant read on all GL tables ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['gl_accounts','gl_journal_batches','gl_journal_lines','gl_settings','gl_account_map'] loop
    execute format('drop policy if exists "%I_accountant_read" on %I', t, t);
    execute format($f$create policy "%I_accountant_read" on %I
      for select to authenticated
      using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'accountant'))$f$, t, t);
  end loop;
end $$;

-- ── Accountant may create + post journals (batches + lines) ──────────────────
-- Insert/update on batches and lines; no delete (keeps an audit trail).
do $$
declare t text;
begin
  foreach t in array array['gl_journal_batches','gl_journal_lines'] loop
    execute format('drop policy if exists "%I_accountant_write" on %I', t, t);
    execute format($f$create policy "%I_accountant_write" on %I
      for insert to authenticated
      with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'accountant'))$f$, t, t);

    execute format('drop policy if exists "%I_accountant_update" on %I', t, t);
    execute format($f$create policy "%I_accountant_update" on %I
      for update to authenticated
      using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'accountant'))
      with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'accountant'))$f$, t, t);
  end loop;
end $$;

-- ── RBAC: 'accounting' feature key ──────────────────────────────────────────
-- Owner bypasses permissions entirely. Accountant: view + edit (can post).
-- Supervisor: view only. Everyone else: none. Idempotent.
insert into role_permissions (role, feature, can_access, can_edit) values
  ('supervisor',    'accounting', false, false),
  ('staff',         'accounting', false, false),
  ('limited_staff', 'accounting', false, false),
  ('data_entry',    'accounting', false, false)
on conflict (role, feature) do nothing;

-- Accountant gets view + edit (so they can create/post journals); forced.
insert into role_permissions (role, feature, can_access, can_edit) values
  ('accountant', 'accounting', true, true)
on conflict (role, feature) do update
  set can_access = excluded.can_access, can_edit = excluded.can_edit, updated_at = now();
