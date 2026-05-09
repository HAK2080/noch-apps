-- ============================================================
-- POS PRODUCTS — is_sold_out flag
-- The terminal long-press toggles this for "out for the day" items.
-- Frontend has been referencing the column since the original
-- POS rollout but the schema column was never added; PostgREST
-- responded with "Could not find the 'is_sold_out' column ... in
-- the schema cache" on every long-press.
--
-- Re-runnable.
-- ============================================================

alter table pos_products
  add column if not exists is_sold_out boolean not null default false;

-- Optional partial index — helps the few read paths that filter to
-- in-stock items (storefront menu, POS grid). Cheap to add.
create index if not exists pos_products_in_stock_idx
  on pos_products(branch_id, is_active)
  where is_sold_out = false;

-- Nudge PostgREST to refresh its schema cache so the new column is
-- visible without waiting for the periodic refresh.
notify pgrst, 'reload schema';
