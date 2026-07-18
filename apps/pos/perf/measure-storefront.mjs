// Storefront perf harness. HashRouter SPA, all routes public.
// Measures warm client-side route transitions (hash nav) + a cold-load
// audit (what the first visit downloads). Supabase mocked for determinism.
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:4174'
const REF = 'kxqjasdvoohiexedtfqw'
const ROUTES = ['/', '/menu', '/shop', '/loyalty', '/wall', '/passport/demo-token']
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

const b = await chromium.launch()
const ctx = await b.newContext()
const page = await ctx.newPage()
await page.route(`**/${REF}.supabase.co/**`, (route) => {
  const req = route.request(); const single = (req.headers()['accept'] || '').includes('pgrst.object')
  const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  return json(single ? {} : [])
})

await page.addInitScript(() => {
  window.__hashNav = (route) => new Promise((resolve) => {
    const start = performance.now(); let last = start
    const obs = new MutationObserver(() => { last = performance.now() })
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    window.location.hash = '#' + route
    const cap = start + 5000
    const tick = () => { const now = performance.now()
      if (now - last > 150) { obs.disconnect(); resolve({ ms: +(last - start).toFixed(1), capped: false }); return }
      if (now > cap) { obs.disconnect(); resolve({ ms: +(last - start).toFixed(1), capped: true }); return }
      requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
})

// Cold-load audit (fresh context per route).
console.log('=== COLD LOAD (fresh cache) ===')
for (const r of ['/', '/menu']) {
  const c2 = await b.newContext(); const p2 = await c2.newPage()
  await p2.route(`**/${REF}.supabase.co/**`, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }))
  const reqs = []
  p2.on('response', (resp) => { const u = resp.url(); if (u.endsWith('.js') || u.includes('.js')) reqs.push(u) })
  const t0 = Date.now()
  try { await p2.goto(BASE + '/#' + r, { waitUntil: 'load', timeout: 30000 }) } catch (e) { console.log(`  ${r}: goto error ${e.message}`) }
  await p2.waitForTimeout(800)
  const fcp = await p2.evaluate(() => { const e = performance.getEntriesByName('first-contentful-paint')[0]; return e ? Math.round(e.startTime) : null })
  const txtLen = (await p2.evaluate(() => (document.getElementById('root')?.innerText || '').length))
  console.log(`  ${r}: FCP=${fcp}ms loadWall=${Date.now() - t0}ms rootTextChars=${txtLen}`)
  console.log(`     external JS: ${[...new Set(reqs.map(u => u.replace(/^https?:\/\//, '').split('/')[0]))].join(', ')}`)
  await c2.close()
}

// Warm transitions.
console.log('\n=== WARM HASH TRANSITIONS (median of 3) ===')
await page.goto(BASE + '/#/', { waitUntil: 'load', timeout: 30000 })
await page.waitForTimeout(1000)
const results = []
for (const r of ROUTES) {
  await page.evaluate((rt) => window.__hashNav(rt), r)
  await page.evaluate(() => window.__hashNav('/'))
  const samples = []; let capped = false
  for (let i = 0; i < 3; i++) { const res = await page.evaluate((rt) => window.__hashNav(rt), r); samples.push(res.ms); capped = capped || res.capped; await page.evaluate(() => window.__hashNav('/')) }
  const m = median(samples); results.push({ r, m })
  console.log(`  ${(m < 50 ? 'PASS' : 'FAIL').padEnd(5)} ${String(m).padStart(7)} ms  ${r}${capped ? ' (capped)' : ''}`)
}
const fails = results.filter(x => x.m >= 50)
console.log(`\nWarm: ${results.length - fails.length}/${results.length} under 50ms. Max ${Math.max(...results.map(x => x.m))}ms`)
await b.close()
