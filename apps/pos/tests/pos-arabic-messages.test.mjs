import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { POS_MESSAGES_AR, posMessage, posError, posLanguage, savedPosLanguage } from '../src/modules/pos/lib/pos-messages.js'

test('cashier controls default to Arabic, including bilingual product mode', () => {
  for (const value of [undefined, null, '', 'ar', 'both', 'invalid']) assert.equal(posLanguage(value), 'ar')
  assert.equal(posLanguage('en'), 'en')
  assert.equal(savedPosLanguage(), 'ar')
})

test('every cashier message has Arabic copy and matching interpolation fields', () => {
  for (const [english, arabic] of Object.entries(POS_MESSAGES_AR)) {
    assert.match(arabic, /[\u0600-\u06ff]/, english)
    const fields = value => [...value.matchAll(/\{\w+\}/g)].map(m => m[0]).sort()
    assert.deepEqual(fields(arabic), fields(english), english)
    assert.equal(posMessage(english, 'en'), english)
  }
  assert.equal(posMessage('Order {number} accepted', 'ar', { number: 'ONL-123' }), 'تم قبول الطلب ONL-123')
  assert.equal(posMessage('Synced {count} offline order(s)', 'ar', { count: 3 }), 'تمت مزامنة 3 طلب محفوظ على الجهاز')
})

test('cashiers get actionable Arabic errors, not raw backend failures', () => {
  assert.equal(posError(new Error('Failed to fetch'), 'Lookup failed'), POS_MESSAGES_AR['Network unavailable. Check your connection and try again.'])
  assert.equal(posError(new Error('Identity exception: multiple accounts'), 'Lookup failed'), POS_MESSAGES_AR['Ask the manager to resolve this account match.'])
  assert.equal(posError(new Error('secret database diagnostic'), 'Failed to complete sale'), POS_MESSAGES_AR['Failed to complete sale'])
  assert.equal(posError(new Error('Reward redemption requires an internet connection'), 'Failed to complete sale'), POS_MESSAGES_AR['Reward redemption requires an internet connection'])
  assert.equal(posError(new Error('Technical detail'), 'Lookup failed', 'en'), 'Technical detail')
})

test('terminal and checkout use translated messages without changing payment contracts', async () => {
  const terminal = await readFile(new URL('../src/modules/pos/pages/POSTerminal.jsx', import.meta.url), 'utf8')
  const payment = await readFile(new URL('../src/modules/pos/components/PaymentModal.jsx', import.meta.url), 'utf8')
  assert.match(terminal, /posLang=\{posLanguage\(tileLang\)\}/)
  assert.doesNotMatch(terminal, /posLang=\{tileLang === 'ar' \? 'ar' : 'en'\}/)
  assert.match(terminal, /msg\('New Online Order!'\)/)
  assert.match(payment, /posLang = 'ar'/)
  assert.match(payment, /posError\(err, 'Could not attach loyalty customer', posLang\)/)
  assert.match(payment, /const canComplete = paymentValid && loyaltyDecision !== null/)
  assert.match(payment, /loyalty_reward_entitlement_id: selectedReward\?\.entitlement_id/)
})
