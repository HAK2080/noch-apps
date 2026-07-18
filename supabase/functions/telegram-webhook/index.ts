// Supabase Edge Function — Telegram Bot webhook
// 1) Receives incoming replies from Telegram and creates task comments. (original)
// 2) Noch 5.0 Receipt Snap: staff send a receipt PHOTO -> AI reads it ->
//    inline keyboard asks which branch (or split) -> expense recorded.
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
const SNAP_FN_URL = SB_URL + '/functions/v1/expense-snap'

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

// ── Telegram API helpers ────────────────────────────────────
function tg(botToken: string, method: string, payload: Record<string, unknown>) {
  return fetch('https://api.telegram.org/bot' + botToken + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => r.json())
}

async function callSnapFn(payload: Record<string, unknown>) {
  const r = await fetch(SNAP_FN_URL, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(payload),
  })
  return r.json()
}

// ── Receipt Snap: photo message (or image sent as a file) ───
async function handlePhoto(botToken: string, msg: TgMessage, fileId: string, mimeType = 'image/jpeg') {
  const chatId = String(msg.chat.id)

  // Must be a linked staff member
  const profiles = await sbGet('profiles?select=id,full_name&telegram_chat_id=eq.' + chatId + '&limit=1')
  if (!Array.isArray(profiles) || !profiles.length) {
    await tg(botToken, 'sendMessage', {
      chat_id: chatId,
      text: 'حسابك غير مربوط بالنظام. تواصل مع الإدارة لربط حسابك.',
    })
    return Response.json({ ok: true, ignored: true, reason: 'unlinked chat' }, { headers: CORS })
  }

  await tg(botToken, 'sendMessage', { chat_id: chatId, text: '📸 وصلت الفاتورة، جاري القراءة...' })

  // Download the file from Telegram
  const fileInfo = await tg(botToken, 'getFile', { file_id: fileId })
  const filePath = fileInfo?.result?.file_path
  if (!filePath) {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: '⚠️ تعذر تحميل الصورة، حاول مرة أخرى.' })
    return Response.json({ ok: false, error: 'getFile failed' }, { headers: CORS })
  }
  const fileResp = await fetch('https://api.telegram.org/file/bot' + botToken + '/' + filePath)
  const buf = new Uint8Array(await fileResp.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  }
  const base64 = btoa(bin)

  // Extract via expense-snap
  const res = await callSnapFn({
    action: 'extract',
    image_base64: base64,
    mime_type: mimeType,
    source: 'telegram',
    telegram_chat_id: chatId,
    telegram_message_id: String(msg.message_id),
    caption: msg.caption || '',
  })

  if (!res.snap_id) {
    console.error('extract failed', res)
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: '⚠️ حدث خطأ في معالجة الفاتورة. حاول مرة أخرى.' })
    return Response.json({ ok: false, error: res }, { headers: CORS })
  }

  // Amount unreadable → ask for it (one typed number) before branch buttons
  if (res.needs_amount) {
    await tg(botToken, 'sendMessage', {
      chat_id: chatId,
      text: '💰 ما قدرت أقرأ المبلغ من الصورة.\nاكتب المبلغ (رقم فقط)، مثال: 450',
    })
    return Response.json({ ok: true, snap_id: res.snap_id, awaiting: 'amount' }, { headers: CORS })
  }

  await sendBranchButtons(botToken, chatId, res, '✅ تمت قراءة الفاتورة:')
  return Response.json({ ok: true, snap_id: res.snap_id }, { headers: CORS })
}

// ── Receipt Snap: shared branch-buttons message ─────────────
async function sendBranchButtons(
  botToken: string,
  chatId: string,
  res: { snap_id: string; extracted?: Record<string, unknown>; cost_centers?: { code: string; name: string }[]; suggested_code?: string | null },
  header: string,
) {
  const ex = res.extracted || {}
  const readLine = [
    ex.vendor ? '🏪 ' + ex.vendor : null,
    ex.amount ? '💰 ' + ex.amount + ' ' + (ex.currency || 'LYD') : '💰 المبلغ غير محدد (سيُراجع مكتبياً)',
    ex.description && !ex.vendor ? '📝 ' + ex.description : null,
  ].filter(Boolean).join('\n')

  // Branch buttons — suggested branch first, then the rest, then split options
  const ccs = res.cost_centers || []
  const suggested = res.suggested_code
  const ordered = suggested
    ? [...ccs.filter((c) => c.code === suggested), ...ccs.filter((c) => c.code !== suggested)]
    : ccs
  const ccButtons = ordered.map((c) => [{
    text: (c.code === suggested ? '⭐ ' : '') + c.name,
    callback_data: 'esnap|' + res.snap_id + '|cc|' + c.code,
  }])

  await tg(botToken, 'sendMessage', {
    chat_id: chatId,
    text: header + '\n' + readLine + '\n\nلأي فرع؟',
    reply_markup: {
      inline_keyboard: [
        ...ccButtons,
        [
          { text: '⚖️ تقسيم بالتساوي', callback_data: 'esnap|' + res.snap_id + '|even' },
          { text: '✏️ تقسيم مخصص', callback_data: 'esnap|' + res.snap_id + '|custom' },
        ],
      ],
    },
  })
}

// ── Receipt Snap: inline button pressed ─────────────────────
async function handleCallback(botToken: string, cb: TgCallbackQuery) {
  const data = cb.data || ''
  const chatId = String(cb.message?.chat?.id ?? '')
  const msgId = cb.message?.message_id

  if (!data.startsWith('esnap|')) {
    await tg(botToken, 'answerCallbackQuery', { callback_query_id: cb.id })
    return Response.json({ ok: true, ignored: true }, { headers: CORS })
  }

  const [, snapId, kind, code] = data.split('|')

  if (kind === 'custom') {
    await callSnapFn({ action: 'mark_custom', snap_id: snapId })
    await tg(botToken, 'answerCallbackQuery', { callback_query_id: cb.id })
    await tg(botToken, 'sendMessage', {
      chat_id: chatId,
      text: '✏️ اكتب التقسيم، مثال:\n300 سيتي ووك، 150 قالاريا\nor: 300 citywalk, 150 galaria',
    })
    return Response.json({ ok: true }, { headers: CORS })
  }

  const allocation = kind === 'even' ? { mode: 'even' } : { mode: 'single', code }
  const res = await callSnapFn({ action: 'finalize', snap_id: snapId, allocation })

  await tg(botToken, 'answerCallbackQuery', { callback_query_id: cb.id })

  if (res.ok) {
    const done = '✅ تم تسجيل الفاتورة' + (res.vendor ? ' — ' + res.vendor : '') + '\n' + res.summary + '\nشكراً! 🙏'
    if (msgId) {
      await tg(botToken, 'editMessageText', { chat_id: chatId, message_id: msgId, text: done })
    } else {
      await tg(botToken, 'sendMessage', { chat_id: chatId, text: done })
    }
  } else if (res.error === 'already_completed') {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: 'هذه الفاتورة مسجلة مسبقاً ✅' })
  } else {
    console.error('finalize failed', res)
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: '⚠️ حدث خطأ في التسجيل. حاول مرة أخرى.' })
  }
  return Response.json({ ok: true }, { headers: CORS })
}

// ── Receipt Snap: plain-text messages (amount / split / manual entry) ──
const HELP_TEXT =
  '👋 أنا بوت نوش للفواتير.\n\n' +
  '📸 أرسل صورة الفاتورة وبنقرأها تلقائياً\n' +
  '✍️ أو اكتب المصروف مباشرة، مثال:\n450 قهوة من مورد النور\n\n' +
  'وبعدها اختار الفرع بضغطة وحدة ✅'

async function handleText(botToken: string, msg: TgMessage): Promise<Response> {
  const chatId = String(msg.chat.id)
  const text = (msg.text || '').trim()

  // 1) Pending "type the amount" snap?
  const awaitingAmount = await sbGet(
    'expense_snaps?select=id&telegram_chat_id=eq.' + chatId +
    '&status=eq.awaiting_amount&order=created_at.desc&limit=1',
  )
  if (Array.isArray(awaitingAmount) && awaitingAmount.length) {
    const res = await callSnapFn({ action: 'set_amount', snap_id: awaitingAmount[0].id, text })
    if (res.ok) {
      await sendBranchButtons(botToken, chatId, res, '✅ تمام:')
    } else {
      await tg(botToken, 'sendMessage', { chat_id: chatId, text: '⚠️ اكتب الرقم فقط، مثال: 450' })
    }
    return Response.json({ ok: true }, { headers: CORS })
  }

  // 2) Pending custom split?
  const awaitingCustom = await sbGet(
    'expense_snaps?select=id&telegram_chat_id=eq.' + chatId +
    '&status=eq.awaiting_custom&order=created_at.desc&limit=1',
  )
  if (Array.isArray(awaitingCustom) && awaitingCustom.length) {
    const res = await callSnapFn({ action: 'custom_parse', snap_id: awaitingCustom[0].id, text })
    if (res.ok) {
      await tg(botToken, 'sendMessage', {
        chat_id: chatId,
        text: '✅ تم تسجيل الفاتورة مقسمة:\n' + res.summary + '\nشكراً! 🙏',
      })
    } else {
      await tg(botToken, 'sendMessage', {
        chat_id: chatId,
        text: '⚠️ ما فهمت التقسيم. اكتبه مثل:\n300 سيتي ووك، 150 قالاريا',
      })
    }
    return Response.json({ ok: true }, { headers: CORS })
  }

  // 3) Text containing a number = manual expense entry ("450 قهوة للمخزن")
  const hasNumber = /[0-9٠-٩۰-۹]/.test(text) && !text.startsWith('/')
  if (hasNumber) {
    const res = await callSnapFn({ action: 'manual', text, source: 'telegram', telegram_chat_id: chatId })
    if (res.error === 'unlinked') {
      await tg(botToken, 'sendMessage', { chat_id: chatId, text: 'حسابك غير مربوط بالنظام. تواصل مع الإدارة لربط حسابك.' })
      return Response.json({ ok: true, ignored: true, reason: 'unlinked chat' }, { headers: CORS })
    }
    if (res.snap_id) {
      if (res.needs_amount) {
        await tg(botToken, 'sendMessage', { chat_id: chatId, text: '💰 كم المبلغ؟ اكتب الرقم فقط، مثال: 450' })
      } else {
        await sendBranchButtons(botToken, chatId, res, '📝 مصروف يدوي:')
      }
      return Response.json({ ok: true, snap_id: res.snap_id }, { headers: CORS })
    }
    console.error('manual entry failed', res)
  }

  // 4) Anything else (including /start) → help
  await tg(botToken, 'sendMessage', { chat_id: chatId, text: HELP_TEXT })
  return Response.json({ ok: true, help: true }, { headers: CORS })
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

  let update: { message?: TgMessage; callback_query?: TgCallbackQuery }
  try {
    update = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // ── Receipt Snap: inline keyboard callbacks ──
  if (update.callback_query) {
    return handleCallback(botToken, update.callback_query)
  }

  const msg = update.message

  // ── Receipt Snap: photo = receipt submission ──
  if (msg && Array.isArray(msg.photo) && msg.photo.length) {
    // Largest photo size Telegram offers
    return handlePhoto(botToken, msg, msg.photo[msg.photo.length - 1].file_id)
  }

  // ── Receipt Snap: image sent as a FILE (document) ──
  if (msg && msg.document) {
    const mime = msg.document.mime_type || ''
    if (mime.startsWith('image/')) {
      return handlePhoto(botToken, msg, msg.document.file_id, mime)
    }
    // PDF or other file types — tell them instead of staying silent
    await tg(botToken, 'sendMessage', {
      chat_id: String(msg.chat.id),
      text: '⚠️ هذا النوع من الملفات غير مدعوم. أرسل الفاتورة كصورة 📷 (من الكاميرا أو المعرض).',
    })
    return Response.json({ ok: true, ignored: true, reason: 'unsupported document' }, { headers: CORS })
  }

  // ── Receipt Snap: plain text (amount reply / custom split / manual entry / help) ──
  if (msg && msg.text && !msg.reply_to_message) {
    return handleText(botToken, msg)
  }

  // ── Original behavior: replies to tracked task messages ──
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
  caption?: string
  photo?: { file_id: string; width: number; height: number }[]
  document?: { file_id: string; mime_type?: string; file_name?: string }
  reply_to_message?: { message_id: number }
}

interface TgCallbackQuery {
  id: string
  data?: string
  from?: { id: number }
  message?: { message_id: number; chat: { id: number } }
}
