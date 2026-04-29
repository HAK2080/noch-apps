// Supabase Edge Function — sends a WhatsApp message via Twilio
// Deploy: npx supabase functions deploy send-whatsapp
// Secrets: npx supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_WHATSAPP_NUMBER=...
//
// Two send modes:
//   1) Free-text: { to, message }
//      Works in sandbox AND in production inside the 24h customer service window.
//   2) Template:  { to, templateName, templateVariables }
//      Required in production for any outbound outside the 24h window. Each
//      template must be Meta-approved first; see WHATSAPP_TEMPLATES.md.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map of template name → Twilio Content SID. Populate after Meta approves
// each template (Twilio Console → Messaging → Content Templates → copy SID).
// Names here must match WHATSAPP_TEMPLATES.md.
// Filled in 2026-04-28. Templates pending Meta approval can still be
// referenced — Twilio returns a 4xx the edge function passes back, and
// the caller (which uses .catch(() => {})) silently swallows it. Once
// Meta approves a template, sends just start working.
const TEMPLATE_SIDS: Record<string, string> = {
  staff_invite: 'HX65adb2b2b1458eb7eb97397f03b65c66',           // resubmitted 2026-04-29 with mid-sentence URL
  loyalty_stamp_earned: 'HX89f5ce59c0ee9cf028a86860c9c30219',
  loyalty_reward_ready: 'HXd1df8cc058afd9e1812ad2881ee9de1e',
  order_pending_confirm: 'HX22d413fd4c3b5889115a100f193dfc79',
  order_ready_pickup: 'HX364e907491fa3eba180a0d8689a1a30e',     // resubmitted 2026-04-29 after Meta rejection
  loyalty_lapsed_checkin: 'HX1bcf158d960d649731d8026e86c70aa5',
  loyalty_visit_feedback: 'HX7817d895460872978be7411662b11fbe',
  loyalty_marketing_birthday: 'HX2d934c0762f0b623e080b1d382f7c5b1',
  marketing_weather_iced: 'HX20bba1bda93bfd0291b1f2428bd8d6f2',
  marketing_streak_save: 'HXf13e53d06f67f28309bd4b1ad29f0eaf',
  marketing_back_in_stock: 'HX16c84ac97be895be6c153b3414e92976',
  // marketing_anniversary: TODO — paste HX SID when visible in Twilio
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { to, message, templateName, templateVariables } = await req.json()

    if (!to) return json({ error: 'Missing required field: to' }, 400)
    if (!message && !templateName) {
      return json({ error: 'Provide either message (free-text) or templateName (Meta-approved template)' }, 400)
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || '+14155238886'

    if (!accountSid || !authToken) {
      return json({ error: 'Twilio credentials not configured' }, 500)
    }

    // Normalize phone: Libyan local numbers (09XXXXXXXX) get +218 prepended.
    // Already-international (+...) passes through.
    let toPhone: string
    if (to.startsWith('+')) {
      toPhone = to
    } else {
      const digits = to.replace(/\D/g, '')
      if (digits.startsWith('0') && digits.length === 10) {
        toPhone = '+218' + digits.slice(1)
      } else if (digits.startsWith('218')) {
        toPhone = '+' + digits
      } else {
        toPhone = '+' + digits
      }
    }

    const params = new URLSearchParams({
      From: `whatsapp:${fromNumber}`,
      To: `whatsapp:${toPhone}`,
    })

    if (templateName) {
      const sid = TEMPLATE_SIDS[templateName]
      if (!sid) {
        return json({
          error: `Unknown or not-yet-approved template: ${templateName}. Add the SID to TEMPLATE_SIDS in send-whatsapp/index.ts after Meta approval.`,
        }, 400)
      }
      params.set('ContentSid', sid)
      if (templateVariables && typeof templateVariables === 'object') {
        params.set('ContentVariables', JSON.stringify(templateVariables))
      }
    } else {
      params.set('Body', message)
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )

    const data = await res.json()

    if (!res.ok) {
      return json({ error: data.message ?? 'Twilio API request failed', code: data.code }, res.status)
    }

    return json({ messageId: data.sid, status: 'sent', mode: templateName ? 'template' : 'freetext' })
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
