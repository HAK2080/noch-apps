// loyalty-feedback: Receive customer feedback, auto-create task if negative

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!

const sbHeaders = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Prefer': 'return=representation',
}

async function sbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders })
  return res.json()
}

async function sbPost(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(body),
  })
  return res.json()
}

async function sendTelegram(chatId: string, message: string) {
  if (!chatId || !TELEGRAM_TOKEN) return
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
  })
  return res.json()
}

function getSentiment(rating: number): string {
  if (rating <= 2) return 'negative'
  if (rating === 3) return 'neutral'
  return 'positive'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })

  try {
    const { customer_id, rating, comment } = await req.json()

    if (!customer_id || !rating) {
      return new Response(JSON.stringify({ error: 'customer_id and rating required' }), { status: 400 })
    }

    if (rating < 1 || rating > 5) {
      return new Response(JSON.stringify({ error: 'rating must be 1-5' }), { status: 400 })
    }

    const sentiment = getSentiment(rating)

    // Get customer
    const customers = await sbGet(`loyalty_customers?id=eq.${customer_id}&limit=1`)
    const customer = customers?.[0]
    if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 404 })

    let taskId = null

    // Auto-create task for negative feedback
    if (sentiment === 'negative') {
      // Get supervisor profile (owner or first staff with owner role)
      const owners = await sbGet(`profiles?role=eq.owner&limit=1`)
      const supervisor = owners?.[0]

      const taskBody = comment
        ? `⚠️ ملاحظة من عميل: "${comment}"\n\nالتقييم: ${'⭐'.repeat(rating)} (${rating}/5)`
        : `⚠️ عميل أعطى تقييماً منخفضاً: ${rating}/5`

      const taskTitle = `تغذية راجعة سلبية - ${customer.full_name}`

      const tasks = await sbPost('tasks', {
        title: taskTitle,
        description: taskBody,
        assigned_to: supervisor?.id || null,
        created_by: supervisor?.id || null,
        priority: rating === 1 ? 'urgent' : 'high',
        status: 'pending',
        due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      })

      taskId = tasks?.[0]?.id || tasks?.id

      // Send Telegram alert to supervisor if they have a chat ID
      if (supervisor?.telegram_chat_id) {
        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating)
        const alertMsg =
          `🚨 <b>تغذية راجعة سلبية!</b>\n\n` +
          `👤 العميل: ${customer.full_name}\n` +
          `${stars} (${rating}/5)\n` +
          (comment ? `💬 التعليق: "${comment}"\n` : '') +
          `\n📋 تم إنشاء مهمة متابعة تلقائياً`
        await sendTelegram(supervisor.telegram_chat_id, alertMsg)
      }
    }

    // Save feedback record
    await sbPost('loyalty_feedback', {
      customer_id,
      rating,
      comment: comment || null,
      sentiment,
      task_id: taskId,
      visit_date: new Date().toISOString().split('T')[0],
    })

    // Send thank-you message back to customer
    let thankYou = ''
    if (sentiment === 'positive') {
      thankYou = `💚 شكراً ${customer.full_name}!\nنوتشي سعيد بتقييمك! 🐰☕`
    } else if (sentiment === 'neutral') {
      thankYou = `☕ شكراً على رأيك ${customer.full_name}!\nنوتشي يحاول دائماً التحسن 🐰`
    } else {
      thankYou = `💙 شكراً ${customer.full_name} على صراحتك.\nنوتشي يعتذر ويعمل على التحسين 🐰\nسنتواصل معك قريباً.`
    }

    if (customer.phone) {
      await sendTelegram(customer.phone, thankYou)
    }

    return new Response(JSON.stringify({
      success: true,
      sentiment,
      task_created: sentiment === 'negative',
      task_id: taskId,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
