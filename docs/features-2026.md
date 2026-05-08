# Noch — Features That Would Matter in 2026 and Beyond

**Author:** Opus 4.7 · **Date:** 2026-05-08 · **Audience:** Solo café operator (Tripoli, multi-branch path).

This is a long brainstorm. Not every idea below is a good idea — some are tradeoffs, some are dead-ends. The point is to map the territory so the next 12 months of build work isn't reactive. Each entry has: **goal · why now · complexity (S/M/L) · dependencies / blockers**.

The recommended top 5 to actually tackle next (after current Phase 1 stabilises) are flagged 🥇.

---

## A. Operations

### A1. 🥇 Mobile invoice OCR (dedicated section below)
The single highest-ROI 2026 feature. See §M for the implementation sketch.

### A2. Tablet self-order at table
**Goal:** customer scans table QR → orders on their phone → POS prints to bar without barista taking the order. **Why now:** the Storefront menu already works; this is the same flow + table-bound. **Complexity:** S–M (the menu page already supports `?table=N`; needs a sticky cart commit flow + bar printer integration). **Blocker:** must verify cash flow for non-loyalty customers — they'd pay at the counter on pickup.

### A3. Kitchen display system (KDS)
**Goal:** orders appear on a screen at the bar/kitchen with timer + recipe layers preview, ready button moves the order to "served." **Why now:** receipts are printed but bar timing and order sequencing is invisible. **Complexity:** M. **Dependencies:** a second tablet/screen at the bar; existing recipes already have `layers` jsonb that could render the drink visually.

### A4. Inventory auto-suggest from sales velocity
**Goal:** every Friday, the system suggests next week's order quantities based on the past 4 weeks' actual usage by ingredient (not by SKU). "You'll run out of oat milk by Tuesday." **Why now:** stock-out is the most common operational miss; we have the data. **Complexity:** M. **Dependencies:** ingredients table populated, recipe-cost mapping current, weekly stock-check entries. POSStockCheck already collects half of this.

### A5. Drive-thru / curbside flow
**Goal:** customer pulls up, opens noch.cloud, sees "I'm here" button, staff sees the order at a "ready for pickup" station. **Why now:** Tripoli traffic + parking → asks for it. **Complexity:** M (geo-trigger + station UI + push notification to staff). **Blocker:** geofence trust (the Storefront already does this for Menu).

### A6. Label printer for grab-and-go
**Goal:** when a SKU is sold via the e-commerce shop, a label prints with name, ingredients, expiry, batch. **Why now:** retail-side compliance + handoff-quality. **Complexity:** S–M. **Dependencies:** a second small ESC/POS printer + label stock + Web Bluetooth driver (already proven by current POS).

### A7. Voice-driven inventory count
**Goal:** night-shift barista counts inventory while talking ("oat milk 4 cartons, matcha 2 tins") and the system fills in. **Why now:** speech-to-text Arabic+English is finally good enough in 2026. **Complexity:** M. **Dependencies:** Whisper-API edge function; Arabic dialect handling probably best handled by sending raw audio to the existing Anthropic SDK with a tool-call schema for "log inventory line."

### A8. Shift handover note
**Goal:** end of every shift, staff types/voice-records a 1-paragraph note. Owner reads on phone. Searchable. **Why now:** Sheets/WhatsApp drift; this lives next to the shift's totals. **Complexity:** S. **Dependencies:** existing `pos_shifts.notes` already has the column; needs a UI widget.

---

## B. Customer experience

### B1. 🥇 Apple Wallet / Google Wallet loyalty pass
**Goal:** customer adds Noch loyalty card to their phone wallet. Stamps update silently via push. Birthday triggers a coupon. **Why now:** removes the QR-scan-the-screen step entirely; pass technology is mature and free for a 1k-customer book. **Complexity:** M (PassKit signing for iOS; Google Wallet API for Android). **Dependencies:** Apple developer account + Google Pay merchant account. Honestly the developer-account onboarding is the big lift, not the code.

### B2. Pre-order pickup window
**Goal:** customer orders 8 minutes ahead, picks the pickup window, drink is ready when they walk in. **Why now:** removes morning-rush wait. **Complexity:** M. **Dependencies:** the existing storefront menu + a new `requested_for` field + a queue display for the bar.

### B3. Bilingual SMS receipt
**Goal:** receipt sent via SMS to phone if loyalty customer, in their preferred language. **Why now:** Twilio is wired for WhatsApp; reuse for SMS. **Complexity:** S. **Dependencies:** customer language preference column on `loyalty_customers`.

### B4. In-app menu favorites
**Goal:** "your usual" button on noch.cloud after 3 visits, one-tap re-order. **Why now:** RFM Frequency data is already computed nightly. **Complexity:** S. **Dependencies:** customer linked to loyalty (the "linked rate" KPI in Marketing).

### B5. Customer profile self-service
**Goal:** customer can update phone, birthday, language, opt-in. **Why now:** today owner has to manually update; data goes stale. **Complexity:** S. **Dependencies:** OTP verification of phone number for self-service updates.

### B6. Tipping flow
**Goal:** at counter, customer can tap to add a tip on their card. Tracked separately from sales, distributed to staff. **Why now:** brief flagged this as missing. **Complexity:** M. **Dependencies:** Verifone tip-entry capability + `pos_orders.tip_amount` column + tip-out flow into shift attendees.

### B7. Out-of-stock graceful UX on the storefront
**Goal:** when a customer adds a sold-out item online, they get a friendly nudge to a similar one with mascot art. **Why now:** the `is_sold_out` flag exists; UI just needs to use it more visibly. **Complexity:** S.

### B8. Order status push notification
**Goal:** "your matcha is ready" push to the customer's phone (web push). **Why now:** Service Worker is already registered; web push is supported. **Complexity:** S–M. **Dependencies:** VAPID keys + a "subscribe" prompt on first order.

### B9. Receipt via WhatsApp instead of paper
**Goal:** customer says "send to WhatsApp instead" → barista taps a button → no paper. **Why now:** WhatsApp Business is wired. **Complexity:** S. **Dependencies:** Twilio template approval for transactional receipts (Meta).

---

## C. AI-driven owner intelligence

### C1. 🥇 Daily summary email/WhatsApp
**Goal:** every morning at 9 AM the owner gets one paragraph: "Yesterday: 87 orders, 1,250 LYD. Prime cost 58% (in band). Top item: matcha latte (18). Anomaly: iced coffee sales down 35% Wednesday — possibly tied to weather." **Why now:** Anthropic SDK is wired; the data is in `finance_pnl`. **Complexity:** S–M. **Dependencies:** edge function + cron + WhatsApp template.

### C2. Anomaly alerts
**Goal:** flag when a metric moves >2 standard deviations vs the same day-of-week last 4 weeks. Push to owner's phone. **Why now:** it's the single best use of AI for an operator — turn data into "should I look at this?" **Complexity:** M. **Dependencies:** a stats job; ideally written as a Postgres scheduled function (no AI call needed per-event, just the threshold).

### C3. Recipe-cost drift alarm
**Goal:** when an ingredient's cost changes >10% (e.g. matcha price jumps), every recipe touching it shows a "cost drift" badge until owner reviews. **Why now:** Libya FX volatility means matcha-cost jumps regularly. **Complexity:** S. **Dependencies:** ingredient-history snapshot + a daily diff job.

### C4. Social-post performance scoring tied to sales lift
**Goal:** when a post about Latte goes live on IG, did Latte sales rise that week? **Why now:** marketing module + content studio + POS data are in one DB. **Complexity:** M. **Dependencies:** post-to-product mapping + 2-week post-launch attribution window.

### C5. AI-suggested daily specials
**Goal:** "you have 3 days of milk left + 2 weeks of pistachio — push the pistachio matcha today." **Why now:** stock + sales velocity + recipe ingredients are all in one DB. **Complexity:** M. **Dependencies:** stock-on-hand reliability (Phase 1 cost mapping must be done first).

### C6. Customer-segment-aware push
**Goal:** an "At Risk" customer gets a different WhatsApp than a "VIP." Templates are AI-personalised. **Why now:** segments now exist. **Complexity:** M. **Dependencies:** Phase 4 campaign engine + Twilio templates.

### C7. Voice-of-customer summary
**Goal:** Google reviews + IG comments + WhatsApp feedback → weekly summary of themes. **Why now:** review velocity is rising, and reading them all manually is 30 min/week. **Complexity:** M. **Dependencies:** GBP API connector (already on the marketing roadmap).

---

## D. Hardware-adjacent

### D1. Customer-facing display (CFD)
**Goal:** small screen facing the customer at the counter showing the current order and total. Touched on in earlier brief. **Why now:** receipt errors get caught before the print. **Complexity:** M. **Dependencies:** lifting cart state to a context shared via `BroadcastChannel` so a second `/cfd` route reads it; second screen.

### D2. Scale integration for retail bag-by-weight
**Goal:** customer wants 250g of beans → digital scale's reading is read directly into the POS. **Why now:** retail SKU model assumes fixed unit weights; reality is gram-priced for beans. **Complexity:** M. **Dependencies:** Web Serial scales (most accept ESC commands or a simple polling protocol).

### D3. NFC tap-to-stamp
**Goal:** customer taps phone NFC tag on the counter pad → loyalty stamp logged + (optionally) Wallet pass updates. **Why now:** removes QR friction. **Complexity:** M. **Dependencies:** Web NFC API works on Chrome Android; iOS NFC is more limited (background tag scan only via App Clips).

### D4. Drawer-pop watchdog
**Goal:** alert if drawer is opened without a sale. Phone notification. **Why now:** `pos_audit_log` records cash-related events; needs a watcher. **Complexity:** S.

### D5. Smart bar lighting / Phillips Hue
**Goal:** light scene shifts at 6pm to "evening" — helps the brand vibe at the dial-in time. **Why now:** integration is trivial; the brand benefit is real. **Complexity:** S. **Dependencies:** Hue bridge + scheduled webhook.

---

## E. Accounting / Finance

### E1. 🥇 Mobile invoice OCR
See §M.

### E2. FX-locked supplier prepay tracking
**Goal:** when ingredients are paid for in USD/EUR, lock the LYD-equivalent at payment time. Track prepayment balance per supplier. **Why now:** Libya FX volatility means a coffee shipment paid in USD-prepay loses ~5% to revaluation if not locked. **Complexity:** M. **Dependencies:** existing `rates` table + supplier extension.

### E3. Weekly cash-drop flow
**Goal:** when daily till exceeds a threshold, prompt to drop cash to safe; record + stamp by manager. **Why now:** today this is informal. **Complexity:** S. **Dependencies:** existing `pos_cash_movements` table + a settings threshold.

### E4. Payroll calculator stub
**Goal:** monthly payroll preview (gross, deductions stub, net) per staff. Print or PDF for the bookkeeper. **Why now:** shift-log + hourly_rate is in place; this is the natural extension. **Complexity:** M. **Dependencies:** Libyan payroll-tax rules (which I don't know off the top — assume flat for v1).

### E5. CapEx ROI tracker
**Goal:** "if I buy a second La Marzocco at 8,000 USD, what's payback?" Calculation lives in the app. **Why now:** brief flagged as Phase 3; remains relevant. **Complexity:** M.

### E6. Forecast / scenario planner
**Goal:** sliders for matcha cost ±%, sales volume ±%, headcount ±. Recalc next-90-day P&L live. **Why now:** the operator can model decisions before making them. **Complexity:** M. **Dependencies:** good baseline data (which now exists post-Phase 1).

### E7. Variance vs budget
**Goal:** set a monthly budget per category. See actual vs budget bar chart. **Why now:** no budgeting today. **Complexity:** S. **Dependencies:** `expense_entries` populated.

### E8. Bank reconciliation flow
**Goal:** match bank lines to POS card-settlement deposits + expense entries. One-click reconcile. **Why now:** bank import already works; reconcile UI doesn't exist yet. **Complexity:** M.

### E9. Receipts archive
**Goal:** every uploaded invoice / receipt photo gets thumbnail + searchable filename. **Why now:** Supabase Storage is wired. **Complexity:** S. **Dependencies:** `expense_entries.receipt_url` + a gallery view.

---

## F. Marketing / Customer Engagement

### F1. 🥇 Birthday automation
**Goal:** on the customer's birthday, free-drink coupon is auto-issued + WhatsApp message sent. **Why now:** `loyalty_customers.birthday` is captured; Twilio is wired; segments + campaigns just shipped. **Complexity:** S–M. **Dependencies:** Phase 4 campaign engine OR a focused birthday job that bypasses the full engine.

### F2. Win-back template campaigns
**Goal:** automatic message when a customer hits "At Risk" segment for 7+ days. **Why now:** segments are computed nightly; this is the next-3-line implementation. **Complexity:** S. **Dependencies:** Phase 4 — but this specific case can ship before the full engine.

### F3. Referral-share QR
**Goal:** any customer can pull a unique referral QR from their loyalty page; first scan rewards both. **Why now:** `loyalty_referrals` table exists, mostly unused. **Complexity:** S–M.

### F4. UGC capture
**Goal:** "post your matcha and tag @noch.cafe → 1 stamp" — automated detection (mention scrape) + reward issue. **Why now:** Instagram scraper exists; just needs the loop. **Complexity:** M. **Dependencies:** social-scraper edge function reliability.

### F5. Reputation inbox
**Goal:** Google reviews + IG comments tagged as questions/complaints in one feed. Reply via Nochi-mascot stickers. **Why now:** brief flagged; reviews matter for foot traffic. **Complexity:** M. **Dependencies:** GBP API + IG API.

### F6. Event ticketing
**Goal:** Noch hosts an evening; sells tickets via the storefront; QR scan at door. **Why now:** brand strategy → events. **Complexity:** M. **Dependencies:** new `events` + `tickets` tables; minimal storefront extension.

### F7. Reviews ask-after-3rd-stamp
**Goal:** after a customer hits 3 stamps, automatic prompt to leave a Google review. **Why now:** GBP review velocity is the #1 leading indicator. **Complexity:** S. **Dependencies:** `loyalty-feedback` flow extended.

---

## G. Multi-branch & scale

### G1. Central kitchen / commissary tracking
**Goal:** matcha cake baked at one branch, distributed to all. Inventory transfer with proper costing. **Why now:** if Bloom expands, this is the bottleneck. **Complexity:** L. **Dependencies:** `pos_inventory_movements.movement_type='transfer'` + 2-leg posting.

### G2. Brand HQ rollup vs branch P&L
**Goal:** see consolidated P&L across all branches + HQ allocations. **Why now:** Finance MVP is per-branch; consolidated needs allocation rules. **Complexity:** M.

### G3. Franchise-style data isolation
**Goal:** future franchisees see their own data only; HQ sees all. **Why now:** RLS is permissive today. **Complexity:** M. **Dependencies:** the `staff_branches` scaffolding from earlier audit fix.

### G4. Branch comparison dashboard
**Goal:** side-by-side branch metrics — Hay Alandlous vs Jaraba vs Bloom. **Why now:** owner has 3 branches now. **Complexity:** S–M. **Dependencies:** existing `pos_sales_daily` view already does this.

### G5. Multi-currency consolidation
**Goal:** Bloom in a different currency? Roll up to LYD with locked rates. **Why now:** future-proofing. **Complexity:** M.

---

## H. Recipes & R&D

### H1. Recipe versioning
**Goal:** change a recipe → old version archived + linked to the date it was retired. Sales prior to that date use the old cost. **Why now:** today recipe edits silently overwrite. **Complexity:** M.

### H2. New-recipe development flow
**Goal:** "experimental" tag on recipes that aren't on the menu yet → cost / margin preview before launch. **Why now:** R&D is happening informally. **Complexity:** S–M.

### H3. Allergen + diet tagging
**Goal:** every recipe tagged with vegan/vegetarian/gluten-free/dairy-free flags; surfaces on storefront menu filters. **Why now:** customer ask. **Complexity:** S.

### H4. Photography library
**Goal:** drink photos uploaded once, used everywhere (POS tile, storefront card, social post). **Why now:** today images are scattered. **Complexity:** S.

### H5. Barista training tracking
**Goal:** barista marks each recipe "I've made 5 of these." Cards unlock when complete. **Why now:** training is informal. **Complexity:** S–M.

---

## I. Stock & Procurement

### I1. Auto-reorder at threshold
**Goal:** when matcha drops below 1 kg, an order draft is generated for the supplier. Owner approves. **Why now:** procurement is reactive. **Complexity:** M. **Dependencies:** supplier ↔ ingredient mapping + order-cadence hint.

### I2. Wastage tracking
**Goal:** end-of-day "I threw out 2 cups of milk" → cost recognised. **Why now:** real cafés lose 3-8% to wastage; today it's invisible. **Complexity:** S. **Dependencies:** `pos_inventory_movements.movement_type='waste'` exists in the schema vocabulary.

### I3. Theoretical vs actual stock variance report
**Goal:** "given sales × recipes, you should have X kg matcha; you actually have Y kg. Variance Z." **Why now:** the single best leak detector. **Complexity:** M. **Dependencies:** all of Phase 1 cost mapping done.

### I4. Supplier rating / on-time delivery
**Goal:** track supplier reliability over time. **Why now:** picking which supplier to expand with. **Complexity:** S.

### I5. Expiry tracking on perishables
**Goal:** dairy + matcha tins have FIFO expiry. **Why now:** wastage; food safety. **Complexity:** M.

---

## J. Brand / Storefront

### J1. Storefront analytics
**Goal:** how many people visit noch.cloud per day, which tile they tap most, where they bounce. **Why now:** the new storefront has 0 instrumentation. **Complexity:** S. **Dependencies:** Plausible / Umami / a homegrown event log.

### J2. Bilingual content unification
**Goal:** Arabic and English versions of every customer-facing string in one place. **Why now:** strings are scattered today. **Complexity:** S–M.

### J3. Storefront SEO + Open Graph
**Goal:** when noch.cloud is shared on WhatsApp, the preview card looks great. **Why now:** word-of-mouth happens via DMs. **Complexity:** S.

### J4. Theme variants for events
**Goal:** Ramadan banner, Eid theme, Halloween tile. Toggle on/off. **Why now:** noch.cloud as marketing surface. **Complexity:** S.

### J5. Photo blog / "what's brewing"
**Goal:** simple weekly post on noch.cloud. RSS-flavoured. **Why now:** storytelling beats generic ads. **Complexity:** S–M.

---

## K. Trust, Security, Compliance

### K1. Audit log surface for the operator
**Goal:** owner can search "who voided 3 orders last Tuesday." **Why now:** `pos_audit_log` exists; UI doesn't surface it. **Complexity:** S.

### K2. Server-side RLS hardening
**Goal:** flip the `using(true)` policies on POS tables to `staff_branches`-scoped. **Why now:** flagged as critical in the original audit; staff_branches scaffold is in place. **Complexity:** M.

### K3. PIN rate-limit + lockout dashboard
**Goal:** see attempts per identifier; lock a device that's brute-forcing. **Why now:** `pin_attempts` table exists. **Complexity:** S.

### K4. Two-factor for owner login
**Goal:** TOTP on owner accounts. **Why now:** owner-only SQL access matters. **Complexity:** S–M. **Dependencies:** Supabase MFA or a per-app implementation.

### K5. Receipt copy retention policy
**Goal:** old receipt photos auto-archive after N months. **Why now:** Storage cost grows. **Complexity:** S.

---

## L. Developer / Operator quality of life

### L1. Public health-check page
**Goal:** `apps.noch.cloud/health` → app version, last deploy, DB ping, channel-snapshot freshness. **Why now:** you can see "the dashboard hasn't refreshed since 4am" at a glance. **Complexity:** S.

### L2. Daily backup verification
**Goal:** Supabase auto-backs-up; we should confirm backups are restorable. **Why now:** untested backups aren't backups. **Complexity:** S.

### L3. Telegram debug bot
**Goal:** edge functions log errors to a private Telegram channel. **Why now:** Telegram is wired; observability is poor. **Complexity:** S.

### L4. Performance budget CI
**Goal:** fail PR if main JS chunk grows >10%. **Why now:** bundle creep is real. **Complexity:** S.

### L5. "Demo mode" for screenshots
**Goal:** fake data overlay so you can publish marketing screenshots without exposing real customer data. **Why now:** Noch as a SaaS template? **Complexity:** S.

---

## M. Mobile invoice OCR — dedicated implementation sketch

**The single highest-ROI feature to build next after Phase 1 stabilises.** It's the difference between expense entry being a 30-second/day chore vs a 30-minute/week one.

### What it does
Owner takes a photo of a supplier invoice with the phone, taps Upload, and a few seconds later a draft `expense_entries` row appears in "needs review" with vendor, date, line items, total, and currency pre-filled. Owner reviews, fixes typos, taps Approve.

### Provider choice (in 2026)
Three reasonable options, ordered by accuracy on Arabic invoices:

1. **Anthropic SDK with vision (Claude Sonnet/Opus 4)** — already wired in this codebase. Bilingual Arabic/English handling is excellent. Cost ~$0.015 per invoice. **Recommended.**
2. **Google Document AI** — purpose-built receipt extractors. Fast, deterministic, structured output. Arabic OCR is decent but layout extraction sometimes weak on Libyan invoice formats. Cost ~$0.03 per invoice.
3. **AWS Textract** — strong English. Arabic OCR weaker in 2025/2026. Cost ~$0.02 per invoice.

For Noch, the Anthropic path is the right pick: existing integration, best Arabic, and we can prompt it for the exact JSON we want (vendor, date, total, currency, line_items[]).

### Data flow
```
1. Owner phone:     /finance/expenses → "Scan invoice" → camera or upload
2. Frontend:        compress to ≤1024 px JPEG, POST to /functions/v1/ocr-invoice with the image
3. Edge function:
   - Stores image in supabase storage bucket `expense-receipts`
   - Calls Anthropic with a tool-call schema: extract_invoice(vendor, date, total_lyd, total_currency, currency_rate_lyd_per_unit, line_items[{name, qty, unit_cost, total}], invoice_number, supplier_id_match)
   - Looks up `suppliers` by fuzzy vendor name match (the existing `suppliers` table)
   - Inserts a draft into `expense_entries` with status='pending_review' and receipt_url
   - Returns the draft + a confidence score
4. Frontend:        shows the draft in a "Needs review" panel, owner edits + Approves
5. On Approve:      status='approved'; visible in normal expense list
```

### Schema additions
```sql
alter table expense_entries
  add column if not exists status text default 'approved' check (status in ('pending_review','approved')),
  add column if not exists ocr_confidence numeric(3,2),
  add column if not exists ocr_raw_response jsonb,
  add column if not exists invoice_number text,
  add column if not exists currency text default 'LYD',
  add column if not exists fx_rate_lyd numeric(8,4);
```

Existing columns (vendor, paid_at, amount_lyd, receipt_url) are reused. `currency` + `fx_rate_lyd` lock the exchange rate at receipt time so a USD invoice stays correctly valued in LYD even if the rate moves later.

### Edge cases
- **Multi-page invoice:** stitch into one image client-side or accept up to N images per upload.
- **Handwritten:** confidence score gates auto-fill; <0.7 → all fields blank, just attach the image.
- **Duplicate:** match on (supplier_id, invoice_number) or (date, total) → warn before insert.
- **Foreign-currency invoice with no FX rate set:** flag the draft and ask for FX before approval.
- **Multi-line item splits across categories:** v1 = single category per invoice (whole invoice goes to e.g. "supplies"); v2 = per-line categorisation.

### UI
- Big phone-friendly camera capture button on `/finance/expenses` mobile view.
- A "Needs review (3)" badge on the Expenses tab when drafts are pending.
- Draft view: image on left, extracted fields on right with confidence-coloured borders (green ≥ 0.85, amber 0.6–0.85, red < 0.6). Owner taps any field to override.

### Cost projection (1 store, ~10 invoices/week)
- Anthropic vision @ ~$0.015/call × ~520 invoices/year = **~$8/year per store.**
- Storage: assume 1 MB JPEG × 520 = 520 MB/year/store = negligible at Supabase Storage prices.
- Engineering: 2-3 days for v1 (edge function + 2 schema columns + UI panel).

### Ship plan
1. Schema migration adds the 5 columns.
2. Edge function `ocr-invoice` deployed.
3. UI: scan button on Expenses tab + draft review panel.
4. Approve action moves status `pending_review → approved` and triggers no further action (the row now flows like a normal expense).

---

## Recommended next 5 (after Phase 1 stabilises with 2 weeks of usage)

In priority order:

1. **Mobile invoice OCR** (§M / E1). Highest unit-of-time saved per day.
2. **Apple/Google Wallet loyalty pass** (§B1). Removes the QR friction; significant retention bump in the literature.
3. **Daily summary email/WhatsApp** (§C1). Turns the new dashboards into a habit.
4. **Birthday automation** (§F1). Cheap, delightful, repeatable.
5. **Recipe versioning** (§H1). Quietly fixes silent data loss; cheap insurance.

Each is S–M complexity. All five together would be ~2 weeks of focused build (with the OCR being the largest chunk). If we ship them in this order, by mid-June we'd have a noticeably smarter, more delightful operation.

Items 6–10 next: Anomaly alerts (C2), KDS (A3), CFD (D1), Variance vs budget (E7), Bank reconciliation (E8).
