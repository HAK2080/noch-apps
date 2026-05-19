// POSEndOfDay.jsx — Shift closing / end-of-day report
// Route: /pos/:branchId/end-of-day

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, CheckCircle, ArrowDownCircle, ArrowUpCircle, Wallet, Coins, Plus } from 'lucide-react'
import {
  getPOSBranch, getOpenShift, closeShift, getShiftSummary,
  getCashMovements, recordCashMovement,
} from '../lib/pos-supabase'
import { printReceipt, isPrinterConnected } from '../lib/escpos'
import { getServedBy } from '../lib/pos-session'
import Layout from '../../../components/Layout'
import { usePermission } from '../../../lib/usePermission'
import { AccessDenied } from '../../../components/shared/ProtectedFeature'
import toast from 'react-hot-toast'

const MOVEMENT_TYPES = [
  { key: 'paid_in',         label: 'Paid In',     icon: ArrowDownCircle, color: 'text-noch-green',  hint: 'Cash added to drawer (e.g. owner top-up)' },
  { key: 'paid_out',        label: 'Paid Out',    icon: ArrowUpCircle,   color: 'text-yellow-400',  hint: 'Cash taken from drawer for an expense' },
  { key: 'safe_drop',       label: 'Safe Drop',   icon: Wallet,          color: 'text-blue-400',    hint: 'Cash moved to the safe' },
  { key: 'tip_out',         label: 'Tip Out',     icon: Coins,           color: 'text-purple-400',  hint: 'Cash given to staff as tips' },
  { key: 'drawer_no_sale',  label: 'No-Sale Drawer Pop', icon: Wallet,   color: 'text-noch-muted',  hint: 'Audit-only — no cash change' },
]

function CashMovementModal({ branchId, shiftId, onClose, onSaved }) {
  const [type, setType] = useState('paid_in')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const meta = MOVEMENT_TYPES.find(m => m.key === type)

  const handleSave = async () => {
    if (type !== 'drawer_no_sale' && (!amount || Number(amount) <= 0)) {
      toast.error('Enter a positive amount')
      return
    }
    setSaving(true)
    try {
      const servedBy = getServedBy()?.id || null
      await recordCashMovement({
        branch_id: branchId,
        shift_id: shiftId,
        movement_type: type,
        amount: type === 'drawer_no_sale' ? 0 : Number(amount),
        reason: reason || null,
        served_by: servedBy,
      })
      toast.success(`${meta.label} recorded`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to save movement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm p-5">
        <h2 className="text-white font-bold text-lg mb-1">Cash Movement</h2>
        <p className="text-noch-muted text-xs mb-4">{meta?.hint}</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {MOVEMENT_TYPES.map(m => (
            <button
              key={m.key}
              onClick={() => setType(m.key)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg text-left text-xs border ${
                type === m.key ? 'bg-noch-green/10 border-noch-green/50 text-noch-green' : 'border-noch-border text-noch-muted hover:border-noch-green/20'
              }`}
            >
              <m.icon size={14} />
              {m.label}
            </button>
          ))}
        </div>
        {type !== 'drawer_no_sale' && (
          <>
            <label className="label block mb-1">Amount (LYD)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="input w-full mb-3"
              step="0.01"
              min="0"
              autoFocus
            />
          </>
        )}
        <label className="label block mb-1">Reason / note</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="input w-full resize-none"
          rows={2}
          placeholder="e.g. milk delivery, tip distribution"
        />
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function POSEndOfDay() {
  const can = usePermission()
  const allowed = can('pos', 'end_of_day')
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  const [shift, setShift] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actualCash, setActualCash] = useState('')
  const [closing, setClosing] = useState(false)
  const [notes, setNotes] = useState('')
  const [cashMovements, setCashMovements] = useState([])
  const [showCashModal, setShowCashModal] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [b, s] = await Promise.all([
          getPOSBranch(branchId),
          getOpenShift(branchId),
        ])
        setBranch(b)
        setShift(s)
        if (s) {
          const [sum, movs] = await Promise.all([
            getShiftSummary(s.id),
            getCashMovements(s.id),
          ])
          setSummary(sum)
          setCashMovements(movs)
        }
      } catch (err) {
        toast.error(err.message || 'Failed to load shift')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [branchId])

  const expectedCash = shift ? parseFloat(shift.expected_cash) : 0
  const actualCashNum = parseFloat(actualCash) || 0
  const cashDiff = actualCashNum - expectedCash

  const handleCloseShift = async () => {
    if (!shift) return
    setClosing(true)
    try {
      await closeShift(shift.id, {
        closing_cash: actualCashNum,
        cash_difference: cashDiff,
        notes,
      })
      toast.success('Shift closed')
      navigate('/pos')
    } catch (err) {
      toast.error(err.message || 'Failed to close shift')
    } finally {
      setClosing(false)
    }
  }

  const handlePrintZReport = async () => {
    if (!shift || !summary) return
    // Build a z-report order-like object for printing
    const zOrder = {
      order_number: `Z-${shift.id.slice(0, 8)}`,
      subtotal: shift.total_sales,
      total: shift.total_sales,
      discount_amount: shift.total_discounts,
      payment_method: 'z-report',
      created_at: new Date().toISOString(),
    }
    const prestoTotal = parseFloat(shift.total_presto_sales || 0)
    const prestoUncollected = parseFloat(shift.total_presto_uncollected || 0)
    const paidIn   = parseFloat(shift.total_paid_in   || 0)
    const paidOut  = parseFloat(shift.total_paid_out  || 0)
    const safeDrop = parseFloat(shift.total_safe_drop || 0)
    const tipOut   = parseFloat(shift.total_tip_out   || 0)
    const zItems = [
      { product_name: `Total Orders: ${shift.total_orders}`, quantity: 1, unit_price: 0, total: 0 },
      { product_name: 'Cash Sales', quantity: 1, unit_price: parseFloat(shift.total_cash_sales), total: parseFloat(shift.total_cash_sales) },
      { product_name: 'Card Sales', quantity: 1, unit_price: parseFloat(shift.total_card_sales), total: parseFloat(shift.total_card_sales) },
      ...(prestoTotal > 0 ? [
        { product_name: 'Presto (in total)', quantity: 1, unit_price: prestoTotal, total: prestoTotal },
        { product_name: '  Owed by Presto', quantity: 1, unit_price: prestoUncollected, total: prestoUncollected },
      ] : []),
      ...(paidIn   > 0 ? [{ product_name: 'Paid In',   quantity: 1, unit_price: paidIn,   total: paidIn   }] : []),
      ...(paidOut  > 0 ? [{ product_name: 'Paid Out',  quantity: 1, unit_price: paidOut,  total: paidOut  }] : []),
      ...(safeDrop > 0 ? [{ product_name: 'Safe Drop', quantity: 1, unit_price: safeDrop, total: safeDrop }] : []),
      ...(tipOut   > 0 ? [{ product_name: 'Tip Out',   quantity: 1, unit_price: tipOut,   total: tipOut   }] : []),
      ...(summary.topProducts || []).slice(0, 5).map(p => ({
        product_name: `  ${p.name} x${p.qty}`,
        quantity: 1,
        unit_price: p.total,
        total: p.total,
      })),
    ]
    try {
      await printReceipt(zOrder, { ...branch, receipt_header: `Z-REPORT - ${branch?.name}` }, zItems)
      toast.success('Z-Report printed')
    } catch (err) {
      toast.error(err.message || 'Print failed')
    }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">Loading...</p></Layout>
  if (!allowed) return <Layout><AccessDenied message="You don't have permission to view End of Day reports." /></Layout>

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-white font-bold text-xl">End of Day</h1>
            <p className="text-noch-muted text-sm">{branch?.name}</p>
          </div>
        </div>

        {!shift && (
          <div className="card text-center py-10">
            <p className="text-noch-muted">No open shift for this branch.</p>
            <button onClick={() => navigate('/pos')} className="btn-secondary mt-4">Go to POS Home</button>
          </div>
        )}

        {shift && summary && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="card text-center">
                <p className="text-noch-muted text-xs mb-1">Total Sales</p>
                <p className="text-noch-green font-bold text-xl">{parseFloat(shift.total_sales).toFixed(2)}</p>
                <p className="text-noch-muted text-xs">LYD</p>
              </div>
              <div className="card text-center">
                <p className="text-noch-muted text-xs mb-1">Orders</p>
                <p className="text-white font-bold text-xl">{shift.total_orders}</p>
              </div>
              <div className="card text-center">
                <p className="text-noch-muted text-xs mb-1">Cash Sales</p>
                <p className="text-white font-bold text-lg">{parseFloat(shift.total_cash_sales).toFixed(2)}</p>
              </div>
              <div className="card text-center">
                <p className="text-noch-muted text-xs mb-1">Card Sales</p>
                <p className="text-white font-bold text-lg">{parseFloat(shift.total_card_sales).toFixed(2)}</p>
              </div>
            </div>

            {/* Presto card — shown only when there's Presto activity. Counted in
                Total Sales above; the "Owed by Presto" line is the portion not
                yet reconciled against Presto's portal. */}
            {parseFloat(shift.total_presto_sales || 0) > 0 && (
              <div className="card mb-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-semibold text-sm">Presto Delivery</p>
                  <p className="text-noch-muted text-xs">included in total</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-noch-muted text-xs mb-0.5">Presto Sales</p>
                    <p className="text-white font-bold">{parseFloat(shift.total_presto_sales).toFixed(2)} LYD</p>
                  </div>
                  <div>
                    <p className="text-noch-muted text-xs mb-0.5">Owed by Presto</p>
                    <p className={`font-bold ${parseFloat(shift.total_presto_uncollected || 0) > 0 ? 'text-yellow-400' : 'text-noch-green'}`}>
                      {parseFloat(shift.total_presto_uncollected || 0).toFixed(2)} LYD
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Top products */}
            {summary.topProducts?.length > 0 && (
              <div className="card mb-5">
                <h3 className="text-white font-semibold mb-3 text-sm">Top Products</h3>
                {summary.topProducts.map((p, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-noch-border/50 last:border-0">
                    <span className="text-white text-sm">{p.name}</span>
                    <div className="text-right">
                      <span className="text-noch-muted text-xs">{p.qty} sold</span>
                      <span className="text-noch-green text-sm font-medium ml-3">{p.total.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cash Movements — paid in / out / safe drop / tip out */}
            <div className="card mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">Cash Movements</h3>
                <button
                  onClick={() => setShowCashModal(true)}
                  className="btn-secondary text-xs px-3 py-1 flex items-center gap-1"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              {/* Running totals */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <div className="flex justify-between bg-noch-dark/50 rounded px-2 py-1">
                  <span className="text-noch-muted">Paid In</span>
                  <span className="text-noch-green">+{parseFloat(shift.total_paid_in || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between bg-noch-dark/50 rounded px-2 py-1">
                  <span className="text-noch-muted">Paid Out</span>
                  <span className="text-yellow-400">-{parseFloat(shift.total_paid_out || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between bg-noch-dark/50 rounded px-2 py-1">
                  <span className="text-noch-muted">Safe Drop</span>
                  <span className="text-blue-400">-{parseFloat(shift.total_safe_drop || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between bg-noch-dark/50 rounded px-2 py-1">
                  <span className="text-noch-muted">Tip Out</span>
                  <span className="text-purple-400">-{parseFloat(shift.total_tip_out || 0).toFixed(2)}</span>
                </div>
              </div>
              {/* Recent list */}
              {cashMovements.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-2">No movements yet this shift.</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {cashMovements.slice(0, 10).map(m => {
                    const meta = MOVEMENT_TYPES.find(x => x.key === m.movement_type)
                    return (
                      <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b border-noch-border/30 last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {meta?.icon && <meta.icon size={12} className={meta.color} />}
                          <div className="min-w-0">
                            <p className="text-white truncate">{meta?.label || m.movement_type}</p>
                            {m.reason && <p className="text-noch-muted truncate">{m.reason}</p>}
                          </div>
                        </div>
                        <span className={`shrink-0 font-mono ${meta?.color || 'text-white'}`}>
                          {m.movement_type === 'drawer_no_sale' ? '—' : `${m.movement_type === 'paid_in' ? '+' : '-'}${parseFloat(m.amount).toFixed(2)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cash count */}
            <div className="card mb-5">
              <h3 className="text-white font-semibold mb-4">Cash Count</h3>
              <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                <div>
                  <p className="text-noch-muted text-xs mb-1">Expected Cash</p>
                  <p className="text-white font-bold">{expectedCash.toFixed(2)} LYD</p>
                </div>
                <div>
                  <p className="text-noch-muted text-xs mb-1">Opening Cash</p>
                  <p className="text-white">{parseFloat(shift.opening_cash).toFixed(2)} LYD</p>
                </div>
              </div>

              <label className="label block mb-1">Actual Cash in Drawer (LYD)</label>
              <input
                type="number"
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                placeholder="0.00"
                className="input w-full mb-3"
                step="0.01"
              />

              {actualCash && (
                <div className={`flex justify-between items-center px-3 py-2 rounded-lg ${
                  cashDiff === 0 ? 'bg-noch-green/10 border border-noch-green/20' :
                  cashDiff > 0 ? 'bg-blue-400/10 border border-blue-400/20' :
                  'bg-red-400/10 border border-red-400/20'
                }`}>
                  <span className="text-sm text-white">Difference</span>
                  <span className={`font-bold ${
                    cashDiff === 0 ? 'text-noch-green' :
                    cashDiff > 0 ? 'text-blue-400' : 'text-red-400'
                  }`}>
                    {cashDiff > 0 ? '+' : ''}{cashDiff.toFixed(2)} LYD
                  </span>
                </div>
              )}

              <label className="label block mt-3 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="input w-full resize-none"
                rows={2}
                placeholder="Shift notes..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={handlePrintZReport} className="btn-secondary flex items-center gap-2 flex-1 justify-center">
                <Printer size={14} />
                Z-Report
              </button>
              <button
                onClick={handleCloseShift}
                disabled={closing || !actualCash}
                className="btn-primary flex items-center gap-2 flex-1 justify-center"
              >
                <CheckCircle size={14} />
                {closing ? 'Closing...' : 'Close Shift'}
              </button>
            </div>
          </>
        )}
      </div>
      {showCashModal && shift && (
        <CashMovementModal
          branchId={branchId}
          shiftId={shift.id}
          onClose={() => setShowCashModal(false)}
          onSaved={async () => {
            // Refresh shift totals + movement list after save.
            const [s, movs] = await Promise.all([getOpenShift(branchId), getCashMovements(shift.id)])
            setShift(s)
            setCashMovements(movs)
          }}
        />
      )}
    </Layout>
  )
}
