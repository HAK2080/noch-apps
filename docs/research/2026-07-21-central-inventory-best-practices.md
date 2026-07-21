# Central Inventory for Multiple Café Branches

**Date:** 2026-07-21  
**Scope:** A central warehouse supplying multiple café branches, with low-friction branch requests and reliable stock, cost, expiry, and audit records.

## Recommendation

Create one shared **item catalogue**, but do not create one undifferentiated stock quantity. Treat the **Central Warehouse**, every branch, and **In Transit** as separate inventory locations. Stock must always be attributable to an item, location, and—where relevant—a lot/expiry date.

Branches should not directly “withdraw” or decrement stock from the central warehouse. A branch should create a **stock request / transfer order**; the warehouse confirms what it actually dispatches, and the branch confirms what it actually receives. Microsoft’s official inventory guidance distinguishes an immediate transfer journal, which has no in-transit tracking, from a transfer order used when in-transit stock must be tracked. Its retail POS guidance likewise makes the current store the transfer destination and lets the store submit an inbound transfer request for the supplying warehouse to fulfil ([Microsoft: inventory journals](https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-journals), [Microsoft: POS inbound inventory](https://learn.microsoft.com/en-us/dynamics365/commerce/pos-inbound-inventory-operation)).

This gives Noch a clear answer to “where is the stock?” and prevents stock from appearing at a branch before it physically arrives.

## Recommended operating flow

1. **Branch requests:** A branch selects products and quantities from its own POS/stock screen. Creating or approving a request does not change on-hand stock.
2. **Warehouse picks and ships:** Warehouse staff confirm actual quantities, lots, and expiry dates dispatched. Source stock decreases only at ship confirmation; the same quantity enters the In Transit location.
3. **Branch receives:** Branch staff confirm actual quantities received. In-transit stock decreases and branch stock increases. Partial receipts remain open; missing, damaged, or substituted quantities are recorded rather than silently corrected.
4. **Branch consumes/sells:** Sales or recorded consumption reduce only that branch’s stock. Waste and other non-sale losses use separate reason-coded movements.
5. **Close:** The transfer closes only when all shipped quantities are received or an authorised user resolves the discrepancy.

Recommended statuses are **Draft → Requested → Approved → Picking → Shipped/In Transit → Partially Received → Received/Closed**, plus **Cancelled**. Microsoft’s POS transfer documentation similarly distinguishes requested, partially/fully shipped, and partially/fully received states ([Microsoft: POS inbound inventory](https://learn.microsoft.com/en-us/dynamics365/commerce/pos-inbound-inventory-operation)).

For an urgent transfer, the system can provide a one-screen **Quick Transfer**, but it should still create the same shipment and receipt records. A suitably authorised manager may perform both confirmations; the system should not bypass the ledger.

## Control by topic

### Stock by location

- Maintain on-hand, reserved, available, and in-transit quantities per item and location.
- The organisation-wide quantity is the sum of warehouse, branch, and in-transit stock; do not count the same transfer at source and destination.
- Purchase deliveries are received into the location that physically accepts them. A direct supplier delivery to a branch should not pass through central stock on paper.
- Use an append-only movement ledger for receipts, shipments, transfers, sales/consumption, waste, counts, and corrections. Do not let users overwrite a balance without a recorded movement.

### Units of measure

- Give every item one base inventory unit. For muffins, doughnuts, and tiramisu portions, use **each/unit** so “24 muffins” means 24 inventory units.
- Ingredients should use a consistent measurable base unit, such as gram, millilitre, or each.
- If purchasing later uses trays, cases, or kilograms, define an explicit item-specific conversion to the base unit; never store free-text conversions. Microsoft’s warehouse guidance requires conversions when multiple units are used and identifies the inventory unit as the basis for on-hand calculations ([Microsoft: unit-of-measure and stocking policies](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/unit-measure-stocking-policies)).

### Lots, expiry, and food rotation

- Require a lot/batch and expiry or use-by date for products where spoilage, recall, or food safety risk justifies it. At minimum, use this for short-life prepared food and supplier batches that may need tracing.
- Preserve the lot through warehouse receipt, branch transfer, branch receipt, waste, and sale/consumption records.
- Pick by **FEFO—first expired, first out**—rather than merely by arrival date. Official Microsoft guidance defines FEFO as selecting the earliest expiration first and can exclude expired stock from picking ([Microsoft: FEFO picking](https://learn.microsoft.com/en-au/dynamics365/business-central/warehouse-picking-by-fefo)).
- GS1’s traceability standard recommends shipment and receipt records containing the product/lot identifier, source and destination parties/locations, and dispatch/receipt dates; lot-level identity is what permits a specific affected batch to be located ([GS1 Global Traceability Standard](https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard)).

### Cycle counts

- Count continuously rather than waiting for an annual full count. Set cadence by value, sales velocity, perishability, and historical variance: frequent for high-risk/high-volume items, less frequent for stable low-value items.
- Use blind counts where practical; the counter enters the physical quantity before seeing the expected quantity.
- Put material differences into **Pending Review** for a manager, with recount and reason required before posting.
- Microsoft documents cycle counting as an audit of on-hand inventory, with threshold-triggered and periodic plans for selected products and locations ([Microsoft: define cycle counting](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/tasks/define-cycle-counting-microsoft-dynamics-365-finance-operations-enterprise-edition-july-2017)).

### Reorder levels

- Store minimum and target/maximum quantities per **item × location**, because branch demand and warehouse lead times differ.
- Start with simple min/max replenishment: when projected available stock falls below the minimum, suggest a transfer that restores it to the target. Microsoft describes this method as replenishing to a maximum when predicted on-hand falls below a threshold ([Microsoft: replenishment methods](https://learn.microsoft.com/en-us/dynamics365/supply-chain/master-planning/planning-optimization/replenishment-methods-quantity-modification)).
- Keep suggestions reviewable at first. Automate approval only after movement, expiry, and count data are consistently reliable.

### Valuation and costing

- Transfers between locations of the same company move inventory value; they are not purchases, sales, revenue, or expense.
- Preserve the item’s carrying cost through transit and into the receiving branch so branch COGS is based on the cost transferred to it.
- Use one consistent accounting cost formula by item class. IAS 2 permits FIFO or weighted average for ordinarily interchangeable items, measures inventory at the lower of cost and net realisable value, and requires inventory losses to be expensed when they occur ([IFRS IAS 2](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)). Weighted average is a practical starting point for interchangeable café stock; FEFO remains the physical picking rule and is separate from the accounting cost formula.

### Waste, shrinkage, and discrepancies

- Never classify waste as a sale or quietly edit stock. Post a negative movement with a required reason such as **expired/spoilage, preparation waste, damaged, staff meal/sample, transfer shortage, theft/loss, or count variance**.
- Record quantity, cost, branch/location, lot where applicable, actor, timestamp, and reference. Use distinct financial accounts or reporting categories for material reason groups.
- Microsoft’s reason-code guidance supports mandatory reasons by warehouse or item, retains counting history, and can post adjustment value to a reason-specific offset account ([Microsoft: inventory counting reason codes](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/reason-codes-for-counting-journals)). IAS 2 requires inventory losses to be recognised as expense in the period of loss ([IFRS IAS 2](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)).

### Permissions and audit trail

- **Branch staff:** view their branch stock, create requests, receive shipments, and record ordinary waste/consumption within limits.
- **Warehouse staff:** approve/pick/ship from central stock; they should not confirm branch receipt.
- **Branch manager:** resolve receiving differences and approve larger branch adjustments.
- **Inventory/owner role:** manage items, units, locations, reorder rules, lot policy, counts, and high-value adjustments.
- Require approval for large or backdated adjustments. Microsoft’s inventory journal workflows are designed so only approved physical inventory journals can be posted ([Microsoft: inventory journal approval workflows](https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-journal-workflow)).
- Every movement and status change should retain actor, timestamp, source and destination, quantity/UOM, item/lot, device/channel, reason, linked transfer or count, and reversal reference. Corrections should reverse and repost; posted history should not be deleted.

## Minimum first release for Noch

1. Central Warehouse, In Transit, and each active branch as locations.
2. One shared item catalogue with a base inventory unit; finished café products start with **unit/each**.
3. Branch request, warehouse ship confirmation, and branch receive confirmation, including partial quantities.
4. Append-only stock movements and a location balance derived from them.
5. Branch sales/consumption and reason-coded waste reducing only branch stock.
6. Role permissions, adjustment thresholds, and a complete audit trail.
7. Cycle-count tasks and branch-specific min/target levels.
8. Lot/expiry and FEFO for perishable or traceability-sensitive products.

Do not begin with automatic transfers or complex forecasting. First make every physical hand-off produce a simple, confirmed movement. Once stock accuracy is trusted, the same data can safely drive transfer suggestions, purchasing, recipe consumption, food-cost reporting, and expiry alerts.

## Sources

- [IFRS Foundation — IAS 2 Inventories](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)
- [GS1 — Global Traceability Standard](https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard)
- [Microsoft — Inventory journals](https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-journals)
- [Microsoft — Inbound inventory operation in POS](https://learn.microsoft.com/en-us/dynamics365/commerce/pos-inbound-inventory-operation)
- [Microsoft — Unit of measure and stocking policies](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/unit-measure-stocking-policies)
- [Microsoft — Enable picking by FEFO](https://learn.microsoft.com/en-au/dynamics365/business-central/warehouse-picking-by-fefo)
- [Microsoft — Define cycle counting](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/tasks/define-cycle-counting-microsoft-dynamics-365-finance-operations-enterprise-edition-july-2017)
- [Microsoft — Replenishment methods and quantity modification](https://learn.microsoft.com/en-us/dynamics365/supply-chain/master-planning/planning-optimization/replenishment-methods-quantity-modification)
- [Microsoft — Reason codes for inventory counting](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/reason-codes-for-counting-journals)
- [Microsoft — Inventory journal approval workflows](https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/inventory-journal-workflow)
