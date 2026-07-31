import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dashboardUrl = new URL('../src/modules/finance/FinanceDashboard.jsx', import.meta.url)
const dailyUrl = new URL('../src/modules/finance/tabs/DailyPnLTab.jsx', import.meta.url)
const summaryUrl = new URL('../src/modules/finance/tabs/ExecutiveSummaryTab.jsx', import.meta.url)

test('finance navigation and headline metrics use owner-friendly language', async () => {
  const [dashboard, daily, summary] = await Promise.all([
    readFile(dashboardUrl, 'utf8'),
    readFile(dailyUrl, 'utf8'),
    readFile(summaryUrl, 'utf8'),
  ])

  assert.match(dashboard, /Owner overview/)
  assert.match(dashboard, /Daily profit/)
  assert.match(dashboard, /Product costs/)
  assert.match(dashboard, /Budget vs actual/)
  assert.match(daily, /Sales after discounts\/refunds/)
  assert.match(daily, /Product costs \(COGS\)/)
  assert.match(daily, /Profit after operating costs/)
  assert.match(summary, /Weeks of cash left/)
  assert.match(summary, /What needs attention/)
})
