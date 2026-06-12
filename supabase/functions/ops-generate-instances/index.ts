// ops-generate-instances — daily cron entry that materialises today's
// task instances from active templates. Honours ops_settings: if
// module_enabled is false, the RPC is a no-op (no rows inserted).
//
// Schedule from outside (pg_cron, GitHub Actions, or Supabase scheduled
// function); the function itself is idempotent thanks to the
// UNIQUE(template_id, business_date) constraint on ops_task_instances.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function todayInTz(tz: string): string {
  // YYYY-MM-DD in the given IANA timezone (defaults to Africa/Tripoli)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return fmt.format(new Date())
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, key)

    // Read tz from settings; module_enabled is enforced inside the RPC.
    const { data: s } = await admin.from('ops_settings').select('timezone, module_enabled').eq('id', 'default').maybeSingle()
    const tz = (s?.timezone as string | undefined) || 'Africa/Tripoli'
    const businessDate = todayInTz(tz)

    if (!s?.module_enabled) {
      return json({ ok: true, skipped: 'module_disabled', business_date: businessDate })
    }

    const { data, error } = await admin.rpc('ops_generate_instances_for', { p_business_date: businessDate })
    if (error) throw error
    return json({ ok: true, business_date: businessDate, inserted: Array.isArray(data) ? data.length : 0 })
  } catch (err) {
    return json({ ok: false, error: (err as Error).message ?? 'internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
