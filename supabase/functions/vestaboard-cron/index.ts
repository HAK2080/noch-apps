// Selects one due Noch Channel and enqueues an approved Vestaboard message.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const headers = { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

type Channel = {
  id: string
  name: string
  channel_type: string
  cadence_minutes: number
  start_hour: number
  end_hour: number
  config: Record<string, unknown>
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

function boardText(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9 !@#.,?'\-:$%&+()\/\n]/g, '').slice(0, 132)
}

async function compose(channel: Channel): Promise<string> {
  if (channel.channel_type === 'weather') {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.8872&longitude=13.1913&current=temperature_2m,weather_code&timezone=Africa%2FTripoli')
    const weather = await response.json()
    return `TRIPOLI NOW\n${Math.round(weather.current?.temperature_2m || 0)} C\nHAVE A NOCH DAY`
  }
  if (channel.channel_type === 'sales') {
    const latest = await api<Array<{ day: string }>>('pos_sales_daily?select=day&order=day.desc&limit=1')
    if (!latest[0]) return 'NO SALES DATA YET'
    const rows = await api<Array<{ gross: number; orders: number }>>(`pos_sales_daily?day=eq.${latest[0].day}&select=gross,orders`)
    const gross = rows.reduce((sum, row) => sum + Number(row.gross || 0), 0)
    const orders = rows.reduce((sum, row) => sum + Number(row.orders || 0), 0)
    return `NOCH DAILY\n${orders} ORDERS\n${gross.toFixed(0)} LYD\nKEEP GOING`
  }
  if (channel.channel_type === 'loyalty') {
    const metric = await api<{ attached_orders?: number; attach_rate?: number }>('rpc/loyalty_checkout_metrics', {
      method: 'POST', body: JSON.stringify({ p_days: 7 }),
    })
    return `NOCHI LOYALTY\n${metric.attached_orders || 0} VISITS\n${metric.attach_rate || 0}% ATTACH RATE`
  }
  if (channel.channel_type === 'custom' || channel.channel_type === 'special') {
    return String(channel.config?.message || channel.name)
  }
  const quotes = [
    'GOOD COFFEE. GOOD MOOD. NOCH.',
    'STAY CURIOUS. DRINK MATCHA.',
    'TODAY IS A GOOD DAY FOR NOCH.',
    'SMALL SIPS. BIG IDEAS.',
  ]
  const day = Math.floor(Date.now() / 86400000)
  return quotes[day % quotes.length]
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok')
  try {
    const now = new Date()
    const tripoliHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tripoli', hour: '2-digit', hour12: false }).format(now))
    const due = await api<Channel[]>(`vestaboard_channels?enabled=eq.true&next_run_at=lte.${encodeURIComponent(now.toISOString())}&order=priority.desc,next_run_at.asc&limit=10`)
    const channel = due.find(item => item.start_hour <= item.end_hour
      ? tripoliHour >= item.start_hour && tripoliHour < item.end_hour
      : tripoliHour >= item.start_hour || tripoliHour < item.end_hour)
    if (!channel) return Response.json({ ok: true, skipped: 'no_due_channel' })

    const owners = await api<Array<{ id: string }>>('profiles?role=eq.owner&select=id&limit=1')
    if (!owners[0]) throw new Error('No owner profile available for system queue ownership')
    const message = boardText(await compose(channel))
    await api('vestaboard_messages', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ message, submitted_by: owners[0].id, status: 'approved' }),
    })
    const nextRun = new Date(now.getTime() + channel.cadence_minutes * 60000).toISOString()
    await api(`vestaboard_channels?id=eq.${channel.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_enqueued_at: now.toISOString(), next_run_at: nextRun, updated_at: now.toISOString() }),
    })
    return Response.json({ ok: true, channel: channel.name, message, next_run_at: nextRun })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
})
