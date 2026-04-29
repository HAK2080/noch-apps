// whatsapp-cron: nightly orchestrator for Phase 2 marketing triggers
// Reads eligibility RPCs, fires send-whatsapp for each recipient, records the
// send in whatsapp_sends. Idempotent: dedupe windows enforced inside RPCs.
// Schedule via pg_cron once daily at 09:00 Tripoli time (06:00 UTC).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const sbHeaders = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
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
  to: string,
  templateName: string,
  templateVariables: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({ to, templateName, templateVariables }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function recordSend(
  customer_id: string,
  phone: string,
  template: string,
  trigger: string,
  status: 'sent' | 'failed',
  error: string | null = null,
  payloadKey: string | null = null,
) {
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_whatsapp_send`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({
      p_customer_id: customer_id,
      p_phone: phone,
      p_template: template,
      p_trigger: trigger,
      p_status: status,
      p_error: error,
      p_payload_key: payloadKey,
    }),
  }).catch(() => {})
}

type Recipient = { customer_id: string; phone: string; full_name: string; [k: string]: unknown }

async function fireBatch(
  trigger: string,
  template: string,
  recipients: Recipient[],
  buildVars: (r: Recipient) => Record<string, string>,
): Promise<{ trigger: string; attempted: number; sent: number; failed: number }> {
  let sent = 0, failed = 0
  for (const r of recipients) {
    const result = await sendTemplate(r.phone, template, buildVars(r))
    if (result.ok) {
      sent++
      await recordSend(r.customer_id, r.phone, template, trigger, 'sent')
    } else {
      failed++
      await recordSend(r.customer_id, r.phone, template, trigger, 'failed', result.error ?? null)
    }
  }
  return { trigger, attempted: recipients.length, sent, failed }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const onlyTriggers: string[] | null = Array.isArray(body.triggers) ? body.triggers : null
    const include = (t: string) => !onlyTriggers || onlyTriggers.includes(t)

    const summary: unknown[] = []

    if (include('anniversary')) {
      const recipients = await rpc<Recipient[]>('whatsapp_anniversary_recipients')
      summary.push(await fireBatch(
        'anniversary',
        'marketing_anniversary',
        recipients,
        (r) => ({ '1': r.full_name, '2': String(r.top_drink ?? 'مشروبك المفضل') }),
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
        (r) => ({ '1': r.full_name, '2': String(r.top_drink ?? 'مشروبك المفضل') }),
      ))
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
