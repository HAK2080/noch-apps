import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, ShoppingCart, AlertTriangle, CheckCircle, TrendingDown } from 'lucide-react'
import Layout from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { getStock, getIngredientsForCost } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function InventoryHub() {
  const { profile, isOwner } = useAuth()
  const navigate = useNavigate()
  const [stock, setStock] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [stockData, ingredientData] = await Promise.all([
        getStock(),
        getIngredientsForCost()
      ])
      setStock(stockData || [])
      setIngredients(ingredientData || [])
    } catch (err) {
      toast.error('Failed to load inventory data')
    } finally {
      setLoading(false)
    }
  }

  const totalTracked = stock.length
  const lowStock = stock.filter(s => s.qty_available > 0 && s.min_threshold > 0 && s.qty_available <= s.min_threshold)
  const outOfStock = stock.filter(s => s.qty_available <= 0)

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-noch-muted text-sm mt-1">Manage stock levels and procurement</p>
        </div>

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={20} className="text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-400 font-medium text-sm">Low Stock Alert</p>
              <p className="text-yellow-400/70 text-xs mt-1">
                {lowStock.map(s => s.ingredient?.name || 'Unknown').join(', ')} — below minimum threshold
              </p>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-noch-card border border-noch-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{loading ? '—' : totalTracked}</p>
            <p className="text-noch-muted text-xs mt-1">Items Tracked</p>
          </div>
          <div className="bg-noch-card border border-noch-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{loading ? '—' : lowStock.length}</p>
            <p className="text-noch-muted text-xs mt-1">Low Stock</p>
          </div>
          <div className="bg-noch-card border border-noch-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{loading ? '—' : outOfStock.length}</p>
            <p className="text-noch-muted text-xs mt-1">Out of Stock</p>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Stock Levels Card */}
          <button
            onClick={() => navigate('/inventory/stock')}
            className="bg-noch-card border border-noch-border rounded-xl p-6 text-left hover:border-noch-green/50 transition-colors group"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-noch-green/10 flex items-center justify-center">
                <Package size={20} className="text-noch-green" />
              </div>
              <h2 className="text-white font-semibold text-lg group-hover:text-noch-green transition-colors">Stock Levels</h2>
            </div>
            <p className="text-noch-muted text-sm">View and update ingredient stock, upload delivery notes, track usage</p>
            <div className="flex items-center gap-4 mt-4 text-xs">
              <span className="text-noch-green flex items-center gap-1">
                <CheckCircle size={14} />
                {stock.filter(s => s.qty_available > 0 && (!s.min_threshold || s.qty_available > s.min_threshold)).length} OK
              </span>
              {lowStock.length > 0 && (
                <span className="text-yellow-400 flex items-center gap-1">
                  <AlertTriangle size={14} />
                  {lowStock.length} Low
                </span>
              )}
              {outOfStock.length > 0 && (
                <span className="text-red-400 flex items-center gap-1">
                  <TrendingDown size={14} />
                  {outOfStock.length} Out
                </span>
              )}
            </div>
          </button>

          {/* Procurement Orders Card — Owner only */}
          {isOwner && (
            <button
              onClick={() => navigate('/inventory/procurement')}
              className="bg-noch-card border border-noch-border rounded-xl p-6 text-left hover:border-noch-green/50 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-noch-green/10 flex items-center justify-center">
                  <ShoppingCart size={20} className="text-noch-green" />
                </div>
                <h2 className="text-white font-semibold text-lg group-hover:text-noch-green transition-colors">Procurement Orders</h2>
              </div>
              <p className="text-noch-muted text-sm">Track orders, costs, shipping, customs, and receiving</p>
            </button>
          )}
        </div>
      </div>
    </Layout>
  )
}
