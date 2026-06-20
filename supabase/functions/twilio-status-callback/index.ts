import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || ''

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    if (!TWILIO_AUTH_TOKEN) return json({ error: 'Twilio auth token not configured' }, 500)

    const contentType = req.headers.get('content-type') || ''
    let payload: Record<string, string> = {}

    if (contentType.includes('application/json')) {
      payload = await req.json()
    } else {
      const form = await req.formData()
      for (const [key, value] of form.entries()) payload[key] = String(value)
    }

    const signature = req.headers.get('x-twilio-signature') || ''
    const url = req.url
    const signedData = Object.keys(payload)
      .sort()
      .reduce((acc, key) => acc + key + payload[key], url)
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(TWILIO_AUTH_TOKEN),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    )
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedData))
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
    if (signature !== expected) return json({ error: 'Invalid Twilio signature' }, 403)

    const messageSid = payload.MessageSid || payload.SmsSid
    const messageStatus = payload.MessageStatus || payload.SmsStatus || payload.MessageStatusCallback
    const errorCode = payload.ErrorCode || null
    const errorMessage = payload.ErrorMessage || null

    if (!messageSid || !messageStatus) {
      return json({ error: 'Missing MessageSid or MessageStatus' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const failed = ['failed', 'undelivered'].includes(messageStatus)
    const update = {
      provider_status: messageStatus,
      status: failed ? 'failed' : 'sent',
      error_text: failed ? (errorMessage || errorCode || 'Twilio delivery failed') : null,
      failed_at: failed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await admin
      .from('notification_outbox')
      .update(update)
      .eq('provider_message_id', messageSid)

    if (error) throw error

    return json({ ok: true })
  } catch (err) {
    return json({ error: (err as Error).message || 'Internal error' }, 500)
  }
})
