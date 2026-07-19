import {
  CORS_HEADERS,
  applyDispatchResult,
  createAdminClient,
  dispatchNotification,
  json,
} from '../_shared/notifications.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = createAdminClient()
    const body = await req.json().catch(() => ({}))
    const limit = Number(body?.limit) > 0 ? Number(body.limit) : 25

    const { data: claimed, error } = await admin.rpc('claim_notification_outbox', { p_limit: limit })
    if (error) throw error

    const summary = []
    for (const row of claimed || []) {
      const result = await dispatchNotification(admin, row)
      const updated = await applyDispatchResult(admin, row, result)
      summary.push({
        id: updated.id,
        status: updated.status,
        provider_status: updated.provider_status,
        error: updated.error_text,
      })
    }

    return json({ ok: true, processed: summary.length, summary })
  } catch (err) {
    return json({ error: (err as Error).message || 'Internal error' }, 500)
  }
})
