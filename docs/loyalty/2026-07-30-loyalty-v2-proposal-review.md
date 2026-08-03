# Loyalty V2 Proposal Review

**Decision:** Approved with revisions for a local implementation.

## Accepted

- Paid POS orders are the source of earning and mission progress.
- The customer scans a transaction-specific QR on their own device.
- No application download is required.
- Points, missions, rewards, refunds, reporting, and campaign controls belong
  to one loyalty program.
- Initial missions stay limited to repeat visit, selected product/category, and
  quiet hours, with no more than two shown to one member.
- V1 member names, value, and valid rewards must be transferred and reconciled.

## Revised

- Customer QR is the primary path; cashier phone lookup is retained as a
  secondary authenticated fallback.
- Staff never see the complete phone number in the normal checkout response.
- QR tokens are random, single-use, transaction-bound, stored as hashes, and
  expire after five minutes.
- All earning, spending, mission bonuses, refunds, voids, and migration value
  are immutable point events.
- Partial refunds reverse the points attributable to the refunded value.
- Missions use versioned rules and idempotent completion so an order cannot
  advance the same mission twice.
- V1 is snapshotted and exposed read-only. Existing tables are not dropped or
  renamed because other Noch modules still depend on them.

## Launch configuration

- One point per net LYD paid.
- A 200-point guaranteed reward.
- Existing points transfer one-for-one.
- Incomplete stamps convert proportionally using the configured V1 stamp goal,
  rounded upward.
- Existing pending rewards transfer one-for-one.
- Maximum two active missions returned to a customer.

## Deferred from the first local slice

- Native mobile application.
- Apple/Google Wallet distribution.
- NFC terminal integration.
- Leaderboards, tiers, spin, badges, collectibles, and complex referrals.

## Good, bad, and ugly

### Good

- The proposal makes a paid POS order the source of truth, so earning, missions,
  and redemptions can be reconciled.
- A customer-scanned transaction QR directly addresses the privacy and
  harassment concern without removing the operational phone fallback.
- Guaranteed progress and a maximum of two missions are understandable at the
  counter and measurable through linked-order rate.

### Bad

- The original proposal did not define an immutable ledger, idempotency keys,
  partial-refund math, V1 conversion, or how active mission edits are versioned.
- It treated phone-first registration as the default even though the local
  market evidence says speaking a number to a barista is the main friction.
- It mixed pilot, application, tablet, and POS work without defining a single
  local acceptance seam.

### Ugly

- V1 had several independent award paths, broad authenticated access policies,
  mutable counters, and a POS trigger plus RPC path capable of overlapping.
- Hidden products were filtered out of the very management pages needed to
  restore them, and manual stock adjustment was split across two writes.
- A code-only migration cannot prove RLS, trigger, OTP-provider, or refund
  behavior. Those require an isolated local Supabase instance before any pilot.

## Local V2 implementation status

Implemented locally:

- V1 snapshot, read-only archive, stamp freeze, name/value reconciliation, and
  pending-reward transfer.
- V2 immutable point ledger, spend earning, reward issuance, mission progress,
  refund/void reversal, and reward reversal when refunded value invalidates an
  unredeemed reward.
- Hashed five-minute transaction QR sessions with one-time claim and paid-order
  settlement.
- Customer phone/email OTP claim page with post-payment points, balance,
  rewards, and mission progress.
- QR-first POS journey with collapsed phone fallback and masked staff response.
- POS reward display, eligibility/discount validation, and redemption.
- Owner dashboard with 30-day/90-day capture goals, migration reconciliation,
  and management for repeat-visit, product, category, and quiet-hours missions.

Still required before a pilot:

- Apply both new migrations to an isolated local Supabase database.
- Exercise RLS with separate owner, staff, and customer OTP sessions.
- Run paid sale, partial refund, full refund, void, expired QR, duplicate claim,
  reward race, and multi-branch scenarios against that database.
- Configure and verify the actual SMS/email OTP providers.
- Conduct a cashier/customer tablet usability pass and measure checkout time.
