// POSEndOfDay.jsx — Shift closing / end-of-day report
// Route: /pos/:branchId/end-of-day

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, CheckCircle } from 'lucide-react'
import { getPOSBranch, getOpenShift, closeShift, getShiftSummary } from '../lib/pos-supabase'
import { printReceipt, isPrinterConnected } from '../lib/escpos'
import Layout from '../../../components/Layout'
import { usePermission } from '../../../lib/usePermission'
import { AccessDenied } from '../../../components/shared/ProtectedFeature'
import toast from 'react-hot-toast'

export default function POSEndOfDay() {
  const can = usePermission()
  if (!can('pos', 'end_of_day')) {
    return <Layout><AccessDenied message="You don't have permission to view End of Day reports." /></Layout>
  }
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  const [shift, setShift] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actualCash, setActualCash] = useState('')
  const [closing, setClosing] = useState(false)
  const [notes, setNotes] = useState('')

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
          const sum = await getShiftSummary(s.id)
          setSummary(sum)
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
    if (!isPrinterConnected()) {
      toast.error('Printer not connected')
      return
    }
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
    const zItems = [
      { product_name: `Total Orders: ${shift.total_orders}`, quantity: 1, unit_price: 0, total: 0 },
      { product_name: 'Cash Sales', quantity: 1, unit_price: parseFloat(shift.total_cash_sales), total: parseFloat(shift.total_cash_sales) },
      { product_name: 'Card Sales', quantity: 1, unit_price: parseFloat(shift.total_card_sales), total: parseFloat(shift.total_card_sales) },
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
    </Layout>
  )
}
