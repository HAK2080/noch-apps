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

## Finance and reporting language

**Business day**:
Noch's reporting day from 05:00 to the following 05:00 in Africa/Tripoli; activity before 05:00 belongs to the preceding date.
_Avoid_: Calendar day, local day

**Net sales**:
Completed-order value after discounts and recorded refunds for the selected business days.
_Avoid_: Revenue, gross sales

**Direct operating profit**:
Net sales minus product costs, direct staff costs, and direct operating expenses before shared operating costs are allocated.
_Avoid_: Net after expenses, branch profit

**Shared operating costs**:
Management payroll and operating expenses serving multiple branches, allocated under a dated shared-cost policy.
_Avoid_: Overhead when the allocation scope or policy is unknown

**Fully loaded operating profit**:
Direct operating profit minus allocated shared operating costs.
_Avoid_: Net profit, accounting profit

**Report completeness**:
The declared state of every source and required cost input used by a report: complete, warning, or unavailable.
_Avoid_: Treating unavailable data as zero

## Sales and cash-control language

**Tender**:
Customer value recorded against one payment method. Split payments are decomposed into their cash and card legs.
_Avoid_: Payment type when a split order is being counted as a third tender

**Tender event**:
An immutable sale, refund, void reversal, or payment correction that changes the recorded balance of one tender.
_Avoid_: Recomputing historical payment movement only from an order's latest state

**Gross tender collected**:
Positive sale tender events before refunds, void reversals, or payment corrections.
_Avoid_: Net sales

**Tender returned**:
Value returned through a stated tender by a refund or void reversal.
_Avoid_: Deducting every refund from cash without recording how it was returned

**Net tender movement**:
Gross tender collected minus tender returned, including tender-to-tender payment corrections, for the selected event period.
_Avoid_: Settlement

**Shift**:
One branch drawer-control interval from opening to closing.
_Avoid_: Business day; a business day can contain more than one shift

**Expected drawer cash**:
Opening cash plus net cash tender events and signed cash movements recorded in the shift.
_Avoid_: Cash sales alone

**Counted drawer cash**:
The physical cash count entered when a shift is closed.
_Avoid_: Expected drawer cash

**Cash variance**:
Counted drawer cash minus expected drawer cash. Positive is over; negative is short.
_Avoid_: Payment reconciliation variance

**Payment reconciliation variance**:
Net sales events minus net tender events for the same scope. Zero means every recorded sale change has an equal tender change.
_Avoid_: Cash variance

**Settlement**:
External evidence that a card or Presto receivable reached its destination. Recording a POS tender does not prove settlement.
_Avoid_: Completed order

**Inferred tender event**:
A historical event reconstructed from order state because the original tender-event evidence was not recorded.
_Avoid_: Presenting reconstructed history as directly observed

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

**Loyalty program version**:
A named set of earning, mission, and reward rules under which member value is accumulated.
_Avoid_: Tier

**Point event**:
An immutable increase or decrease in a member's loyalty value with a unique business cause.
_Avoid_: Directly changing a points balance

**Loyalty checkout session**:
A short-lived claim that allows one loyalty member to identify themselves to one open checkout without exposing contact information to staff.
_Avoid_: Customer QR when the code identifies a person rather than a checkout

**Mission**:
A time-bounded offer with explicit eligibility, qualifying behavior, progress target, completion limit, and guaranteed reward.
_Avoid_: Challenge, game

**Opening balance**:
The customer value carried into a new loyalty program version and recorded as the first auditable event in that version.
_Avoid_: Bonus when the value was earned under an earlier program

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
