// Supabase Edge Function — sends a WhatsApp message via Twilio
// Deploy: npx supabase functions deploy send-whatsapp
// Secrets: npx supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_WHATSAPP_NUMBER=...

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { to, message } = await req.json()

    if (!to || !message) {
      return json({ error: 'Missing required fields: to, message' }, 400)
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER') || '+14155238886'

    if (!accountSid || !authToken) {
      return json({ error: 'Twilio credentials not configured' }, 500)
    }

    // Normalise phone: ensure it has + prefix
    const toPhone = to.startsWith('+') ? to : '+' + to.replace(/\D/g, '')

    const params = new URLSearchParams({
      From: `whatsapp:${fromNumber}`,
      To: `whatsapp:${toPhone}`,
      Body: message,
    })

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
