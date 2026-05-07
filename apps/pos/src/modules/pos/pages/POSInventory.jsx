// POSInventory.jsx — Stock management for a branch
// Route: /pos/:branchId/inventory

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, Download, AlertTriangle, CheckCircle } from 'lucide-react'
import { getPOSBranch, getPOSProducts, updateProductStock, createInventoryMovement } from '../lib/pos-supabase'
import { supabase } from '../../../lib/supabase'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

function StockRow({ product, onAdjust }) {
  const [editing, setEditing] = useState(false)
  const [newQty, setNewQty] = useState('')
  const [saving, setSaving] = useState(false)

  const stock = parseFloat(product.stock_qty)
  const alert = parseFloat(product.low_stock_alert)

  const stockColor = !product.track_inventory
    ? 'text-noch-muted'
    : stock <= 0
    ? 'text-red-400'
    : stock <= alert
    ? 'text-yellow-400'
    : 'text-noch-green'

  const handleSave = async () => {
    const n = parseFloat(newQty)
    if (isNaN(n)) return
    setSaving(true)
    try {
      await onAdjust(product.id, product.branch_id, stock, n)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-noch-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{product.name}</p>
        {product.name_ar && <p className="text-noch-muted text-xs" dir="rtl">{product.name_ar}</p>}
        <p className="text-noch-muted text-xs">{parseFloat(product.price).toFixed(3)} LYD</p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {!product.track_inventory ? (
          <span className="text-noch-muted text-xs">Not tracked</span>
        ) : editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
              className="input py-1 px-2 w-20 text-sm text-center"
              placeholder={stock.toFixed(2)}
              autoFocus
              step="0.01"
            />
            <button onClick={handleSave} disabled={saving} className="btn-primary px-2 py-1 text-xs">
              {saving ? '...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="btn-secondary px-2 py-1 text-xs">
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              {stock <= 0 ? <AlertTriangle size={12} className="text-red-400" /> :
               stock <= alert ? <AlertTriangle size={12} className="text-yellow-400" /> :
               <CheckCircle size={12} className="text-noch-green" />}
              <span className={`font-bold text-sm ${stockColor}`}>{stock.toFixed(2)}</span>
            </div>
            <button
              onClick={() => { setNewQty(stock.toFixed(2)); setEditing(true) }}
              className="btn-secondary text-xs px-2 py-1"
            >
              Adjust
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function POSInventory() {
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLow, setFilterLow] = useState(false)

  useEffect(() => {
    Promise.all([getPOSBranch(branchId), getPOSProducts(branchId)])
      .then(([b, p]) => { setBranch(b); setProducts(p) })
      .catch(err => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [branchId])

  const handleAdjust = async (productId, branchId, stockBefore, newQty) => {
    await updateProductStock(productId, newQty)
    await createInventoryMovement({
      branch_id: branchId,
      product_id: productId,
      movement_type: 'adjustment',
      quantity: newQty - stockBefore,
      stock_before: stockBefore,
      stock_after: newQty,
      notes: 'Manual adjustment',
    })
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, stock_qty: newQty } : p
    ))
    toast.success('Stock updated')
  }

  const exportCSV = () => {
    const rows = [
      ['Name', 'Name AR', 'Price', 'Track Inventory', 'Stock Qty', 'Low Stock Alert'],
      ...products.map(p => [
        p.name, p.name_ar || '', p.price, p.track_inventory, p.stock_qty, p.low_stock_alert
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${branch?.name || 'inventory'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = products.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.name_ar && p.name_ar.includes(search))
    const matchLow = !filterLow || (p.track_inventory && parseFloat(p.stock_qty) <= parseFloat(p.low_stock_alert))
    return matchSearch && matchLow
  })

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">Loading...</p></Layout>

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Package size={18} className="text-noch-green" />
              Inventory
            </h1>
            <p className="text-noch-muted text-sm">{branch?.name}</p>
          </div>
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
            <Download size={14} />
            Export
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input flex-1"
          />
          <button
            onClick={() => setFilterLow(!filterLow)}
            className={`btn-secondary text-sm whitespace-nowrap flex items-center gap-1.5 ${filterLow ? 'border-yellow-400/50 text-yellow-400' : ''}`}
          >
            <AlertTriangle size={12} />
            Low Stock
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="card text-center py-3">
            <p className="text-white font-bold">{products.length}</p>
            <p className="text-noch-muted text-xs">Total Products</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-yellow-400 font-bold">
              {products.filter(p => p.track_inventory && parseFloat(p.stock_qty) <= parseFloat(p.low_stock_alert) && parseFloat(p.stock_qty) > 0).length}
            </p>
            <p className="text-noch-muted text-xs">Low Stock</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-red-400 font-bold">
              {products.filter(p => p.track_inventory && parseFloat(p.stock_qty) <= 0).length}
            </p>
            <p className="text-noch-muted text-xs">Out of Stock</p>
          </div>
        </div>

        {/* Product list */}
        <div className="card">
          {filtered.length === 0 ? (
            <p className="text-noch-muted text-center py-8 text-sm">No products found</p>
          ) : (
            filtered.map(p => (
              <StockRow
                key={p.id}
                product={p}
                onAdjust={handleAdjust}
              />
            ))
          )}
        </div>
      </div>
    </Layout>
  )
}
