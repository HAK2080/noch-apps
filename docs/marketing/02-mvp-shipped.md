# Marketing MVP — Shipped (2026-05-08)

Live at `/marketing` on `apps.noch.cloud`.

## What's deployed

### Schema (migration `20260508020000_marketing_mvp.sql`)
- `marketing_channel_snapshots` (per-account daily; manual + api). Unique per `(channel, account_label, snapshot_date)`. Owner-only RLS.
- `loyalty_customers.marketing_opt_in` (default true), `last_marketing_contact_at`, `phone_normalised`.
- One-shot phone normaliser pass: `+218 91…`, `0912…`, `912…` → `+218912…`.
- `loyalty_customer_duplicates` view: rows that share a normalised phone.
- `customer_segments` table: per-customer `segment` + R/F/M scores + composite. Read-only via RLS; writes only via the RPC.
- `refresh_customer_segments()` RPC + nightly cron at 04:15 UTC.
- `cohort_retention(p_months)` RPC.

### Client (`apps/pos/src/modules/marketing/`)
3 tabs at `/marketing` (owner-only):

| Tab | Reads | Writes |
|---|---|---|
| **Channels** | `marketing_channel_snapshots` + `whatsapp_sends` (live counts) | snapshot upsert |
| **Customers** | `customer_segments` + `loyalty_customer_duplicates` + `loyaltyLinkRate` (last 30d) | `refresh_customer_segments` RPC |
| **Cohorts** | `cohort_retention` RPC | — |

`/loyalty/customers/:id` extended with a **Marketing intelligence** panel: segment badge + RFM scores + 180-day visits / spend / last-visit. Read-only.

### Channels supported on Day 1

| Channel | Mode | Notes |
|---|---|---|
| Instagram | Manual entry | Phase 2.5 = IG Graph API onboarding |
| TikTok | Manual entry | Phase 2.5 = TikTok Business API |
| Facebook | Manual entry | Phase 2.5 = piggyback on IG Graph |
| Google Business | Manual entry | Phase 2.5 = Business Profile API (lowest friction; do this first) |
| WhatsApp | **Live** — reads `whatsapp_sends` log table | Sent/Delivered/Read/Failed pulled from existing Twilio integration |

### RFM segment definitions (from `refresh_customer_segments`)
- **VIP** = R≥4 (last 14d) AND M=5 (top quintile spend)
- **Regular** = R≥4 AND F≥3 (3+ visits in 180d)
- **At risk** = R 2–3 (15–60 days quiet) AND was previously active (F≥3)
- **Churned** = R=1 (60+ days no visit) OR no visits at all
- **New** = customer record <14 days old AND ≤1 visit
- **Occasional** = everything else

180-day max history window (avoids pulling whole order log on every refresh).

## What's NOT in this MVP (per brief)

- Campaign engine → Phase 4
- Content calendar → Phase 4 (will link to existing `/content-studio`)
- Reputation inbox → Phase 4
- Email automation, paid-ads management, influencer CRM, A/B testing → out of scope for the foreseeable
- IG / TikTok / GBP API connectors → Phase 2.5 (manual-first ships first; APIs need OAuth setup with each platform)

## Operator setup checklist (5 min after launch)

1. **Hit Refresh on Customers tab** — first manual run of `refresh_customer_segments()`. Subsequent runs happen nightly at 04:15 UTC.
2. **Check the duplicates banner** — manually merge phones if any. Until phones are deduplicated, VIP/Regular counts may be inflated.
3. **Log this week's channel snapshots** — Channels tab → "Log snapshot" per channel → enter followers/reach/etc. once per week.
4. **Watch the "% loyalty-linked orders" health metric** — top of Customers tab. If <30%, encourage QR scans at the POS (segments are biased low until customers self-link).

## Cross-module hooks (already wired)

- `/loyalty/customers/:id` calls `getCustomerSegment(id)` on mount and renders the Marketing panel above the existing Award Stamp section.
- The `whatsapp_sends` table that the WhatsApp section reads from is the same one populated by the existing `whatsapp-cron` edge function.
- Future "VIP-only menu" or "VIP WhatsApp queue" features can `select customer_id, segment from customer_segments where segment='vip'` directly — no new schema needed.

## Known limitations / gotchas

- **POS-issued loyalty stamps may not write to `loyalty_stamps` rows.** Per inspection §1.2: `pos_orders.loyalty_stamps_awarded` is a number on the order; whether each award also creates a `loyalty_stamps` row depends on the POS create_pos_order RPC behaviour. The user flagged this as "live with the limitation; verify when ops are operational." If RFM Frequency seems too low, that's why — the segments RPC reads both `pos_orders` AND `loyalty_stamps`, but if neither captures the visit, it's invisible.
- **% of orders linked to loyalty** is the leading indicator. <30% = bad RFM data. Top-of-tab health metric warns when this is low.
- **WhatsApp inbound is not captured** anywhere. Marketing dashboard cannot show inbound-question / customer-DM volume in v1. Twilio webhooks would need to be added for that.
- **TikTok / IG / FB scraper** (the existing `social-scraper` edge function) is scoped to *competitor* monitoring (`scout_sources` table) and not own-account analytics. Don't confuse the two.
- **GBP API is the recommended first connector** to flip from manual to API. It surfaces direction-requests and review velocity, both leading indicators of foot traffic.

## Files (commit `8eedace`)
- `apps/pos/src/modules/marketing/`
  - `MarketingDashboard.jsx`
  - `lib/marketing-supabase.js`
  - `components/SegmentBadge.jsx`
  - `tabs/{ChannelAnalyticsTab,CustomersTab,CohortsTab}.jsx`
- `apps/pos/src/modules/loyalty/pages/CustomerDetail.jsx` (Marketing intelligence panel inserted)
- `apps/pos/src/App.jsx` (`/marketing` route)
- `apps/pos/src/components/Layout.jsx` (sidebar entry)
- `supabase/migrations/20260508020000_marketing_mvp.sql`

## Ship verification
- Migration applied; `select cron.schedule(...)` returned cron job id `8`.
- `apps/pos` built and deployed (`index-DnvlelMZ.js`).
- Customer profile detail page extended without disturbing existing loyalty flows (read-only soft-fail if segment RPC errors).

## Next sessions

- **Phase 2.5:** GBP API connector first, then Meta IG Graph, then TikTok. Each is OAuth + verification — most of the work is the platform-side onboarding, not coding.
- **Phase 4 (after 2 weeks):** Campaign engine (segments → WhatsApp blast → POS coupon redemption tracking → ROAS calc). Content calendar tied to `/content-studio`. Reputation inbox aggregating Google reviews + IG comments.
