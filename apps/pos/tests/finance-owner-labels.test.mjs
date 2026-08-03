import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dashboardUrl = new URL('../src/modules/finance/FinanceDashboard.jsx', import.meta.url)
const dailyUrl = new URL('../src/modules/finance/tabs/DailyPnLTab.jsx', import.meta.url)
const summaryUrl = new URL('../src/modules/finance/tabs/ExecutiveSummaryTab.jsx', import.meta.url)
const managementReportUrl = new URL('../src/pages/Report.jsx', import.meta.url)

test('finance navigation and headline metrics use owner-friendly language', async () => {
  const [dashboard, daily, summary, managementReport] = await Promise.all([
    readFile(dashboardUrl, 'utf8'),
    readFile(dailyUrl, 'utf8'),
    readFile(summaryUrl, 'utf8'),
    readFile(managementReportUrl, 'utf8'),
  ])

  assert.match(dashboard, /Owner overview/)
  assert.match(dashboard, /Daily profit/)
  assert.match(dashboard, /Product costs/)
  assert.match(dashboard, /Budget vs actual/)
  assert.match(daily, /Net sales/)
  assert.match(daily, /Product costs \(COGS\)/)
  assert.match(daily, /Direct operating profit/)
  assert.match(daily, /Fully loaded operating profit/)
  assert.match(daily, /05:00–05:00 Africa\/Tripoli/)
  assert.match(summary, /Weeks of cash left/)
  assert.match(summary, /What needs attention/)
  assert.match(summary, /Branch reconciliation/)
  assert.match(summary, /Report completeness/)
  assert.match(managementReport, /Payment reconciliation/)
  assert.match(managementReport, /Cash collected/)
  assert.match(managementReport, /Card collected/)
  assert.match(managementReport, /Presto collected/)
  assert.match(managementReport, /مطابقة المدفوعات/)
  assert.match(managementReport, /الربح التشغيلي بعد تحميل جميع التكاليف/)
})
