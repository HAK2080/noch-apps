// Sanity check: confirm pages render real content under the mock,
// so the perf numbers reflect genuine renders (not empty error states).
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:4173'
const REF = 'kxqjasdvoohiexedtfqw'
const ID = '00000000-0000-0000-0000-000000000001'
const OWNER_USER = { id: ID, aud: 'authenticated', role: 'authenticated', email: 'owner@test.local', app_metadata: {}, user_metadata: {} }
const OWNER_PROFILE = { id: ID, role: 'owner', full_name: 'Perf Owner', email: 'owner@test.local', branch_id: 'test-branch' }
const SESSION = { access_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 31536000, refresh_token: 'x', user: OWNER_USER }
const CHECK = ['/finance', '/accounting', '/pos/test-branch/tables', '/loyalty', '/inventory', '/marketing', '/staff']

const b = await chromium.launch()
const ctx = await b.newContext()
await ctx.addInitScript(([ref, s]) => { try { localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s)) } catch {} }, [REF, SESSION])
const page = await ctx.newPage()
await page.route(`**/${REF}.supabase.co/**`, (route) => {
  const req = route.request(); const url = req.url(); const single = (req.headers()['accept'] || '').includes('pgrst.object')
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  if (url.includes('/rest/v1/profiles')) return json(single ? OWNER_PROFILE : [OWNER_PROFILE])
  return json(single ? {} : [])
})
for (const r of CHECK) {
  await page.goto(BASE + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const txt = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ').trim()
  console.log(`\n### ${r}  (chars=${txt.length})\n${txt.slice(0, 220)}`)
}
await b.close()
