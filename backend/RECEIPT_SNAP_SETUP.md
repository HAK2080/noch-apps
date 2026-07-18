# Noch 5.0 — Receipt Snap Setup

Photo-only expense submission for staff. Two doors, one brain:

- **Telegram bot** — staff send a receipt photo to the existing Noch bot → AI reads it → tap a branch button → done.
- **PWA** — `apps.noch.cloud/snap` — camera-first page, installable to the Android home screen ("Noch Snap").

Both create rows in the existing `expenses` table with `status='pending'`; you review/approve in the Expenses page exactly as today. Staff never type anything (custom split is the only optional text).

---

## 1. Run the SQL (Supabase SQL Editor)

Run [`supabase/migrations/20260717000000_receipt_snap.sql`](supabase/migrations/20260717000000_receipt_snap.sql).

What it does (all additive):
- `expenses.receipt_group_id` — links rows created by a split
- `expenses.source` — `'snap_telegram' | 'snap_pwa' | 'manual'`
- `cost_centers.include_in_split` — CC00 (CEO) and CC99 (MD) excluded from "split evenly"
- New `expense_snaps` table — pending photo state while awaiting the branch tap
- Creates the `expense-receipts` storage bucket if it doesn't already exist

## 2. Deploy the edge functions

```bash
cd backend
supabase functions deploy expense-snap
supabase functions deploy telegram-webhook   # redeploy — extended, task-reply behavior unchanged
```

Secrets — all already set for existing functions, verify they exist:
- `ANTHROPIC_API_KEY` (used by extract-recipe already)
- `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

Then open the telegram-webhook function URL in a browser once (GET) to re-register the webhook.

> Note: `expense-snap` is called by `telegram-webhook` with the service key, and by the
> PWA with the user's session. If your functions deploy with JWT verification ON, both
> paths already send valid Authorization headers — nothing to change.

## 3. Frontend

Deploys automatically with the admin app (push to master). New:
- Route `/snap` (any logged-in staff)
- `public/snap-manifest.webmanifest`, `snap-sw.js`, `snap-icon.svg`

## 4. Staff onboarding (the whole training)

**Telegram:** "Send receipt photos to the Noch bot. Tap your branch when it asks."
Requires their `profiles.telegram_chat_id` to be linked (same linking as task reminders).

**PWA:** open `apps.noch.cloud/snap` in Chrome on their phone → menu → *Add to Home screen* → a "Noch Snap" icon appears. Opens straight into the camera.

## 5. How review works (you)

- Everything lands as `pending` in the Expenses page, receipt photo attached.
- AI fills vendor/amount/date/category; anything unreadable is left blank or flagged
  `[AI low confidence — verify]` in the description — fix at approval time.
- Split receipts appear as one row per branch, tagged `(split 1/3)` etc., sharing
  a `receipt_group_id` and the same photo.

## Costs

~$0.003–0.005 per receipt (Claude Haiku 4.5 vision). 1,000 receipts/month ≈ $4–5.
