-- Add separate customer-menu visibility column.
-- Previously visible_on_menu served double duty (POS staff grid + customer ordering page).
-- Now the three channels are fully independent:
--   visible_on_menu          = POS staff terminal grid
--   visible_on_customer_menu = Customer ordering page (/menu/:branchId)
--   visible_on_website       = Online store (retail: tools, bags, etc.)

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS visible_on_customer_menu boolean NOT NULL DEFAULT true;

-- Backfill: any product currently shown on the POS menu should also appear
-- on the customer menu by default. Staff can opt individual items out.
UPDATE pos_products
SET visible_on_customer_menu = true
WHERE is_active = true;
