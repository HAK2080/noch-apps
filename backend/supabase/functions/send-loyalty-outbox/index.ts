// Supabase Edge Function — dispatches queued loyalty messages via Twilio.
// Triggered by pg_cron every minute (see LOYALTY_REMINDERS.sql for schedule).
//
// Required secrets (set via `supabase secrets set ...`):
//   TWILIO_ACCOUNT_SID      = AC...
//   TWILIO_AUTH_TOKEN       = (Twilio auth token)
//   TWILIO_SMS_FROM         = +18777967780      (regular SMS sender)
//   TWILIO_WHATSAPP_NUMBER  = +14155238886      (WhatsApp sandbox or production sender)
//   SUPABASE_URL            = https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = (service role key)
//
// Reads loyalty_messages_outbox.status='pending' rows that are due,
// calls Twilio for each, marks the row sent/failed.
// Up to 25 per invocation; failed messages retry up to 3 times before
// being marked 'failed'.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const T_SID  = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const T_TOK  = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const T_SMS  = Deno.env.get('TWILIO_SMS_FROM') ?? '+18777967780'
const T_WA   = Deno.env.get('TWILIO_WHATSAPP_NUMBER') ?? '+14155238886'

const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
}

async function sbGet(path: string) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { headers: SB_HEADERS })
  return r.json()
}

async function sbPatch(table: string, filter: string, payload: Record<string, unknown>) {
  const r = await fetch(SB_URL + '/rest/v1/' + table + '?' + filter, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  return r.json()
}

async function sendTwilio(channel: string, to: string, body: string): Promise<string> {
  if (!T_SID || !T_TOK) throw new Error('Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)')
  const useWA = channel === 'whatsapp'
  const fromBare = useWA ? T_WA : T_SMS
  const params = new URLSearchParams({
    From: useWA ? `whatsapp:${fromBare}` : fromBare,
    To:   useWA ? `whatsapp:${to}`       : to,
    Body: body,
  })
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${T_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${T_SID}:${T_TOK}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(`twilio:${data.code ?? res.status} ${data.message ?? 'unknown'}`)
  return data.sid as string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const nowIso = new Date().toISOString()
  const due = await sbGet(
    `loyalty_messages_outbox?select=id,channel,to_phone,message_text,attempts&status=eq.pending&scheduled_at=lte.${encodeURIComponent(nowIso)}&order=created_at.asc&limit=25`
  )

  if (!Array.isArray(due) || due.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const results: Array<{ id: string; ok: boolean; error?: string; sid?: string }> = []

  for (const m of due) {
    // optimistic lock: mark sending
    await sbPatch('loyalty_messages_outbox', 'id=eq.' + m.id, {
      status: 'sending',
      attempts: (m.attempts ?? 0) + 1,
    })
    try {
      const sid = await sendTwilio(m.channel, m.to_phone, m.message_text)
      await sbPatch('loyalty_messages_outbox', 'id=eq.' + m.id, {
        status: 'sent',
        sent_at: new Date().toISOString(),
        twilio_sid: sid,
        error: null,
      })
      results.push({ id: m.id, ok: true, sid })
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      const willRetry = (m.attempts ?? 0) + 1 < 3
      await sbPatch('loyalty_messages_outbox', 'id=eq.' + m.id, {
        status: willRetry ? 'pending' : 'failed',
        error: msg,
      })
      results.push({ id: m.id, ok: false, error: msg })
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
