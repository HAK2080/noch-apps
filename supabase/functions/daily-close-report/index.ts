// Sends the completed 5 AM→5 AM trading-day report to configured Telegram chats.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const headers = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
}

type Subscription = {
  branch_id: string
  telegram_chat_id: string
}

type Report = {
  branch_name: string
  day: string
  orders: number
  gross: number
  cash: number
  card: number
  split: number
  refunds: number
  last_week_gross: number
  gross_change_pct: number | null
  top_products: Array<{ name: string; qty: number }>
  stamps: number
  snapped_expenses: number
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return response.json()
}

function money(value: number) {
  return Number(value || 0).toFixed(2)
}

function render(report: Report) {
  const comparison = report.gross_change_pct == null
    ? 'No same-day comparison last week'
    : `${report.gross_change_pct >= 0 ? '▲' : '▼'} ${Math.abs(report.gross_change_pct)}% vs last week`
  const products = report.top_products?.length
    ? report.top_products.map((item, index) => `${index + 1}. ${item.name} — ${item.qty}`).join('\n')
    : 'No product sales'

  return `*${report.branch_name} — Daily close*\n${report.day}\n\n` +
    `Gross: *${money(report.gross)} LYD* (${report.orders} orders)\n` +
    `Cash ${money(report.cash)} · Card ${money(report.card)} · Split ${money(report.split)}\n` +
    `Refunds ${money(report.refunds)}\n${comparison}\n\n` +
    `*Top products*\n${products}\n\n` +
    `Loyalty stamps: ${report.stamps}\nReceipts snapped: ${report.snapped_expenses}`
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok')
  try {
    const subscriptions = await rest<Subscription[]>(
      'daily_close_subscriptions?enabled=eq.true&select=branch_id,telegram_chat_id',
    )
    const results = []
    for (const subscription of subscriptions) {
      const reports = await rest<Report[]>('rpc/daily_close_report_payload', {
        method: 'POST',
        body: JSON.stringify({ p_branch_id: subscription.branch_id }),
      })
      const report = Array.isArray(reports) ? reports[0] : reports
      if (!report) {
        results.push({ branch_id: subscription.branch_id, skipped: 'no_completed_day' })
        continue
      }
      const send = await fetch(`${SUPABASE_URL}/functions/v1/send-telegram`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ chat_id: subscription.telegram_chat_id, message: render(report) }),
      })
      results.push({ branch_id: subscription.branch_id, ok: send.ok })
    }
    return Response.json({ ok: true, attempted: subscriptions.length, results })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
})
