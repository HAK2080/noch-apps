import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const REWARD_READY_CONTENT_SID = 'HXd1df8cc058afd9e1812ad2881ee9de1e'

type JsonMap = Record<string, unknown>

export type NotificationTemplateRow = {
  id: string
  template_key: string
  channel: string
  audience: string
  provider: string
  proactive: boolean
  enabled: boolean
  twilio_content_sid: string | null
  body_template_ar: string | null
  body_template_en: string | null
  notes: string | null
}

export type NotificationOutboxRow = {
  id: string
  created_at: string
  updated_at: string
  scheduled_for: string | null
  requested_by: string | null
  source_module: string | null
  audience: string
  channel: string
  provider: string
  event_key: string | null
  template_key: string | null
  customer_id: string | null
  campaign_id: string | null
  feedback_id: string | null
  reward_id: string | null
  recipient_name: string | null
  recipient_phone: string | null
  recipient_chat_id: string | null
  language: string
  message_body: string | null
  template_variables: JsonMap | null
  context: JsonMap | null
  status: string
  requires_template: boolean
  allow_freeform_session: boolean
  provider_message_id: string | null
  provider_status: string | null
  attempts: number
  last_attempt_at: string | null
  sent_at: string | null
  failed_at: string | null
  error_text: string | null
  dedupe_key: string | null
}

type DispatchResult = {
  status: 'sent' | 'failed' | 'skipped'
  providerStatus: string
  providerMessageId?: string | null
  errorText?: string | null
  templateLabel?: string | null
}

type QueueNotificationArgs = {
  audience?: string
  event_key?: string | null
  customer_id?: string | null
  campaign_id?: string | null
  feedback_id?: string | null
  reward_id?: string | null
  recipient_name?: string | null
  recipient_phone?: string | null
  recipient_chat_id?: string | null
  language?: string | null
  message_body?: string | null
  template_key?: string | null
  template_variables?: JsonMap | null
  context?: JsonMap | null
  source_module?: string | null
  requested_by?: string | null
  status?: string | null
  scheduled_for?: string | null
  requires_template?: boolean
  allow_freeform_session?: boolean
  dedupe_key?: string | null
}

function serviceHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

function toStringValue(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function firstValue(...values: unknown[]) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return value
  }
  return null
}

function isNumberedVariables(variables: JsonMap) {
  return Object.keys(variables).some((key) => /^\d+$/.test(key))
}

function renderTemplate(template: string | null, variables: JsonMap) {
  if (!template) return ''
  return String(template)
    .replace(/\$\{(\w+)\}/g, (_, key) => toStringValue(variables[key], ''))
    .replace(/\{\{(\w+)\}\}/g, (_, key) => toStringValue(variables[key], ''))
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export function normaliseWhatsAppPhone(input: string) {
  const trimmed = String(input || '').trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')

  if (/^09\d{7,9}$/.test(digits)) return `+218${digits.slice(1)}`
  if (/^9\d{7,9}$/.test(digits)) return `+218${digits}`
  if (/^2189\d{7,9}$/.test(digits)) return `+${digits}`

  return `+${digits}`
}

export function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function getRequestUserId(req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await userClient.auth.getUser()
    if (error || !data?.user?.id) return null
    return data.user.id
  } catch {
    return null
  }
}

export async function getNotificationTemplate(admin: ReturnType<typeof createAdminClient>, templateKey: string | null) {
  if (!templateKey) return null
  const { data, error } = await admin
    .from('notification_templates')
    .select('*')
    .eq('template_key', templateKey)
    .maybeSingle()
  if (error) throw error
  return data as NotificationTemplateRow | null
}

async function getLoyaltySettings(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin
    .from('loyalty_settings')
    .select('stamp_notify_template_sid, stamp_notify_message_ar, stamp_notify_message_en')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function sendFunction(functionName: string, payload: JsonMap) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error: toStringValue((data as JsonMap)?.error || (data as JsonMap)?.message || `HTTP ${res.status}`),
      data,
    }
  }
  return { ok: true, data }
}

function buildTwilioVariables(row: NotificationOutboxRow, templateKey: string, variables: JsonMap) {
  if (isNumberedVariables(variables)) return variables

  const name = toStringValue(firstValue(variables.name, row.recipient_name), '')
  const drink = toStringValue(firstValue(
    variables.drink,
    variables.top_drink,
    (row.context || {}).top_drink,
    variables.reward_label,
    'your favorite drink',
  ))
  const days = toStringValue(firstValue(variables.days, variables.days_since, (row.context || {}).days_since, 30))
  const activity = toStringValue(firstValue(variables.activity, (row.context || {}).activity, 'your activity'))
  const rating = toStringValue(firstValue(variables.rating, (row.context || {}).rating, ''))

  switch (templateKey) {
    case 'marketing_anniversary':
    case 'marketing_weather_iced':
      return { '1': name, '2': drink }
    case 'marketing_streak_save':
      return { '1': name, '2': toStringValue(firstValue(variables.streak, (row.context || {}).streak, 5)) }
    case 'marketing_back_in_stock':
      return { '1': name, '2': toStringValue(firstValue(variables.item, (row.context || {}).item, 'your favorite item')) }
    case 'loyalty_marketing_birthday':
    case 'birthday':
    case 'loyalty_thank_review':
    case 'random_love':
      return { '1': name }
    case 'loyalty_lapsed_checkin':
    case 'nochi_sad':
    case 'nochi_tired':
    case 'nochi_deathbed':
    case 'feedback_followup':
      return { '1': name, '2': days }
    case 'loyalty_reward_ready':
    case 'reward_earned':
      return { '1': name, '2': drink }
    case 'feedback_thank_you':
      return { '1': name, '2': rating }
    case 'stamp_grant':
      return { '1': activity }
    default:
      return variables
  }
}

function resolveMessageBody(
  row: NotificationOutboxRow,
  template: NotificationTemplateRow | null,
  settings: { stamp_notify_message_ar?: string | null; stamp_notify_message_en?: string | null } | null,
) {
  const variables = row.template_variables || {}
  if (row.message_body) return row.message_body

  if (row.template_key === 'stamp_grant' && settings) {
    const fallback = row.language === 'en' ? settings.stamp_notify_message_en : settings.stamp_notify_message_ar
    if (fallback) {
      return renderTemplate(fallback, {
        ...variables,
        activity: firstValue(variables.activity, (row.context || {}).activity, 'your activity'),
      })
    }
  }

  if (!template) return ''
  const bodyTemplate = row.language === 'en' ? template.body_template_en : template.body_template_ar
  return renderTemplate(bodyTemplate, {
    ...variables,
    name: firstValue(variables.name, row.recipient_name),
  })
}

async function recordWhatsAppSend(
  admin: ReturnType<typeof createAdminClient>,
  row: NotificationOutboxRow,
  result: DispatchResult,
) {
  if (result.status !== 'sent' && result.status !== 'failed') return

  const templateLabel = result.templateLabel || row.template_key || row.event_key || 'manual'

  try {
    await admin.rpc('record_whatsapp_send', {
      p_customer_id: row.customer_id,
      p_phone: row.recipient_phone,
      p_template: templateLabel,
      p_trigger: row.event_key || row.template_key || row.source_module || 'notification',
      p_status: result.status,
      p_error: result.status === 'failed' ? result.errorText : null,
      p_payload_key: row.dedupe_key || row.id,
    })
  } catch {
    // Audit logging must not block the customer message result.
  }
}

export async function dispatchNotification(
  admin: ReturnType<typeof createAdminClient>,
  row: NotificationOutboxRow,
): Promise<DispatchResult> {
  if (row.channel === 'telegram') {
    if (row.audience !== 'staff') {
      return {
        status: 'failed',
        providerStatus: 'blocked_channel',
        errorText: 'Telegram is blocked for customer messaging.',
      }
    }
    if (!row.recipient_chat_id) {
      return {
        status: 'failed',
        providerStatus: 'missing_chat_id',
        errorText: 'Telegram staff message is missing a chat ID.',
      }
    }
    const telegramSend = await sendFunction('send-telegram', {
      chatId: row.recipient_chat_id,
      message: row.message_body || '',
    })
    if (!telegramSend.ok) {
      return {
        status: 'failed',
        providerStatus: 'telegram_failed',
        errorText: telegramSend.error,
      }
    }
    return {
      status: 'sent',
      providerStatus: 'sent',
      templateLabel: row.template_key || row.event_key || 'telegram_manual',
    }
  }

  if (row.channel !== 'whatsapp') {
    return {
      status: 'failed',
      providerStatus: 'unsupported_channel',
      errorText: `Unsupported notification channel: ${row.channel}`,
    }
  }

  if (!row.recipient_phone) {
    return {
      status: 'failed',
      providerStatus: 'missing_phone',
      errorText: 'Notification is missing a recipient phone number.',
    }
  }

  const template = await getNotificationTemplate(admin, row.template_key)
  if (row.template_key && !template) {
    return {
      status: 'failed',
      providerStatus: 'missing_template',
      errorText: `Unknown notification template: ${row.template_key}`,
      templateLabel: row.template_key,
    }
  }
  if (template && !template.enabled) {
    return {
      status: 'skipped',
      providerStatus: 'template_disabled',
      errorText: `Notification template is disabled: ${template.template_key}`,
      templateLabel: template.template_key,
    }
  }

  const settings = row.template_key === 'stamp_grant' ? await getLoyaltySettings(admin) : null
  const messageBody = resolveMessageBody(row, template, settings)
  const contentSid = firstValue(
    (row.context || {}).content_sid,
    template?.twilio_content_sid,
    settings?.stamp_notify_template_sid,
  )
  const variables = buildTwilioVariables(row, row.template_key || row.event_key || '', row.template_variables || {})

  if (row.template_key === 'stamp_grant' && contentSid === REWARD_READY_CONTENT_SID) {
    return {
      status: 'failed',
      providerStatus: 'wrong_template_sid',
      errorText: 'The reward-ready Twilio template SID cannot be used for stamp-grant messages.',
      templateLabel: 'stamp_grant',
    }
  }

  const sendPayload: JsonMap = {
    to: normaliseWhatsAppPhone(row.recipient_phone),
  }

  if (contentSid) {
    sendPayload.contentSid = toStringValue(contentSid)
    sendPayload.contentVariables = variables
  } else if (row.allow_freeform_session && messageBody) {
    sendPayload.message = messageBody
  } else {
    return {
      status: 'failed',
      providerStatus: 'template_required',
      errorText: 'Approved Twilio WhatsApp template SID required for proactive delivery.',
      templateLabel: row.template_key || row.event_key || 'manual',
    }
  }

  const response = await sendFunction('send-whatsapp', sendPayload)
  if (!response.ok) {
    return {
      status: 'failed',
      providerStatus: 'provider_failed',
      errorText: response.error,
      templateLabel: row.template_key || row.event_key || 'manual',
    }
  }

  const payload = response.data as JsonMap
  return {
    status: 'sent',
    providerStatus: toStringValue(payload.status, 'sent'),
    providerMessageId: toStringValue(payload.messageId, null),
    templateLabel: row.template_key || row.event_key || 'manual',
  }
}

export async function queueNotification(
  admin: ReturnType<typeof createAdminClient>,
  channel: string,
  args: QueueNotificationArgs,
) {
  const { data, error } = await admin.rpc('queue_notification', {
    p_channel: channel,
    p_audience: args.audience || 'customer',
    p_event_key: args.event_key || args.template_key || null,
    p_customer_id: args.customer_id || null,
    p_campaign_id: args.campaign_id || null,
    p_feedback_id: args.feedback_id || null,
    p_reward_id: args.reward_id || null,
    p_recipient_name: args.recipient_name || null,
    p_recipient_phone: args.recipient_phone || null,
    p_recipient_chat_id: args.recipient_chat_id || null,
    p_language: args.language || 'ar',
    p_message_body: args.message_body || null,
    p_template_key: args.template_key || null,
    p_template_variables: args.template_variables || {},
    p_context: args.context || {},
    p_source_module: args.source_module || null,
    p_requested_by: args.requested_by || null,
    p_status: args.status ?? null,
    p_scheduled_for: args.scheduled_for || null,
    p_requires_template: args.requires_template ?? false,
    p_allow_freeform_session: args.allow_freeform_session ?? false,
    p_dedupe_key: args.dedupe_key || null,
  })
  if (error) throw error
  return toStringValue(data)
}

export async function getOutboxRow(admin: ReturnType<typeof createAdminClient>, outboxId: string) {
  const { data, error } = await admin
    .from('notification_outbox')
    .select('*')
    .eq('id', outboxId)
    .single()
  if (error) throw error
  return data as NotificationOutboxRow
}

export async function beginOutboxAttempt(admin: ReturnType<typeof createAdminClient>, outboxId: string) {
  const current = await getOutboxRow(admin, outboxId)
  const { data, error } = await admin
    .from('notification_outbox')
    .update({
      status: 'processing',
      attempts: (current.attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      failed_at: null,
      error_text: null,
    })
    .eq('id', outboxId)
    .select('*')
    .single()
  if (error) throw error
  return data as NotificationOutboxRow
}

export async function applyDispatchResult(
  admin: ReturnType<typeof createAdminClient>,
  row: NotificationOutboxRow,
  result: DispatchResult,
) {
  const now = new Date().toISOString()
  const payload: JsonMap = {
    status: result.status,
    updated_at: now,
    provider_status: result.providerStatus,
    provider_message_id: result.providerMessageId || null,
    error_text: result.errorText || null,
  }

  if (result.status === 'sent') {
    payload.sent_at = now
    payload.failed_at = null
  } else if (result.status === 'failed') {
    payload.failed_at = now
  }

  const { data, error } = await admin
    .from('notification_outbox')
    .update(payload)
    .eq('id', row.id)
    .select('*')
    .single()
  if (error) throw error

  await recordWhatsAppSend(admin, row, result)
  return data as NotificationOutboxRow
}
