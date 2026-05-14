-- Update the public-read RLS policy on pos_products so the customer
-- ordering page (anon) can see products by EITHER visibility flag,
-- and so products that use visible_branch_ids (with branch_id=NULL)
-- are also reachable.
--
-- Before this migration, the policy hard-coded:
--   branch_id IN (active branches) AND is_active AND visible_on_website
-- which broke as soon as we split the channel into customer_menu vs
-- website and bulk-disabled visible_on_website for drinks.

DROP POLICY IF EXISTS pos_products_public_read ON pos_products;

CREATE POLICY pos_products_public_read ON pos_products
  FOR SELECT
  USING (
    is_active = true
    AND (visible_on_customer_menu = true OR visible_on_website = true)
    AND (
      branch_id IN (SELECT id FROM pos_branches WHERE is_active = true)
      OR EXISTS (
        SELECT 1 FROM pos_branches b
        WHERE b.is_active = true
          AND b.id = ANY(pos_products.visible_branch_ids)
      )
    )
  );
