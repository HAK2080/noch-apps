// Supabase Edge Function — sends a WhatsApp message via Twilio.
// Free-form { to, message, mediaUrl? } for the 24h session window, OR an
// approved template { to, contentSid, contentVariables? } via the Content API
// for proactive business-initiated messages.
// Deploy: npx supabase functions deploy send-whatsapp
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and one sender —
//   TWILIO_MESSAGING_SERVICE_SID (recommended for templates) or TWILIO_WHATSAPP_NUMBER.


const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Approved WhatsApp template name → Twilio Content SID (HX…).
// Single source of truth so callers (whatsapp-cron, frontend) can pass a
// human-readable template name and we resolve it here. Verified against the
// Twilio Content API on 2026-06-05. Add new rows here once a template is
// approved in Twilio.
const TEMPLATE_SIDS: Record<string, string> = {
  marketing_anniversary:      'HX0ed864bf6d201c75b435358efa9ebbd6',
  marketing_streak_save:      'HXf13e53d06f67f28309bd4b1ad29f0eaf',
  marketing_back_in_stock:    'HX16c84ac97be895be6c153b3414e92976',
  marketing_weather_iced:     'HX20bba1bda93bfd0291b1f2428bd8d6f2',
  loyalty_marketing_birthday: 'HX2d934c0762f0b623e080b1d382f7c5b1',
  loyalty_lapsed_checkin:     'HX1bcf158d960d649731d8026e86c70aa5',
  loyalty_reward_ready:       'HXd1df8cc058afd9e1812ad2881ee9de1e',
  // loyalty_phoenix_revival: not yet approved in Twilio — add SID once live.
}

function normaliseWhatsAppPhone(input: string): string {
  const trimmed = String(input || '').trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')

  // Libya mobile numbers are commonly stored locally as 09xxxxxxxx.
  // Twilio requires E.164, so convert those to +2189xxxxxxxx instead
  // of the invalid +09xxxxxxxx shape.
  if (/^09\d{7,9}$/.test(digits)) return `+218${digits.slice(1)}`
  if (/^9\d{7,9}$/.test(digits)) return `+218${digits}`
  if (/^2189\d{7,9}$/.test(digits)) return `+${digits}`

  return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // Accepts either:
    //   - free-form: { to, message, mediaUrl? }                  (24h session window)
    //   - template:  { to, contentSid, contentVariables? }       (proactive, approved)
    //   - template by name: { to, templateName, templateVariables? }
    //       (resolved to a Content SID via TEMPLATE_SIDS — used by whatsapp-cron)
    const body = await req.json()
    const { to, message, mediaUrl, templateName } = body

    // Resolve the Content SID: explicit contentSid wins, else map the name.
    let contentSid: string | undefined = body.contentSid
    if (!contentSid && templateName) {
      contentSid = TEMPLATE_SIDS[templateName]
      if (!contentSid) {
        return json({ error: `Unknown or unapproved template: ${templateName}` }, 400)
      }
    }
    // Accept either spelling of the variables map.
    const contentVariables = body.contentVariables ?? body.templateVariables

    if (!to || (!message && !contentSid)) {
      return json({ error: 'Missing required fields: to, and (message, contentSid, or templateName)' }, 400)
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || '+14155238886'
    const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')

    if (!accountSid || !authToken) {
      return json({ error: 'Twilio credentials not configured' }, 500)
    }

    const toPhone = normaliseWhatsAppPhone(to)

    const params = new URLSearchParams({ To: `whatsapp:${toPhone}` })
    // Prefer a Messaging Service (recommended for templates); else the from number.
    if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid)
    else params.set('From', `whatsapp:${fromNumber}`)

    if (contentSid) {
      // Approved-template send via Twilio Content API.
      params.set('ContentSid', contentSid)
      if (contentVariables) {
        params.set('ContentVariables',
          typeof contentVariables === 'string' ? contentVariables : JSON.stringify(contentVariables))
      }
    } else {
      // Free-form session message.
      params.set('Body', message)
      if (mediaUrl) params.set('MediaUrl', mediaUrl)
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

    return json({ messageId: data.sid, status: 'sent' })
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
