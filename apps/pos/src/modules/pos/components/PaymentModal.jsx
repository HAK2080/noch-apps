// PaymentModal.jsx — Payment collection modal

import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { X, DollarSign, CreditCard, Shuffle, QrCode, Bike, Phone, Loader2, ChevronDown, Gift } from 'lucide-react'
import QRCode from 'qrcode'
// Scanners are heavy (@zxing/html5-qrcode). Lazy so the eager POSTerminal
// import chain doesn't drag them into the cold bundle.
const BarcodeScanner = lazy(() => import('./BarcodeScanner'))
const QRScanner      = lazy(() => import('./QRScanner'))
import {
  closeLoyaltyCheckoutV2,
  createLoyaltyCheckoutV2,
  getAvailableLoyaltyRewardsV2,
  getLoyaltyCheckoutV2,
  lookupCustomerByPassportToken,
  lookupOrCreateLoyaltyMemberV2,
} from '../../loyalty/lib/loyalty-supabase'
import { translations } from '../../../lib/i18n'
import toast from 'react-hot-toast'
import { format } from '../lib/money'

// Local-only POS translation — see CartPanel for rationale.
const posT = (key, lang) =>
  translations[lang === 'ar' ? 'ar' : 'en']?.[key] || translations.en?.[key] || key

const NUMPAD_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫']

function Numpad({ value, onChange }) {
  const handleKey = (k) => {
    if (k === '⌫') {
      onChange(value.slice(0, -1) || '0')
    } else if (k === '.' && value.includes('.')) {
      return
    } else {
      onChange(value === '0' ? k : value + k)
    }
  }
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {NUMPAD_KEYS.map(k => (
        <button
          key={k}
          onClick={() => handleKey(k)}
          className={`py-3 rounded-xl text-lg font-semibold transition-all active:scale-95
            ${k === '⌫'
              ? 'bg-noch-border/50 text-noch-muted hover:bg-noch-border'
              : 'bg-noch-card border border-noch-border text-white hover:border-noch-green/30 hover:bg-noch-green/5'
            }`}
        >
          {k}
        </button>
      ))}
    </div>
  )
}

const newCartToken = () => (
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0')
)

const calculateRewardDiscount = (reward, cart, total) => {
  if (!reward) return 0
  if (reward.reward_type === 'fixed_discount') {
    return Math.min(total, Math.max(0, Number(reward.reward_value_lyd || 0)))
  }
  const productIds = reward.product_ids || []
  const categoryIds = reward.category_ids || []
  const eligibleLines = cart.filter(line => (
    (productIds.length === 0 && categoryIds.length === 0)
    || productIds.includes(line.product_id)
    || categoryIds.includes(line.category_id)
  ))
  if (eligibleLines.length === 0) return 0
  return Math.min(total, Math.min(...eligibleLines.map(line => Number(line.price || 0))))
}

export default function PaymentModal({ total, branchId, cart = [], onComplete, onClose, submitting = false, loyaltyCustomer: initialLoyalty, posLang = 'en', prestoEnabled = false }) {
  const t = (k) => posT(k, posLang)
  const [method, setMethod] = useState('cash') // cash | card | split | presto
  const [cashTendered, setCashTendered] = useState(total.toFixed(2))
  const [cardAmount, setCardAmount] = useState('0')
  const [showScanner, setShowScanner] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(initialLoyalty || null)
  const [loyaltyPhone, setLoyaltyPhone] = useState('')
  const [linkingPhone, setLinkingPhone] = useState(false)
  const [showPhoneFallback, setShowPhoneFallback] = useState(false)
  const [cartToken, setCartToken] = useState(newCartToken)
  const [checkoutSession, setCheckoutSession] = useState(null)
  const [checkoutQr, setCheckoutQr] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [loyaltyDecision, setLoyaltyDecision] = useState(
    initialLoyalty
      ? { outcome: 'linked', captureMethod: 'existing_card', skipReason: null }
      : null,
  )
  const [availableRewards, setAvailableRewards] = useState([])
  const [selectedRewardId, setSelectedRewardId] = useState(null)

  useEffect(() => {
    if (!loyaltyCustomer?.id || !branchId) {
      setAvailableRewards([])
      setSelectedRewardId(null)
      return
    }
    let active = true
    getAvailableLoyaltyRewardsV2(loyaltyCustomer.id, branchId)
      .then(rewards => {
        if (active) setAvailableRewards(rewards)
      })
      .catch(() => {
        if (active) setAvailableRewards([])
      })
    return () => { active = false }
  }, [branchId, loyaltyCustomer?.id])

  const selectedReward = availableRewards.find(reward => reward.entitlement_id === selectedRewardId) || null
  const rewardDiscount = useMemo(
    () => calculateRewardDiscount(selectedReward, cart, total),
    [cart, selectedReward, total],
  )
  const payableTotal = Math.max(0, total - rewardDiscount)

  const changeDue = method === 'cash'
    ? Math.max(0, parseFloat(cashTendered || 0) - payableTotal)
    : 0

  const splitCash = payableTotal - parseFloat(cardAmount || 0)
  const splitValid = method === 'split' &&
    parseFloat(cardAmount) > 0 &&
    parseFloat(cardAmount) < payableTotal

  const paymentValid =
    (method === 'cash' && parseFloat(cashTendered || 0) >= payableTotal) ||
    method === 'card' ||
    method === 'presto' ||
    splitValid
  const canComplete = paymentValid && loyaltyDecision !== null

  const handleComplete = useCallback(() => {
    if (!canComplete) return
    const paymentData = {
      payment_method: method,
      cash_tendered: method === 'cash' ? parseFloat(cashTendered) : null,
      change_due: changeDue,
      card_amount: (method === 'card' || method === 'presto') ? payableTotal : method === 'split' ? parseFloat(cardAmount) : 0,
      loyalty_customer_id: loyaltyCustomer?.id || null,
      loyalty_customer: loyaltyCustomer,
      loyalty_checkout_session_id: checkoutSession?.session_id || null,
      loyalty_reward_entitlement_id: selectedReward?.entitlement_id || null,
      loyalty_reward_discount: rewardDiscount,
      loyalty_capture_outcome: loyaltyDecision.outcome,
      loyalty_capture_method: loyaltyDecision.captureMethod,
      loyalty_skip_reason: loyaltyDecision.skipReason,
    }
    onComplete(paymentData)
  }, [canComplete, method, cashTendered, changeDue, cardAmount, payableTotal, loyaltyCustomer, checkoutSession, selectedReward, rewardDiscount, loyaltyDecision, onComplete])

  useEffect(() => {
    if (!branchId || loyaltyCustomer) return undefined
    let active = true
    let pollTimer

    const startCheckout = async () => {
      try {
        setCheckoutError('')
        const session = await createLoyaltyCheckoutV2(branchId, cartToken)
        if (!active) return
        const claimUrl = `${window.location.origin}/loyalty/checkout/${encodeURIComponent(session.token)}`
        const qr = await QRCode.toDataURL(claimUrl, { width: 240, margin: 1 })
        if (!active) return
        setCheckoutSession(session)
        setCheckoutQr(qr)

        pollTimer = window.setInterval(async () => {
          try {
            const status = await getLoyaltyCheckoutV2(session.session_id)
            if (!active) return
            setCheckoutSession(current => ({ ...current, ...status }))
            if (status.status === 'claimed' && status.customer_id) {
              setLoyaltyCustomer({
                id: status.customer_id,
                full_name: status.full_name,
                points_balance: status.points_balance,
                available_rewards: status.available_rewards,
              })
              setLoyaltyDecision({
                outcome: 'linked',
                captureMethod: 'customer_qr',
                skipReason: null,
              })
              window.clearInterval(pollTimer)
              toast.success(`Loyalty linked: ${status.full_name}`)
            } else if (['expired', 'cancelled', 'settled'].includes(status.status)) {
              window.clearInterval(pollTimer)
            }
          } catch {
            // Transient polling failures must not interrupt payment.
          }
        }, 2000)
      } catch (err) {
        if (active) setCheckoutError(err.message || 'Transaction QR unavailable')
      }
    }

    startCheckout()
    return () => {
      active = false
      if (pollTimer) window.clearInterval(pollTimer)
    }
  }, [branchId, cartToken, loyaltyCustomer])

  const handleClose = useCallback(() => {
    if (checkoutSession?.session_id) {
      closeLoyaltyCheckoutV2(checkoutSession.session_id, null, true).catch(() => {})
    }
    onClose()
  }, [checkoutSession, onClose])

  // Enter key shortcut
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter' && canComplete) handleComplete()
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canComplete, handleComplete, handleClose])

  const handleLoyaltyScan = async (token) => {
    setShowQRScanner(false)
    try {
      const customer = await lookupCustomerByPassportToken(token)
      if (customer) {
        if (checkoutSession?.session_id) {
          closeLoyaltyCheckoutV2(checkoutSession.session_id, null, true).catch(() => {})
          setCheckoutSession(null)
          setCheckoutQr('')
        }
        setLoyaltyCustomer(customer)
        setLoyaltyDecision({
          outcome: 'linked',
          captureMethod: 'existing_card',
          skipReason: null,
        })
        toast.success(`Loyalty card linked: ${customer.full_name}`)
      } else {
        toast.error('QR code not recognized')
      }
    } catch {
      toast.error('Could not look up loyalty card')
    }
  }

  const handleBarcodeScan = (result) => {
    setShowScanner(false)
    // QR contains customer ID or phone
    setLoyaltyCustomer({ id: result, name: 'Loyalty Customer' })
  }

  const handlePhoneAttach = async () => {
    if (loyaltyPhone.replace(/\D/g, '').length < 7) return toast.error('Enter at least 7 phone digits')
    setLinkingPhone(true)
    try {
      const customer = await lookupOrCreateLoyaltyMemberV2(loyaltyPhone)
      if (checkoutSession?.session_id) {
        closeLoyaltyCheckoutV2(checkoutSession.session_id, null, true).catch(() => {})
        setCheckoutSession(null)
        setCheckoutQr('')
      }
      setLoyaltyCustomer(customer)
      setLoyaltyDecision({
        outcome: 'linked',
        captureMethod: 'phone_fallback',
        skipReason: null,
      })
      toast.success(`Loyalty linked: ${customer.full_name}`)
    } catch (err) {
      toast.error(err.message || 'Could not attach loyalty customer')
    } finally {
      setLinkingPhone(false)
    }
  }

  const handleDetachLoyalty = () => {
    if (checkoutSession?.session_id) {
      closeLoyaltyCheckoutV2(checkoutSession.session_id, null, true).catch(() => {})
    }
    setLoyaltyCustomer(null)
    setCheckoutSession(null)
    setCheckoutQr('')
    setCartToken(newCartToken())
    setLoyaltyDecision(null)
  }

  return (
    <>
      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner
            onScan={handleBarcodeScan}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}
      {showQRScanner && (
        <Suspense fallback={null}>
          <QRScanner
            onScan={handleLoyaltyScan}
            onClose={() => setShowQRScanner(false)}
          />
        </Suspense>
      )}

      <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm max-h-[90dvh] pos-scroll">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-noch-border">
            <div>
              <h2 className="text-white font-bold text-xl">{t('posPayment')}</h2>
              <p className="text-noch-green text-2xl font-bold mt-1">{format(payableTotal)} LYD</p>
              {rewardDiscount > 0 && (
                <p className="text-xs text-yellow-300">Reward applied: −{format(rewardDiscount)} LYD</p>
              )}
            </div>
            <button onClick={handleClose} className="text-noch-muted hover:text-white p-1">
              <X size={20} />
            </button>
          </div>

          <div className="p-5">
            {/* Method tabs */}
            <div className={`grid ${prestoEnabled ? 'grid-cols-4' : 'grid-cols-3'} gap-2 mb-5`}>
              {[
                { id: 'cash',   icon: DollarSign,  label: t('posCash') },
                { id: 'card',   icon: CreditCard,  label: t('posCard') },
                { id: 'split',  icon: Shuffle,     label: t('posSplit') },
                ...(prestoEnabled ? [{ id: 'presto', icon: Bike, label: t('posPresto') }] : []),
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border transition-all ${
                    method === m.id
                      ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
                      : 'border-noch-border text-noch-muted hover:border-noch-green/20'
                  }`}
                >
                  <m.icon size={18} />
                  <span className="text-xs font-medium">{m.label}</span>
                </button>
              ))}
            </div>

            {/* Cash */}
            {method === 'cash' && (
              <div>
                <p className="text-noch-muted text-sm mb-2">{t('posCashTendered')}</p>
                <div className="bg-noch-dark border border-noch-border rounded-xl px-4 py-3 text-right">
                  <span className="text-white text-2xl font-bold">{format(cashTendered || 0)} LYD</span>
                </div>
                {changeDue > 0 && (
                  <div className="flex justify-between items-center mt-3 bg-noch-green/10 border border-noch-green/20 rounded-xl px-4 py-3">
                    <span className="text-noch-green font-medium">{t('posChangeDue')}</span>
                    <span className="text-noch-green font-bold text-xl">{format(changeDue)} LYD</span>
                  </div>
                )}
                {/* Quick amounts — big tappable buttons, shown first */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {[payableTotal, Math.ceil(payableTotal), Math.ceil(payableTotal / 5) * 5, Math.ceil(payableTotal / 10) * 10, Math.ceil(payableTotal / 20) * 20].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 6).map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCashTendered(amt.toFixed(2))}
                      className={`py-3 rounded-xl font-semibold text-base transition-all active:scale-95 ${
                        parseFloat(cashTendered) === amt
                          ? 'bg-noch-green/20 border-2 border-noch-green text-noch-green'
                          : 'border border-noch-border text-white hover:border-noch-green/30'
                      }`}
                    >
                      {amt % 1 === 0 ? amt : amt.toFixed(2)}
                    </button>
                  ))}
                </div>
                <Numpad value={cashTendered} onChange={setCashTendered} />
              </div>
            )}

            {/* Card */}
            {method === 'card' && (
              <div className="text-center py-6">
                <CreditCard size={48} className="text-noch-green mx-auto mb-3" />
                <p className="text-white font-semibold mb-1">{t('posVerifoneHint')}</p>
                <p className="text-noch-muted text-sm mb-4">{t('posVerifoneSub')}</p>
                <div className="bg-noch-green/10 border border-noch-green/20 rounded-xl p-4">
                  <p className="text-noch-green text-3xl font-bold">{format(payableTotal)} LYD</p>
                </div>
              </div>
            )}

            {/* Split */}
            {method === 'split' && (
              <div>
                <p className="text-noch-muted text-sm mb-2">{t('posCardAmount')}</p>
                <div className="bg-noch-dark border border-noch-border rounded-xl px-4 py-3 text-right">
                  <span className="text-white text-2xl font-bold">{format(cardAmount || 0)} LYD</span>
                </div>
                {splitValid && (
                  <div className="flex justify-between items-center mt-2 bg-noch-card border border-noch-border rounded-xl px-4 py-2">
                    <span className="text-noch-muted text-sm">{t('posCashRemaining')}</span>
                    <span className="text-white font-semibold">{format(splitCash)} LYD</span>
                  </div>
                )}
                <Numpad value={cardAmount} onChange={setCardAmount} />
              </div>
            )}

            {/* Presto */}
            {method === 'presto' && (
              <div className="text-center py-6">
                <Bike size={48} className="text-noch-green mx-auto mb-3" />
                <p className="text-white font-semibold mb-1">{t('posPrestoHint')}</p>
                <p className="text-noch-muted text-sm mb-1">{t('posPrestoSub')}</p>
                <p className="text-yellow-400 text-xs mb-4">{t('posPrestoNote')}</p>
                <div className="bg-noch-green/10 border border-noch-green/20 rounded-xl p-4">
                  <p className="text-noch-green text-3xl font-bold">{format(payableTotal)} LYD</p>
                </div>
              </div>
            )}

            {/* Loyalty */}
            <div className="mt-4 pt-4 border-t border-noch-border">
              {loyaltyCustomer ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-noch-green/10 border border-noch-green/20 rounded-xl px-3 py-2">
                    <span className="text-noch-green text-sm">♥ {loyaltyCustomer.full_name || loyaltyCustomer.name || t('posLoyaltyCard')}</span>
                    <button onClick={handleDetachLoyalty} className="ml-auto text-noch-muted hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                  {availableRewards.length > 0 && (
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-yellow-300">
                        <Gift size={14} /> Available rewards
                      </p>
                      <div className="space-y-2">
                        {availableRewards.map(reward => {
                          const discount = calculateRewardDiscount(reward, cart, total)
                          const selected = selectedRewardId === reward.entitlement_id
                          return (
                            <button
                              key={reward.entitlement_id}
                              type="button"
                              disabled={discount <= 0}
                              onClick={() => setSelectedRewardId(selected ? null : reward.entitlement_id)}
                              className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                                selected
                                  ? 'border-yellow-300/60 bg-yellow-300/10'
                                  : discount > 0
                                    ? 'border-noch-border hover:border-yellow-300/30'
                                    : 'cursor-not-allowed border-noch-border opacity-50'
                              }`}
                            >
                              <span className="block text-sm font-medium text-white">{reward.title}</span>
                              <span className="text-xs text-noch-muted">
                                {discount > 0 ? `Apply ${format(discount)} LYD reward` : 'No eligible item in this order'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-noch-green/30 bg-noch-green/5 p-3 text-center">
                    <div className="flex items-center justify-center gap-2 text-noch-green font-semibold text-sm">
                      <QrCode size={16} />
                      Customer scans to collect points
                    </div>
                    {checkoutQr ? (
                      <img
                        src={checkoutQr}
                        alt="Customer loyalty transaction QR"
                        className="mx-auto mt-3 h-40 w-40 rounded-lg bg-white p-1"
                      />
                    ) : checkoutError ? (
                      <p className="mt-3 text-xs text-red-300">{checkoutError}</p>
                    ) : (
                      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-noch-muted">
                        <Loader2 size={14} className="animate-spin" />
                        Preparing private transaction code…
                      </div>
                    )}
                    <p className="mt-2 text-xs text-noch-muted">
                      No phone number is spoken or shown to the cashier.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowQRScanner(true)}
                    className="flex items-center gap-2 text-noch-muted hover:text-white text-sm transition-colors"
                  >
                    <QrCode size={14} />
                    Scan an existing membership card
                  </button>

                  <button
                    onClick={() => setShowPhoneFallback(value => !value)}
                    className="flex w-full items-center gap-2 text-noch-muted hover:text-white text-sm transition-colors"
                  >
                    <Phone size={14} />
                    Cashier phone lookup
                    <ChevronDown size={14} className={`ml-auto transition-transform ${showPhoneFallback ? 'rotate-180' : ''}`} />
                  </button>
                  {showPhoneFallback && (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
                        <input
                          inputMode="tel"
                          value={loyaltyPhone}
                          onChange={e => setLoyaltyPhone(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handlePhoneAttach() } }}
                          placeholder="Phone — fallback only"
                          className="input w-full pl-9 text-sm"
                        />
                      </div>
                      <button onClick={handlePhoneAttach} disabled={linkingPhone} className="btn-secondary px-3">
                        {linkingPhone ? <Loader2 size={14} className="animate-spin" /> : 'Attach'}
                      </button>
                    </div>
                  )}

                  <div className="rounded-xl border border-noch-border bg-noch-dark/40 p-3">
                    <p className="mb-2 text-xs font-semibold text-white">
                      {posLang === 'ar' ? 'إذا لم يربط العميل الطلب، اختر السبب' : 'If the customer does not link, choose why'}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['declined', posLang === 'ar' ? 'رفض' : 'Declined'],
                        ['not_member', posLang === 'ar' ? 'ليس عضواً' : 'Not a member'],
                        ['qr_unavailable', posLang === 'ar' ? 'QR غير متاح' : 'QR unavailable'],
                        ['timeout', posLang === 'ar' ? 'انتهى الوقت' : 'Timed out'],
                      ].map(([reason, label]) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => setLoyaltyDecision({
                            outcome: 'skipped',
                            captureMethod: null,
                            skipReason: reason,
                          })}
                          className={`rounded-lg border px-2 py-2 text-xs ${
                            loyaltyDecision?.skipReason === reason
                              ? 'border-orange-300/60 bg-orange-300/10 text-orange-200'
                              : 'border-noch-border text-noch-muted hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {paymentValid && !loyaltyDecision && (
              <p className="mt-3 rounded-lg border border-orange-300/30 bg-orange-300/10 px-3 py-2 text-center text-xs text-orange-200">
                {posLang === 'ar'
                  ? 'اربط العضوية أو اختر سبب التخطي قبل إتمام البيع'
                  : 'Link loyalty or choose a skip reason before completing the sale'}
              </p>
            )}

            {/* Complete button — disabled while a charge is in flight to
                prevent double-submit (also guarded server-side by the
                idempotency_key on create_pos_order). */}
            <button
              onClick={handleComplete}
              disabled={!canComplete || submitting}
              className={`w-full py-4 rounded-xl font-bold text-lg mt-5 transition-all ${
                canComplete && !submitting
                  ? 'bg-noch-green text-noch-dark hover:bg-noch-green/90 active:scale-95'
                  : 'bg-noch-border text-noch-muted cursor-not-allowed'
              }`}
            >
              {submitting
                ? t('posProcessing')
                : method === 'card'
                  ? t('posConfirmCard')
                  : method === 'presto'
                    ? t('posConfirmPresto')
                    : t('posCompleteSale')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
