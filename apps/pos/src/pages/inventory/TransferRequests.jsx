// TransferRequests.jsx — Request stock from the central warehouse
// Route: /inventory/requests
// Any staff can request; cancel is owner/supervisor only (and currently
// blocked by RLS — see cancelTransfer note in lib/warehouse.js).

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, PackagePlus, X, Loader2 } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { getPOSProducts } from '../../modules/pos/lib/pos-supabase'
import {
  listLocations, listWarehouseStock, listTransfers,
  requestTransfer, cancelTransfer,
} from './lib/warehouse'
import toast from 'react-hot-toast'

export default function TransferRequests() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canCancel = profile?.role === 'owner' || profile?.role === 'supervisor'

  const [locations, setLocations] = useState([])
  const [locationId, setLocationId] = useState('')
  const [products, setProducts] = useState([])
  const [warehouseQty, setWarehouseQty] = useState({})
  const [openRequests, setOpenRequests] = useState([])

  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const [loading, setLoading] = useState(true)

  const locationName = id => locations.find(l => l.id === id)?.name || '—'

  const loadRequests = useCallback(async (locId) => {
    const all = await listTransfers({ status: 'requested', limit: 100 })
    setOpenRequests(locId ? all.filter(t => t.to_location_id === locId) : all)
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const [locs, prods, wh] = await Promise.all([
          listLocations(),
          getPOSProducts(),
          listWarehouseStock(),
        ])
        const branchLocs = locs.filter(l => l.location_type === 'branch')
        setLocations(branchLocs)
        if (branchLocs.length) setLocationId(branchLocs[0].id)
        setProducts(prods)
        setWarehouseQty(Object.fromEntries(wh.rows.map(r => [r.product_id, parseFloat(r.qty) || 0])))
      } catch (err) {
        toast.error(err.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!locationId) return
    loadRequests(locationId).catch(err => toast.error(err.message || 'Failed to load requests'))
  }, [locationId, loadRequests])

  async function handleSubmit(e) {
    e.preventDefault()
    const n = parseFloat(qty)
    if (!productId) return toast.error('Select a product')
    if (!locationId) return toast.error('Select a branch')
    if (!n || n <= 0) return toast.error('Enter a quantity above 0')
    setSubmitting(true)
    try {
      await requestTransfer(productId, locationId, n, note.trim())
      toast.success('Transfer requested')
      setProductId('')
      setQty('')
      setNote('')
      await loadRequests(locationId)
    } catch (err) {
      toast.error(err.message || 'Request failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(t) {
    setCancelling(t.id)
    try {
      await cancelTransfer(t.id)
      toast.success('Request cancelled')
      await loadRequests(locationId)
    } catch (err) {
      toast.error(err.message || 'Cancel failed')
    } finally {
      setCancelling(null)
    }
  }

  const selectedWarehouseQty = productId ? (warehouseQty[productId] ?? 0) : null

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/inventory')} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <PackagePlus size={18} className="text-noch-green" />
              Transfer Requests
            </h1>
            <p className="text-noch-muted text-sm">Request stock from the central warehouse</p>
          </div>
        </div>

        {/* Request form */}
        <form onSubmit={handleSubmit} className="bg-noch-card border border-noch-border rounded-xl p-4 mb-6 space-y-3">
          <h2 className="text-white font-semibold text-sm">Request stock</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1">Destination branch</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)} className="input w-full">
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Product</label>
              <select value={productId} onChange={e => setProductId(e.target.value)} className="input w-full">
                <option value="">Select product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — warehouse: {warehouseQty[p.id] ?? 0}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Quantity</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="0"
                className="input w-full"
              />
              {selectedWarehouseQty !== null && (
                <p className={`text-xs mt-1 ${selectedWarehouseQty <= 0 ? 'text-red-400' : 'text-noch-muted'}`}>
                  {selectedWarehouseQty} available in warehouse
                </p>
              )}
            </div>
            <div>
              <label className="label block mb-1">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. weekend rush"
                className="input w-full"
              />
            </div>
          </div>
          <button type="submit" disabled={submitting || loading} className="btn-primary flex items-center gap-2">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Request transfer
          </button>
        </form>

        {/* Open requests */}
        <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-noch-border">
            <h2 className="text-white font-semibold text-sm">
              Open requests{locationId ? ` — ${locationName(locationId)}` : ''}
            </h2>
          </div>
          {loading ? (
            <p className="text-noch-muted text-center py-10 text-sm">Loading...</p>
          ) : openRequests.length === 0 ? (
            <p className="text-noch-muted text-center py-10 text-sm">No open requests for this branch</p>
          ) : (
            <div className="divide-y divide-noch-border/50">
              {openRequests.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{t.product_name}</p>
                    <p className="text-noch-muted text-xs">
                      {parseFloat(t.qty_requested)} requested
                      {t.requested_at && ` · ${new Date(t.requested_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                      {t.note && ` · ${t.note}`}
                    </p>
                  </div>
                  {canCancel && (
                    <button
                      onClick={() => handleCancel(t)}
                      disabled={cancelling === t.id}
                      className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 shrink-0"
                    >
                      {cancelling === t.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
