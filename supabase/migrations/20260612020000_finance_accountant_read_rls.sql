-- Accountant read-only access to the finance tables the client queries
-- directly (finance-supabase.js). RPC-driven data (finance_pnl, menu matrix,
-- cash runway, variance, forecast) needs nothing: those functions are
-- SECURITY DEFINER with GRANT EXECUTE TO authenticated.
--
-- ADDITIVE ONLY: the existing *_owner_only FOR ALL policies are left intact
-- (policies OR together). SELECT-only — accountant writes stay blocked at the
-- DB level regardless of UI state.
--
-- Deliberately NOT widened: bank_transactions, finance_capex, finance_scenarios
-- (those tabs remain owner/edit-level in the UI).

do $$
begin
  -- finance_settings: thresholds + payroll flags read by DailyPnL/CashRunway/Shifts tabs
  drop policy if exists "finance_settings_accountant_read" on finance_settings;
  create policy "finance_settings_accountant_read" on finance_settings
    for select to authenticated
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'accountant'));

  -- expense_entries: finance-module Expenses tab (read-only list)
  drop policy if exists "expense_entries_accountant_read" on expense_entries;
  create policy "expense_entries_accountant_read" on expense_entries
    for select to authenticated
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'accountant'));

  -- finance_budgets: Variance tab budget column (read-only)
  drop policy if exists "finance_budgets_accountant_read" on finance_budgets;
  create policy "finance_budgets_accountant_read" on finance_budgets
    for select to authenticated
    using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'accountant'));
end $$;
