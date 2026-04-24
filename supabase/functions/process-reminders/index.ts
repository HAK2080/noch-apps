// Supabase Edge Function — processes scheduled Telegram reminders
// Called by pg_cron every hour: select cron.schedule('process-reminders-hourly', '0 * * * *', ...)
// Uses direct Supabase REST API calls (no imports) for maximum compatibility

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SB_URL = Deno.env.get('SUPABASE_URL') ?? 'https://kxqjasdvoohiexedtfqw.supabase.co'
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'عاجل ⚡',
  high: 'مرتفع 🔴',
  medium: 'متوسط 🟡',
  low: 'منخفض 🟢',
}

async function sbGet(path: string) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, { headers: SB_HEADERS })
  return r.json()
}

async function sbPost(table: string, payload: Record<string, unknown>) {
  const r = await fetch(SB_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(payload),
  })
  return r.json()
}

async function sbPatch(table: string, filter: string, payload: Record<string, unknown>) {
  const r = await fetch(SB_URL + '/rest/v1/' + table + '?' + filter, {
    method: 'PATCH',
    headers: SB_HEADERS,
    body: JSON.stringify(payload),
  })
  return r.json()
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!botToken) {
    return json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, 500)
  }

  const now = new Date()

  // Fetch active reminders that are due, join task + assignee profile for telegram_chat_id
  const reminders = await sbGet(
    'task_reminders?select=*,task:tasks(id,title,description,priority,due_date,status,assigned_to,assignee:profiles!tasks_assigned_to_fkey(telegram_chat_id,full_name))&active=eq.true&next_send_at=lte.' + encodeURIComponent(now.toISOString())
  )

  if (!Array.isArray(reminders) || !reminders.length) {
    return json({ processed: 0, message: 'No reminders due' })
  }

  let processed = 0
  let skipped = 0

  for (const reminder of reminders) {
    const task = reminder.task

    // Deactivate if task is done or deleted
    if (!task || task.status === 'done') {
      await sbPatch('task_reminders', 'id=eq.' + reminder.id, { active: false })
      skipped++
      continue
    }

    // Resolve the Telegram chat_id: prefer explicitly stored one, fall back to assignee's
    const chatId: string | null =
      reminder.telegram_chat_id ?? task.assignee?.telegram_chat_id ?? null

    if (!chatId) {
      console.warn(`No telegram_chat_id for reminder ${reminder.id}, skipping`)
      skipped++
      continue
    }

    // Build reminder message
    const message =
      `📋 *نوتشي - إدارة المهام*\n\n` +
      `🔔 *تذكير بمهمة*\n\n` +
      `*${task.title}*\n` +
      (task.description ? `${task.description}\n\n` : '\n') +
      `الأولوية: ${PRIORITY_LABELS[task.priority] || task.priority}\n` +
      (task.due_date ? `الموعد النهائي: ${task.due_date}\n` : '') +
      `\n_يمكنك الرد على هذه الرسالة لإضافة تعليق على المهمة_\n` +
      `— فريق بلوم - نوتش ☕`

    // Send via Telegram Bot API
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text: message,
        parse_mode: 'Markdown',
      }),
    })

    const tgData = await res.json()

    if (!res.ok || !tgData.ok) {
      console.error(`Telegram error for reminder ${reminder.id}:`, tgData)
      continue
    }

    // Store sent message_id → task mapping so replies can be linked back
    const sentMessageId: number = tgData.result?.message_id
    if (sentMessageId) {
      await sbPost('telegram_messages', {
        task_id: task.id,
        reminder_id: reminder.id,
        chat_id: String(chatId),
        message_id: sentMessageId,
      })
    }

    // Update reminder: calculate next send or deactivate (one-time)
    if (reminder.frequency === 'specific_date') {
      await sbPatch('task_reminders', 'id=eq.' + reminder.id, { active: false })
    } else {
      const days =
        reminder.frequency === 'daily' ? 1
        : reminder.frequency === 'every2days' ? 2
        : reminder.frequency === 'weekly' ? 7
        : reminder.interval_days ?? 1

      const next = new Date(now)
      next.setDate(next.getDate() + days)
      if (reminder.send_time) {
        const [h, m] = reminder.send_time.split(':').map(Number)
        next.setHours(h, m, 0, 0)
      }

      await sbPatch('task_reminders', 'id=eq.' + reminder.id, {
        next_send_at: next.toISOString(),
      })
    }

    processed++
  }

  return json({ processed, skipped, total: reminders.length })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
