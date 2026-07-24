// loyalty-feedback: compatibility wrapper for storefront/POS feedback submits.
// Customer notifications are handled by submit_feedback -> notification_outbox.
// Telegram remains only for internal staff escalation on negative feedback.

import { CORS_HEADERS, createAdminClient, json } from '../_shared/notifications.ts'

const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!

async function sendTelegram(chatId: string, message: string) {
  if (!chatId || !TELEGRAM_TOKEN) return
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
  }).catch(() => {})
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = createAdminClient()
    const { customer_id, rating, comment } = await req.json()

    if (!customer_id || !rating) {
      return json({ error: 'customer_id and rating required' }, 400)
    }

    const { data: customer, error: customerError } = await admin
      .from('loyalty_customers')
      .select('id, full_name, phone')
      .eq('id', customer_id)
      .maybeSingle()
    if (customerError) throw customerError
    if (!customer) return json({ error: 'Customer not found' }, 404)

    const { data, error } = await admin.rpc('submit_feedback', {
      p_branch_id: null,
      p_rating: rating,
      p_comment: comment || null,
      p_order_id: null,
      p_source: 'loyalty-feedback',
      p_phone: customer.phone || null,
    })
    if (error) throw error
    if (!data?.ok) {
      return json({ error: data?.error || 'submit_feedback failed' }, 400)
    }

    if (data.sentiment === 'negative') {
      const { data: owner } = await admin
        .from('profiles')
        .select('telegram_chat_id, full_name')
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle()

      if (owner?.telegram_chat_id) {
        const stars = '★'.repeat(Number(rating)) + '☆'.repeat(Math.max(0, 5 - Number(rating)))
        const alert = [
          '<b>Negative customer feedback</b>',
          '',
          `Customer: ${customer.full_name}`,
          `Rating: ${stars} (${rating}/5)`,
          comment ? `Comment: "${comment}"` : null,
          `Feedback id: ${data.id}`,
        ].filter(Boolean).join('\n')
        await sendTelegram(owner.telegram_chat_id, alert)
      }
    }

    return json({
      success: true,
      sentiment: data.sentiment,
      feedback_id: data.id,
      points_awarded: data.points_awarded,
      total_points: data.total_points,
      reward_code: data.reward_code,
    })
  } catch (err) {
    return json({ error: (err as Error).message || 'Internal error' }, 500)
  }
})
