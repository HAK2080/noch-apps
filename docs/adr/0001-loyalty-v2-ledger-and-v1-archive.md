# ADR 0001: Loyalty V2 Ledger and V1 Archive

**Status:** Accepted for local implementation

**Date:** 2026-07-30

## Context

Noch Loyalty V1 stores customer value across mutable stamp and point counters,
stamp rows, rewards, and several award paths. Renaming or deleting those tables
would break POS, Passport, marketing, and reporting callers. Moving to a
spend-based program also requires a defensible transfer of existing customer
value.

## Decision

- `loyalty_customers` remains the persistent customer identity. Existing IDs and
  names do not change.
- V1 customer, stamp, point, tier, and reward state is copied to immutable
  archive tables before V2 opening balances are created.
- V2 value is represented by immutable point events. A balance is the sum of
  those events; callers cannot directly change it.
- Existing point balances transfer one-for-one.
- Incomplete stamp progress converts in the customer's favor:
  `ceil(current_stamps / legacy_stamp_goal * 200)`.
- Valid pending V1 rewards transfer one-for-one as V2 reward entitlements.
- Lifetime V1 stamps and tiers remain historical evidence and are not converted
  into spendable value a second time.
- The customer-scanned checkout session is the primary identification path.
  Cashier phone lookup remains an authenticated fallback, and staff-facing
  responses mask contact information.
- V1 remains available through a read-only archive surface. It is not deleted
  or renamed.

## Consequences

- Migration can be reconciled customer by customer and rerun safely.
- Refund and void behavior must append reversing events rather than edit prior
  events.
- V2 needs a single settlement module for paid orders, missions, reward
  issuance, refunds, and voids.
- Contact information remains available for recovery and consented messaging,
  but it is not required in the primary counter interaction.
