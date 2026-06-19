import {
  CORS_HEADERS,
  applyDispatchResult,
  beginOutboxAttempt,
  createAdminClient,
  dispatchNotification,
  getOutboxRow,
  getRequestUserId,
  json,
  queueNotification,
} from '../_shared/notifications.ts'

type SendNotificationBody = {
  outbox_id?: string
  channel?: string
  audience?: string
  event_key?: string
  template_key?: string
  customer_id?: string
  campaign_id?: string
  feedback_id?: string
  reward_id?: string
  recipient_name?: string
  recipient_phone?: string
  recipient_chat_id?: string
  language?: 'ar' | 'en'
  message_body?: string
  template_variables?: Record<string, unknown>
  context?: Record<string, unknown>
  source_module?: string
  status?: string | null
  scheduled_for?: string | null
  requires_template?: boolean
  allow_freeform_session?: boolean
  dedupe_key?: string
  requested_by?: string
  send_now?: boolean
}

async function enrichRecipient(admin: ReturnType<typeof createAdminClient>, body: SendNotificationBody) {
  if (!body.customer_id) return body

  const { data, error } = await admin
    .from('loyalty_customers')
    .select('id, full_name, phone, phone_normalised, preferred_language')
    .eq('id', body.customer_id)
    .maybeSingle()
  if (error) throw error
  if (!data) return body

  return {
    ...body,
    recipient_name: body.recipient_name || data.full_name || null,
    recipient_phone: body.recipient_phone || data.phone || data.phone_normalised || null,
    language: body.language || (data.preferred_language === 'en' ? 'en' : 'ar'),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = createAdminClient()
    const requestUserId = await getRequestUserId(req)
    const body = await req.json() as SendNotificationBody
    const sendNow = body.send_now === true

    if (body.outbox_id) {
      let row = await getOutboxRow(admin, body.outbox_id)
      if (!sendNow) return json({ ok: true, outbox_id: row.id, status: row.status, row })

      row = await beginOutboxAttempt(admin, row.id)
      const result = await dispatchNotification(admin, row)
      const updated = await applyDispatchResult(admin, row, result)
      return json({
        ok: result.status === 'sent',
        outbox_id: updated.id,
        status: updated.status,
        provider_status: updated.provider_status,
        error: updated.error_text,
      })
    }

    const channel = body.channel || 'whatsapp'
    const enriched = await enrichRecipient(admin, body)
    const requestedBy = body.requested_by || requestUserId || null
    const outboxId = await queueNotification(admin, channel, {
      audience: enriched.audience || 'customer',
      event_key: enriched.event_key || enriched.template_key || null,
      customer_id: enriched.customer_id || null,
      campaign_id: enriched.campaign_id || null,
      feedback_id: enriched.feedback_id || null,
      reward_id: enriched.reward_id || null,
      recipient_name: enriched.recipient_name || null,
      recipient_phone: enriched.recipient_phone || null,
      recipient_chat_id: enriched.recipient_chat_id || null,
      language: enriched.language || 'ar',
      message_body: enriched.message_body || null,
      template_key: enriched.template_key || null,
      template_variables: enriched.template_variables || {},
      context: enriched.context || {},
      source_module: enriched.source_module || null,
      requested_by: requestedBy,
      status: sendNow ? 'queued' : (enriched.status ?? null),
      scheduled_for: sendNow ? null : (enriched.scheduled_for || null),
      requires_template: enriched.requires_template ?? false,
      allow_freeform_session: enriched.allow_freeform_session ?? false,
      dedupe_key: enriched.dedupe_key || null,
    })

    let row = await getOutboxRow(admin, outboxId)
    if (!sendNow) {
      return json({ ok: true, outbox_id: row.id, status: row.status })
    }

    row = await beginOutboxAttempt(admin, row.id)
    const result = await dispatchNotification(admin, row)
    const updated = await applyDispatchResult(admin, row, result)

    return json({
      ok: result.status === 'sent',
      outbox_id: updated.id,
      status: updated.status,
      provider_status: updated.provider_status,
      provider_message_id: updated.provider_message_id,
      error: updated.error_text,
    })
  } catch (err) {
    return json({ error: (err as Error).message || 'Internal error' }, 500)
  }
})
