-- Guest Orders — Extend pos_orders for Online Storefront
-- Track guest/online orders separately from POS orders

ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS is_guest boolean DEFAULT false;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS source text DEFAULT 'pos'; -- 'pos' or 'online'
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_method text; -- 'pickup', 'bank_transfer', 'cod'

-- Create indexes for filtering guest orders
CREATE INDEX IF NOT EXISTS idx_pos_orders_guest ON pos_orders(is_guest, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_orders_source ON pos_orders(source);
CREATE INDEX IF NOT EXISTS idx_pos_orders_payment ON pos_orders(payment_method);
