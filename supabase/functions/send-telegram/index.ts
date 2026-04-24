// Supabase Edge Function — sends a Telegram message via Bot API
// Deploy: npx supabase functions deploy send-telegram --no-verify-jwt
// Secrets: npx supabase secrets set TELEGRAM_BOT_TOKEN=...

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
