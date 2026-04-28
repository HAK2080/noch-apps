// PaymentModal.jsx — Payment collection modal

import { useState, useEffect, useCallback } from 'react'
import { X, DollarSign, CreditCard, Shuffle, QrCode, Bike, Gift } from 'lucide-react'
import BarcodeScanner from './BarcodeScanner'
import QRScanner from './QRScanner'
import { lookupLoyaltyQR, validateLoyaltyCode } from '../../../lib/supabase'
import toast from 'react-hot-toast'

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

export default function PaymentModal({ total, cartItems = [], onComplete, onClose, loyaltyCustomer: initialLoyalty }) {
  const [method, setMethod] = useState('cash') // cash | card | split | presto
  const [showScanner, setShowScanner] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [showLoyaltyCode, setShowLoyaltyCode] = useState(false)
  const [loyaltyCustomer, setLoyaltyCustomer] = useState(initialLoyalty || null)
  const [loyaltyReward, setLoyaltyReward] = useState(null) // { reward_id, customer_name, discount_amount }

  const loyaltyDiscount = loyaltyReward?.discount_amount || 0
  const effectiveTotal = Math.max(0, total - loyaltyDiscount)

  const [cashTendered, setCashTendered] = useState(effectiveTotal.toFixed(2))
  const [cardAmount, setCardAmount] = useState('0')

  // Keep cashTendered in sync with effectiveTotal when loyalty is applied/removed
  useEffect(() => {
    setCashTendered(effectiveTotal.toFixed(2))
  }, [effectiveTotal])

  const changeDue = method === 'cash'
    ? Math.max(0, parseFloat(cashTendered || 0) - effectiveTotal)
    : 0

  const splitCash = effectiveTotal - parseFloat(cardAmount || 0)
  const splitValid = method === 'split' &&
    parseFloat(cardAmount) > 0 &&
    parseFloat(cardAmount) < effectiveTotal

  const canComplete =
    (method === 'cash' && parseFloat(cashTendered || 0) >= effectiveTotal) ||
    method === 'card' ||
    method === 'presto' ||
    splitValid

  const handleComplete = useCallback(() => {
    if (!canComplete) return
    const paymentData = {
      payment_method: method,
      cash_tendered: method === 'cash' ? parseFloat(cashTendered) : null,
      change_due: changeDue,
      card_amount: (method === 'card' || method === 'presto') ? effectiveTotal : method === 'split' ? parseFloat(cardAmount) : 0,
      loyalty_customer_id: loyaltyReward?.customer_id || loyaltyCustomer?.id || null,
      loyalty_reward_id: loyaltyReward?.reward_id || null,
      loyalty_discount_amount: loyaltyDiscount,
    }
    onComplete(paymentData)
  }, [canComplete, method, cashTendered, changeDue, cardAmount, effectiveTotal, loyaltyCustomer, loyaltyReward, loyaltyDiscount, onComplete])

  const handleLoyaltyCodeApply = async (code) => {
    try {
      const result = await validateLoyaltyCode(code)
      if (!result?.valid) {
        const msg = result?.error === 'expired' ? 'Code expired'
                  : result?.error === 'bad_format' ? 'Code must be 4 letters'
                  : 'Code invalid or already used'
        toast.error(msg)
        return
      }
      // Discount = highest unit price in cart (one free drink)
      const highestPrice = cartItems.reduce((max, i) => Math.max(max, parseFloat(i.price) || 0), 0)
      if (highestPrice <= 0) {
        toast.error('Add items to the cart first')
        return
      }
      setLoyaltyReward({
        reward_id: result.reward_id,
        customer_id: result.customer_id,
        customer_name: result.customer_name,
        discount_amount: highestPrice,
      })
      setShowLoyaltyCode(false)
      toast.success(`Loyalty applied — ${result.customer_name} (-${highestPrice.toFixed(2)} LYD)`)
    } catch (err) {
      toast.error(err.message || 'Could not validate code')
    }
  }

  const removeLoyalty = () => setLoyaltyReward(null)

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
              <h2 className="text-white font-bold text-xl">Payment</h2>
              {loyaltyDiscount > 0 ? (
                <>
                  <p className="text-noch-muted text-sm line-through mt-1">{total.toFixed(2)} LYD</p>
                  <p className="text-noch-green text-2xl font-bold">{effectiveTotal.toFixed(2)} LYD</p>
                </>
              ) : (
                <p className="text-noch-green text-2xl font-bold mt-1">{total.toFixed(2)} LYD</p>
              )}
            </div>
            <button onClick={onClose} className="text-noch-muted hover:text-white p-1">
              <X size={20} />
            </button>
          </div>

          <div className="p-5">
            {/* Loyalty section */}
            {loyaltyReward ? (
              <div className="mb-4 rounded-xl px-3 py-2.5 flex items-center gap-3" style={{ background: 'rgba(245,146,46,0.12)', border: '1px solid rgba(245,146,46,0.4)' }}>
                <Gift size={16} className="text-yellow-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">Loyalty: {loyaltyReward.customer_name}</p>
                  <p className="text-yellow-400 text-xs">−{loyaltyDiscount.toFixed(2)} LYD (free drink)</p>
                </div>
                <button onClick={removeLoyalty} className="text-zinc-400 hover:text-white text-xs px-2">Remove</button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoyaltyCode(true)}
                className="mb-4 w-full py-2.5 rounded-xl border border-yellow-500/30 text-yellow-400 text-sm font-medium hover:bg-yellow-500/10 transition-colors flex items-center justify-center gap-2"
              >
                <Gift size={14} />
                Apply Loyalty Code
              </button>
            )}

            {showLoyaltyCode && (
              <LoyaltyCodeEntry
                onApply={handleLoyaltyCodeApply}
                onClose={() => setShowLoyaltyCode(false)}
              />
            )}

            {/* Method tabs */}
            <div className="grid grid-cols-4 gap-2 mb-5">
              {[
                { id: 'cash',   icon: DollarSign,  label: 'Cash' },
                { id: 'card',   icon: CreditCard,  label: 'Card' },
                { id: 'split',  icon: Shuffle,     label: 'Split' },
                { id: 'presto', icon: Bike,        label: 'Presto' },
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
                <p className="text-noch-muted text-sm mb-2">Cash tendered</p>
                <div className="bg-noch-dark border border-noch-border rounded-xl px-4 py-3 text-right">
                  <span className="text-white text-2xl font-bold">{parseFloat(cashTendered || 0).toFixed(2)} LYD</span>
                </div>
                {changeDue > 0 && (
                  <div className="flex justify-between items-center mt-3 bg-noch-green/10 border border-noch-green/20 rounded-xl px-4 py-3">
                    <span className="text-noch-green font-medium">Change due</span>
                    <span className="text-noch-green font-bold text-xl">{changeDue.toFixed(2)} LYD</span>
                  </div>
                )}
                <Numpad value={cashTendered} onChange={setCashTendered} />
                {/* Quick amounts */}
                <div className="flex gap-2 mt-2">
                  {[effectiveTotal, Math.ceil(effectiveTotal), Math.ceil(effectiveTotal / 5) * 5, Math.ceil(effectiveTotal / 10) * 10].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).map(amt => (
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
                <p className="text-white font-semibold mb-1">Process on Verifone X990 Plus</p>
                <p className="text-noch-muted text-sm mb-4">Insert / tap card on terminal</p>
                <div className="bg-noch-green/10 border border-noch-green/20 rounded-xl p-4">
                  <p className="text-noch-green text-3xl font-bold">{effectiveTotal.toFixed(2)} LYD</p>
                </div>
              </div>
            )}

            {/* Split */}
            {method === 'split' && (
              <div>
                <p className="text-noch-muted text-sm mb-2">Card amount</p>
                <div className="bg-noch-dark border border-noch-border rounded-xl px-4 py-3 text-right">
                  <span className="text-white text-2xl font-bold">{parseFloat(cardAmount || 0).toFixed(2)} LYD</span>
                </div>
                {splitValid && (
                  <div className="flex justify-between items-center mt-2 bg-noch-card border border-noch-border rounded-xl px-4 py-2">
                    <span className="text-noch-muted text-sm">Cash remaining</span>
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
                <p className="text-white font-semibold mb-1">Presto Delivery</p>
                <p className="text-noch-muted text-sm mb-4">Order will be marked as Presto payment</p>
                <div className="bg-noch-green/10 border border-noch-green/20 rounded-xl p-4">
                  <p className="text-noch-green text-3xl font-bold">{effectiveTotal.toFixed(2)} LYD</p>
                </div>
              </div>
            )}

            {/* Loyalty */}
            <div className="mt-4 pt-4 border-t border-noch-border">
              {loyaltyCustomer ? (
                <div className="flex items-center gap-2 bg-noch-green/10 border border-noch-green/20 rounded-xl px-3 py-2">
                  <span className="text-noch-green text-sm">♥ {loyaltyCustomer.full_name || loyaltyCustomer.name || 'Loyalty Customer'}</span>
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
                  Scan loyalty card
                </button>
              )}
            </div>

            {/* Complete button */}
            <button
              onClick={handleComplete}
              disabled={!canComplete}
              className={`w-full py-4 rounded-xl font-bold text-lg mt-5 transition-all ${
                canComplete
                  ? 'bg-noch-green text-noch-dark hover:bg-noch-green/90 active:scale-95'
                  : 'bg-noch-border text-noch-muted cursor-not-allowed'
              }`}
            >
              {method === 'card' ? 'Confirm Card Payment' : method === 'presto' ? 'Confirm Presto Order' : 'Complete Sale'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Loyalty code entry modal ──────────────────────────────────
function LoyaltyCodeEntry({ onApply, onClose }) {
  const [code, setCode] = useState('')
  const handle = (k) => {
    if (k === '⌫') return setCode(c => c.slice(0, -1))
    if (code.length >= 4) return
    setCode(c => (c + k).toUpperCase())
  }
  const KEYS = ['Q','W','E','R','T','Y','U','I','O','P','A','S','D','F','G','H','J','K','L','Z','X','C','V','B','N','M']
  // Subset matching the server alphabet (no I,O,Q,V,etc — keep I and O removed for clarity)
  const ALPHABET = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z']

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-noch-border">
          <h3 className="text-white font-bold">Loyalty code</h3>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5">
          <p className="text-noch-muted text-xs text-center mb-2">Enter the 4-letter code from the customer</p>
          <div className="bg-noch-dark border-2 border-yellow-500/30 rounded-xl py-5 mb-4">
            <p className="text-yellow-400 text-4xl font-black tracking-[0.4em] text-center">
              {code.padEnd(4, '·')}
            </p>
          </div>
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {ALPHABET.map(k => (
              <button
                key={k}
                onClick={() => handle(k)}
                className="py-2.5 rounded-lg bg-noch-dark border border-noch-border text-white text-sm font-semibold hover:border-yellow-500/40"
              >
                {k}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => handle('⌫')} className="flex-1 py-2.5 rounded-lg bg-noch-border/50 text-noch-muted hover:bg-noch-border">⌫</button>
            <button
              onClick={() => onApply(code)}
              disabled={code.length !== 4}
              className={`flex-[2] py-2.5 rounded-lg font-bold ${code.length === 4 ? 'bg-yellow-400 text-noch-dark hover:bg-yellow-300' : 'bg-noch-border text-noch-muted cursor-not-allowed'}`}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
