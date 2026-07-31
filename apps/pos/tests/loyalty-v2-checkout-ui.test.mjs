import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const modalUrl = new URL('../src/modules/pos/components/PaymentModal.jsx', import.meta.url)
const terminalUrl = new URL('../src/modules/pos/pages/POSTerminal.jsx', import.meta.url)
const dataUrl = new URL('../src/modules/pos/lib/pos-supabase.js', import.meta.url)
const appUrl = new URL('../src/App.jsx', import.meta.url)
const missionsUrl = new URL('../src/modules/loyalty/pages/LoyaltyMissionsV2.jsx', import.meta.url)
const claimUrl = new URL('../src/modules/loyalty/pages/LoyaltyCheckoutClaim.jsx', import.meta.url)

test('transaction QR is the primary loyalty action and phone lookup is collapsed fallback', async () => {
  const source = await readFile(modalUrl, 'utf8')
  const qrPosition = source.indexOf('Customer scans to collect points')
  const phonePosition = source.indexOf('Cashier phone lookup')

  assert.ok(qrPosition > 0, 'transaction QR prompt must be rendered')
  assert.ok(phonePosition > qrPosition, 'phone fallback must appear after the transaction QR')
  assert.match(source, /showPhoneFallback && \(/)
  assert.match(source, /createLoyaltyCheckoutV2\(branchId,\s*cartToken\)/)
  assert.match(source, /getLoyaltyCheckoutV2\(session\.session_id\)/)
  assert.match(source, /No phone number is spoken or shown to the cashier/)
})

test('every paid order records one explicit loyalty capture outcome', async () => {
  const [terminalSource, appSource] = await Promise.all([
    readFile(terminalUrl, 'utf8'),
    readFile(appUrl, 'utf8'),
  ])

  assert.match(terminalSource, /loyalty_checkout_session_id:\s*loyaltyCheckoutSessionId/)
  assert.match(terminalSource, /await createPOSOrder\(orderData,\s*items\)[\s\S]*await recordLoyaltyCaptureDecisionV2\(\{[\s\S]*orderId:\s*order\.id,[\s\S]*sessionId:\s*loyaltyCheckoutSessionId,[\s\S]*outcome:\s*loyaltyCaptureOutcome/)
  assert.match(appSource, /path="\/loyalty\/checkout\/:token"/)
  assert.doesNotMatch(appSource, /path="\/loyalty\/checkout\/:token" element=\{<ProtectedRoute>/)
})

test('available rewards and the discounted order commit through one atomic V2 RPC', async () => {
  const [modalSource, terminalSource, dataSource] = await Promise.all([
    readFile(modalUrl, 'utf8'),
    readFile(terminalUrl, 'utf8'),
    readFile(dataUrl, 'utf8'),
  ])

  assert.match(modalSource, /getAvailableLoyaltyRewardsV2\(loyaltyCustomer\.id,\s*branchId\)/)
  assert.match(modalSource, /const payableTotal = Math\.max\(0,\s*total - rewardDiscount\)/)
  assert.match(modalSource, /loyalty_reward_entitlement_id:\s*selectedReward\?\.entitlement_id/)
  assert.match(terminalSource, /discountAmount = round\(\(showPayment\.discountAmount \|\| 0\) \+ \(loyaltyRewardDiscount \|\| 0\)\)/)
  assert.match(terminalSource, /loyalty_reward_entitlement_id:\s*loyaltyRewardEntitlementId/)
  assert.doesNotMatch(terminalSource, /redeemLoyaltyRewardV2/)
  assert.match(dataSource, /create_pos_order_with_loyalty_reward_v2/)
  assert.match(dataSource, /p_loyalty_reward_entitlement_id/)
})

test('owner mission management covers launch mission types and campaign controls', async () => {
  const [appSource, missionSource] = await Promise.all([
    readFile(appUrl, 'utf8'),
    readFile(missionsUrl, 'utf8'),
  ])

  assert.match(appSource, /path="\/loyalty\/missions"[\s\S]*<OwnerRoute><LoyaltyMissionsV2/)
  assert.match(missionSource, /repeat_visit/)
  assert.match(missionSource, /selected_product/)
  assert.match(missionSource, /selected_category/)
  assert.match(missionSource, /quiet_hours/)
  assert.match(missionSource, /Only two live missions can be active at once/)
  assert.match(missionSource, /mission\.status === 'active' \? 'suspended' : 'active'/)
  assert.match(missionSource, /create_loyalty_mission_version_v3/)
  assert.match(missionSource, /English and Arabic titles are required/)
  assert.match(missionSource, /p_title_ar:\s*payload\.title_ar/)
  assert.match(missionSource, /p_description_ar:\s*payload\.description_ar/)
  assert.match(missionSource, /New mission version created/)
})

test('customer claim page waits for payment and shows earned points after settlement', async () => {
  const source = await readFile(claimUrl, 'utf8')

  assert.match(source, /supabase\.rpc\('get_my_loyalty_checkout_v2'/)
  assert.match(source, /Waiting for payment/)
  assert.match(source, /\+\{result\.points_earned\} points/)
  assert.match(source, /result\.missions\.map/)
})
