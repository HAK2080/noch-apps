// POSWaste.jsx — Barista waste reporting (tablet-first, big touch targets)
// Route: /pos/:branchId/waste
// Flow: search product → pick reason → set qty → Submit → report_waste RPC.

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, Search, Minus, Plus, Loader2 } from 'lucide-react'
import { getPOSBranch, getPOSProducts } from '../lib/pos-supabase'
import { reportWaste } from '../../../pages/inventory/lib/warehouse'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

const REASONS = [
  { value: 'used',        label: 'Used',        emoji: '🥛' },
  { value: 'damaged',     label: 'Damaged',     emoji: '💧' },
  { value: 'lost',        label: 'Lost',        emoji: '❓' },
  { value: 'thrown_away', label: 'Thrown away', emoji: '🗑️' },
  { value: 'expired',     label: 'Expired',     emoji: '⌛' },
  { value: 'staff_meal',  label: 'Staff meal',  emoji: '🍽️' },
]

export default function POSWaste() {
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [product, setProduct] = useState(null)
  const [reason, setReason] = useState(null)
  const [qty, setQty] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([getPOSBranch(branchId), getPOSProducts(branchId)])
      .then(([b, p]) => { setBranch(b); setProducts(p) })
      .catch(err => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [branchId])

  const matches = search.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (p.name_ar && p.name_ar.includes(search.trim()))
      ).slice(0, 8)
    : []

  function reset() {
    setProduct(null)
    setReason(null)
    setQty(1)
    setSearch('')
  }

  function bump(delta) {
    setQty(q => {
      const next = Math.round((q + delta) * 100) / 100
      return next < 1 ? 1 : next
    })
  }

  async function handleSubmit() {
    if (!product) return toast.error('Pick a product first')
    if (!reason) return toast.error('Pick a reason')
    if (!qty || qty <= 0) return toast.error('Quantity must be above 0')
    setSubmitting(true)
    try {
      await reportWaste(branchId, product.id, qty, reason, null)
      toast.success(`${qty} × ${product.name} reported as ${REASONS.find(r => r.value === reason)?.label}`)
      // Keep local stock in sync so a second entry shows the new qty
      setProducts(prev => prev.map(p =>
        p.id === product.id
          ? { ...p, stock_qty: Math.max(0, (parseFloat(p.stock_qty) || 0) - qty) }
          : p
      ))
      reset()
    } catch (err) {
      toast.error(err.message || 'Failed to report waste')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">Loading...</p></Layout>

  return (
    <Layout>
      <div className="max-w-lg mx-auto pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Trash2 size={20} className="text-red-400" />
              Report Waste
            </h1>
            <p className="text-noch-muted text-sm">{branch?.name}</p>
          </div>
        </div>

        {/* Step 1 — product */}
        {!product ? (
          <div className="bg-noch-card border border-noch-border rounded-xl p-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search product..."
                className="input w-full pl-9 py-3 text-base"
                autoFocus
              />
            </div>
            <div className="mt-2 divide-y divide-noch-border/50">
              {search.trim() && matches.length === 0 && (
                <p className="text-noch-muted text-sm text-center py-6">No products match</p>
              )}
              {matches.map(p => (
                <button
                  key={p.id}
                  onClick={() => setProduct(p)}
                  className="w-full flex items-center justify-between px-2 py-3.5 text-left hover:bg-noch-dark rounded-lg transition-colors"
                >
                  <span className="text-white text-base font-medium">{p.name}</span>
                  <span className="text-noch-muted text-sm tabular-nums">{parseFloat(p.stock_qty) || 0} in stock</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Selected product */}
            <div className="bg-noch-card border border-noch-green/40 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-lg">{product.name}</p>
                <p className="text-noch-muted text-sm">{parseFloat(product.stock_qty) || 0} in stock</p>
              </div>
              <button onClick={reset} className="btn-secondary text-sm px-3 py-1.5">Change</button>
            </div>

            {/* Step 2 — reason */}
            <div className="grid grid-cols-2 gap-3">
              {REASONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`py-5 rounded-xl border text-base font-semibold transition-colors flex flex-col items-center gap-1
                    ${reason === r.value
                      ? 'bg-red-500/20 border-red-500/60 text-red-300'
                      : 'bg-noch-card border-noch-border text-white hover:border-red-500/40'}`}
                >
                  <span className="text-2xl">{r.emoji}</span>
                  {r.label}
                </button>
              ))}
            </div>

            {/* Step 3 — qty */}
            <div className="bg-noch-card border border-noch-border rounded-xl p-4 flex items-center justify-center gap-4">
              <button onClick={() => bump(-1)} className="btn-secondary w-14 h-14 rounded-xl text-2xl flex items-center justify-center">
                <Minus size={22} />
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={e => setQty(parseFloat(e.target.value) || 0)}
                className="input w-24 py-3 text-center text-2xl font-bold"
              />
              <button onClick={() => bump(1)} className="btn-secondary w-14 h-14 rounded-xl text-2xl flex items-center justify-center">
                <Plus size={22} />
              </button>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !reason || !qty || qty <= 0}
              className="btn-primary w-full py-4 text-lg font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {submitting && <Loader2 size={18} className="animate-spin" />}
              Submit waste report
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}
