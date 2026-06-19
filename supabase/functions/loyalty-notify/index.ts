// loyalty-notify: compatibility wrapper for manual loyalty/customer sends.
// All customer delivery now goes through send-notification + notification_outbox.

import { CORS_HEADERS, createAdminClient, json, normaliseWhatsAppPhone } from '../_shared/notifications.ts'

const RANDOM_LOVE_VARIANTS = {
  ar: [
    'نوتشي يفكر فيك اليوم.',
    'أنت من الناس اللي تفرح نوتشي.',
    'القهوة أحلى لما نشوفك عندنا.',
  ],
  en: [
    'Nochi is thinking of you today.',
    'You are one of the people who makes Nochi happy.',
    'Coffee feels better when we see you here.',
  ],
}

const EVENT_META: Record<string, { templateKey: string; requiresTemplate: boolean }> = {
  reward_earned: { templateKey: 'reward_earned', requiresTemplate: true },
  nochi_sad: { templateKey: 'nochi_sad', requiresTemplate: true },
  nochi_tired: { templateKey: 'nochi_tired', requiresTemplate: true },
  nochi_deathbed: { templateKey: 'nochi_deathbed', requiresTemplate: true },
  birthday: { templateKey: 'birthday', requiresTemplate: true },
  random_love: { templateKey: 'random_love', requiresTemplate: true },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = createAdminClient()
    const { type, customer_id, lang = 'ar', vars = {} } = await req.json()

    if (!customer_id || !type) {
      return json({ error: 'customer_id and type required' }, 400)
    }

    const event = EVENT_META[type]
    if (!event) return json({ error: 'Unknown notification type' }, 400)

    const { data: customer, error } = await admin
      .from('loyalty_customers')
      .select('id, full_name, phone, phone_normalised, preferred_language, whatsapp_opt_in')
      .eq('id', customer_id)
      .maybeSingle()
    if (error) throw error
    if (!customer) return json({ error: 'Customer not found' }, 404)

    const recipientPhone = customer.phone || customer.phone_normalised
    if (!recipientPhone) return json({ error: 'Customer has no WhatsApp number' }, 400)
    if (customer.whatsapp_opt_in === false) return json({ error: 'Customer is not opted in to WhatsApp' }, 409)

    const language = (lang === 'en' || customer.preferred_language === 'en') ? 'en' : 'ar'
    const previewMessage = type === 'random_love'
      ? RANDOM_LOVE_VARIANTS[language][Math.floor(Math.random() * RANDOM_LOVE_VARIANTS[language].length)]
      : null

    const sendRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
      },
      body: JSON.stringify({
        send_now: true,
        channel: 'whatsapp',
        audience: 'customer',
        event_key: type,
        template_key: event.templateKey,
        customer_id,
        recipient_name: customer.full_name,
        recipient_phone: normaliseWhatsAppPhone(recipientPhone),
        language,
        message_body: previewMessage,
        template_variables: {
          name: customer.full_name,
          days: vars.days ?? 0,
          reward_label: vars.reward_label || vars.drink || 'your reward',
        },
        context: {
          ...vars,
          source: 'loyalty-notify',
        },
        source_module: 'loyalty',
        requires_template: event.requiresTemplate,
      }),
    })

    const result = await sendRes.json().catch(() => ({}))
    if (!sendRes.ok || result?.error || result?.status === 'failed') {
      return json({ error: result?.error || 'Notification send failed', outbox_id: result?.outbox_id || null }, 409)
    }

    return json({
      success: true,
      outbox_id: result?.outbox_id || null,
      status: result?.status || 'queued',
      preview_message: previewMessage,
    })
  } catch (err) {
    return json({ error: (err as Error).message || 'Internal error' }, 500)
  }
})
