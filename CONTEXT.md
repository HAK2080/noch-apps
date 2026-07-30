# Noch Apps

Noch Apps manages products, stock, sales, staff, and finance across central operations and café branches.

## Inventory language

**Stock quantity**:
The amount currently on hand, stored in the product's base unit.
_Avoid_: Inventory count when the product is measured by weight or volume

**Base unit**:
The smallest stable unit used for stock calculations: piece, gram, or millilitre.
_Avoid_: Display unit, receiving unit

**Base-unit cost**:
The inventory valuation cost of one base unit. Roasted coffee uses LYD per gram, independent of the size of a roast batch or retail bag.
_Avoid_: Retail bag cost, monthly roasting cost

**Retail pack size**:
The number of base units sold as one packaged retail item. Coffee bags currently contain 250 grams.
_Avoid_: Stock quantity

**Receiving unit**:
The unit staff use when recording a delivery. Kilograms convert to grams and litres convert to millilitres before changing stock.
_Avoid_: Pack size

**Stock receipt**:
An audited increase to stock caused by goods being received.
_Avoid_: Delivery when referring to the recorded inventory movement

**Menu product**:
An item sold to a customer, such as a latte or espresso.
_Avoid_: Ingredient, stock item

**Stock item**:
A physical item held at a location and transferred or consumed there, whether or not it is sold directly.
_Avoid_: Menu product when referring to raw materials

**Consumption source**:
The stock item and quantity consumed when one unit of a menu product is sold.
_Avoid_: Product stock when referring to recipe usage

**Product cost component**:
A stock-linked or manually priced ingredient entered directly on a menu product, with the quantity and unit used for one sale.
_Avoid_: Linked recipe

**Resolved product cost**:
The sum of a menu product's complete cost components. A stock item's base-unit cost is preferred; a component's manual unit cost is the fallback when stock cost is unavailable. A manual product cost is used only when no components exist.
_Avoid_: Treating an unpriced component as zero

**Central roasted storage**:
The central inventory location that holds roasted Ghadamis coffee beans before transfer to a branch.
_Avoid_: Branch stock, green-bean storage

**Theoretical stock**:
Expected on-hand stock after receipts, transfers, sales consumption, reversals, and recorded waste.
_Avoid_: Physical count

## Loyalty language

**Loyalty member**:
A customer enrolled in Noch's loyalty program with a persistent identity and reward history.
_Avoid_: Loyalty user, account

**Linked order**:
A completed customer order attributed to one loyalty member at checkout.
_Avoid_: Loyalty visit when no order attribution exists

**Stamp event**:
An auditable unit of loyalty progress issued for one qualifying action and capable of being reversed.
_Avoid_: Directly changing a customer's stamp balance

**Reward entitlement**:
An earned, unredeemed customer benefit with explicit issue, expiry, redemption, and reversal states.
_Avoid_: Coupon when referring to an earned loyalty obligation

## Content language

**Content campaign**:
A coordinated set of creative briefs and assets serving one audience, business objective, and measurement plan.
_Avoid_: Marketing campaign when the work only groups content production

**Marketing campaign**:
A targeted customer communication or paid distribution effort with eligibility, consent, delivery, cost, and outcome rules.
_Avoid_: Content campaign

**Approved content**:
A creative asset accepted as on-brand and ready for production or publishing.
_Avoid_: Published content

**Published content**:
An approved asset released on an external channel with verifiable channel, time, campaign, and outcome evidence.
_Avoid_: Approved content
