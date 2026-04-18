// Returns unique chat IDs from recent bot messages
// Deploy: npx supabase functions deploy get-telegram-ids --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) return json({ error: 'Bot token not configured' }, 500)

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`)
  const data = await res.json()

  if (!data.ok) return json({ error: data.description }, 500)

  // Deduplicate by chat_id, keep most recent
  const seen = new Map<number, object>()
  for (const update of data.result) {
    const msg = update.message || update.channel_post
    if (!msg) continue
    const id = msg.chat.id
    if (!seen.has(id)) {
      seen.set(id, {
        chat_id: id,
        name: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.chat.title || 'Unknown',
        username: msg.from?.username || null,
      })
    }
  }

  return json({ users: Array.from(seen.values()) })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
