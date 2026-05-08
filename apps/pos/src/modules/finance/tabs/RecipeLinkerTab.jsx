// RecipeLinkerTab.jsx — bulk-link pos_products to recipes.
// Suggest links by case-insensitive name substring match.

import { useEffect, useMemo, useState } from 'react'
import { Link2, Search, Wand2, CheckCircle2, X } from 'lucide-react'
import { listProductsForLinking, listRecipes, setProductRecipe } from '../lib/finance-supabase'
import toast from 'react-hot-toast'

function suggest(productName, recipes) {
  const n = (productName || '').toLowerCase()
  // Highest score: exact match → contains-all-words → contains-any-word
  const tokens = n.split(/\s+/).filter(Boolean)
  let best = null, bestScore = 0
  for (const r of recipes) {
    const rn = (r.name || '').toLowerCase()
    let score = 0
    if (rn === n) score = 100
    else if (rn.includes(n) || n.includes(rn)) score = 80
    else {
      const hits = tokens.filter(t => t.length > 2 && rn.includes(t)).length
      score = hits * 20
    }
    if (score > bestScore) { bestScore = score; best = r }
  }
  return bestScore >= 40 ? best : null
}

export default function RecipeLinkerTab() {
  const [products, setProducts] = useState([])
  const [recipes, setRecipes] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | unlinked | linked
  const [busyId, setBusyId] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try {
      const [ps, rs] = await Promise.all([listProductsForLinking(), listRecipes()])
      setProducts(ps); setRecipes(rs)
    } catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const visible = useMemo(() => {
    return products.filter(p => {
      if (filter === 'linked' && !p.recipe_id) return false
      if (filter === 'unlinked' && p.recipe_id) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [products, search, filter])

  const totals = {
    total: products.length,
    linked: products.filter(p => p.recipe_id).length,
  }

  const link = async (productId, recipeId) => {
    setBusyId(productId)
    try {
      await setProductRecipe(productId, recipeId)
      setProducts(ps => ps.map(p => p.id === productId ? { ...p, recipe_id: recipeId } : p))
      toast.success('Linked')
    } catch (err) { toast.error(err.message || 'Link failed') }
    finally { setBusyId(null) }
  }

  const suggestAll = async () => {
    let hits = 0
    for (const p of products) {
      if (p.recipe_id) continue
      const s = suggest(p.name, recipes)
      if (s) {
        try { await setProductRecipe(p.id, s.id); hits++ } catch { /* skip */ }
      }
    }
    toast.success(`Linked ${hits} via name match`)
    reload()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-noch-green"/>
            <h3 className="text-white text-sm font-semibold">Map products to recipes</h3>
            <span className="text-noch-muted text-[11px]">{totals.linked}/{totals.total} linked</span>
          </div>
          <button onClick={suggestAll} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
            <Wand2 size={12}/> Suggest links by name
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-noch-muted" />
            <input className="input w-full pl-7 py-1 text-sm" placeholder="Search products" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input py-1 px-2 text-xs" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All ({totals.total})</option>
            <option value="unlinked">Unlinked ({totals.total - totals.linked})</option>
            <option value="linked">Linked ({totals.linked})</option>
          </select>
        </div>

        {loading ? <p className="text-noch-muted text-center py-6">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-noch-muted">
                <tr>
                  <th className="text-left py-1 pr-2">Product</th>
                  <th className="text-left py-1 pr-2">Suggested</th>
                  <th className="text-left py-1 pr-2">Linked recipe</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(p => {
                  const s = suggest(p.name, recipes)
                  const linked = recipes.find(r => r.id === p.recipe_id)
                  return (
                    <tr key={p.id} className="border-t border-noch-border/40">
                      <td className="py-1.5 pr-2 text-white">{p.name}</td>
                      <td className="py-1.5 pr-2 text-noch-muted">{s ? s.name : '—'}</td>
                      <td className="py-1.5 pr-2">
                        <select
                          className="input py-0.5 px-1 text-xs"
                          value={p.recipe_id || ''}
                          disabled={busyId === p.id}
                          onChange={e => link(p.id, e.target.value || null)}
                        >
                          <option value="">— unlinked —</option>
                          {recipes.map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.category})</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 text-right">
                        {linked ? <CheckCircle2 size={14} className="inline text-noch-green"/> : s ? (
                          <button onClick={() => link(p.id, s.id)} className="text-noch-green text-[11px] underline">use suggestion</button>
                        ) : <X size={14} className="inline text-noch-muted opacity-50"/>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
