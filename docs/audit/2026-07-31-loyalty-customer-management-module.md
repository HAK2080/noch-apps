# Loyalty and Customer Management — Module 5

Date: 2026-07-31
Status: implemented and verified; production deployment evidence is recorded in `COMPLETED_WORK.md`

## Purpose and users

This module gives customers a private way to join and identify themselves,
cashiers a fast checkout decision, and owners a trustworthy view of capture,
member value, consent, rewards, and identity exceptions.

| User | Primary work | Authoritative surface |
|---|---|---|
| Customer | Join, claim an open checkout, view value, choose contact consent | `/loyalty/checkout/:token` and self-service card |
| Cashier | Offer transaction QR, existing card, or masked phone fallback; record a skip reason | POS payment modal |
| Owner | Monitor launch capture, customers, consent, missions, rewards, and exceptions | `/loyalty`, `/loyalty/customers`, `/loyalty/missions` |

## Authoritative model

- `loyalty_capture_events` records one immutable resolved decision per paid
  order: linked by customer QR, existing card, or phone fallback; or skipped
  with a stated reason. Synced offline orders remain visibly `unknown` until
  resolved.
- `loyalty_v2_owner_summary` is the owner reporting authority. It uses the
  05:00 `Africa/Tripoli` business day and separates the launch cohort from
  historical performance.
- `loyalty_consent_events` is append-only evidence by channel and purpose.
  Legacy truthy flags without provenance are explicitly unverified.
- V2 point events, reward entitlements, reward events, and immutable cost
  snapshots are the member-value and obligation authorities.
- The masked customer directory and search RPCs are the only normal staff
  customer lookup paths. Customer access is audited.

## Feature classification

### Essential

- Customer-scanned transaction QR as the primary checkout journey.
- Existing card and masked cashier phone lookup as supported alternatives.
- Explicit linked/skipped/unknown capture outcomes.
- Preserved names, identities, opening points, pending rewards, and V1 archive.
- Verified self-service WhatsApp and marketing consent.
- Bilingual missions, reward obligations, reversals, and owner exceptions.

### Consolidate

- `/loyalty` is the owner control view; `/loyalty/customers` is the masked
  directory; the POS payment modal is the only checkout capture decision.
- All customer communications use the same consent eligibility function.
- Mission edits create a bilingual immutable version rather than mutating
  historical rules.

### Archive or hide

- Loyalty V1 remains read-only for reconciliation and rollback evidence.
- Historical capture is shown separately and is not used to judge the new
  journey.

### Remove

- No customer records were removed. Unreviewed duplicate identities are
  preserved as exception cases and are never merged automatically.
- No phone number is exposed in normal customer search or card-token lookup.

## Validation evidence

Both the migration and owner RPCs compiled against the production schema
inside an explicit transaction and were rolled back before live application.
The validation found:

- Launch status `awaiting_first_order`: 0 post-launch eligible and linked
  orders.
- Historical linked orders: 1 of 3,664 (0.03%).
- 60 active members with 1,130 points outstanding.
- Three open identity-exception groups, preserved without merging.
- 60 legacy WhatsApp flags classified as unverified; zero verified WhatsApp
  or marketing consents.
- Zero pending rewards and zero missing reward-cost snapshots.
- Branch results reconcile to the consolidated launch totals.

Focused automated tests cover QR priority, explicit capture decisions,
idempotent value transfer, refund/void reversals, consent, masked access,
Tripoli periods, bilingual mission versioning, and customer claim settlement.
Targeted lint and the production build pass.

## Rollback and preservation

The migration is additive and idempotent. It does not delete or rewrite V1/V2
identity, ledger, reward, or order records. Legacy consent flags remain stored;
only their eligibility is classified conservatively until the member verifies
the choice. New tables and RPC overrides can be removed while the archived and
source records remain intact.

## Remaining risks and backlog

1. The 30% day-30 and 50% day-90 goals cannot be evaluated until post-launch
   paid orders exist. Review capture outcomes and skip reasons daily.
2. Synced offline orders enter an explicit unknown queue because the offline
   client cannot safely resolve loyalty identity at sale time.
3. The three identity exception groups require owner-reviewed evidence before
   any merge tooling is authorized.
4. Reward obligation is zero because no pending entitlements exist; configure
   and test cost evidence before a reward campaign is activated.

## Definition-of-done assessment

Customer identification does not require speaking a phone number, both
alternative methods remain available, every online checkout records a
decision, consent fails closed, customer access is masked and role-controlled,
launch reporting has one Tripoli-based authority, inherited value reconciles,
and no business records are silently merged or removed.
