// WarehouseStock.jsx — Central warehouse product stock + receive form
// Route: /inventory/warehouse
// Stock enters via receive_warehouse_stock (this form) and leaves via
// ship_transfer (see Transfers page).

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Warehouse, RefreshCw, Search, PackagePlus } from 'lucide-react'
import Layout from '../../components/Layout'
import { listWarehouseStock, listProducts, receiveWarehouseStock } from './lib/warehouse'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function WarehouseStock() {
  const navigate = useNavigate()
  const { profile, isOwner } = useAuth()
  const canReceive = isOwner || profile?.role === 'supervisor'
  const [warehouse, setWarehouse] = useState(null)
  const [rows, setRows] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ productId: '', qty: '', note: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ warehouse, rows }, prods] = await Promise.all([listWarehouseStock(), listProducts()])
      setWarehouse(warehouse)
      setRows(rows)
      setProducts(prods)
    } catch (err) {
      toast.error(err.message || 'Failed to load warehouse stock')
    } finally {
      setLoading(false)
    }
  }

  async function submitReceive(e) {
    e.preventDefault()
    const qty = parseFloat(form.qty)
    if (!form.productId) { toast.error('Select a product'); return }
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return }
    setSaving(true)
    try {
      await receiveWarehouseStock(form.productId, qty, form.note)
      toast.success('Stock received into warehouse')
      setForm({ productId: '', qty: '', note: '' })
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to receive stock')
    } finally {
      setSaving(false)
    }
  }

  const filtered = rows.filter(r =>
    !search || r.product_name.toLowerCase().includes(search.toLowerCase())
  )

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
              <Warehouse size={18} className="text-noch-green" />
              Warehouse Stock
            </h1>
            <p className="text-noch-muted text-sm">{warehouse?.name || 'Central Warehouse'}</p>
          </div>
          <button onClick={load} className="p-2 text-noch-muted hover:text-white rounded-lg hover:bg-noch-card" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Receive stock (owner/supervisor) */}
        {canReceive && (
          <form onSubmit={submitReceive} className="bg-noch-card border border-noch-border rounded-xl p-4 mb-4">
            <p className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
              <PackagePlus size={15} className="text-noch-green" /> Receive stock into warehouse
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_1fr_auto] gap-2">
              <select
                value={form.productId}
                onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
                className="input"
              >
                <option value="">Select product…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Qty"
                value={form.qty}
                onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                className="input"
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className="input"
              />
              <button type="submit" disabled={saving} className="btn-primary whitespace-nowrap disabled:opacity-50">
                {saving ? 'Saving…' : 'Receive'}
              </button>
            </div>
          </form>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full pl-9"
          />
        </div>

        {/* Table */}
        <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_150px] gap-2 px-4 py-2.5 border-b border-noch-border text-xs font-semibold text-noch-muted uppercase tracking-wide">
            <span>Product</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Updated</span>
          </div>
          {loading ? (
            <p className="text-noch-muted text-center py-10 text-sm">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-noch-muted text-center py-10 text-sm">
              {rows.length === 0 ? 'No warehouse stock yet — receive stock above, then ship it to branches' : 'No products match'}
            </p>
          ) : (
            <div className="divide-y divide-noch-border/50">
              {filtered.map(r => (
                <div key={r.id} className="grid grid-cols-[1fr_100px_150px] gap-2 px-4 py-3 items-center">
                  <p className="text-white text-sm font-medium truncate">{r.product_name}</p>
                  <p className={`text-sm font-bold text-right tabular-nums ${parseFloat(r.qty) <= 0 ? 'text-red-400' : 'text-noch-green'}`}>
                    {parseFloat(r.qty)}
                  </p>
                  <p className="text-noch-muted text-xs text-right">
                    {r.updated_at ? new Date(r.updated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-noch-muted text-xs mt-3">
          Stock enters here via the receive form and leaves to branches via Transfers.
        </p>
      </div>
    </Layout>
  )
}
