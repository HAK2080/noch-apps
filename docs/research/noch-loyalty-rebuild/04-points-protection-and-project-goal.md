# Customer-value protection and project goal

## Non-negotiable promise

The rebuild must not cause a customer to lose points, an earned reward, already-earned progress or access to their account. It must not silently devalue existing points by changing the reward terms. Existing customer IDs, reward provenance and transaction history must remain traceable.

This document is a required implementation plan, not a claim that backups, production reconciliation or migration have already happened. No customer data was changed during research.

## 1. What must be protected

| Record / value | Why a points-only export is insufficient | Required treatment |
|---|---|---|
| Customer identity and membership | Phone aliases, auth links or duplicate-looking profiles can belong to different records. | Preserve stable IDs, aliases, status and ownership evidence. No automatic merges. |
| Current signed points balance | New balance is the sum of events, not necessarily the old `customer.points` field. | Preserve exact authoritative signed balance and every event. Do not round, clamp or reset exceptions away. |
| Earned rewards | Points are already deducted when an entitlement is issued. A balance of zero can coexist with a free drink. | Preserve each reward ID, type, eligibility, expiry/null expiry, state and redemption history separately. |
| Legacy points and rewards | Feedback may still write the older counters and voucher table after V2 migration. | Compare with the archived snapshot and prior transfer IDs; review unrepresented value once. Never add the whole old balance twice. |
| In-progress missions | Customers may already have completed qualifying purchases toward a future benefit. | Preserve rule version, qualifying events, progress and completion; grandfather or make whole if retiring a mission. |
| Refund/void adjustments | Pending or later adjustments can change lawful value after the snapshot. | Preserve event lineage and process once under approved rules; do not confuse real transaction adjustments with migration loss. |
| Offline and in-flight orders | A device may hold sales not yet visible in the server database. | Inventory queues and replay with the same unique order identifiers; preserve capture evidence. |
| Consent and withdrawals | An older opt-in flag may not prove current permission. | Preserve evidence and withdrawn states; never re-enable marketing through migration. |
| V1 archives, access and reward audits | Needed for disputes and proving correct transfer. | Preserve read-only evidence and verify backups/restores. |

Preservation includes access to value, not merely a matching database total. Old receipt and passport links must lead to a supported recovery/member journey. Customers must not have to create a second account to regain existing points.

## 2. The safest implementation approach

Prefer replacing the interfaces and connecting legacy paths while retaining the authoritative new ledger. This removes an unnecessary balance migration. If the backend must change, use additive versioned structures and a tested adapter rather than overwriting existing tables.

The historical V1 conversion already included old points plus converted incomplete stamps. Re-running conversion against today's mutable counters would not be a valid opening balance for another rebuild. Start from current value at an agreed cutover boundary, then separately establish any old value not yet represented.

Any change to future earning or redemption terms needs approval and an effective date. Existing earned rewards keep their terms. For accumulated points, preserve their practical redemption value through grandfathering or a reviewed, non-disadvantaging conversion. The simplest first release changes neither the points unit nor its earning/redemption economics.

## 3. Required sequence before any cutover

1. **Inventory the deployed system using read-only access.** Identify all value writers, table definitions, active jobs, triggers, public RPCs and offline queues. Confirm how production differs from source. Do not call a reporting RPC that runs housekeeping simply to obtain a supposedly read-only snapshot.
2. **Create a consistent protected backup and prove restoration.** Include necessary database schemas, customer/auth mappings and relevant assets/configuration. Verify actual provider backup coverage, retention and restore capability; a dashboard screenshot or CSV of 100 members is not a backup. Keep personal data and secrets out of Git and public artifacts.
3. **Create a restricted reconciliation manifest.** For every account, record customer ID, membership, signed balance, point-event totals, issued/pending/redeemed rewards with terms, mission progress, legacy transfer references and pending activity. Aggregate counts/checksums are supporting controls, not substitutes for account-level matching.
4. **Rehearse on an isolated copy.** Use identical rules and deterministic import/event keys. Run the same import twice to demonstrate no duplicate value. Confirm the restored copy is useful, not just readable.
5. **Resolve legacy divergence without guessing.** Check feedback award records and old reward IDs created after migration. Distinguish a real new award from a copy of previously migrated value. Unexplained cases remain preserved and visible for owner review; do not discard or silently merge them.
6. **Control the write boundary.** At cutover, use a short coordinated write pause or a proven event-capture/catch-up design. Do not let independent old and new engines award points for the same transaction. A shadow system may calculate comparisons but must not spend customer rewards independently.
7. **Reconcile the catch-up.** Include all purchases, rewards, refunds and offline syncs that arrived since the snapshot. Launch only after zero unexplained account-level differences and zero duplicated legacy transfer IDs.
8. **Switch surfaces gradually.** Keep old links resolving. Start with a limited operational pilot while the same ledger remains authoritative. Monitor balances, access, delayed claims and redemption failures.
9. **Retain a value-safe rollback.** Prefer returning the UI to the old version over restoring a stale entire database. If a database rollback is unavoidable, capture and replay every legitimate post-cutover event before resuming. Restoring yesterday's backup alone would lose today's purchases.
10. **Audit after launch.** Compare all migrated accounts at cutover, then newly active accounts/events continually during the pilot. Keep exception ownership and customer-support recovery documented.

## 4. Reconciliation rules

At the same logical cutover boundary, for each customer:

`Expected balance = authoritative source balance + approved unrepresented legacy credits + legitimate catch-up net movements`

`Difference = target balance − expected balance = 0`

Each adjustment must have a recorded reason and unique source reference. For a UI-only rebuild on the same ledger, there should be no migration balance movement at all.

Compare reward inventories independently: reward identity, status, benefit, eligible products/branches, expiry and redemption linkage must match. Also compare mission progress and the ability of the correct person to access the account. A zero aggregate difference can hide one customer losing 100 points and another gaining 100; therefore totals alone never pass the gate.

If no event trail can prove a legacy difference, do not invent a conversion. Preserve the source records, list the case and obtain an owner-reviewed customer-favorable resolution. No unresolved case may disappear from the handover.

## 5. Required test cases

| Area | Minimum scenarios |
|---|---|
| Existing value | Zero-point account with pending reward; high balance; multiple rewards; null expiry; legacy voucher; negative balance exception; duplicate-looking identities. |
| Awarding | Normal purchase; excluded item; discount; fractional spend; multiple items; mixed payment; repeated request; ambiguous network timeout. |
| Redemption | Eligible/ineligible product and branch; expired reward; customer declines use; two tills attempt the same reward; payment fails; retry after success. |
| Adjustments | Partial item refund; full refund; void; refund after reward issuance; refund of a reward-bearing sale; repeated status transitions; mission bonus reversal. |
| Identity | Lost phone; changed number; shared number; existing authenticated member; expired session; unauthorized access; copied public card cannot spend another member's rewards. |
| Recovery | Expired QR; payment before verification; delayed OTP; missed scan; delayed offline sync; repeated claim; one receipt claimed by two accounts. |
| Messaging | Withdrawn consent; legacy unverified flag; duplicate campaign delivery; provider failure; queued versus sent versus suppressed; stale offer or unavailable reward. |
| Migration/rollback | Consistent snapshot; in-flight catch-up; rerun import; all accounts reconciled; reward inventories preserved; post-cutover activity survives rollback. |

The existing sixteen passing local tests are helpful regression checks, not fulfillment of this matrix. Real transaction tests should use isolated/synthetic accounts first. Production validation must avoid uncontrolled messages, purchases or balance adjustments.

## 6. Project goal and approval gates

**Goal:** deliver the lowest-friction practical Noch loyalty experience with one understandable bilingual program, quick repeat recognition, reliable and recoverable earning/redemption, useful consent-respecting marketing and measurable additional repeat visits—without losing or devaluing existing customer value.

“Lowest friction” means reducing unnecessary work for customers and staff while retaining essential ownership and transaction safeguards. It is an optimization target, not an unprovable claim of being the world's most frictionless program.

| Gate | Required evidence | Current status |
|---|---|---|
| Preparation | Research, source map, ratings, priorities and preservation plan. | Complete in this package. |
| Design approval | Plain-language rules, journey, catalogue decision, expiry/recovery/refund policies, role scope and pilot budget. | Requires owner approval. |
| Implementation approval | Agreed change scope and explicit authority to build/migrate/deploy. | Not yet granted for this preparation phase. |
| Data safety | Verified backup/restore and full per-customer reconciliation. | Not executed. |
| Functional readiness | Representative transaction, identity, offline and consent tests. | Not executed end to end; source tests pass. |
| Usability readiness | One-scan return flow; no retyped profile for recognized members; no loyalty blocking payment; Arabic/English recovery. | Proposed design, not implemented. |
| Business pilot | Reliable baseline, comparison group and margin-aware outcome review. | Not started. |

The goal is active, not complete. Creating it does not authorize customer-data changes. Next step is approval of the proposed program and implementation scope; no background campaigns, migration or deployment should occur before that approval.
