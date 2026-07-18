# Noch 5.0 — Receipt Snap
## Release: 2026-07-17

The compliance fix for expense entry: staff submit receipts by **photo only**.
No forms, no typing, no excuses. AI does the data entry; the office reviews.

## New

### Receipt Snap — Telegram door
- Send a receipt photo to the existing Noch bot → AI reads vendor/amount/date/category (Arabic + English)
- One tap picks the branch — AI pre-suggests (⭐) when the receipt hints at one
- ⚖️ Split evenly across branches, or ✏️ custom split in plain text ("300 سيتي ووك، 150 قالاريا")
- Photo caption is passed to the AI as a hint

### Receipt Snap — PWA door
- `/snap` — camera-first page, installable to the Android home screen as **Noch Snap**
- Snap → AI reads → tap branch → ✓ → camera again (built for a stack of receipts)
- Same branch/split options as the bot

### Under the hood
- New edge function `expense-snap` (extract / finalize / custom-split parse) — Claude Haiku 4.5 vision, ~$0.004 per receipt
- `telegram-webhook` extended (photos + inline buttons); task-reply behavior unchanged
- `expenses.receipt_group_id` + `expenses.source`; new `expense_snaps` pending-state table
- Everything lands as `status='pending'` in the existing Expenses review flow; unreadable amounts flagged for office correction

Setup: see `RECEIPT_SNAP_SETUP.md`.

## Versioning
- App version: 3.6.0 → **5.0.0** (4.x was used by the Content Studio 2.0 "Noch 4.0" line)
