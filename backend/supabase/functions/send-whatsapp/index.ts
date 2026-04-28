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
const TEMPLATE_SIDS: Record<string, string> = {
  // staff_invite: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  // loyalty_stamp_earned: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  // loyalty_reward_ready: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  // order_pending_confirm: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  // order_ready_pickup: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  // inventory_review_digest: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  // loyalty_marketing_birthday: 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
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

    const toPhone = to.startsWith('+') ? to : '+' + to.replace(/\D/g, '')

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
