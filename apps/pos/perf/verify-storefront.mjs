// Verify the precompiled storefront renders all routes with no errors,
// and measure cold FCP. Run against the storefront preview.
import { chromium } from '@playwright/test'
const BASE = process.argv[2] || 'http://localhost:4174'
const REF = 'kxqjasdvoohiexedtfqw'
const ROUTES = ['/', '/menu', '/shop', '/loyalty', '/wall', '/passport/demo-token']
const b = await chromium.launch()
let anyError = false
for (const r of ROUTES) {
  const ctx = await b.newContext(); const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.route(`**/${REF}.supabase.co/**`, (rt) => rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }))
  try { await page.goto(BASE + '/#' + r, { waitUntil: 'load', timeout: 30000 }) } catch (e) { errors.push('goto: ' + e.message) }
  await page.waitForTimeout(1200)
  const fcp = await page.evaluate(() => { const e = performance.getEntriesByName('first-contentful-paint')[0]; return e ? Math.round(e.startTime) : null })
  const txt = (await page.evaluate(() => (document.getElementById('root')?.innerText || '').replace(/\s+/g, ' ').trim()))
  const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource'))
  if (realErrors.length) anyError = true
  console.log(`\n### ${r}  FCP=${fcp}ms  rootChars=${txt.length}`)
  console.log('   ' + (txt.slice(0, 140) || '(EMPTY!)'))
  if (realErrors.length) console.log('   ERRORS: ' + realErrors.slice(0, 4).join(' | '))
  await ctx.close()
}
console.log('\n' + (anyError ? 'XX  Errors detected — DO NOT deploy' : 'OK  All routes rendered, no runtime errors'))
await b.close()
