-- Make products + categories global. Add per-branch visibility arrays.
-- Existing single-branch ownership is preserved as a backfill, so the live
-- storefront keeps showing each product on its current branch's menu.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. New visibility arrays
-- ──────────────────────────────────────────────────────────────────────────
alter table public.pos_products
  add column if not exists visible_branch_ids uuid[] not null default '{}';

alter table public.pos_categories
  add column if not exists visible_branch_ids uuid[] not null default '{}';

-- visible_on_website was added by 20260417000000 — make sure visible_on_menu also exists
alter table public.pos_products
  add column if not exists visible_on_menu boolean not null default false;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Backfill: any product/category currently scoped to a branch becomes
--    visible in that branch (only).
-- ──────────────────────────────────────────────────────────────────────────
update public.pos_products
   set visible_branch_ids = array[branch_id]
 where branch_id is not null
   and (visible_branch_ids is null or visible_branch_ids = '{}');

update public.pos_categories
   set visible_branch_ids = array[branch_id]
 where branch_id is not null
   and (visible_branch_ids is null or visible_branch_ids = '{}');

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Loosen the branch FK so a product/category can live without a branch
--    (still allowed: a product can keep a single primary branch_id, e.g. for
--    the POS register that sold it. But it's no longer required.)
-- ──────────────────────────────────────────────────────────────────────────
alter table public.pos_products  alter column branch_id drop not null;
alter table public.pos_categories alter column branch_id drop not null;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. GIN index for fast "which products visible at branch X" queries
-- ──────────────────────────────────────────────────────────────────────────
create index if not exists pos_products_visible_branch_ids_idx
  on public.pos_products using gin (visible_branch_ids);
create index if not exists pos_categories_visible_branch_ids_idx
  on public.pos_categories using gin (visible_branch_ids);
