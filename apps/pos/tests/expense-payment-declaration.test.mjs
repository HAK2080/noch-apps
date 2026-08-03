import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(testDirectory, '..')
const repoRoot = path.resolve(appRoot, '../..')

const readApp = relativePath => fs.readFileSync(path.join(appRoot, relativePath), 'utf8')
const readRepo = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

test('system expense form records paid status and payment method from the submitter', () => {
  const submitTab = readApp('src/pages/expenses/SubmitTab.jsx')
  const i18n = readApp('src/lib/i18n.js')

  assert.match(submitTab, /payment_status_reported: 'unpaid'/)
  assert.match(submitTab, /payment_method_reported: form\.payment_status_reported === 'paid'/)
  assert.match(submitTab, /Has this expense already been paid\?/)
  assert.match(submitTab, /Not paid yet/)
  assert.match(submitTab, /> Cash/)
  assert.match(submitTab, /> Card/)
  assert.match(i18n, /expenseAlreadyPaid: 'هل تم دفع هذا المصروف بالفعل؟'/)
  assert.match(i18n, /expenseSubmitterPaidCard: 'Submitter: Paid card'/)
})

test('owner approval automatically settles a submitter-reported payment', () => {
  const approveTab = readApp('src/pages/expenses/ApproveTab.jsx')
  const migration = readRepo('supabase/migrations/20260725121000_expense_submitter_payment_declaration.sql')

  assert.match(approveTab, /approve_expense_with_reported_payment/)
  assert.match(approveTab, /PaymentDeclarationBadge/)
  assert.match(migration, /payment_status_reported in \('not_reported', 'unpaid', 'paid'\)/)
  assert.match(migration, /when v_expense\.payment_method_reported = 'card' then 'bank'/)
  assert.match(migration, /perform public\.mark_expense_paid/)
  assert.match(migration, /public\.gl_post_expense\(p_expense_id, 'expenses'\)/)
  assert.match(migration, /Automatically settled as shareholder funding/)
  assert.match(migration, /Only an owner can approve expenses/)
})

test('Telegram asks paid status before branch allocation and persists it', () => {
  const webhook = readRepo('supabase/functions/telegram-webhook/index.ts')
  const snapFunction = readRepo('supabase/functions/expense-snap/index.ts')

  assert.match(webhook, /sendPaymentButtons/)
  assert.match(webhook, /Has this expense been paid\?/)
  assert.match(webhook, /epay\|\$\{res\.snap_id\}\|unpaid/)
  assert.match(webhook, /epay\|\$\{res\.snap_id\}\|paid\|cash/)
  assert.match(webhook, /epay\|\$\{res\.snap_id\}\|paid\|card/)
  assert.match(webhook, /action: 'set_payment'/)
  assert.match(snapFunction, /async function actionSetPayment/)
  assert.match(snapFunction, /status: needsAmount \? "awaiting_amount" : "awaiting_payment"/)
  assert.match(snapFunction, /payment_reported_by: snap\.submitted_by/)
  assert.match(snapFunction, /authenticateRequest\(req\)/)
  assert.match(snapFunction, /getSnapForActor\(snapId,\s*actor\)/)
  assert.match(snapFunction, /snap\.submitted_by === actor\.profileId/)
  assert.match(snapFunction, /snap\.source === "telegram"/)
})

test('Receipt Snap PWA offers unpaid, cash, and card choices', () => {
  const snapPage = readApp('src/pages/snap/SnapReceipt.jsx')

  assert.match(snapPage, /setPhase\('payment'\)/)
  assert.match(snapPage, /reportPayment\('unpaid'\)/)
  assert.match(snapPage, /reportPayment\('paid', 'cash'\)/)
  assert.match(snapPage, /reportPayment\('paid', 'card'\)/)
})
