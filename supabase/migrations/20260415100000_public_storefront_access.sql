-- Public Storefront Access — RLS Policies for Anonymous Users
-- Allows customers to browse menu without authentication

-- Allow anonymous users to view active branches
CREATE POLICY "pos_branches_public_read" ON pos_branches
  FOR SELECT TO anon
  USING (is_active = true);

-- Allow anonymous users to view categories for active branches
CREATE POLICY "pos_categories_public_read" ON pos_categories
  FOR SELECT TO anon
  USING (
    branch_id IN (SELECT id FROM pos_branches WHERE is_active = true)
    AND is_active = true
  );

-- Allow anonymous users to view active products
CREATE POLICY "pos_products_public_read" ON pos_products
  FOR SELECT TO anon
  USING (
    branch_id IN (SELECT id FROM pos_branches WHERE is_active = true)
    AND is_active = true
  );
