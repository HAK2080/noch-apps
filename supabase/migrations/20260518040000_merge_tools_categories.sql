-- Merge duplicate Tools categories into one shared across both branches.
-- Surviving: 0476af8f (Noch Hay Alandlous, 87 products)
-- Removed:   07ee1717 (Noch Jaraba, 4 products)

-- Reassign the 4 Jaraba products to the unified category
UPDATE pos_products
SET category_id = '0476af8f-da46-469a-b0b8-23dff7dba9a3'
WHERE category_id = '07ee1717-2c37-499a-a0a8-b9a101aa3d20';

-- Make surviving Tools visible in both branches
UPDATE pos_categories
SET visible_branch_ids = ARRAY[
  '8936e821-ad7f-4d69-b654-c2f76404f89f'::uuid,
  '1332e9b6-8137-40fb-ad3e-074521c32ffb'::uuid
]
WHERE id = '0476af8f-da46-469a-b0b8-23dff7dba9a3';

-- Soft-delete the duplicate
UPDATE pos_categories
SET is_active = false
WHERE id = '07ee1717-2c37-499a-a0a8-b9a101aa3d20';
