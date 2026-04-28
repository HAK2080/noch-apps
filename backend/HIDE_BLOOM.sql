-- Hide Bloom Abu Nawas across the admin app
-- Most branch selectors in the app filter by `is_active = true` already
-- (Sales, Staff, InventoryHub, ProductCatalog via getPOSBranches, OverviewTab,
-- BranchTab, Menu storefront route). Setting is_active = false on Bloom
-- removes it from all of them in one shot. Idempotent — safe to re-run.

update pos_branches
   set is_active = false
 where id = '8459848d-fe99-4716-8222-c99b8746d881';

-- To bring Bloom back later:
-- update pos_branches set is_active = true where id = '8459848d-fe99-4716-8222-c99b8746d881';
