-- ============================================================
-- WhatsApp opt-in: default true for new + existing customers.
-- Loyalty customers register in person at the counter, so the
-- expected default at this venue is "yes, send me offers".
-- Customers can still flip it off from their Nochi Pass.
-- Re-runnable.
-- ============================================================

-- Safe to re-run: only changes the column default. Existing rows are
-- untouched, so customer opt-outs are never silently overwritten.
alter table loyalty_customers
  alter column whatsapp_opt_in set default true;

notify pgrst, 'reload schema';

-- One-time backfill — DO NOT include this in the re-runnable migration
-- file. Paste it manually in the Supabase SQL editor *once* if you
-- want existing customers flipped from the old `false` default to
-- `true`. Re-running this would clobber later opt-outs.
--
--   update loyalty_customers
--   set whatsapp_opt_in = true
--   where whatsapp_opt_in = false;
