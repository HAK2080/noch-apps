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

import {
  detectStockLanguage,
  findStockProductCandidates,
  parseStockReceiptMessage,
} from '../_shared/stock-command.js'

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
  const data = await r.json()
  if (!r.ok) throw new Error(data?.message || data?.error || `Could not insert ${table}`)
  return data
}
async function sbPatch(path: string, payload: Record<string, unknown>) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method: 'PATCH',
    headers: SB_HEADERS,
    body: JSON.stringify(payload),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data?.message || data?.error || 'Could not update database record')
  return data
}
async function sbDelete(path: string) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method: 'DELETE',
    headers: SB_HEADERS,
  })
  if (r.status === 204) return []
  const data = await r.json()
  if (!r.ok) throw new Error(data?.message || data?.error || 'Could not delete database record')
  return data
}
async function sbUpsert(table: string, onConflict: string, payload: Record<string, unknown>) {
  const r = await fetch(
    SB_URL + '/rest/v1/' + table + '?on_conflict=' + encodeURIComponent(onConflict),
    {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    },
  )
  const data = await r.json()
  if (!r.ok) throw new Error(data?.message || data?.error || `Could not save ${table}`)
  return data
}
async function sbRpc(name: string, payload: Record<string, unknown>) {
  const r = await fetch(SB_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(payload),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data?.message || data?.error || 'Database operation failed')
  return data
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

// ── Product stock receiving ────────────────────────────────────────────────
const STOCK_BUTTON = '📦 استلام مخزون / Receive Stock'

function stockMenu() {
  return {
    keyboard: [[{ text: STOCK_BUTTON }]],
    resize_keyboard: true,
    is_persistent: true,
  }
}

function isStockButton(text: string) {
  const normalized = text.trim().toLowerCase()
  return normalized === STOCK_BUTTON.toLowerCase()
    || normalized === 'استلام مخزون'
    || normalized === 'receive stock'
    || normalized === '/stock'
}

function stockText(language: 'ar' | 'en', key: string) {
  const copy = {
    ar: {
      prompt: 'اكتب الكمية واسم المنتج، مثال:\n20 تيراميسو',
      unlinked: 'حسابك غير مربوط بالنظام. تواصل مع الإدارة لربط تيليغرام.',
      inactive: 'حساب الموظف غير نشط.',
      noBranch: 'لا يوجد فرع محدد لحسابك. اطلب من الإدارة تحديد الفرع أولاً.',
      badQuantity: 'اكتب كمية أكبر من صفر مع اسم المنتج، مثال: 20 تيراميسو',
      badProduct: 'اكتب الكمية واسم المنتج، مثال: 20 تيراميسو',
      notFound: 'لم أجد هذا المنتج في قائمة هذا الفرع. جرّب الاسم الظاهر في الـ POS.',
      choose: 'وجدت أكثر من منتج. اختر المنتج الصحيح:',
      confirm: 'تأكيد استلام المخزون',
      product: 'المنتج',
      quantity: 'الكمية المستلمة',
      current: 'المخزون الحالي',
      newStock: 'المخزون الجديد',
      confirmButton: '✅ تأكيد',
      cancelButton: '❌ إلغاء',
      cancelled: 'تم إلغاء العملية.',
      expired: 'انتهت صلاحية الطلب. اضغط «استلام مخزون» وابدأ من جديد.',
      completed: 'تم تحديث المخزون بنجاح ✅',
      alreadyCompleted: 'تم تسجيل هذه الكمية مسبقاً ✅',
      failed: 'تعذر تحديث المخزون. حاول مرة أخرى أو تواصل مع الإدارة.',
    },
    en: {
      prompt: 'Type the quantity and product name, for example:\n20 tiramisu',
      unlinked: 'Your Telegram account is not linked. Ask management to link it first.',
      inactive: 'Your employee account is inactive.',
      noBranch: 'No branch is assigned to your account. Ask management to assign one first.',
      badQuantity: 'Enter a quantity greater than zero and a product name, for example: 20 tiramisu',
      badProduct: 'Enter the quantity and product name, for example: 20 tiramisu',
      notFound: 'I could not find that product at your branch. Try the name shown in the POS.',
      choose: 'I found more than one product. Choose the correct one:',
      confirm: 'Confirm stock received',
      product: 'Product',
      quantity: 'Quantity received',
      current: 'Current stock',
      newStock: 'New stock',
      confirmButton: '✅ Confirm',
      cancelButton: '❌ Cancel',
      cancelled: 'Stock update cancelled.',
      expired: 'This request expired. Tap “Receive Stock” and start again.',
      completed: 'Stock updated successfully ✅',
      alreadyCompleted: 'This stock receipt was already recorded ✅',
      failed: 'Could not update stock. Try again or contact management.',
    },
  }
  const selected = copy[language] as Record<string, string>
  return selected[key] || key
}

function displayProduct(product: Record<string, unknown>, language: 'ar' | 'en') {
  if (language === 'ar') return String(product.name_ar || product.name || '')
  return String(product.name || product.name_ar || '')
}

function formatStockQty(value: unknown) {
  const quantity = Number(value) || 0
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

async function linkedStockProfile(chatId: string) {
  const profiles = await sbGet(
    'profiles?select=id,full_name,branch_id,is_active&telegram_chat_id=eq.'
    + encodeURIComponent(chatId) + '&limit=1',
  )
  return Array.isArray(profiles) && profiles.length ? profiles[0] : null
}

async function startStockSession(botToken: string, msg: TgMessage, requestedLanguage?: 'ar' | 'en') {
  const chatId = String(msg.chat.id)
  const language = requestedLanguage || detectStockLanguage(msg.text || '')
  const profile = await linkedStockProfile(chatId)

  if (!profile) {
    await tg(botToken, 'sendMessage', {
      chat_id: chatId,
      text: stockText(language, 'unlinked'),
      reply_markup: stockMenu(),
    })
    return Response.json({ ok: true, ignored: true, reason: 'unlinked stock reporter' }, { headers: CORS })
  }
  if (profile.is_active === false) {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'inactive'), reply_markup: stockMenu() })
    return Response.json({ ok: true, ignored: true, reason: 'inactive stock reporter' }, { headers: CORS })
  }
  if (!profile.branch_id) {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'noBranch'), reply_markup: stockMenu() })
    return Response.json({ ok: true, ignored: true, reason: 'stock reporter has no branch' }, { headers: CORS })
  }

  await sbUpsert('telegram_stock_sessions', 'telegram_chat_id', {
    telegram_chat_id: chatId,
    profile_id: profile.id,
    branch_id: profile.branch_id,
    language,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  })

  await tg(botToken, 'sendMessage', {
    chat_id: chatId,
    text: stockText(language, 'prompt'),
    reply_markup: stockMenu(),
  })
  return Response.json({ ok: true, awaiting: 'stock_receipt' }, { headers: CORS })
}

async function getStockRequest(requestId: string, chatId: string) {
  const rows = await sbGet(
    'telegram_stock_requests?select=*&id=eq.' + encodeURIComponent(requestId)
    + '&telegram_chat_id=eq.' + encodeURIComponent(chatId) + '&limit=1',
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

async function getStockProduct(productId: string) {
  const rows = await sbGet(
    'pos_products?select=id,branch_id,name,name_ar,price,stock_qty,track_inventory,is_active&id=eq.'
    + encodeURIComponent(productId) + '&limit=1',
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

async function getStockBranch(branchId: string) {
  const rows = await sbGet('pos_branches?select=id,name,name_ar&id=eq.' + encodeURIComponent(branchId) + '&limit=1')
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

async function sendStockConfirmation(
  botToken: string,
  chatId: string,
  request: Record<string, unknown>,
  product: Record<string, unknown>,
  editMessageId?: number,
) {
  const language = request.language === 'en' ? 'en' : 'ar'
  const branch = await getStockBranch(String(request.branch_id))
  const current = Number(product.stock_qty) || 0
  const quantity = Number(request.quantity) || 0
  const branchName = language === 'ar'
    ? String(branch?.name_ar || branch?.name || '')
    : String(branch?.name || branch?.name_ar || '')
  const productName = displayProduct(product, language)
  const price = Number(product.price) || 0
  const text = [
    stockText(language, 'confirm'),
    branchName,
    '',
    `${stockText(language, 'product')}: ${productName} — ${price.toFixed(2)} LYD`,
    `${stockText(language, 'quantity')}: +${formatStockQty(quantity)}`,
    `${stockText(language, 'current')}: ${formatStockQty(current)}`,
    `${stockText(language, 'newStock')}: ${formatStockQty(current + quantity)}`,
  ].join('\n')
  const payload = {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: [[
        { text: stockText(language, 'confirmButton'), callback_data: 'stockapply|' + request.id },
        { text: stockText(language, 'cancelButton'), callback_data: 'stockcancel|' + request.id },
      ]],
    },
  }

  if (editMessageId) {
    await tg(botToken, 'editMessageText', { ...payload, message_id: editMessageId })
  } else {
    await tg(botToken, 'sendMessage', payload)
  }
}

async function handleStockEntry(botToken: string, msg: TgMessage, session: Record<string, unknown>) {
  const chatId = String(msg.chat.id)
  const parsed = parseStockReceiptMessage(msg.text || '')
  const language = parsed.language || (session.language === 'en' ? 'en' : 'ar')

  if (!parsed.ok) {
    const key = parsed.error === 'missing_product' ? 'badProduct' : 'badQuantity'
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, key), reply_markup: stockMenu() })
    return Response.json({ ok: true, awaiting: 'stock_receipt', error: parsed.error }, { headers: CORS })
  }

  const products = await sbGet(
    'pos_products?select=id,branch_id,name,name_ar,price,stock_qty,track_inventory,is_active'
    + '&branch_id=eq.' + encodeURIComponent(String(session.branch_id))
    + '&is_active=eq.true&order=name.asc',
  )
  const matches = findStockProductCandidates(Array.isArray(products) ? products : [], parsed.productQuery)

  if (!matches.length) {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'notFound'), reply_markup: stockMenu() })
    return Response.json({ ok: true, awaiting: 'stock_receipt', error: 'product_not_found' }, { headers: CORS })
  }

  const existing = await sbGet(
    'telegram_stock_requests?select=*&telegram_chat_id=eq.' + encodeURIComponent(chatId)
    + '&telegram_message_id=eq.' + encodeURIComponent(String(msg.message_id)) + '&limit=1',
  )
  let request = Array.isArray(existing) && existing.length ? existing[0] : null
  if (!request) {
    const choosing = matches.length > 1
    try {
      const inserted = await sbPost('telegram_stock_requests', {
        telegram_chat_id: chatId,
        telegram_message_id: String(msg.message_id),
        profile_id: session.profile_id,
        branch_id: session.branch_id,
        product_id: choosing ? null : matches[0].product.id,
        candidate_product_ids: matches.map(match => match.product.id),
        quantity: parsed.quantity,
        language,
        status: choosing ? 'selecting' : 'pending',
      })
      request = Array.isArray(inserted) && inserted.length ? inserted[0] : null
    } catch (error) {
      // Telegram can retry the same webhook. Reuse the original request if a
      // concurrent delivery inserted it first.
      const duplicate = await sbGet(
        'telegram_stock_requests?select=*&telegram_chat_id=eq.' + encodeURIComponent(chatId)
        + '&telegram_message_id=eq.' + encodeURIComponent(String(msg.message_id)) + '&limit=1',
      )
      if (!Array.isArray(duplicate) || !duplicate.length) throw error
      request = duplicate[0]
    }
  }

  await sbDelete('telegram_stock_sessions?telegram_chat_id=eq.' + encodeURIComponent(chatId))

  if (!request) {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'failed'), reply_markup: stockMenu() })
    return Response.json({ ok: false, error: 'stock request insert failed' }, { headers: CORS })
  }

  if (request.status === 'applied') {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'alreadyCompleted'), reply_markup: stockMenu() })
    return Response.json({ ok: true, duplicate: true }, { headers: CORS })
  }

  if (request.status === 'selecting') {
    const candidates = matches.length > 1
      ? matches
      : (request.candidate_product_ids || []).map((id: string) => ({ product: products.find((p: Record<string, unknown>) => p.id === id) })).filter((m: Record<string, unknown>) => m.product)
    await tg(botToken, 'sendMessage', {
      chat_id: chatId,
      text: stockText(language, 'choose'),
      reply_markup: {
        inline_keyboard: candidates.map((match: { product: Record<string, unknown> }, index: number) => [{
          text: `${displayProduct(match.product, language)} — ${Number(match.product.price || 0).toFixed(2)} LYD`,
          callback_data: `stockpick|${request.id}|${index}`,
        }]),
      },
    })
    return Response.json({ ok: true, awaiting: 'product_selection', request_id: request.id }, { headers: CORS })
  }

  const product = await getStockProduct(String(request.product_id))
  if (!product) {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'notFound'), reply_markup: stockMenu() })
    return Response.json({ ok: false, error: 'selected product unavailable' }, { headers: CORS })
  }
  await sendStockConfirmation(botToken, chatId, request, product)
  return Response.json({ ok: true, awaiting: 'stock_confirmation', request_id: request.id }, { headers: CORS })
}

async function handleStockCallback(botToken: string, cb: TgCallbackQuery): Promise<Response> {
  const data = cb.data || ''
  const chatId = String(cb.message?.chat?.id ?? '')
  const messageId = cb.message?.message_id
  const [action, requestId, indexText] = data.split('|')
  const request = await getStockRequest(requestId, chatId)

  await tg(botToken, 'answerCallbackQuery', { callback_query_id: cb.id })

  if (!request) {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText('ar', 'expired'), reply_markup: stockMenu() })
    return Response.json({ ok: true, ignored: true, reason: 'stock request missing' }, { headers: CORS })
  }

  const language = request.language === 'en' ? 'en' : 'ar'
  const expired = Date.now() - new Date(request.created_at).getTime() > 30 * 60 * 1000
  if (expired && !['applied', 'cancelled'].includes(request.status)) {
    await sbPatch('telegram_stock_requests?id=eq.' + encodeURIComponent(request.id), { status: 'expired' })
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'expired'), reply_markup: stockMenu() })
    return Response.json({ ok: true, expired: true }, { headers: CORS })
  }

  if (action === 'stockcancel') {
    if (request.status !== 'applied') {
      await sbPatch('telegram_stock_requests?id=eq.' + encodeURIComponent(request.id), { status: 'cancelled' })
    }
    if (messageId) {
      await tg(botToken, 'editMessageText', { chat_id: chatId, message_id: messageId, text: stockText(language, 'cancelled') })
    }
    return Response.json({ ok: true, cancelled: true }, { headers: CORS })
  }

  if (action === 'stockpick') {
    if (request.status !== 'selecting') return Response.json({ ok: true, ignored: true }, { headers: CORS })
    const index = Number(indexText)
    const productId = request.candidate_product_ids?.[index]
    const product = productId ? await getStockProduct(String(productId)) : null
    if (!product || product.branch_id !== request.branch_id) {
      await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'notFound'), reply_markup: stockMenu() })
      return Response.json({ ok: false, error: 'invalid stock product selection' }, { headers: CORS })
    }
    await sbPatch('telegram_stock_requests?id=eq.' + encodeURIComponent(request.id), {
      product_id: product.id,
      status: 'pending',
    })
    request.product_id = product.id
    request.status = 'pending'
    await sendStockConfirmation(botToken, chatId, request, product, messageId)
    return Response.json({ ok: true, awaiting: 'stock_confirmation' }, { headers: CORS })
  }

  if (action !== 'stockapply') return Response.json({ ok: true, ignored: true }, { headers: CORS })
  if (request.status === 'applied') {
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'alreadyCompleted'), reply_markup: stockMenu() })
    return Response.json({ ok: true, duplicate: true }, { headers: CORS })
  }
  if (request.status !== 'pending' || !request.product_id) {
    return Response.json({ ok: true, ignored: true, reason: 'stock request not pending' }, { headers: CORS })
  }

  try {
    const result = await sbRpc('receive_pos_product_stock', {
      p_product_id: request.product_id,
      p_quantity: request.quantity,
      p_source: 'telegram',
      p_source_ref: `telegram:${chatId}:${request.telegram_message_id}`,
      p_actor_profile_id: request.profile_id,
    })
    await sbPatch('telegram_stock_requests?id=eq.' + encodeURIComponent(request.id), {
      status: 'applied',
      applied_at: new Date().toISOString(),
    })
    const done = [
      stockText(language, result?.duplicate ? 'alreadyCompleted' : 'completed'),
      `${stockText(language, 'quantity')}: +${formatStockQty(result?.quantity_received || request.quantity)}`,
      `${stockText(language, 'newStock')}: ${formatStockQty(result?.stock_after)}`,
    ].join('\n')
    if (messageId) {
      await tg(botToken, 'editMessageText', { chat_id: chatId, message_id: messageId, text: done })
    } else {
      await tg(botToken, 'sendMessage', { chat_id: chatId, text: done, reply_markup: stockMenu() })
    }
    return Response.json({ ok: true, stock: result }, { headers: CORS })
  } catch (error) {
    console.error('telegram stock receive failed', error)
    await tg(botToken, 'sendMessage', { chat_id: chatId, text: stockText(language, 'failed'), reply_markup: stockMenu() })
    return Response.json({ ok: false, error: 'stock receive failed' }, { headers: CORS })
  }
}

// ── Receipt Snap: inline button pressed ─────────────────────
async function handleCallback(botToken: string, cb: TgCallbackQuery) {
  const data = cb.data || ''
  const chatId = String(cb.message?.chat?.id ?? '')
  const msgId = cb.message?.message_id

  if (data.startsWith('stockpick|') || data.startsWith('stockapply|') || data.startsWith('stockcancel|')) {
    return handleStockCallback(botToken, cb)
  }

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

  // Stock receiving is an explicit conversational mode so a message such as
  // "20 tiramisu" can never be confused with the existing expense intake.
  if (isStockButton(text)) {
    const telegramLanguage = msg.from?.language_code?.toLowerCase().startsWith('ar') ? 'ar' : 'en'
    return startStockSession(botToken, msg, telegramLanguage)
  }

  const stockSessions = await sbGet(
    'telegram_stock_sessions?select=*&telegram_chat_id=eq.' + encodeURIComponent(chatId)
    + '&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) + '&limit=1',
  )
  if (Array.isArray(stockSessions) && stockSessions.length) {
    return handleStockEntry(botToken, msg, stockSessions[0])
  }

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
  await tg(botToken, 'sendMessage', { chat_id: chatId, text: HELP_TEXT, reply_markup: stockMenu() })
  return Response.json({ ok: true, help: true }, { headers: CORS })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const fnUrl = (SB_URL) + '/functions/v1/telegram-webhook'

  // GET: self-register the Telegram webhook URL
  if (req.method === 'GET') {
    if (!botToken) return Response.json({ error: 'no TELEGRAM_BOT_TOKEN' }, { status: 500, headers: CORS })
    await tg(botToken, 'setMyCommands', {
      commands: [
        { command: 'start', description: 'Open Noch bot menu' },
        { command: 'stock', description: 'استلام مخزون / Receive stock' },
      ],
    })
    const r = await fetch('https://api.telegram.org/bot' + botToken + '/setWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Register the shared secret so Telegram signs every update with the
      // X-Telegram-Bot-Api-Secret-Token header we verify below.
      body: JSON.stringify({
        url: fnUrl,
        ...(Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
          ? { secret_token: Deno.env.get('TELEGRAM_WEBHOOK_SECRET') }
          : {}),
      }),
    })
    return Response.json(await r.json(), { headers: CORS })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Verify Telegram's webhook secret header so forged POSTs can't inject
  // task comments. Set TELEGRAM_WEBHOOK_SECRET and pass the same value as
  // secret_token when registering the webhook. Until it is configured we
  // log a loud warning and allow, so existing deployments keep working.
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (webhookSecret) {
    if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) {
      return new Response('Unauthorized', { status: 401 })
    }
  } else {
    console.warn('TELEGRAM_WEBHOOK_SECRET not set — telegram-webhook accepts unverified POSTs; set the secret and re-register the webhook with secret_token')
  }

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
  from?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string }
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
