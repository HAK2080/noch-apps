// whatsapp-cron: nightly orchestrator for marketing/loyalty automations.
// Reads the existing recipient RPCs, but routes every delivery through the
// notification outbox so status is auditable in one place.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const sbHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status}`)
  return res.json()
}

async function sendTemplate(
  customerId: string,
  phone: string,
  templateKey: string,
  templateVariables: Record<string, string>,
  context: Record<string, unknown> = {},
) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({
      send_now: true,
      channel: 'whatsapp',
      audience: 'customer',
      event_key: templateKey,
      template_key: templateKey,
      customer_id: customerId,
      recipient_phone: phone,
      template_variables: templateVariables,
      context,
      source_module: 'whatsapp-cron',
      requires_template: true,
      dedupe_key: `${templateKey}:${customerId}:${new Date().toISOString().slice(0, 10)}`,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.status === 'failed') {
    return { ok: false, error: data?.error || `HTTP ${res.status}` }
  }
  return { ok: true }
}

type Recipient = { customer_id: string; phone: string; full_name: string; [k: string]: unknown }

async function fireBatch(
  trigger: string,
  templateKey: string,
  recipients: Recipient[],
  buildVars: (recipient: Recipient) => Record<string, string>,
) {
  let sent = 0
  let failed = 0

  for (const recipient of recipients) {
    const result = await sendTemplate(
      recipient.customer_id,
      recipient.phone,
      templateKey,
      buildVars(recipient),
      { trigger, full_name: recipient.full_name },
    )
    if (result.ok) sent++
    else failed++
  }

  return { trigger, attempted: recipients.length, sent, failed }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const onlyTriggers: string[] | null = Array.isArray(body.triggers) ? body.triggers : null
    const include = (trigger: string) => !onlyTriggers || onlyTriggers.includes(trigger)
    const summary: unknown[] = []

    if (include('anniversary')) {
      const recipients = await rpc<Recipient[]>('whatsapp_anniversary_recipients')
      summary.push(await fireBatch(
        'anniversary',
        'marketing_anniversary',
        recipients,
        (r) => ({ '1': r.full_name, '2': String(r.top_drink ?? 'your favorite drink') }),
      ))
    }

    if (include('birthday')) {
      const recipients = await rpc<Recipient[]>('whatsapp_birthday_recipients')
      summary.push(await fireBatch(
        'birthday',
        'loyalty_marketing_birthday',
        recipients,
        (r) => ({ '1': r.full_name }),
      ))
    }

    if (include('lapsed')) {
      const recipients = await rpc<Recipient[]>('whatsapp_lapsed_recipients', { p_days: 30 })
      summary.push(await fireBatch(
        'lapsed',
        'loyalty_lapsed_checkin',
        recipients,
        (r) => ({ '1': r.full_name, '2': String(r.days_since ?? 30) }),
      ))
    }

    if (include('streak')) {
      const recipients = await rpc<Recipient[]>('whatsapp_streak_save_recipients')
      summary.push(await fireBatch(
        'streak',
        'marketing_streak_save',
        recipients,
        (r) => ({ '1': r.full_name, '2': String(r.streak ?? 5) }),
      ))
    }

    if (include('weather')) {
      const recipients = await rpc<Recipient[]>('whatsapp_weather_iced_recipients')
      summary.push(await fireBatch(
        'weather',
        'marketing_weather_iced',
        recipients,
        (r) => ({ '1': r.full_name, '2': String(r.top_drink ?? 'your favorite drink') }),
      ))
    }

    if (include('phoenix')) {
      const recipients = await rpc<Recipient[]>('whatsapp_phoenix_recipients')
      summary.push(await fireBatch(
        'phoenix',
        'loyalty_phoenix_revival',
        recipients,
        (r) => ({ '1': r.full_name, '2': String(r.revival_count ?? 1) }),
      ))
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
