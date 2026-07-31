# Inventory, Purchasing, Stock Movement, and Waste

## Outcome

Module 3 establishes a single operational source for each inventory state and
removes unsupported calculations from the normal journey. Historical records
are preserved. The prior multi-purpose Stock Manager remains archived at
`apps/pos/src/pages/inventory/archive/StockManagerLegacy.jsx`.

## Users and business purpose

| User | Essential work |
|---|---|
| Owner | See urgent stock and evidence exceptions in under one minute; approve purchasing; audit counts, transfers, waste, and valuation inputs |
| Supervisor | Record physical counts, receive warehouse stock, ship and receive transfers, investigate discrepancies |
| Branch staff | View branch stock, request stock, receive a shipped transfer, record waste |
| Accountant | Trace procurement receipts/returns and inventory evidence supporting costs and payables |

## Authoritative states

| State | Authority | Rule |
|---|---|---|
| Business-wide ingredient balance | `stock` + `stock_logs` | Physical baseline; never inferred from missing recipes |
| Ingredient location count | `inventory_location_stock` + `inventory_location_stock_movements` | Authorized physical observation by location |
| Product stock by branch/warehouse | `location_product_stock` + `location_product_movements` | Operational product quantity |
| Legacy product total | `pos_products.stock_qty` | Compatibility total of tracked branch balances; not branch evidence |
| Procurement | `procurement_orders` plus receipt/return evidence and GL entries | Order lifecycle remains auditable |
| Transfer | `inventory_transfers` | Requested, shipped, received/partial, or cancelled |
| In transit | `inventory_in_transit` | Computed shipped less received; never stored independently |
| Waste | Negative location movement with branch, product, reason, actor, and time | Negative balances remain visible when evidence is missing |
| Theoretical ingredient usage | Explicit `cost_recipe` / `recipe_ingredients` links only | Unavailable when recipe evidence is absent |
| Checklist | Stock-check observation tables | Directs work; never substitutes for a quantity count |

## Classification

### Essential

- Physical ingredient counts and count freshness
- Branch and warehouse product balances
- Procurement receiving and returns
- Request, ship, receive, partial-receipt discrepancy, and in-transit states
- Waste reason and movement evidence
- Minimum/target levels and urgent exceptions
- Location-to-business ingredient reconciliation

### Consolidate

- `/inventory` is the shared owner/staff control hub.
- `/inventory/intelligence` is the detailed owner evidence report.
- Product movement history combines legacy and location evidence without
  duplicating mirrored sale/refund/void rows.
- POS receive and manual adjustment use the branch currently open, not the
  product's legacy branch field.

### Archive or hide

- The legacy Stock Manager, including browser-side AI classification, document
  extraction, supplier editing, speculative usage presentation, and mixed
  catalog/count responsibilities, is archived for rollback.
- The legacy global product balance and movement table remain available as
  compatibility/history but are labeled non-authoritative for branch stock.

### Remove

- No data or feature was permanently removed.
- The unsafe calculation that applied `default_qty_per_serve` to every sold
  product when a recipe was missing is replaced. It is not retained in any
  active report.

## Initial evidence and defects

- 80 ingredient stock rows; all 80 physical counts were more than seven days
  old at audit time.
- 217 active products; zero opted into generic product inventory tracking.
- 28 product/location balances, five non-zero, and 1,081 location movements.
- Zero procurement orders and zero transfers, so the authority repair does not
  rewrite an active purchasing or transfer lifecycle.
- The production schema lacked `inventory_location_stock` although active code
  and procurement routines referenced it.
- There were zero cost recipes and zero recipe-ingredient links. The previous
  fallback produced 3,409,320 units of false ingredient consumption, including
  applying the same sales volume to unrelated equipment and cleaning items.
- The legacy product movement ledger was dominated by refund/void compatibility
  movements and did not provide branch-specific stock truth.

## Implemented controls

- Created the missing ingredient-location table idempotently with split
  read/write RLS and an immutable movement audit.
- Added an atomic authorized location-count RPC.
- Added evidence-aware inventory status and summary RPCs.
- Replaced the unsafe recipe fallback; theoretical values are null/unavailable
  without explicit recipe evidence.
- Routed POS branch receipts and manual adjustments to location stock.
- Mirrored future tracked-product sale/refund/void movements into the branch
  location ledger and de-duplicated the combined movement screen.
- Made warehouse receipts and both transfer legs auditable location movements.
- Made branch waste reduce the branch location balance with reason and actor.
- Preserved negative location balances as visible missing-evidence exceptions.
- Added a rollout snapshot table; no historical balance or movement was
  rewritten.
- Replaced the duplicate landing page and mixed Stock Manager with focused,
  bilingual, mobile-responsive control and physical-count workflows.

## Definition-of-done evidence

- SQL migration compiled against the production schema inside `BEGIN` /
  `ROLLBACK`.
- All 102 Node tests passed, including calculation, migration contract,
  permissions/wiring, POS receiving, reporting, finance, loyalty, and existing
  inventory tests.
- Targeted ESLint passed with zero warnings or errors.
- POS production build passed.
- Production migrations `20260731203000` and `20260731213000` were applied and
  recorded after rollback validation. Owner count authority was transaction
  tested against the live database and rolled back without leaving count rows.
- GitHub Actions run `30616535996` deployed commit `1a87813`; its server-side
  verification confirmed `index-CtlR5RmQ.js` live at `apps.noch.cloud`.
- A fresh no-cache production request returned HTTP 200 and the same deployed
  application bundle.

## Remaining business backlog

These are visible data/configuration gaps, not hidden software success:

1. Complete physical counts for all stale ingredients and every active location.
2. Build explicit cost recipes for sold products before using theoretical
   ingredient consumption for purchasing.
3. Configure generic tracked products deliberately; do not enable every menu
   item as stock.
4. Reconcile the business-wide ingredient balance to location counts and explain
   every material variance.
5. Add supplier and procurement records as real orders occur; the live system
   currently has no procurement history to reconcile.
