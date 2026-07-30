# Noch Loyalty and Content Studio Audit

**Date:** 2026-07-30

**Scope:** current repository, recent Git history, production staff app, public storefront, deployed customer journey, and external benchmark evidence.

**Method:** read-only audit; no product or production data changes.

## Executive conclusion

Noch has built two sophisticated feature sets but not yet two effective business systems.

- **Loyalty is feature-rich and adoption-poor.** The product includes a distinctive mascot-led Passport, stamps, rewards, tiers, lifecycle states, referrals, challenges, feedback, preferences, WhatsApp hooks, and POS attachment. In production, however, only **1 of 3,771 completed orders in the last 30 days** was linked to a loyalty customer: approximately **0.03%**. That makes retention, personalization, member economics, and most segmentation outputs unreliable.
- **Content Studio is creation-rich and outcome-poor.** Production contains **122 inspirations, 122 concepts, 60 drafts, and 23 approved bank items**, and the code has strong dialect/brand controls. But the deployed Performance route is blank, no social channel snapshots exist, publishing is outside the current `cs_*` workflow, and product-sales attribution is manual and causally weak.
- **The strategic priority is a measurement spine, not more features.** Noch should make order-to-member, reward-to-order, published-post-to-product/campaign, consent, and outcome linkage trustworthy before expanding gamification, personalization, or AI generation.

The right description of the current state is:

> A strong experience concept sitting on top of a weak operating and measurement system.

## Verified current state

### Production loyalty evidence

The signed-in production UI at `apps.noch.cloud` showed:

| Measure | Observed |
|---|---:|
| Loyalty customer records | 60 |
| Completed orders, trailing 30 days | 3,771 |
| Orders linked to a loyalty customer | 1 |
| Order link rate | 0.03% |
| Active loyalty customers this week | 0 |
| VIP segment | 0 |
| Regular segment | 0 |
| Occasional segment | 10 |
| At-risk segment | 5 |
| Churned segment | 42 |
| New segment | 3 |

Interpretation:

- The database contains enrolled people, but the program is almost absent from checkout.
- A 0.03% link rate means the RFM and spend views describe a tiny, biased sample.
- Forty-two of 60 records are classified as churned, but many have no linked visit history. This is partly a customer outcome and partly an instrumentation failure.
- “Active this week = 0” is consistent with the same capture failure.

The public storefront at `noch.cloud/#loyalty` successfully opens a polished bilingual phone-number loyalty overlay. The deployed counter QR destination uses `#loyalty?t=<token>`, while the storefront only opens loyalty for the exact `#loyalty` hash. Production verification confirmed that a tokenized hash opens no loyalty dialog.

### Production content evidence

The signed-in production Content Studio showed:

| Artefact | Observed |
|---|---:|
| Inspirations | 122 |
| Extracted concepts | 122 |
| Draft variants | 60 |
| Voice profiles | 1 |
| Approved content-bank items | 23 |

This proves that Noch is using the system as a creative repository, not merely carrying dormant scaffolding.

However:

- The deployed Content Studio navigation does not include Performance.
- Direct navigation to `/content-studio/performance` renders a blank page.
- The production Marketing channel dashboard has no Instagram, TikTok, Facebook, Google Business, or WhatsApp snapshots.
- WhatsApp showed 213 sent, 147 failed, and zero delivered/read, so delivery evidence is incomplete and failure is high.

The work log says the Performance workspace was deployed on 2026-07-25, while the live bundle checked on 2026-07-30 does not expose it. This is deployment drift: later production deployment likely replaced the feature with an older or incomplete bundle.

## Current program maps

### Loyalty as implemented

```text
Discovery
  └─ noch.cloud loyalty tile / in-store prompt
       └─ Phone lookup or sign-up
            ├─ Name + birthday
            ├─ WhatsApp preference
            └─ Loyalty member + Passport

Checkout
  └─ Staff attaches member in POS
       ├─ Order receives loyalty_customer attribution
       ├─ Configured stamps are issued
       ├─ Visit/preferences can be refreshed
       └─ Receipt links to Passport

Progress
  ├─ Stamp card and free-drink entitlement
  ├─ Lifetime tiers
  ├─ Points from feedback/other actions
  ├─ Referrals, challenges, spin, badges
  └─ Daily gestures and mascot lifecycle state

Retention
  ├─ Inactivity segments
  ├─ Birthday/reward/win-back hooks
  ├─ WhatsApp campaigns
  └─ Feedback and review requests

Measurement
  ├─ Customer counts and lifecycle states
  ├─ RFM/customer segments
  ├─ Checkout link rate
  └─ Rewards and feedback lists
```

The intended journey is sensible. The failure occurs at the checkout seam: the member is almost never attached, so all downstream intelligence loses its foundation.

### Content Studio as implemented

```text
Business signals
  ├─ POS product trends/declines
  ├─ Loyalty inactivity/feedback/reward signals
  ├─ Staff ideas
  └─ External inspiration
       ↓
Inspiration library
       ↓
Concept extraction / adaptation / copy-risk review
       ↓
Creative brief
  ├─ Objective, audience, product, mission
  ├─ Voice, dialect, platform, format
  └─ Quality rubric + campaign link
       ↓
AI draft variants
       ↓
Evaluate → edit/version → rewrite → approve/reject
       ↓
Approved Content Bank
       ↓
Manual publishing outside the current workflow
       ↓
Manual metric entry + AI manifesto evaluation
       ↓
Learning-signal records and voice examples
```

The creative half is coherent. The publishing, evidence, attribution, and learning half is not closed.

## The good

### Loyalty

1. **The proposition is memorable.** Nochi the mascot, the Passport, visible stamp progress, “usual drink” memory, and bilingual voice are more distinctive than a generic points wallet.
2. **The core reward is easy to explain.** Nine qualifying purchases leading to a free drink is concrete and naturally supports goal-gradient behavior.
3. **The data model anticipates a real relationship.** It contains visits, stamps, rewards, tiers, preferences, birthday, referral, feedback, consent, and lifecycle state rather than only a coupon code.
4. **POS attribution exists in the architecture.** Completed orders can carry a loyalty customer and stamps can be awarded during the order transaction.
5. **Customer memory can improve service.** The POS can surface name, preferences, tier, stamps, visits, and notes for an attached customer.
6. **Consent has at least been recognized.** WhatsApp opt-in fields and consent timestamps/sources exist in the later Passport work.
7. **The Marketing module already exposes the decisive health metric.** Showing linked orders over total orders is exactly the right starting point, even though the current result is effectively zero.

### Content Studio

1. **The workflow is richer than a caption generator.** Signals, inspirations, concepts, briefs, drafts, evaluation, version history, approval, a bank, campaigns, and performance evidence are modeled separately.
2. **Brand and dialect control are unusually strong.** Voice rules, forbidden forms, a dialect lexicon, gold examples, Tripoli/Libyan training, and evaluator dimensions address a real Noch differentiation.
3. **Generation and evaluation are separated.** The evaluator labels drafts without silently determining them, and edits/rewrites preserve parent-child version history.
4. **AI provider resilience improved.** Generation and evaluation have structured JSON and provider fallbacks.
5. **The module can start from business signals.** POS and loyalty observations can become briefs, which is the right direction for commercially useful content.
6. **A performance model exists in code.** The repository contains platform metrics, human ratings, brand-fit scoring, peer benchmarks, and persisted evaluations, with focused tests passing.
7. **Real usage exists.** The live counts show substantial inspiration, concept, draft, and approved-bank inventory.

## The bad

### Loyalty

1. **Breadth arrived before habit formation.** Spin, gestures, tiers, challenges, badges, Nochi Day, points, referrals, feedback rewards, and multiple campaign paths exist while checkout attachment is effectively unused.
2. **The member value exchange is not operationalized at the counter.** The UI supports attachment, but there is no enforced staff prompt/skip reason or manager accountability funnel.
3. **“Repeat visit rate” is not true retention.** The current RPC calculates additional linked orders inside one trailing window. It does not measure a matured enrollment cohort or a second visit within a defined post-enrollment period.
4. **Lifecycle labels overstate precision.** “Churned,” “dead,” and RFM scores look authoritative even when most orders are unlinked.
5. **The points economy is not unified with the stamp economy.** Visit points, feedback points, spin costs, referral bonuses, and free-drink thresholds coexist with the nine-stamp reward and use inconsistent historical defaults.
6. **Rewards are not managed as an economic obligation.** The dashboard does not show expected redemption, reward COGS, breakage, outstanding liability, or reward cost as a share of member sales.
7. **Critical loyalty behavior lacks focused automated tests.** Existing tests mostly prove that pages load. There are no current integration tests for issuance, rollover, referral bonus, expiry, redemption, void, partial refund, or abuse.

### Content Studio

1. **Two content systems still coexist.** The current `cs_*` workflow creates approved bank items, while scheduling/calendar views still read legacy `content_posts`. The seam between them is missing.
2. **Publishing is outside the workflow.** There is no reliable transition from approved bank item to scheduled/published external post with platform ID and evidence timestamps.
3. **Campaign objectives are free text.** A field such as “+15% product sales” is not a computable metric definition, product mapping, attribution window, or experiment plan.
4. **Performance input is manual.** Manual entry is acceptable as a first release, but the system has no completeness control or fixed 24-hour/7-day snapshots.
5. **Learning signals are mostly write-only telemetry.** Approved/rejected/edit/rewrite/performance signals are stored and displayed. Draft generation consumes dialect gold examples, but it does not consume the saved good/bad caption samples or aggregate learning-signal history.
6. **The same item has two performance-entry experiences.** Content Bank includes a collapsed legacy panel, while the newer Performance workspace calculates a different composite evaluation. This duplicates concepts and invites conflicting scores.
7. **The overview measures inventory, not throughput.** Counts of inspirations, drafts, and approved items do not reveal time to publish, first-pass approval, abandonment, or approved assets that never go live.

## The ugly

These items can create financial, security, customer-trust, or decision-quality harm.

### Loyalty

1. **The order link rate is approximately 0.03%.** Until this is repaired, member sales, RFM, retention, frequency, and personalization are not decision-grade.
2. **The deployed counter QR is broken.** It produces a tokenized hash the public storefront does not parse.
3. **The customer loyalty overlay depends on RPCs absent from migrations.** `get_my_loyalty_card`, `signup_loyalty_customer`, and `redeem_my_reward` are called by the live storefront but have no reproducible definition in the repository.
4. **Customer card access and redemption are phone-number-only.** No OTP or authenticated customer session is required in the visible flow. Someone who knows a member phone number can attempt to view or redeem that member's rewards.
5. **The staff Stamp Counter bypasses the canonical ledger.** It directly updates fields including `lifetime_stamps` and `visit_count`, while the canonical customer model uses `total_stamps` and `total_visits`. It can show a win without creating an auditable reward entitlement.
6. **Void reversal is incomplete.** It decrements customer counters but does not reverse stamp-ledger rows, recompute tier, or safely cancel a reward created by the voided order. Partial refunds do not define proportional loyalty reversal.
7. **Reward expiry is presentation, not enforcement.** Rewards have `expires_at`, but no current job was found that changes pending rewards to expired, and staff redemption does not reject an expired timestamp.
8. **Reward schema drift remains.** Migrations/functions reference reward fields such as `code` and `metadata` that are not added to the canonical reward table migrations.
9. **Phone normalization is inconsistent in live data.** Production visibly contains `+218`, `+09`, `00...`, spaced, local-only, international, test, and deleted-marker formats. A unique raw phone string is not customer deduplication.

### Content Studio

1. **Production does not match the repository or work log.** The code and log say Performance is live; the deployed route is blank and absent from navigation.
2. **The campaign workbench still selects a nonexistent draft field.** It requests and renders `body`, while `cs_draft_variants` uses `body_text`, so linked drafts can fail to load.
3. **The composite “effectiveness” score can imply false precision.** It uses manual before/after order counts without a product ID, branch, exact time window, paid/organic flag, campaign cost, or control group.
4. **Fallback benchmarks are arbitrary.** When peer evidence is absent, the score assumes a 5% engagement benchmark and a 3% profile-visit benchmark. Peers are matched mainly by platform, not format, objective, paid status, audience, or time period.
5. **Captured business metrics are partly unused.** Loyalty visits after publishing and link clicks can be entered but do not materially drive the composite score.
6. **Saved “our voice” and “avoid” examples do not train draft generation.** They influence evaluation context, but the generator omits them. The UI statement that the decision “trains this voice profile” is therefore only partially true.
7. **Rewrite reliability is behind generation/evaluation.** The rewrite function still uses one fixed Anthropic model with no provider fallback, despite known Anthropic credit constraints.
8. **Access claims and policies disagree.** The Settings page says Content Studio writes are owner-only, while newer briefs/campaigns migrations grant all authenticated users full table access. The route is owner-gated, but the database policy is broader.

## Strategic goals and scorecard

### North star

**Incremental contribution margin from identified returning customers and measurable content-led demand.**

This north star prevents the business from optimizing sign-ups, points issued, drafts generated, or likes in isolation.

### Loyalty scorecard

| Goal | Metric | Definition | Target |
|---|---|---|---:|
| Make data usable | Order link rate | Linked completed orders / eligible completed orders | 30% by day 30; 50% by day 90; 70% 12-month stretch |
| Form a habit | Second-visit rate | New members with a second linked order in 30 days / matured new-member cohort | Baseline after four clean cohorts; then +10% relative per test cycle |
| Activate members | 120-day activation | Members with at least 3 linked purchases in 120 days / matured enrollment cohort | 20% floor, 28% stretch reference |
| Keep members active | 90-day active-member rate | Members with at least 1 linked order in trailing 90 days / eligible members | Baseline after link-rate gate; improve cohort over cohort |
| Increase useful frequency | Visits per active member | Linked completed orders per active member per 28 days | Improve median, not only mean |
| Protect economics | Reward cost rate | Reward COGS plus discount value / linked member sales | Set after COGS baseline; alert before vendor-informed 4.5% face-value warning |
| Control obligations | Ledger reconstructability | Issuance, reversal, expiry, redemption, source order, SKU, and COGS traceable | 100% |
| Respect customers | Consent enforcement | Personalized outbound sends passing channel/purpose consent and suppression at send time | 100% |
| Prove incrementality | Test coverage | Material loyalty interventions with randomized holdout | At least 2 completed tests by day 90 |

### Content scorecard

| Goal | Metric | Definition | Target |
|---|---|---|---:|
| Ship useful work | Approved-use rate | Approved assets published within 30 days / matured approved assets | 80%+ |
| Move faster | Brief-to-publish time | `published_at - brief_created_at` | Median ≤48h; p90 ≤5 business days |
| Reduce rework | First-pass approval | Assets approved without revision / first submissions | 70%+ |
| Keep commitments | On-time publish rate | Assets published by planned time / scheduled assets | 90%+ |
| Preserve evidence | Evidence completeness | Published posts with platform ID, timestamps, campaign/product map, cost, and snapshots | 90%+ initially; 100% target |
| Connect to commerce | Product mapping | Product-led posts mapped to at least one product and campaign | 100% |
| Learn comparably | Performance-cell sample | Posts compared within platform × format × objective × paid/organic cell | 30 comparable posts before stable benchmark claims |
| Prove business value | Incrementality | Pre-registered content tests with contribution-margin outcome | At least 3 by day 180 |

## Recommended roadmap

### Phase 0 — Stop the bleeding (week 1)

1. **Freeze new loyalty mechanics and new AI draft features.**
2. Add a visible production data-health banner: link rate, missing reward ledger events, missing consent provenance, unmapped published posts, and stale deployments.
3. Disable or repair the broken counter QR and Stamp Counter.
4. Restore deployed Content Performance and add a deployment smoke test for every Content Studio route.
5. Define one canonical customer phone normalization and merge process.
6. Document or migrate the storefront loyalty RPCs; add OTP/session-based customer access before treating reward redemption as secure.

### Phase 1 — Make loyalty trustworthy (days 8–30)

1. Put member attach/search in the normal POS payment path with three cashier outcomes:
   - member attached;
   - new member enrolled;
   - customer declined/unavailable, with a skip reason.
2. Track prompt coverage, enrollment conversion, and staff-level attach rate.
3. Use one transactional loyalty module for order issuance, manual bonus issuance, void, partial refund, reward creation, expiry, and redemption.
4. Replace direct balance changes with immutable events and derived balances.
5. Recompute tiers from the canonical ledger after reversals.
6. Implement expiry enforcement and monthly reward-liability reconciliation using reward COGS.
7. Backfill only what can be reconstructed defensibly; label unknown legacy balances.

**Exit:** at least 30% order link rate and zero unexplained ledger/reward exceptions for seven consecutive days.

### Phase 2 — Close the content loop (days 15–45)

1. Choose `cs_*` as the canonical workflow and create one adapter into scheduling/publishing; stop maintaining two authoring systems.
2. Add structured campaign objective, promoted product IDs, branch, paid/organic, attribution window, cost, and success metric.
3. Instrument timestamps for brief, work start, submission, decision, scheduling, and publishing.
4. Require external platform/media ID and fixed-age metric snapshots at 24 hours and 7 days.
5. Merge the legacy Content Bank performance panel into the single Performance workspace.
6. Replace the composite score with a ladder:
   - delivery;
   - attention;
   - intent;
   - action;
   - business outcome;
   - incrementality.
7. Feed approved/rejected captions and summarized edit/performance patterns into generation through a bounded, reviewed voice-memory adapter.

**Exit:** 90% evidence completeness, 100% product mapping for product-led posts, and the deployed routes match the repository.

### Phase 3 — Prove behavior change (days 31–90)

1. Establish four clean enrollment cohorts.
2. Test:
   - one new-member second-visit intervention;
   - one near-reward progress reminder;
   - one post-redemption head-start/reset.
3. Hold out at least 10% of eligible customers where sample size permits.
4. Report incremental visits and incremental contribution margin, not recipient versus non-recipient correlation.
5. Review content weekly by comparable platform/format/objective cells and promote only patterns supported by evidence.

**Exit:** 50% order link rate, at least two completed loyalty tests, and one repeatable creative pattern supported by at least 30 comparable posts.

### Phase 4 — Scale what works (days 91–180)

1. Automate lifecycle messaging only for segments with reliable linked history and valid consent.
2. Use unique links, QR codes, or offer codes for action-oriented content.
3. Run repeated time-block, customer-holdout, or matched-branch experiments suited to Noch's scale.
4. Allocate creative effort and campaign spend by incremental contribution margin.

**Exit:** three pre-registered content-to-sales tests and a documented winning/losing creative library.

## What not to build yet

- More loyalty tiers, badges, wheels, challenges, or points currencies.
- More AI rewrite actions or content-generation modes.
- A “single magic score” for customers or content.
- Automatic win-back messaging from the current churn labels.
- Paid social connectors before the post/product/campaign data contract is stable.
- Advanced CLV or personalization while the order link rate is below 30%.

## Operating cadence

### Daily

- Unlinked-order rate by branch and cashier.
- Loyalty issuance/redemption/reversal exceptions.
- Failed or suppressed outbound messages.
- Missing scheduled/published evidence.

### Weekly

- Link funnel: eligible → prompted → enrolled/attached → completed.
- New-member second visits and activation by cohort.
- Reward cost and outstanding exposure.
- Content throughput, approval, publish timeliness, and evidence completeness.
- Comparable post-performance cells and active experiments.

### Monthly

- 90-day member activity and cohort retention.
- Reward liability/breakage reconciliation.
- Consent and suppression audit.
- Loyalty and content incremental-margin review.
- Deployment parity audit between Git, database migrations/functions, and production routes.

## Evidence and verification

Repository evidence:

- Loyalty domain functions: `apps/pos/src/modules/loyalty/lib/loyalty-supabase.js`
- POS loyalty issuance: `supabase/migrations/20260718190000_pos_stamps_reward_rollover.sql`
- Void handling: `supabase/migrations/20260718190100_void_loyalty_reversal.sql`
- Public storefront journey: `apps/storefront/index.html`
- Counter QR UI: `apps/pos/src/modules/loyalty/pages/LoyaltyQR.jsx`
- Staff Stamp Counter: `apps/pos/src/modules/loyalty/pages/LoyaltyStamp.jsx`
- Content workflow: `apps/pos/src/modules/contentStudio/`
- Draft generation prompt: `supabase/functions/cs-generate-drafts/index.ts`
- Performance logic: `apps/pos/src/modules/contentStudio/lib/postPerformance.js`
- Campaign workbench: `apps/pos/src/modules/contentStudio/pages/CampaignDetail.jsx`

External benchmarks, KPI formulas, and source links:

- [`docs/research/loyalty-content-benchmarks-2026-07-30.md`](../research/loyalty-content-benchmarks-2026-07-30.md)

Verification performed:

- Read coordination/work logs, current code, migrations, and recent Git history.
- Inspected signed-in production Loyalty, Marketing, and Content Studio surfaces.
- Inspected the public loyalty journey and tokenized counter QR destination.
- Ran the two focused Content Studio suites: 8 tests passed.
- No current focused loyalty accounting/redemption test suite was found.
