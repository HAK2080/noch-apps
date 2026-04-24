-- ============================================================
-- V3: Cost Calculator Enhancements + Inventory + Analytics
-- ============================================================

-- Cost Calculator: menu pricing columns
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS selling_price_lyd numeric;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_on_menu boolean DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS menu_category text;

-- Inventory: ingredient image + supplier info
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_name text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_contact text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_web_price_lyd numeric;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_web_price_url text;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_web_price_checked timestamptz;

-- Procurement orders (admin-only costs: shipping, customs, etc.)
CREATE TABLE IF NOT EXISTS procurement_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid REFERENCES ingredients(id) ON DELETE CASCADE,
  supplier_name text,
  quantity_ordered numeric,
  unit text,
  unit_cost_lyd numeric,
  shipping_cost_lyd numeric DEFAULT 0,
  customs_cost_lyd numeric DEFAULT 0,
  other_cost_lyd numeric DEFAULT 0,
  total_cost_lyd numeric,
  notes text,
  ordered_by uuid REFERENCES profiles(id),
  received_at timestamptz,
  status text DEFAULT 'ordered',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE procurement_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_procurement" ON procurement_orders FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_procurement_ingredient ON procurement_orders(ingredient_id);

-- Sales data uploads (Odoo CSV/PDF)
CREATE TABLE IF NOT EXISTS sales_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_url text,
  file_type text DEFAULT 'csv',
  source text DEFAULT 'odoo',
  period_start date,
  period_end date,
  raw_text text,
  extracted_json jsonb,
  status text DEFAULT 'pending',
  error_message text,
  uploaded_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Processed business metrics
CREATE TABLE IF NOT EXISTS business_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_type text DEFAULT 'daily',
  revenue_total numeric DEFAULT 0,
  cogs_total numeric DEFAULT 0,
  gross_profit numeric DEFAULT 0,
  gross_margin_pct numeric DEFAULT 0,
  transaction_count int DEFAULT 0,
  avg_order_value numeric DEFAULT 0,
  top_products jsonb,
  category_breakdown jsonb,
  hourly_breakdown jsonb,
  notes text,
  source_upload_id uuid REFERENCES sales_uploads(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(period_start, period_end, period_type)
);

ALTER TABLE sales_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_sales_uploads" ON sales_uploads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_business_metrics" ON business_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_business_metrics_period ON business_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_sales_uploads_status ON sales_uploads(status);
