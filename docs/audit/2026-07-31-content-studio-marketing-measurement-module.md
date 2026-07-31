# Content Studio and Marketing Measurement — Module 6

Date: 2026-07-31
Status: implemented and verified; production deployment evidence is recorded in `COMPLETED_WORK.md`

## Purpose and users

Content Studio remains an owner-only creative operating workflow. It connects
inspiration, concepts, briefs, drafts, approvals, external publication, and
comparable evidence without claiming that an observed sale was caused by a
post.

| User | Primary work | Authoritative surface |
|---|---|---|
| Owner/content lead | Plan campaigns, generate and approve content, schedule and confirm publication, capture evidence, compare learning | `/content-studio/*` |

## Authoritative model

- `cs_content_bank_items` remains the approved-asset authority.
- `cs_publications` is the sole source for planned and actual external
  publishing, including objective, campaign, product, platform, spend,
  attribution window, and experiment reference.
- `cs_performance_snapshots` is the sole new source for comparable 24-hour,
  7-day, and final evidence.
- `content_measurement_summary_v2` is the owner reporting authority for
  pipeline, approved-use, evidence completeness, overdue work, and stable
  comparison cells.
- Associated orders and revenue are observational. Causal lift is unavailable
  unless a recorded experiment and control support it.

## Feature classification

### Essential

- Business objective and primary measurement plan on campaigns.
- Approved asset to scheduled/published record.
- Verifiable external post identity.
- Product mapping for sales objectives and explicit paid spend.
- Fixed-horizon performance snapshots and visible missing evidence.
- Bilingual owner navigation, status, exceptions, and measurement guidance.

### Consolidate

- `/content-studio/performance` replaces the separate inline Content Bank
  performance editor with one publishing-and-measurement workflow.
- The Content Bank is approval evidence and links to the measurement surface.
- Scheduled posts can be marked published without creating a second record;
  one approved asset may be published on multiple platforms.

### Archive or hide

- Legacy `perf_*` Content Bank fields are retained for rollback and are
  backfilled only when a verifiable historical post URL and publication time
  exist.
- The old `PostPerformance` implementation remains inactive in source for safe
  rollback but is no longer routed.

### Remove

- No content, campaign, draft, or performance record is deleted.
- Removed the duplicate inline editing journey and unsupported causal language
  from the active owner workflow.

## Validation evidence

The migration and owner summary compiled against the production schema inside
an explicit transaction and were rolled back before live application.
Validation found:

- 122 inspirations, 122 extracted concepts, 1 brief, and 60 drafts.
- 23 approved assets.
- Zero authoritative publications or performance snapshots at launch.
- Approved-use rate 0%; the target is 80% for assets at least 30 days old.
- Evidence completeness is unavailable rather than zero because nothing has
  yet been published through the authoritative workflow.
- Zero overdue scheduled publications and zero evidence exceptions at launch.

Focused automated tests cover record identity, snapshot horizons, preserved
legacy evidence, owner-only RLS, authoritative routing, scheduled-to-published
transition, and the prohibition on unsupported causal claims. Targeted lint
and the production build pass.

## Rollback and preservation

The migration is additive. Existing creative and legacy performance columns
are not dropped. Backfill uses idempotency keys and never overwrites the legacy
source. The active route can be switched back while publication and snapshot
records remain preserved.

## Remaining risks and backlog

1. The current baseline has no authoritative publication evidence. The next
   30 days should establish regular scheduling and both 24-hour and 7-day
   snapshots before comparative benchmarks are trusted.
2. Platform metrics are manually entered until an authorized platform API is
   connected; evidence source remains explicit.
3. Associated POS results are not causal. A future experiment workflow must
   define treatment, control, sample, and stopping rules before lift is shown.
4. Marketing campaign delivery remains governed by verified customer consent
   from Module 5 and is not merged with creative-production campaigns.

## Definition-of-done assessment

The active workflow has one publishing source and one performance source,
duplicate editing is removed, missing evidence is visible, business objectives
and product scope are explicit, owner-only access is enforced, English/Arabic
copy is present on core controls, records are preserved, and rollback is safe.
