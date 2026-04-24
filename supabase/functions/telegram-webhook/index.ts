// Supabase Edge Function — Telegram Bot webhook
// Receives incoming replies from Telegram and creates task comments.
//
// Webhook is auto-registered: call GET on this function URL to re-register.
// Uses direct Supabase REST API calls (no import required) for maximum compatibility
// when deployed via the Management API JSON body method.
//
// Required secrets: TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const SB_URL = Deno.env.get('SUPABASE_URL') ?? 'https://kxqjasdvoohiexedtfqw.supabase.co'
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

async function sbGet(path: string) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { headers: SB_HEADERS })
  return r.json()
}
async function sbPost(table: string, payload: Record<string, unknown>) {
  const r = await fetch(SB_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(payload),
  })
  return r.json()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const fnUrl = (SB_URL) + '/functions/v1/telegram-webhook'

  // GET: self-register the Telegram webhook URL
  if (req.method === 'GET') {
    if (!botToken) return Response.json({ error: 'no TELEGRAM_BOT_TOKEN' }, { status: 500, headers: CORS })
    const r = await fetch('https://api.telegram.org/bot' + botToken + '/setWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fnUrl }),
    })
    return Response.json(await r.json(), { headers: CORS })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let update: { message?: TgMessage }
  try {
    update = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const msg = update.message
  if (!msg || !msg.reply_to_message || !msg.text) {
    return Response.json({ ok: true, ignored: true }, { headers: CORS })
  }

  const chatId = String(msg.chat.id)
  const replyToId = msg.reply_to_message.message_id

  console.log('webhook: received reply', { chatId, replyToId, messageId: msg.message_id, senderName: [msg.from?.first_name, msg.from?.last_name].join(' ') })

  // Look up the task associated with the replied-to message
  const query = 'telegram_messages?select=task_id&chat_id=eq.' + encodeURIComponent(chatId) + '&message_id=eq.' + encodeURIComponent(String(replyToId)) + '&limit=1'
  const tgMsgs = await sbGet(query)
  console.log('webhook: message lookup result', { chatId, replyToId, found: Array.isArray(tgMsgs) && tgMsgs.length > 0, result: tgMsgs })
  if (!Array.isArray(tgMsgs) || !tgMsgs.length) {
    console.log('webhook: message not tracked', { chatId, replyToId })
    if (botToken) {
      await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: 'يرجى الرد على رسالة التذكير من النظام.' }),
      })
    }
    return Response.json({ ok: true, ignored: true, reason: 'not tracked' }, { headers: CORS })
  }
  const taskId = tgMsgs[0].task_id

  // Find profile matching this Telegram chat ID
  const profiles = await sbGet('profiles?select=id&telegram_chat_id=eq.' + chatId + '&limit=1')
  const profileId = Array.isArray(profiles) && profiles.length ? profiles[0].id : null

  const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Unknown'
  const body = profileId
    ? msg.text.trim()
    : '[' + senderName + ' via Telegram] ' + msg.text.trim()

  await sbPost('task_comments', {
    task_id: taskId,
    author_id: profileId,
    body,
    source: 'telegram',
  })

  if (botToken) {
    await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: 'تم إضافة ردك كتعليق على المهمة.' }),
    })
  }

  return Response.json({ ok: true, task_id: taskId }, { headers: CORS })
})

interface TgMessage {
  message_id: number
  from?: { id: number; first_name?: string; last_name?: string; username?: string }
  chat: { id: number }
  text?: string
  reply_to_message?: { message_id: number }
}
