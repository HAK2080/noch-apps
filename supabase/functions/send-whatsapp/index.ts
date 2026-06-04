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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // Accepts either:
    //   - free-form: { to, message, mediaUrl? }            (24h session window)
    //   - template:  { to, contentSid, contentVariables? } (proactive, approved)
    const { to, message, mediaUrl, contentSid, contentVariables } = await req.json()

    if (!to || (!message && !contentSid)) {
      return json({ error: 'Missing required fields: to, and (message or contentSid)' }, 400)
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || '+14155238886'
    const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')

    if (!accountSid || !authToken) {
      return json({ error: 'Twilio credentials not configured' }, 500)
    }

    // Normalise phone: ensure it has + prefix
    const toPhone = to.startsWith('+') ? to : '+' + to.replace(/\D/g, '')

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
