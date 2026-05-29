-- Allow products to appear in multiple categories on the customer menu.
-- secondary_category_ids: additional categories beyond the primary category_id.
-- The customer menu query ORs primary + secondary to build each section.

alter table pos_products
  add column if not exists secondary_category_ids uuid[] default '{}';

create index if not exists pos_products_secondary_cats_idx
  on pos_products using gin (secondary_category_ids);
