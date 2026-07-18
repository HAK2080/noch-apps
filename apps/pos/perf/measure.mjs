// Repeatable client-side route-transition perf harness.
//
// Method (matches agreed test conditions):
//  - Prod build served by `vite preview` on localhost.
//  - Auth + Supabase fully mocked: a fake owner session is seeded into
//    localStorage and every Supabase REST/auth call is intercepted and
//    answered instantly, so timings reflect React render cost, not
//    network/DB latency, and are deterministic across runs.
//  - The SPA is loaded ONCE. For each route we measure the client-side
//    transition: dashboard -> route, timing from nav trigger to the last
//    DOM mutation (render settled). Each route is warmed once (to load
//    its lazy chunk) then measured 3x; we report the MEDIAN warm time.
//
// Usage: node perf/measure.mjs [--base http://localhost:4173] [--json out.json]

import { chromium } from '@playwright/test'
import fs from 'node:fs'

const args = process.argv.slice(2)
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const BASE = getArg('--base', 'http://localhost:4173')
const JSON_OUT = getArg('--json', 'perf/results.json')
const SUPABASE_REF = 'kxqjasdvoohiexedtfqw'
const SUPABASE_HOST = `${SUPABASE_REF}.supabase.co`

// Concrete route list. Parameterized routes get a sample param.
const SAMPLE_BRANCH = 'test-branch'
const SAMPLE_ID = '00000000-0000-0000-0000-000000000001'
const ROUTES = [
  '/dashboard', '/tasks', `/tasks/${SAMPLE_ID}`, '/staff', '/staff/my-profile',
  '/staff/roles', '/report', '/my-tasks', '/recipes', `/recipes/${SAMPLE_ID}`,
  '/cost-calculator', '/expenses', '/content', '/content/studio',
  '/content/brand/setup', '/content/brands/new', `/content/brand/${SAMPLE_ID}`,
  '/content/review', '/content/ideas', '/products', '/inventory',
  '/inventory/stock-check', '/inventory/stock', '/inventory/procurement',
  '/inventory/suppliers', '/inventory/intelligence', '/finance', '/marketing',
  '/analytics-legacy', '/loyalty', '/loyalty/customers',
  `/loyalty/customers/${SAMPLE_ID}`, '/loyalty/rewards', '/loyalty/qr',
  '/loyalty/settings', '/loyalty/leaderboard', '/loyalty/stamp',
  '/loyalty/gestures', '/loyalty/spin', '/loyalty/feedback',
  '/loyalty/intelligence', '/experiments', `/experiments/${SAMPLE_ID}`,
  '/messages', '/ideas', '/ideas/categories', '/vestaboard', '/accounting',
  '/ops', '/ops/dashboard', '/ops/settings', '/pos', `/pos/${SAMPLE_BRANCH}`,
  `/pos/${SAMPLE_BRANCH}/end-of-day`, `/pos/${SAMPLE_BRANCH}/inventory`,
  `/pos/${SAMPLE_BRANCH}/modifiers`, `/pos/${SAMPLE_BRANCH}/orders`,
  `/pos/${SAMPLE_BRANCH}/products`, `/pos/${SAMPLE_BRANCH}/reports`,
  `/pos/${SAMPLE_BRANCH}/sessions`, `/pos/${SAMPLE_BRANCH}/settings`,
  `/pos/${SAMPLE_BRANCH}/stock-check`, `/pos/${SAMPLE_BRANCH}/tables`,
]

const OWNER_USER = {
  id: SAMPLE_ID, aud: 'authenticated', role: 'authenticated',
  email: 'owner@test.local', app_metadata: {}, user_metadata: {},
}
const OWNER_PROFILE = {
  id: SAMPLE_ID, role: 'owner', full_name: 'Perf Owner',
  email: 'owner@test.local', branch_id: SAMPLE_BRANCH,
}
const SESSION = {
  access_token: 'perf-fake-access-token', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
  refresh_token: 'perf-fake-refresh-token', user: OWNER_USER,
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext()

  // Seed the supabase session into localStorage before any app code runs.
  await ctx.addInitScript(([ref, session]) => {
    try { localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session)) } catch {}
  }, [SUPABASE_REF, SESSION])

  const page = await ctx.newPage()

  // Intercept every Supabase call and answer instantly.
  await page.route(`**/${SUPABASE_HOST}/**`, async (route) => {
    const req = route.request()
    const url = req.url()
    const accept = (req.headers()['accept'] || '')
    const single = accept.includes('pgrst.object')
    const json = (body, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body),
    })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.includes('/auth/v1/token')) return json({ ...SESSION })
    if (url.includes('/auth/v1/user')) return json(OWNER_USER)
    if (url.includes('/auth/v1/logout')) return json({})
    if (url.includes('/rest/v1/profiles')) return json(single ? OWNER_PROFILE : [OWNER_PROFILE])
    if (url.includes('/rest/v1/')) return json(single ? {} : [])
    if (url.includes('/functions/v1/')) return json({})
    return json(single ? {} : [])
  })

  const consoleErrors = []
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  // Helper installed in the page: client-side navigate + measure settle time.
  await page.addInitScript(() => {
    window.__perfNav = (route) => new Promise((resolve) => {
      const start = performance.now()
      let last = start
      const obs = new MutationObserver(() => { last = performance.now() })
      obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
      window.history.pushState({}, '', route)
      window.dispatchEvent(new PopStateEvent('popstate'))
      const cap = start + 5000
      const tick = () => {
        const now = performance.now()
        if (now - last > 150) { obs.disconnect(); resolve({ ms: +(last - start).toFixed(1), capped: false }); return }
        if (now > cap) { obs.disconnect(); resolve({ ms: +(last - start).toFixed(1), capped: true }); return }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  })

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)

  const results = []
  for (const r of ROUTES) {
    // warm the lazy chunk
    await page.evaluate((rt) => window.__perfNav(rt), r)
    await page.evaluate((rt) => window.__perfNav(rt), '/dashboard')
    const samples = []
    let capped = false
    for (let i = 0; i < 3; i++) {
      const res = await page.evaluate((rt) => window.__perfNav(rt), r)
      samples.push(res.ms); capped = capped || res.capped
      await page.evaluate(() => window.__perfNav('/dashboard'))
    }
    const m = median(samples)
    results.push({ route: r, median: m, samples, capped })
    const flag = m < 50 ? 'PASS' : 'FAIL'
    console.log(`${flag.padEnd(5)} ${String(m).padStart(7)} ms  ${r}${capped ? '  (capped)' : ''}`)
  }

  results.sort((a, b) => b.median - a.median)
  const failing = results.filter((r) => r.median >= 50)
  console.log('\n================ SUMMARY ================')
  console.log(`Routes measured: ${results.length}`)
  console.log(`PASS (<50ms):    ${results.length - failing.length}`)
  console.log(`FAIL (>=50ms):   ${failing.length}`)
  console.log(`Max median:      ${results[0]?.median} ms (${results[0]?.route})`)
  if (failing.length) {
    console.log('\nWorst offenders:')
    for (const r of failing.slice(0, 15)) console.log(`  ${String(r.median).padStart(7)} ms  ${r.route}`)
  }
  if (consoleErrors.length) {
    console.log(`\nPage errors (${consoleErrors.length}):`)
    for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log('  ' + e)
  }

  fs.writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, when: new Date().toISOString(), results }, null, 2))
  console.log(`\nWrote ${JSON_OUT}`)

  await browser.close()
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
