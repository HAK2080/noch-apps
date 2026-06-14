// gl-nightly-sync — nightly auto-posting of sales + approved expenses into
// the General Ledger. Calls gl_sync_period(yesterday, today) with force=false,
// so it NO-OPS entirely while gl_settings.auto_post_enabled = false.
//
// Scheduled hourly by pg_cron; the RPC itself is idempotent and the gate is
// in the DB, so an hourly tick is safe and cheap when disabled.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function ymdInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, key)

    const { data: s } = await admin.from('gl_settings').select('auto_post_enabled').eq('id', 'default').maybeSingle()
    if (!s?.auto_post_enabled) return json({ ok: true, skipped: 'auto_post_disabled' })

    const tz = 'Africa/Tripoli'
    const today = ymdInTz(new Date(), tz)
    const yesterday = ymdInTz(new Date(Date.now() - 86400000), tz)

    const { data, error } = await admin.rpc('gl_sync_period', {
      p_from: yesterday, p_to: today, p_branch: null, p_force: false,
    })
    if (error) throw error
    return json({ ok: true, result: data })
  } catch (err) {
    return json({ ok: false, error: (err as Error).message ?? 'internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
