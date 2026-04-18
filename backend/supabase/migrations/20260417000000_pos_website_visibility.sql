-- Add visible_on_website flag to POS products
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS visible_on_website boolean DEFAULT true;

-- Update public RLS to respect the new flag
DROP POLICY IF EXISTS "pos_products_public_read" ON pos_products;
CREATE POLICY "pos_products_public_read" ON pos_products
  FOR SELECT TO anon
  USING (
    branch_id IN (SELECT id FROM pos_branches WHERE is_active = true)
    AND is_active = true
    AND visible_on_website = true
  );
