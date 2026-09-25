# POS integrity audit — 25 September 2026

Scope: read-only production checks in Supabase and apps.noch.cloud, plus focused local tests. No sale, expense, shift closure, stock upload, recipe link, or historical payment was created by this audit.

## Verified working

- The 23 September City Walk business day (05:00 Tripoli cutoff) reconciles: 72 completed orders, 3,265 LYD before refunds, 74 LYD refunded, 3,191 LYD net; signed tenders are 1,575 LYD cash and 1,616 LYD card. The live Sales control page shows these amounts and separates the 2,587 LYD net shift from the 604 LYD daily/shift attribution difference.
- The 23 September P&L reports 3,191 LYD net revenue, 74 LYD refunds, 1,330.48 LYD COGS and 725 LYD operating expenses. The live Expenses dashboard lists the 725 LYD paid City Walk expense dated 23 September. This is a spot check, not a full journal reconciliation.
- The Products, Recipes, Expenses, POS branch and inventory-loss pages loaded for the signed-in owner. Fifty-six focused product/POS/coffee/expense/report tests passed. Separate shift-age tests, lint and build passed.
- Online pickup settlement now requires explicit payment through the September 12 payment-safety migration; no newer missing-sale tender exceptions were found in the prior 24-business-day sales review.

## Open accuracy gaps

1. **Matcha stock usage is not yet trustworthy.** Twenty active products whose English names contain “matcha” have zero `cost_recipe_id` links. Four distinct matcha ingredients exist (Blue Matcha, Loose Leaf Matcha, Matcha Beyond, En The Matcha). The live physical-count picker marks the matcha powders “recipe required,” so it cannot attribute powder consumption or unexplained loss. From 26 August onward, at least nine named matcha products sold; the top four were Matcha latte (221), Strawberry Matcha (137), Mango Matcha (97), and Matcha Blueberry (72) serves. Mapping must use the actual powder and grams per drink; neither should be guessed.
2. **Some profit is overstated.** Two products sold on 23 September have no recorded cost: Pistachio Cheesecake (six units sold, 125 LYD net line value after one refund) and Power Bank (one unit, 3 LYD). P&L and management reporting already warn that missing costs understate COGS. Enter verified purchase/recipe costs; do not invent historical amounts.
3. **Historical pickup tender gaps remain.** Online order `ONL-20260903-00000008` is completed for 12 LYD with no sale tender event or shift. `ONL-20260904-00000009` is completed for 87 LYD with a 28 LYD refund but no sale tender event or shift. Both store `payment_method = pickup`, not cash/card. Their actual collection method requires evidence before any historical tender correction.
4. **A shift was left open across the next business day.** City Walk shift `9eb3673b-939c-4d17-96d4-32bf387f71fa` opened 24 September at 10:06 Tripoli time and remained open more than 24 hours at audit time. The POS branch tile previously showed only “10:06”; commit `afa55c8` adds the date and an Arabic warning after 18 hours. Staff/manager must close and physically reconcile; this audit does not close it.
5. **Ghadamis status changed after the previous repair.** Product `618415b5-d657-461b-9633-7e8ee1a5adec` is currently active and visible on the staff POS, with zero global stock and customer/online visibility off. Its `updated_at` is 24 September 19:32 UTC. This conflicts with the earlier instruction to keep it inactive but may be an intentional later change; no status was changed here pending owner confirmation. Bean-stock consumption does not depend on the bean product being active.

## Next work

- Confirm which matcha powder and grams are used for each selling drink, then link verified cost recipes and test sale-to-stock-to-loss calculations. Do not backdate stock or manufacture consumption history.
- Enter verified costs for sold products, starting with the two found on 23 September, and check P&L warnings clear afterward.
- Reconcile the two pickup orders against receipts/cash-drawer evidence before creating any tender corrections.
- Verify the open shift is closed by staff and its counted cash matches the drawer; the software warning alone is not a closure.
- Continue expense-to-journal and branch-level reporting checks over a wider date range before claiming end-to-end completeness.
