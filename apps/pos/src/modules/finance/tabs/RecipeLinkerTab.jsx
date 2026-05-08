// RecipeLinkerTab.jsx — Cost Mapping.
// Per-product `cost_lyd` entry. The Menu Profitability Matrix and the
// COGS line on Daily P&L read directly from this column.
//
// Why direct entry rather than recipe linkage: the cost-calculator's
// per-recipe cost is computed in JavaScript (calcCostPerBaseUnit with
// FX rates and unit conversion) and can't be replicated server-side
// without re-implementing the full conversion math in PL/pgSQL — too
// much for v1. Owner enters cost-per-unit per product; future Phase
// 1.1 can add an "import from cost calculator" button.

import { useEffect, useMemo, useState } from 'react'
import { Coffee, Search, Save, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { lyd } from '../lib/thresholds'
import toast from 'react-hot-toast'

async function listProductsForCostMapping() {
  const { data, error } = await supabase
    .from('pos_products')
    .select('id, name, name_ar, price, cost_lyd, is_active, branch_id')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data || []
}

async function setProductCost(productId, cost) {
  const { error } = await supabase
    .from('pos_products')
    .update({ cost_lyd: cost, updated_at: new Date().toISOString() })
    .eq('id', productId)
  if (error) throw error
}

export default function RecipeLinkerTab() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')  // all | unset | set
  const [editing, setEditing] = useState({})   // { productId: cost-string }

  const reload = async () => {
    setLoading(true)
    try { setProducts(await listProductsForCostMapping()) }
    catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const visible = useMemo(() => products.filter(p => {
    const isSet = Number(p.cost_lyd) > 0
    if (filter === 'unset' && isSet) return false
    if (filter === 'set'   && !isSet) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [products, search, filter])

  const totals = {
    total: products.length,
    set: products.filter(p => Number(p.cost_lyd) > 0).length,
  }

  const save = async (productId, raw) => {
    const cost = Number(raw)
    if (!Number.isFinite(cost) || cost < 0) return toast.error('Enter a non-negative LYD cost')
    try {
      await setProductCost(productId, cost)
      setProducts(ps => ps.map(p => p.id === productId ? { ...p, cost_lyd: cost } : p))
      setEditing(e => { const { [productId]: _, ...rest } = e; return rest })
      toast.success('Saved')
    } catch (err) { toast.error(err.message || 'Save failed') }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Coffee size={14} className="text-noch-green"/>
        <h3 className="text-white text-sm font-semibold">Cost mapping</h3>
        <span className="text-noch-muted text-[11px]">{totals.set}/{totals.total} priced</span>
      </div>
      <p className="text-noch-muted text-xs mb-3">
        Enter <strong>variable cost per unit (LYD)</strong> for each menu item — that's ingredients + cup + lid + sleeve + sweetener for one drink. The Menu Profitability Matrix and the COGS line on Daily P&L use these numbers directly.
        Tip: open the <a href="/cost-calculator" className="underline text-noch-green">Cost Calculator</a> in another tab to look up totals.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-noch-muted" />
          <input className="input w-full pl-7 py-1 text-sm" placeholder="Search products" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input py-1 px-2 text-xs" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All ({totals.total})</option>
          <option value="unset">No cost set ({totals.total - totals.set})</option>
          <option value="set">Cost set ({totals.set})</option>
        </select>
      </div>

      {loading ? <p className="text-noch-muted text-center py-6">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Product</th>
                <th className="text-right py-1 pr-2">Price</th>
                <th className="text-right py-1 pr-2">Cost (LYD)</th>
                <th className="text-right py-1 pr-2">Margin</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => {
                const editValue = editing[p.id]
                const isEditing = editValue !== undefined
                const cm = Number(p.price) - Number(p.cost_lyd || 0)
                const cmR = Number(p.price) > 0 ? cm / Number(p.price) : 0
                return (
                  <tr key={p.id} className="border-t border-noch-border/40">
                    <td className="py-1.5 pr-2 text-white">{p.name}</td>
                    <td className="py-1.5 pr-2 text-right text-white font-mono">{lyd(p.price)}</td>
                    <td className="py-1.5 pr-2 text-right">
                      {isEditing ? (
                        <input
                          type="number" step="0.01" autoFocus
                          className="input py-0.5 px-1 text-xs w-24 text-right"
                          value={editValue}
                          onChange={e => setEditing(s => ({ ...s, [p.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') save(p.id, editValue)
                            if (e.key === 'Escape') setEditing(s => { const { [p.id]: _, ...rest } = s; return rest })
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => setEditing(s => ({ ...s, [p.id]: String(p.cost_lyd ?? '') }))}
                          className={`font-mono ${Number(p.cost_lyd) > 0 ? 'text-noch-green' : 'text-noch-muted underline'}`}
                        >
                          {Number(p.cost_lyd) > 0 ? Number(p.cost_lyd).toFixed(2) : '— set —'}
                        </button>
                      )}
                    </td>
                    <td className={`py-1.5 pr-2 text-right font-mono ${cmR >= 0.5 ? 'text-noch-green' : cmR >= 0.3 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {Number(p.cost_lyd) > 0 ? `${(cmR * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="py-1.5 text-right">
                      {isEditing ? (
                        <>
                          <button onClick={() => save(p.id, editValue)} className="text-noch-green px-1"><Save size={11}/></button>
                          <button onClick={() => setEditing(s => { const { [p.id]: _, ...rest } = s; return rest })} className="text-noch-muted px-1"><X size={11}/></button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
