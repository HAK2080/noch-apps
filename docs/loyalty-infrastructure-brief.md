# Nochi Loyalty Infrastructure — Map & Investigation Brief

> Purpose: a single-source map of the Nochi loyalty system so we can scope
> further AI work (OpenAI and/or other modules). Snapshot date: 2026-06-05.
> Project: `AI apps/Noch_apps_May_2026` (v4.3.0). Prod Supabase `kxqjas…`.

---

## 1. What the loyalty system is

A café loyalty + CRM + lifecycle-marketing stack for Noch (Libya, Arabic-first).
Customers earn **stamps** → **rewards** (free drink), have a **tier**, a streak,
a playful "**Nochi**" mascot state, and receive **lifecycle WhatsApp** messages
(anniversary, birthday, win-back, etc.). There is a public QR feedback mini-site
and a points system. An owner-facing **Marketing dashboard** segments customers
and surfaces AI insights.

Scale today (early/seed data): **31 customers, 16 stamps, 10 feedback rows,
0 rewards issued, 22 whatsapp_sends, 23 outbox rows.** → small enough that any
ML/LLM approach must work in a *cold-start / low-data* regime.

---

## 2. Database layer (20 tables)

**Core identity & progress**
- `loyalty_customers` (48 cols) — the hub. Identity (`phone`, `phone_normalised`,
  `full_name`, `language`/`preferred_language`), progress (`current_stamps`,
  `total_stamps`, `total_visits`, `current_streak`, `longest_streak`,
  `last_visit_at`, `tier`, `points`), mascot (`nochi_state`, `nochi_name`),
  lifecycle flags (`is_phoenix`, `revival_count`, `is_founder`, `founder_seat`),
  preferences (`favorite_drink`, `favorite_drinks`, `milk_preference`,
  `sweetness_preference`), social (`instagram_handle`, `tiktok_handle`,
  `facebook_handle`, `ugc_consent`), consent (`marketing_opt_in`,
  `whatsapp_opt_in`, `consent_source`), referrals (`referred_by_id`,
  `referral_code`), `birthday`/`birthday_day`/`birthday_month`, `notes`.
- `loyalty_customers_archive` (50) — soft-delete archive (hard delete blocked by trigger).
- `loyalty_stamps` (7), `loyalty_rewards` (13) — earn/redeem ledger.
- `loyalty_settings` (45) — global config (stamp goal, points-per-feedback,
  free-drink goal, reward toggles, template SIDs, etc.).

**Engagement / gamification**
- `loyalty_challenges` (12) + `loyalty_challenge_progress` (8)
- `loyalty_spin_prizes` (8) + `loyalty_spins` (5) — spin wheel
- `loyalty_customer_badges` (4), `loyalty_gestures` (6) — manual "gestures"
- `loyalty_referrals` (5), `loyalty_recent_events` (5)

**Feedback & messaging**
- `loyalty_feedback` (15) — QR mini-site feedback (guest-capable; negative → task).
- `loyalty_messages_outbox` (14) — queued lifecycle messages (channel/status model).
- `whatsapp_sends` (9) — send log (customer_id, phone, template, trigger_name,
  status, error, payload_key) used for dedupe + channel analytics.
- `loyalty_qr_tokens` (8) — short-lived QR login/scan tokens.
- `loyalty_nochi_day_runs` (6), `loyalty_customer_duplicates` (3).

---

## 3. RPC layer (Postgres functions)

**Earn / redeem / identity**
`award_loyalty_stamp`, `redeem_my_reward`, `get_my_loyalty_card`,
`signup_loyalty_customer`, `loyalty_normalize_phone` / `loyalty_to_e164`,
`generate_loyalty_code` / `validate_loyalty_code` / `consume_loyalty_code` /
`_loyalty_random_code`.

**Lifecycle batch "runs"** (called by cron/edge):
`loyalty_birthday_run`, `loyalty_expiring_run`, `loyalty_inactivity_run`,
`loyalty_nochi_day_run`, `grant_birthday_rewards_today`, `loyalty_send_welcome`,
`loyalty_queue_message`, `loyalty_tier_change_trigger`.

**WhatsApp eligibility selectors** (feed `whatsapp-cron`):
`whatsapp_anniversary_recipients`, `whatsapp_birthday_recipients`,
`whatsapp_lapsed_recipients`, `whatsapp_streak_save_recipients`,
`whatsapp_weather_iced_recipients`, `whatsapp_phoenix_recipients`,
`wa_segment_reward_ready`, `record_whatsapp_send`.

**Gamification / social**: `bump_challenge_progress`, `get_challenge_progress`,
`list_active_challenges`, `resolve_referral_code`, `fn_referral_first_stamp`,
`fn_loyalty_check_founder`.

**Analytics**: `get_loyalty_stats`, `owner_insights_near_reward`, `submit_feedback`.

---

## 4. Edge functions (Deno / Supabase)

| Function | Role | JWT |
|---|---|---|
| `whatsapp-cron` | Nightly orchestrator (06:00 UTC). Reads eligibility RPCs, fires `send-whatsapp` per recipient, logs to `whatsapp_sends`. Triggers: anniversary/birthday/lapsed/streak/weather/phoenix. | false |
| `send-whatsapp` | Twilio sender. Free-form OR approved template; resolves `templateName`→Content SID via `TEMPLATE_SIDS` map. **Spends money.** | true |
| `loyalty-stamp` | Award a stamp (server-side). | — |
| `loyalty-qr` | QR token issue/lookup. | — |
| `loyalty-feedback` | Feedback submit path (also via `submit_feedback` RPC). | — |
| `loyalty-notify` | ⚠️ **Telegram-only legacy** — powers the "Send Nochi Message" buttons but never sends WhatsApp. | — |
| `send-telegram` / `telegram-webhook` / `get-telegram-ids` | Telegram channel. | — |
| `process-reminders` | Hourly cron for task reminders (Telegram). | — |

---

## 5. Frontend (owner-facing, `apps/pos/src`)

**Loyalty module** (`modules/loyalty/`): `LoyaltyDashboard`, `LoyaltyCustomers`,
`CustomerDetail` (stamp/redeem/gestures/"Send Nochi Message"), `LoyaltyRewards`,
`LoyaltyStamp`, `LoyaltyQR`, `LoyaltySpinWheel`, `LoyaltyLeaderboard`,
`LoyaltyFeedback` (inbox), `LoyaltyGestures`, `LoyaltySettings`,
**`LoyaltyIntelligence`** (rule-based segments: at_risk, drifting, …).
Components: `StampCard`, `BadgeGrid`, `NochiAnimation`/`NochiBunny`,
`CustomerRegisterForm`.

**Marketing module** (`modules/marketing/`): `MarketingDashboard` + tabs —
Campaigns, Challenges, ChannelAnalytics, Cohorts, ContentCalendar, Customers,
**Insights**, Reputation, UGC. Data via `marketing-supabase.js`.

**Customer-facing**: `pages/storefront/Feedback.jsx` (QR mini-site).

---

## 6. Messaging & channels

- **WhatsApp (Twilio)** — primary. Working as of 2026-06-05. Real WABA sender
  `+218935516524`; approved Arabic templates for anniversary/streak/birthday/
  lapsed/weather/back-in-stock/reward-ready. Business-initiated messages **must**
  be templates (WhatsApp rule; free-form only inside 24h → error 63016).
- **Telegram** — legacy/secondary (`loyalty-notify`, reminders).
- **Outbox model** — `loyalty_messages_outbox` + `loyalty_queue_message` RPC is
  a generic queue that is **underused** vs. the direct `whatsapp-cron` path.

---

## 7. Current AI footprint

- **Provider: 100% Anthropic Claude** today. Models in use across edge functions:
  `claude-opus-4-5` (9×), `claude-sonnet-4-20250514` (8×), `claude-sonnet-4-6` (5×).
- **`analytics-ai-insights`** — Claude as "café ops consultant": returns JSON
  {opportunities, cost_cuts, anomalies, actions} from business data. This is the
  closest existing pattern to reuse for loyalty.
- **Content Studio** (`cs-*` functions) — Claude for content generation/dialect.
- **Secrets present: `ANTHROPIC_API_KEY` AND `Openai_API_KEY`.** The OpenAI key
  exists but is **currently unused** (no code references OpenAI). ← key fact for
  this investigation.
- **`LoyaltyIntelligence` segmentation is rule-based** (hardcoded day thresholds),
  not ML/LLM.

---

## 8. Gaps / opportunities to investigate (where AI could plug in)

1. **Personalized message generation** — today messages are fixed approved
   templates with `{{1}},{{2}}` slots. Investigate: LLM-drafted, per-customer
   copy (respecting WhatsApp template constraints) using `favorite_drink`,
   `nochi_state`, streak, language. *Constraint: business-initiated WhatsApp must
   stay within approved templates — LLM can pick/parameterize, not free-write.*
2. **Smarter segmentation / churn scoring** — replace hardcoded "14+ days =
   at_risk" with a churn/propensity model. *Cold-start: 31 customers → start with
   LLM-assisted heuristics, not trained ML.*
3. **Next-best-action per customer** — given history, recommend stamp nudge vs.
   win-back vs. reward. Reuse the `analytics-ai-insights` JSON pattern.
4. **Feedback intelligence** — cluster/classify `loyalty_feedback` reason_tags +
   free-text (Arabic) into themes; auto-prioritize. Already auto-creates tasks on
   negative; LLM could summarize trends.
5. **"Send Nochi Message" fun buttons** — currently Telegram-only & broken on
   WhatsApp. Needs approved templates; LLM could generate template *variants* for
   submission, then parameterize at send time.
6. **Optimal send timing / cadence** — `whatsapp_sends` + visit history could
   feed a send-time model. Low data today.
7. **Outbox unification** — consider routing all lifecycle messages through
   `loyalty_messages_outbox` so AI selection/scheduling has one chokepoint.

---

## 9. Concrete questions for the OpenAI / next investigation

- **Why OpenAI here?** The stack is Claude-native and that works well. Define the
  intended OpenAI role: (a) cheaper/faster classification & embeddings
  (segmentation, feedback clustering), (b) a second opinion / eval, or (c) a
  specific capability (e.g. `text-embedding-3` for customer/feedback similarity)?
  *Recommendation to validate: use OpenAI embeddings for segmentation/feedback
  similarity; keep Claude for long-form Arabic copy & insights.*
- **Where does inference run?** New Supabase edge function(s) mirroring
  `analytics-ai-insights` (server-side, key stays secret). Confirm `Openai_API_KEY`
  casing is wired into the new function's `Deno.env.get`.
- **Data contract** — which RPC(s) export the customer/feedback feature set for the
  model? (`get_loyalty_stats`, a new `loyalty_customer_features` view?)
- **Guardrails** — Arabic/Libyan dialect quality, WhatsApp template compliance,
  PII handling (phones), and cost per run at scale.
- **Eval** — with only 31 customers, how do we measure lift? Define a manual
  review loop before any automated sending.

---

## 10. Key files to read next

- `supabase/functions/whatsapp-cron/index.ts` — lifecycle orchestration
- `supabase/functions/send-whatsapp/index.ts` — template send + `TEMPLATE_SIDS`
- `supabase/functions/analytics-ai-insights/index.ts` — AI insight pattern to clone
- `apps/pos/src/modules/loyalty/pages/LoyaltyIntelligence.jsx` — current rule-based segments
- `apps/pos/src/modules/marketing/lib/marketing-supabase.js` — marketing data access
- `apps/pos/src/lib/supabase.js` — `sendLoyaltyNotification`, `notifyStampGranted`, helpers
- `apps/pos/src/lib/whatsapp.js` — `sendWhatsApp` / `sendWhatsAppTemplate`
