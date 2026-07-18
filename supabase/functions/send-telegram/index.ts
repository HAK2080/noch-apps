// Supabase Edge Function — sends a Telegram message via Bot API
// Deploy: npx supabase functions deploy send-telegram
// Secrets: npx supabase secrets set TELEGRAM_BOT_TOKEN=...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'


const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function requireAuthorizedCaller(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json({ error: 'missing Authorization' }, 401)
  if (SERVICE_KEY && token === SERVICE_KEY) return null

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'invalid token' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!['owner', 'supervisor', 'staff'].includes(profile?.role)) {
    return json({ error: 'forbidden' }, 403)
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const authError = await requireAuthorizedCaller(req)
    if (authError) return authError

    const { chat_id, message } = await req.json()

    if (!chat_id || !message) {
      return json({ error: 'Missing required fields: chat_id, message' }, 400)
    }

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!token) {
      return json({ error: 'Telegram bot token not configured' }, 500)
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chat_id),
        text: message,
        parse_mode: 'Markdown',
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.ok) {
      return json({ error: data.description ?? 'Telegram API error', code: data.error_code }, res.status)
    }

    return json({ messageId: data.result?.message_id, status: 'sent' })
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
