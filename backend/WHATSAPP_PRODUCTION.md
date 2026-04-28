# WhatsApp Business Production Setup — Twilio + Meta

Guide for switching off the Twilio WhatsApp **sandbox** (`+14155238886`, customers must text "join mood-same" first) and getting a production sender. End-to-end timeline: ~10–14 days, mostly Meta review.

## What you need before you start

Gather these into one folder. Twilio + Meta will ask for them.

- [ ] **Meta Business Manager account** with a Facebook business page for Noch (https://business.facebook.com).
- [ ] **Business verification documents:** trade license, tax registration, utility bill in the business name. PDFs preferred. Meta accepts Libyan business docs but expects English/Arabic translation if not in Latin script.
- [ ] **A dedicated phone number** that:
  - Has SMS / voice service active.
  - Is **not registered with WhatsApp** (personal or business). If it is, deregister it from WhatsApp first (Settings → Account → Delete account in the WhatsApp app).
  - Is reachable for the OTP verification call.
- [ ] **A Twilio account** with Pay-as-you-go balance topped up (~$25 minimum). Sandbox is free; production sender has a one-time setup + per-message cost.
- [ ] **A display name** for the sender, e.g. "Noch" or "Noch Café". Meta enforces guidelines: no generic words, no celebrity names, must match the business.
- [ ] **A profile photo** (square, 640×640 PNG/JPG, business logo).
- [ ] **A short description** (≤139 chars) shown in the customer's WhatsApp profile view.

## Step 1 — Twilio Console

1. Sign in at https://console.twilio.com.
2. Left nav → **Messaging** → **Senders** → **WhatsApp senders**.
3. Click **Create new sender** → **Continue**.
4. Choose your phone number (the dedicated one above) and confirm OTP.
5. Fill the WhatsApp Business profile form (display name, photo, description, business category — pick "Food & beverage").
6. Twilio submits to Meta. Status moves to **Pending review**.

## Step 2 — Meta review (5–10 days typical)

Meta verifies:
- The phone number isn't on WhatsApp elsewhere.
- The business exists and the docs match.
- The display name is policy-compliant.

If rejected, the dashboard shows the reason. Most common rejections:
- Display name too generic ("Coffee", "Café"). Fix: use brand name "Noch".
- Business not verified in Meta Business Manager. Fix: complete business verification at business.facebook.com → Business settings → Security center.

## Step 3 — Submit message templates (parallel to Step 2)

You can only send free-text WhatsApp inside a **24-hour customer service window** (a 24h window opens whenever the customer messages you). For all other outbound — order confirmations, loyalty stamp notifications, reminders — you must use a Meta-approved template.

Templates take 1–3 days each to approve. Submit day-1 so they're ready when the sender is.

Template list to submit — see `WHATSAPP_TEMPLATES.md` in this repo.

## Step 4 — When approved

1. Twilio dashboard shows the production WhatsApp number, e.g. `+218XXXXXXXXX`.
2. Set the secret on Supabase:
   ```
   npx supabase secrets set TWILIO_WHATSAPP_NUMBER=+218XXXXXXXXX
   ```
3. No code redeploy needed — the edge function reads the env var at request time.
4. Test from the admin app: send a WhatsApp staff-invite. Recipient gets the message **without** the "join mood-same" prompt.

## Step 5 — Switch staff invites + customer notifications to templates

Once at least one template is approved, the edge function needs a new code path that sends template messages instead of free-text when targeting a customer outside the 24h window. See `supabase/functions/send-whatsapp/index.ts` — the `templateName` and `templateVariables` parameters are stubbed but inactive until you uncomment the template branch and pass approved template names from the caller.

## Costs (rough, 2026 rates)

- One-time Meta verification fee: $0 (Meta covers it for verified businesses).
- Twilio per-message: $0.005–0.02 outside the conversation window (template messages count). Inside 24h window: free conversation.
- Customer-initiated messages cost nothing (still inside window).

For a coffee shop with ~200 outbound WhatsApp/day, expect ~$30–60/month.

## Reverting / reset

If you need to roll back to the sandbox during testing:
```
npx supabase secrets unset TWILIO_WHATSAPP_NUMBER
```
The edge function falls back to `+14155238886` (sandbox).
