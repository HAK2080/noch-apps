// Cold-load audit: production-like first paint. Fresh context (empty
// cache), real network timing to the local preview server. Records every
// JS chunk fetched before the app is interactive, total transfer, and FCP.
// This is the metric that reflects what a first-time visitor downloads.
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:4173'
const REF = 'kxqjasdvoohiexedtfqw'
const ID = '00000000-0000-0000-0000-000000000001'
const OWNER_USER = { id: ID, aud: 'authenticated', role: 'authenticated', email: 'owner@test.local', app_metadata: {}, user_metadata: {} }
const OWNER_PROFILE = { id: ID, role: 'owner', full_name: 'Perf Owner', email: 'owner@test.local', branch_id: 'test-branch' }
const SESSION = { access_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 31536000, refresh_token: 'x', user: OWNER_USER }
const ROUTES = process.argv.slice(3).length ? process.argv.slice(3) : ['/dashboard', '/pos/test-branch', '/finance', '/loyalty']

const b = await chromium.launch()
for (const r of ROUTES) {
  const ctx = await b.newContext()  // fresh cache per route = cold
  await ctx.addInitScript(([ref, s]) => { try { localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s)) } catch {} }, [REF, SESSION])
  const page = await ctx.newPage()
  await page.route(`**/${REF}.supabase.co/**`, (route) => {
    const req = route.request(); const url = req.url(); const single = (req.headers()['accept'] || '').includes('pgrst.object')
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.includes('/rest/v1/profiles')) return json(single ? OWNER_PROFILE : [OWNER_PROFILE])
    return json(single ? {} : [])
  })
  const js = []
  page.on('response', async (resp) => {
    const u = resp.url()
    if (u.endsWith('.js') || u.includes('.js?')) {
      let size = 0
      try { const h = resp.headers(); size = Number(h['content-length'] || 0) } catch {}
      js.push({ name: u.split('/').pop().split('?')[0], size })
    }
  })
  await page.goto(BASE + r, { waitUntil: 'load' })
  await page.waitForTimeout(500)
  const fcp = await page.evaluate(() => { const e = performance.getEntriesByName('first-contentful-paint')[0]; return e ? Math.round(e.startTime) : null })
  const total = js.reduce((a, c) => a + c.size, 0)
  const hasScanner = js.some((c) => c.name.startsWith('vendor-scanner'))
  console.log(`\n### ${r}`)
  console.log(`  FCP: ${fcp} ms | JS chunks: ${js.length} | total JS (uncompressed declared): ${(total / 1024).toFixed(0)} KB`)
  console.log(`  vendor-scanner loaded eagerly? ${hasScanner ? 'YES (BAD)' : 'no'}`)
  console.log('  chunks: ' + js.map((c) => c.name).sort().join(', '))
  await ctx.close()
}
await b.close()
