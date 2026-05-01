-- Per user decision: recipe is just a calculator. Owner manually sets product
-- price; the cost link lives at the inventory layer (ingredient cost → recipe
-- calculated cost). Drop the broken pos_products.cost_recipe_id pointer.

alter table public.pos_products
  drop column if exists cost_recipe_id;
