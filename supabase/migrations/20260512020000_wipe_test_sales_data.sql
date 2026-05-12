-- 20260512020000_wipe_test_sales_data.sql
--
-- Pre-launch data wipe — clears all test sales, shifts, and loyalty
-- activity so the system starts clean on go-live.
--
-- What is DELETED:
--   pos_order_items          — line items for every test order
--   pos_orders               — all test orders
--   pos_shifts               — all test shifts
--   pos_cash_movements       — all test cash-drawer movements
--   pos_inventory_movements  — all stock movements driven by test sales
--   pos_audit_log            — all audit rows
--   pin_attempts             — any residual lockout rows
--   loyalty_stamps           — stamps awarded during testing
--   loyalty_rewards          — free-drink rewards from testing
--
-- What is KEPT:
--   pos_branches, pos_categories, pos_products, pos_product_modifier_*
--   profiles, staff_branches, pos_settings
--   loyalty_customers, loyalty_tiers, loyalty_settings
--   All recipe, content, and marketing data
--
-- After the wipe:
--   * All product is_sold_out flags are reset to false (clean shelf).
--   * No open shift remains — staff must open a fresh shift before selling.

BEGIN;

-- Order lines first (FK child of pos_orders)
DELETE FROM pos_order_items;

-- Orders
DELETE FROM pos_orders;

-- Shifts
DELETE FROM pos_shifts;

-- Cash drawer movements
DELETE FROM pos_cash_movements;

-- Inventory movements (restocking will create fresh ones on go-live)
DELETE FROM pos_inventory_movements;

-- Audit log
DELETE FROM pos_audit_log;

-- Rate-limit table
DELETE FROM pin_attempts;

-- Loyalty activity earned from test transactions
DELETE FROM loyalty_stamps;
DELETE FROM loyalty_rewards;

-- Reset sold-out flags so every product shows as available on launch day
UPDATE pos_products SET is_sold_out = false WHERE is_sold_out = true;

COMMIT;
