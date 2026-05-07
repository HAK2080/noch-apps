# Marketing — Phase 0 Inspection

**Auditor:** Opus 4.7 · **Date:** 2026-05-08 · **Scope:** what already exists in this repo that touches marketing, customers, content, or external channels. **No code written.**

---

## 1. Loyalty schema (the customer ground truth)

The Loyalty module is the most mature customer system in the app. **Almost everything Customer Intelligence (§2.2 of the brief) needs is already in this schema.**

### 1.1 Customer master
**`loyalty_customers`** ([`20260412180000_loyalty_system.sql`](supabase/migrations/20260412180000_loyalty_system.sql))
- `id, phone (unique), full_name, birthday, tier ('bronze'|'silver'|'gold'|'legend')`
- `current_stamps, total_stamps (lifetime), total_visits, current_streak, longest_streak`
- `last_visit_at, nochi_state ('happy'|'sad'|'tired'|'deathbed'|'dead')`
- `registered_by (profiles FK), notes, created_at, updated_at`

🟢 **Phone is unique** — one of the brief's anti-patterns ("don't trust loyalty data without deduplication") is partly mitigated. **NEEDS_MANUAL_VERIFY:** is the phone normalised on insert (country code, whitespace, leading zeros)?

🟠 **No `email`, no `social_handle`, no `gender`, no `consent_marketing` flag.** Brief doesn't ask for these in v1, but the campaign engine in Phase 4 will need an opt-in / opt-out boolean. Plan to add a `marketing_opt_in boolean default true` column.

### 1.2 Stamp + reward history
- **`loyalty_stamps`** — `customer_id, awarded_by, stamp_number (1–9), cycle_number, notes, created_at`. **One row per stamp event** = visit log + spending proxy.
- **`loyalty_rewards`** — earned free drinks: `customer_id, reward_type, status ('pending'|'redeemed'|'expired'), redeemed_at, expires_at`.

🟢 **`loyalty_stamps.created_at` IS the visit log.** RFM Recency = `max(created_at)` per customer. Frequency = `count(*)` per customer in window. Monetary = needs join to `pos_orders`.

🟠 **Linkage to `pos_orders` is NOT enforced.** `pos_orders.loyalty_customer_id` is set when the cashier scans a loyalty QR, but stamps awarded server-side via `create_pos_order` write to `pos_orders.loyalty_stamps_awarded` (a number, not a row in `loyalty_stamps`). Today, `loyalty_stamps` rows come from `LoyaltyStamp` admin UI. **There may be a gap where POS-awarded stamps don't show in `loyalty_stamps` history.** Needs the user's confirmation.

**Implication for RFM segmentation:** The brief defines Monetary by spend. To compute it, query `sum(pos_orders.total) where loyalty_customer_id = X and status='completed'`. This works only when the cashier links the customer to the order. **NEEDS_MANUAL_VERIFY:** what % of orders today have `loyalty_customer_id` set? If it's <30%, RFM Monetary will be unreliable.

### 1.3 Engagement extensions
| Table | Purpose | Source migration |
|---|---|---|
| `loyalty_feedback` | post-visit rating 1–5, comment, sentiment, auto-creates a task on negative | [`20260412180000`](supabase/migrations/20260412180000_loyalty_system.sql) |
| `loyalty_challenges` + `loyalty_challenge_progress` | weekly/monthly challenges (visit X times, etc.) | same |
| `loyalty_qr_tokens` | one-shot QR tokens for stamp claim / customer linking | same |
| `loyalty_customer_badges` | gamification badges | [`20260417_001`](supabase/migrations/20260417_001_schema_additions.sql) / [`20260501030000`](supabase/migrations/20260501030000_loyalty_phase0_activation.sql) |
| `loyalty_gestures` | micro-interactions (gestures recorded by app) | `20260417_001` |
| `loyalty_referrals` | `referrer_id, referred_id, points_awarded` — referral tracking | `20260417_001` |
| `loyalty_spins` + `loyalty_spin_prizes` | spin-the-wheel reward mechanic | `20260417_001` |
| `loyalty_nochi_day_runs` | "Nochi Day" promo run history | [`20260501060000`](supabase/migrations/20260501060000_nochi_day.sql) |
| `loyalty_settings` | thresholds: stamp_goal=9, tier cutoffs, inactivity bands → nochi_state decay | `20260412180000` |

🟢 **Inactivity bands already exist** for the `nochi_state` decay (sad / tired / deathbed / dead) — these map almost 1:1 onto the brief's RFM "At Risk" / "Churned" segments. Reuse the same thresholds to avoid two competing definitions of "stale customer."

### 1.4 Loyalty pages already in the app
Routes (from `src/App.jsx`):
- `/loyalty` — `LoyaltyDashboard`
- `/loyalty/customers`, `/loyalty/customers/:id` — list + detail (the Customer Profile View the brief asks for already exists in some form here)
- `/loyalty/rewards`, `/loyalty/qr`, `/loyalty/settings`
- `/loyalty/leaderboard` — top customers by stamps
- `/loyalty/stamp` — manual stamp UI
- `/loyalty/gestures`, `/loyalty/spin`

**Recommendation:** the Marketing v1 Customer Intelligence section should **not** rebuild a customer profile view from scratch. Either link to `/loyalty/customers/:id` or extend that page with the new RFM/CLV/cohort tabs. Same data; different lens.

---

## 2. Brand Settings & Content Studio

### 2.1 Brand schema
**`brands`** ([`20260410000000_content_studio.sql`](supabase/migrations/20260410000000_content_studio.sql))
- `name, name_ar, tagline, tagline_ar, category ('cafe' default)`
- `voice_archetype, voice_inspirations[], personality_notes, target_audience`
- `dialect ('libyan-tripoli' default)`
- `platforms[] (default ['instagram','facebook'])`
- `primary_color, logo_url, brand_program, voice_score`

🟢 **One row per brand.** Noch + Bloom likely both have rows. Brief says "Bloom is out for v1" → filter `name != 'Bloom'` on the Marketing dashboard.

### 2.2 Content Studio (the production engine)
| Table | Purpose |
|---|---|
| `content_posts` | drafts + published posts. Stores `caption_en`, `caption_ar`, `caption_final`, `image_brief`, `image_url`, `video_brief`, `hashtags[]`, `cta`, `status ('draft'|...)`, `score_voice`, `score_dialect`, `score_hook`, `score_humor`, `score_relevance`, `score_total`, `dialect_corrections jsonb`, `scheduled_at`, `published_at`. |
| `content_research` | scraped competitor/inspiration source material |
| `content_calendar` | scheduling layer |
| `content_experiments` | A/B variants |
| `content_categories`, `content_series` | taxonomy |
| `content_ideas` | idea bank |
| `swipe_file` | inspiration archive |
| `scout_sources` | external Facebook/Instagram pages tracked (competitor / inspiration / meme / lifestyle / food / dialect) — `last_scraped_at`, `scrape_count` |
| `voice_fingerprint`, `dialect_corpus`, `negative_examples` | brand-voice training data |
| `generation_log` | record of each AI generation (cost, prompt) |
| **`post_performance`** | **manual + api** entries with `reach, likes, comments, shares, saves, link_clicks, engagement_rate`, weighted by `source_weight`, `logged_by` ('manual' \| 'api') |
| `cs_dialect_training_items` | dialect trainer items ([`20260425000000`](supabase/migrations/20260425000000_dialect_trainer.sql)) |

🟢 **`post_performance` is exactly the storage table the brief says is needed for snapshotting** ("Don't store historical IG/TikTok numbers in API responses"). It already supports both manual and api logging. Reuse.

🟠 **No `marketing_channel_snapshots` table for account-level metrics** (followers, reach, profile-visits per day). `post_performance` is per-post; we need per-account daily snapshots too. Plan to add.

### 2.3 Content Studio routes (already in app)
From `src/App.jsx`:
- `/content`, `/content-studio/*` — the v2 content studio (`src/modules/contentStudio/`)
- `/content/studio` (legacy v1), `/content/brand/setup`, `/content/brand/:id`, `/content/review`, `/content/ideas`
- Owner-only.

Edge functions powering this (from `supabase/functions/`):
- `cs-extract-concept`, `cs-generate-drafts`, `cs-evaluate-draft`, `cs-humanize-draft`, `cs-train-dialect`, `cs-scrape-wattpad`
- `social-scraper`, `auto-research`, `analyze-brand`
- `generate-content`

🟠 **The Content Studio is already a mature, sophisticated content engine.** Brief says Phase 4 builds a "Content calendar tied to Social Studio" — read as: don't rebuild the calendar, link the Marketing surface to `/content-studio` for any actual editing. Marketing's calendar view is a consumer.

---

## 3. Marketing data sources — connection state today

| Channel | Status | Evidence |
|---|---|---|
| **Instagram** | ❌ Not via official API. ⚠ Scraped via `social-scraper` edge function (mobile UA, `https://www.instagram.com/<handle>/`, `?__a=1` fallback). Fragile, rate-limit-prone. | [`supabase/functions/social-scraper/index.ts`](supabase/functions/social-scraper/index.ts) |
| **Facebook** | ❌ Not via Graph API. ⚠ Same scraper, scrapes `m.facebook.com/<handle>/`. | same |
| **TikTok** | ❌ No connector found. **NEEDS_MANUAL_VERIFY** if any account exists. | nothing in repo |
| **Google Business Profile** | ❌ No connector found. No `googleapis.com/businessprofile` call. | nothing in repo |
| **WhatsApp Business** | 🟢 **Live via Twilio.** Sandbox number `+14155238886` is the default in [`send-whatsapp/index.ts:10`](supabase/functions/send-whatsapp/index.ts), creds are in root `.env`. There's a `whatsapp_sends` log table + `whatsapp-cron` scheduled function + `record_whatsapp_send` RPC. | [`20260501020000_whatsapp_cron_recipient_rpcs.sql`](supabase/migrations/20260501020000_whatsapp_cron_recipient_rpcs.sql), [`send-whatsapp`](supabase/functions/send-whatsapp/index.ts), [`whatsapp-cron`](supabase/functions/whatsapp-cron/index.ts) |
| **Telegram** | 🟢 **Live.** Used for staff notifications (new orders), not customer marketing. | [`20260408185041_add_telegram_chat_id.sql`](supabase/migrations/20260408185041_add_telegram_chat_id.sql), [`send-telegram`](supabase/functions/send-telegram/index.ts) |
| **Email** | ❌ No connector. | nothing in repo |
| **SMS (non-WhatsApp)** | ❌ No connector. | nothing in repo |

### 3.1 Why scraping IG/Facebook is a Phase-2 problem

The `social-scraper` function works for public-page content discovery (competitor monitoring) but is the wrong tool for **own-account analytics**. The brief's Channel Analytics roll-up needs:
- Own-account followers, reach, story views, profile visits
- Per-post performance (reach, likes, comments, saves, shares)

Meta's official path: [Instagram Graph API](https://developers.facebook.com/docs/instagram-platform/) — requires a Meta-verified business app, an Instagram Professional account (not personal), Facebook Page link, and OAuth onboarding. **2–4 hours of setup, not coding.**

🟠 **Recommendation for Phase 2:** ship the manual-entry fallback first (`marketing_channel_snapshots` table, weekly numbers entered by hand). API onboarding runs in parallel. Marked in the brief as "phase 2.5".

### 3.2 TikTok specifics
TikTok Business API for analytics requires a TikTok Business account + developer-portal app review. Even more friction than Meta. **NEEDS_MANUAL_VERIFY:** does Noch have a TikTok Business profile? If not, manual-entry is the only realistic v1 path.

### 3.3 Google Business Profile
[Business Profile API](https://developers.google.com/my-business). Needs Google Cloud project + OAuth + verified location. Worth the effort because review velocity and direction-requests are leading indicators of foot traffic — exactly the brief's "leading indicators of brand health" goal. **Plan: do this connector first** in Phase 2 (lower friction than Meta if the location is already claimed in Google Maps).

---

## 4. Customer touchpoints inventory

Where do customers physically/digitally enter the funnel today?

| Touchpoint | Status | Notes |
|---|---|---|
| **In-store NFC stickers** | NEEDS_MANUAL_VERIFY — none referenced in code. | Brief mentions them as existing. If they exist they likely point at a `/loyalty/register` URL — not in routes. |
| **Loyalty QR codes** | 🟢 Live. `loyalty_qr_tokens` table; `/loyalty/qr` admin page; `loyalty-qr` + `loyalty-stamp` edge functions; `lookupLoyaltyQR()` in `src/lib/supabase.js`. Customer scans → linked to their account → stamp awarded. | Plus `pos_orders.loyalty_customer_id` linkage when cashier scans. |
| **Storefront menu** | 🟢 Live at `apps.noch.cloud/menu/:branchId` (`apps/pos/src/pages/storefront/Menu.jsx`). Bilingual EN/AR. Customers can submit guest orders via `submit_guest_order` RPC. | Captures `customer_name + customer_phone` per order. **Phone capture point.** |
| **noch.cloud landing** | 🟢 Live. After today's monorepo merge it lives at `apps/storefront/`. Tiles: Menu / Where we are / Loyalty / Shop / Presto. | EN/AR toggle. Sends customers to `/menu/<branch>`. |
| **WhatsApp orders** | NEEDS_MANUAL_VERIFY — Twilio integration is for outbound (staff → customer), not inbound order capture. Are customers messaging the WhatsApp Business number to place orders? If yes, no inbound flow is in code. | |
| **Presto (delivery aggregator)** | 🟢 Captured as a `payment_method` on `pos_orders`. POS shows "Owed by Presto" until reconciled. | This is a **customer touchpoint we don't see** — Presto's app is the actual customer surface. Only the LYD reconciliation lives here. |
| **Telegram** | Staff-only (order notifications), not customer-facing. | |

### 4.1 Phone-number capture points (deduplication risk surface)

The same phone could enter the system through:
1. `/loyalty/register` (NEEDS_MANUAL_VERIFY route — referenced in old comments as "removed")
2. POS — manual loyalty signup at the counter (`POSPinLogin` flows into `LoyaltyStamp`)
3. `submit_guest_order` from the storefront menu (creates a guest order with phone, may not auto-create a `loyalty_customers` row)

🔴 **Anti-pattern risk:** the brief explicitly warns about loyalty deduplication. The schema has `unique` on `loyalty_customers.phone`, but `pos_orders.customer_phone` (free-text, no FK) is a separate column. If guest-order phones aren't auto-linked to `loyalty_customers`, the same person will appear twice in any RFM analysis.

**Action for Phase 2:**
1. Audit current behaviour of `submit_guest_order` to see if it upserts into `loyalty_customers`.
2. One-off cleanup: phone-normalise (`+218` country code, strip whitespace/dashes), then merge.
3. Ongoing: every guest-order phone gets reconciled against `loyalty_customers.phone`.

---

## 5. NEEDS_MANUAL_VERIFY items (questions for the user before building)

1. **Phone normalisation in `loyalty_customers`.** Country code? Whitespace? Leading zero? (Determines whether RFM data is trustworthy.)
2. **Stamp linkage.** Are POS-issued stamps (`pos_orders.loyalty_stamps_awarded`) backfilled into `loyalty_stamps` rows, or do stamps only get rows when entered manually via `/loyalty/stamp`? (Determines whether the visit log is complete.)
3. **% of orders with `loyalty_customer_id` set.** A quick `select count(*) filter (where loyalty_customer_id is not null) * 100.0 / count(*) from pos_orders where status='completed'` — drives reliability of RFM Monetary.
4. **TikTok Business profile** — does Noch have one? If not, ship manual-entry only.
5. **Google Business Profile** — is the Hay Alandlous location claimed? Owner-verified?
6. **Meta Business / Instagram Professional** — is the IG account a Professional account linked to a Facebook Page? (Pre-req for Graph API.)
7. **WhatsApp inbound** — are customers messaging the WhatsApp Business number to place orders or ask questions? If yes, do we have a triage process today (manual reply)?
8. **NFC stickers in-store** — exist? Point to which URL?
9. **Loyalty register flow** — old code referenced `/loyalty/register` and `/my-card` as removed in favour of `noch.cloud/#loyalty`. **What is the current customer self-signup flow?**
10. **Marketing opt-in.** Is there any existing user consent for outbound marketing today, or do we treat all `loyalty_customers` as opt-in by default? (Compliance + dunning policy.)
11. **`scout_sources`** — is the social scraper currently being run on a schedule for competitor monitoring? Or paused?
12. **`post_performance`** — is anyone currently entering numbers manually here, or is the table empty?

---

## 6. Suggested Phase 2 sequencing (deferred to `01-mvp-plan.md` after user review)

The brief's priority order is **locked**: Channel Analytics → Customer Intelligence. Within that:

**Channel Analytics:**
1. Add `marketing_channel_snapshots` table (per-account daily snapshot).
2. Build a manual-entry form first (Settings → Marketing → "Weekly numbers"). Operator types in followers/reach/engagement once a week. **Day-1 value, no API friction.**
3. Build the dashboard reading from `marketing_channel_snapshots` + `post_performance`.
4. **In parallel**, start Google Business Profile API onboarding (lowest-friction connector).
5. Then Meta IG Graph API.
6. TikTok last (highest friction).

**Customer Intelligence:**
1. Phone-normalise + dedup `loyalty_customers` first (cleanup pass).
2. Build the RFM RPC: per-customer recency/frequency/monetary scores (1–5 each).
3. Segments table (materialised view, refreshed nightly): `customer_segments` with `customer_id, segment, computed_at`.
4. Wire `/loyalty/customers/:id` to display the segment + RFM scores.
5. Cohort retention chart on its own page (`/marketing/cohorts`).
6. Customer Profile View — extend the existing `/loyalty/customers/:id` (don't rebuild).

---

## 7. Anti-pattern check (against the brief's anti-patterns list)

| Brief said | Repo state | Mitigation |
|---|---|---|
| "Don't store historical IG/TikTok numbers in API responses." | ✅ `post_performance` already snapshots; gap is at the per-account level. | Add `marketing_channel_snapshots`. |
| "Don't trust loyalty data without deduplication." | 🟠 `phone` is unique, but storefront guest orders don't auto-link to `loyalty_customers`. Phone normalisation NEEDS_MANUAL_VERIFY. | Cleanup pass before Phase 2 ships. |
| "Don't build a generic BI tool." | 🟢 `BusinessAnalytics.jsx` is already opinionated tabs, not a builder. Marketing dashboard should follow the same pattern. | Hard-code 6–8 views. |
| "Don't build a marketing automation tool." | ✅ Out of scope for v1. WhatsApp campaigns are manual-trigger via the existing `whatsapp-cron` recipient flow. | Console UX, manual triggers. |
| "Don't surface raw data tables as dashboards." | 🟠 `/loyalty/customers` is a table today. **Acceptable** as a list view, but the Marketing landing should be the segments + cohort + channel KPIs, not this table. | Marketing's customer page uses segments first, list second. |
| "Don't auto-categorize." | n/a for marketing. | n/a. |

---

## 8. Cross-module integration checkpoints (from §"Cross-module integration notes" in the brief)

1. **Marketing campaign redemption ← POS.** Phase 4 campaigns will issue promo codes; the POS already has `apply_coupon` RPC + `pos_coupons` table (NEEDS_MANUAL_VERIFY existence — referenced in [`20260501090000_quick_wins.sql`](supabase/migrations/20260501090000_quick_wins.sql)). Reuse, don't reimplement.
2. **Finance "Marketing spend" line ← Marketing campaign costs.** When campaigns table is built (Phase 4), expose total cost via a Postgres view or RPC the Finance dashboard reads.
3. **Customer segments exposed to other modules.** Recommend: store segments in a single `customer_segments` table, not in a derived view, so other modules (a future "VIP-only menu" or "VIP WhatsApp queue") can query it directly.

---

## 9. Recommended next steps (deferred per brief — stop here)

1. Confirm the 12 NEEDS_MANUAL_VERIFY items in §5.
2. Decide: full IG Graph API onboarding now, or ship manual-entry first?
3. Walk `/loyalty` and `/content-studio` together; confirm what's missing vs the brief's Phase 2 ask.
4. Then write `01-mvp-plan.md` with concrete schema diffs + screen layouts.

**Stop here per the brief.**
