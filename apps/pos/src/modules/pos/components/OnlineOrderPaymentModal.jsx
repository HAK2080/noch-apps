import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'
import { printDrinkTicket } from '../lib/escpos'
import { format } from '../lib/money'
import { posMessage, posError, savedPosLanguage } from '../lib/pos-messages'

// Existing guest order is settled in place, never copied into a second sale.
export default function OnlineOrderPaymentModal({ order, branchId, branch, shiftId, onPaid, onClose }) {
  const lang = savedPosLanguage(), msg = (key) => posMessage(key, lang)
  const [method, setMethod] = useState('cash')
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const total = Number(order.total)
  const cardDue = method === 'card' ? total : method === 'split' ? Number(card) : 0
  const cashDue = total - cardDue
  const valid = Number.isFinite(total) && total >= 0 && Number.isFinite(cardDue) && cardDue >= 0 && cardDue <= total
    && (method !== 'split' || (cardDue > 0 && cardDue < total))
    && (method === 'card' || (cash.trim() !== '' && Number.isFinite(Number(cash)) && Number(cash) >= cashDue))
    && confirmed && !!shiftId

  const pay = async () => {
    if (!valid || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('complete_online_order_payment', {
        p_order_id: order.id, p_branch_id: branchId, p_shift_id: shiftId, p_expected_total: total,
        p_payment_method: method, p_cash_tendered: method === 'card' ? null : Number(cash), p_card_amount: cardDue,
      })
      if (rpcError) throw rpcError
      if (!data?.success || !data.order) throw new Error(data?.error || 'Payment confirmation unavailable')
      // No print before commit and no automatic reprint on replay/another tablet.
      if (!data.already_completed && data.print_ticket !== false) {
        printDrinkTicket(data.order, order.pos_order_items || [], branch)
          .catch(err => {
            console.warn('Paid order ticket could not be queued', err)
            toast.error(msg('Payment saved. Check the printer before preparing the order.'))
          })
      } else if (data.already_completed) {
        toast(msg('Payment already recorded. Do not collect it again.'))
      }
      onPaid(data.order)
    } catch (err) {
      console.error('Online order payment failed', err)
      setError(posError(err, 'Online payment failed. Check connection and retry this same order.', lang))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return <div role="dialog" aria-label={msg('Review and collect payment')} lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
    <section className="bg-noch-card border border-noch-border rounded-2xl p-5 w-full max-w-md max-h-[90dvh] overflow-auto space-y-4">
      <h2 className="text-white text-xl font-bold">{msg('Review and collect payment')}</h2>
      <p className="text-noch-muted">{order.order_number} · {order.customer_name}</p>
      <div className="text-white space-y-2">{(order.pos_order_items || []).map((item, index) => <p key={item.id || index}>{item.quantity}× {lang === 'ar' ? (item.product_name_ar || item.product_name) : item.product_name} — {format(item.total)}</p>)}</div>
      <p className="text-noch-green text-xl font-bold">{msg('Total')}: {format(total)} {msg('LYD')}</p>
      <label className="block text-white">{msg('Payment method')}
        <select className="input w-full mt-1" value={method} disabled={busy} onChange={e => { setMethod(e.target.value); setConfirmed(false) }}>
          <option value="cash">{msg('Cash')}</option><option value="card">{msg('Card')}</option><option value="split">{msg('Split payment')}</option>
        </select>
      </label>
      {method === 'split' && <label className="block text-white">{msg('Card amount')}<input className="input w-full" inputMode="decimal" dir="ltr" value={card} disabled={busy} onChange={e => { setCard(e.target.value); setConfirmed(false) }} /></label>}
      {method !== 'card' && <label className="block text-white">{msg('Cash received')}<input className="input w-full" inputMode="decimal" dir="ltr" value={cash} disabled={busy} onChange={e => { setCash(e.target.value); setConfirmed(false) }} /></label>}
      {method !== 'card' && Number(cash) >= cashDue && cash !== '' && <p className="text-noch-green">{msg('Change')}: {format(Number(cash) - cashDue)} {msg('LYD')}</p>}
      <label className="flex gap-2 text-white"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />{msg('I checked the order and received payment')}</label>
      {!shiftId && <p role="alert" className="text-yellow-400">{msg('Open a shift before collecting payment')}</p>}
      {error && <p role="alert" className="text-red-400">{error}</p>}
      <div className="flex gap-3"><button className="btn-secondary flex-1" disabled={busy} onClick={onClose}>{msg('Cancel')}</button><button className="btn-primary flex-1" disabled={busy || !valid} onClick={pay}>{busy ? msg('Saving payment…') : msg('Confirm payment and prepare')}</button></div>
    </section>
  </div>
}
