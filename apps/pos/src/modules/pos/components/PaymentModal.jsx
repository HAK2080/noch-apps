// PaymentModal.jsx — Payment collection modal

import { useState, useEffect, useCallback } from 'react'
import { X, DollarSign, CreditCard, Shuffle, QrCode, Bike } from 'lucide-react'
import BarcodeScanner from './BarcodeScanner'
import QRScanner from './QRScanner'
import { lookupLoyaltyQR } from '../../../lib/supabase'
import { translations } from '../../../lib/i18n'
import toast from 'react-hot-toast'

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

export default function PaymentModal({ total, onComplete, onClose, submitting = false, loyaltyCustomer: initialLoyalty, posLang = 'en' }) {
  const t = (k) => posT(k, posLang)
  const [method, setMethod] = useState('cash') // cash | card | split | presto
  const [cashTendered, setCashTendered] = useState(total.toFixed(2))
  const [cardAmount, setCardAmount] = useState('0')
  const [showScanner, setShowScanner] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(initialLoyalty || null)

  const changeDue = method === 'cash'
    ? Math.max(0, parseFloat(cashTendered || 0) - total)
    : 0

  const splitCash = total - parseFloat(cardAmount || 0)
  const splitValid = method === 'split' &&
    parseFloat(cardAmount) > 0 &&
    parseFloat(cardAmount) < total

  const canComplete =
    (method === 'cash' && parseFloat(cashTendered || 0) >= total) ||
    method === 'card' ||
    method === 'presto' ||
    splitValid

  const handleComplete = useCallback(() => {
    if (!canComplete) return
    const paymentData = {
      payment_method: method,
      cash_tendered: method === 'cash' ? parseFloat(cashTendered) : null,
      change_due: changeDue,
      card_amount: (method === 'card' || method === 'presto') ? total : method === 'split' ? parseFloat(cardAmount) : 0,
      loyalty_customer_id: loyaltyCustomer?.id || null,
    }
    onComplete(paymentData)
  }, [canComplete, method, cashTendered, changeDue, cardAmount, total, loyaltyCustomer, onComplete])

  // Enter key shortcut
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter' && canComplete) handleComplete()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canComplete, handleComplete, onClose])

  const handleLoyaltyScan = async (token) => {
    setShowQRScanner(false)
    try {
      const customer = await lookupLoyaltyQR(token)
      if (customer) {
        setLoyaltyCustomer(customer)
        toast.success(`Loyalty card linked: ${customer.full_name}`)
      } else {
        toast.error('QR code not recognized')
      }
    } catch (err) {
      toast.error('Could not look up loyalty card')
    }
  }

  const handleBarcodeScan = (result) => {
    setShowScanner(false)
    // QR contains customer ID or phone
    setLoyaltyCustomer({ id: result, name: 'Loyalty Customer' })
  }

  return (
    <>
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}
      {showQRScanner && (
        <QRScanner
          onScan={handleLoyaltyScan}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-noch-border">
            <div>
              <h2 className="text-white font-bold text-xl">{t('posPayment')}</h2>
              <p className="text-noch-green text-2xl font-bold mt-1">{total.toFixed(2)} LYD</p>
            </div>
            <button onClick={onClose} className="text-noch-muted hover:text-white p-1">
              <X size={20} />
            </button>
          </div>

          <div className="p-5">
            {/* Method tabs */}
            <div className="grid grid-cols-4 gap-2 mb-5">
              {[
                { id: 'cash',   icon: DollarSign,  label: t('posCash') },
                { id: 'card',   icon: CreditCard,  label: t('posCard') },
                { id: 'split',  icon: Shuffle,     label: t('posSplit') },
                { id: 'presto', icon: Bike,        label: t('posPresto') },
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
                  <span className="text-white text-2xl font-bold">{parseFloat(cashTendered || 0).toFixed(2)} LYD</span>
                </div>
                {changeDue > 0 && (
                  <div className="flex justify-between items-center mt-3 bg-noch-green/10 border border-noch-green/20 rounded-xl px-4 py-3">
                    <span className="text-noch-green font-medium">{t('posChangeDue')}</span>
                    <span className="text-noch-green font-bold text-xl">{changeDue.toFixed(2)} LYD</span>
                  </div>
                )}
                <Numpad value={cashTendered} onChange={setCashTendered} />
                {/* Quick amounts */}
                <div className="flex gap-2 mt-2">
                  {[total, Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCashTendered(amt.toFixed(2))}
                      className="flex-1 py-2 rounded-xl border border-noch-border text-noch-muted hover:text-white hover:border-noch-green/30 text-sm transition-all"
                    >
                      {amt.toFixed(2)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Card */}
            {method === 'card' && (
              <div className="text-center py-6">
                <CreditCard size={48} className="text-noch-green mx-auto mb-3" />
                <p className="text-white font-semibold mb-1">{t('posVerifoneHint')}</p>
                <p className="text-noch-muted text-sm mb-4">{t('posVerifoneSub')}</p>
                <div className="bg-noch-green/10 border border-noch-green/20 rounded-xl p-4">
                  <p className="text-noch-green text-3xl font-bold">{total.toFixed(2)} LYD</p>
                </div>
              </div>
            )}

            {/* Split */}
            {method === 'split' && (
              <div>
                <p className="text-noch-muted text-sm mb-2">{t('posCardAmount')}</p>
                <div className="bg-noch-dark border border-noch-border rounded-xl px-4 py-3 text-right">
                  <span className="text-white text-2xl font-bold">{parseFloat(cardAmount || 0).toFixed(2)} LYD</span>
                </div>
                {splitValid && (
                  <div className="flex justify-between items-center mt-2 bg-noch-card border border-noch-border rounded-xl px-4 py-2">
                    <span className="text-noch-muted text-sm">{t('posCashRemaining')}</span>
                    <span className="text-white font-semibold">{splitCash.toFixed(2)} LYD</span>
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
                  <p className="text-noch-green text-3xl font-bold">{total.toFixed(2)} LYD</p>
                </div>
              </div>
            )}

            {/* Loyalty */}
            <div className="mt-4 pt-4 border-t border-noch-border">
              {loyaltyCustomer ? (
                <div className="flex items-center gap-2 bg-noch-green/10 border border-noch-green/20 rounded-xl px-3 py-2">
                  <span className="text-noch-green text-sm">♥ {loyaltyCustomer.full_name || loyaltyCustomer.name || t('posLoyaltyCard')}</span>
                  <button onClick={() => setLoyaltyCustomer(null)} className="ml-auto text-noch-muted hover:text-white">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowQRScanner(true)}
                  className="flex items-center gap-2 text-noch-muted hover:text-white text-sm transition-colors"
                >
                  <QrCode size={14} />
                  {t('posScanLoyalty')}
                </button>
              )}
            </div>

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
