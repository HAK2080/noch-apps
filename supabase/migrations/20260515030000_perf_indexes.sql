-- Foreign-key indexes for order/sales/finance query speed.
-- All use IF NOT EXISTS — safe to re-run.
CREATE INDEX IF NOT EXISTS idx_pos_orders_shift_id            ON pos_orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_served_by           ON pos_orders(served_by);
CREATE INDEX IF NOT EXISTS idx_pos_orders_staff_confirmed_by  ON pos_orders(staff_confirmed_by);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_product_id     ON pos_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pos_product_modifier_groups_product_id
  ON pos_product_modifier_groups(product_id);
