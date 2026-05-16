// ProductModifierModal.jsx — picker shown when a product has modifier
// groups. Renders one section per group; single-choice (max_select=1)
// uses radios, multi-choice uses checkboxes. Required groups must be
// satisfied before "Add to cart".

import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { getModifierGroupsForProduct } from '../lib/pos-supabase'
import { round, lineTotal } from '../lib/money'
import toast from 'react-hot-toast'

export default function ProductModifierModal({ product, onAdd, onClose, groups: groupsProp = null }) {
  const [groups, setGroups] = useState([])
  const [selections, setSelections] = useState({}) // groupId → array of modifier objects
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!product?.id) return
    if (Array.isArray(groupsProp)) {
      setGroups(groupsProp)
      const init = {}
      for (const grp of groupsProp) {
        init[grp.id] = grp.modifiers.filter(m => m.is_default)
      }
      setSelections(init)
      setLoading(false)
      return
    }
    getModifierGroupsForProduct(product.id)
      .then(g => {
        setGroups(g)
        // Pre-select defaults
        const init = {}
        for (const grp of g) {
          init[grp.id] = grp.modifiers.filter(m => m.is_default)
        }
        setSelections(init)
      })
      .catch(err => toast.error(err.message || 'Failed to load options'))
      .finally(() => setLoading(false))
  }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleModifier = (group, mod) => {
    setSelections(prev => {
      const cur = prev[group.id] || []
      const exists = cur.find(m => m.id === mod.id)
      if (group.max_select === 1) {
        return { ...prev, [group.id]: exists ? [] : [mod] }
      }
      if (exists) {
        return { ...prev, [group.id]: cur.filter(m => m.id !== mod.id) }
      }
      if (cur.length >= group.max_select) {
        toast(`Up to ${group.max_select} choices in ${group.name}`)
        return prev
      }
      return { ...prev, [group.id]: [...cur, mod] }
    })
  }

  const validation = (() => {
    for (const g of groups) {
      const picked = selections[g.id] || []
      if (g.is_required && picked.length < Math.max(1, g.min_select)) {
        return { ok: false, reason: `Pick at least ${Math.max(1, g.min_select)} in "${g.name}"` }
      }
      if (picked.length < (g.min_select || 0)) {
        return { ok: false, reason: `Pick at least ${g.min_select} in "${g.name}"` }
      }
    }
    return { ok: true }
  })()

  const allSelected = Object.values(selections).flat()

  const totalDelta = round(allSelected.reduce((s, m) => s + Number(m.price_delta || 0), 0))
  const finalUnit = round(Number(product.price) + totalDelta)
  const lineTtl = lineTotal(finalUnit, 1)

  const handleAdd = () => {
    if (!validation.ok) { toast.error(validation.reason); return }
    onAdd({
      // The cart line uses the modified unit_price so receipt totals
      // match without a separate per-line modifier sum.
      unit_price: finalUnit,
      modifiers: allSelected.map(m => ({
        modifier_id: m.id,
        group_name:  groups.find(g => g.modifiers.some(x => x.id === m.id))?.name,
        modifier_name: m.name,
        modifier_name_ar: m.name_ar,
        price_delta: m.price_delta,
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center">
      <div className="bg-noch-card border border-noch-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-noch-border sticky top-0 bg-noch-card">
          <div>
            <h2 className="text-white font-bold">{product.name}</h2>
            <p className="text-noch-muted text-xs">Customise this drink</p>
          </div>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-noch-muted">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading options…
            </div>
          ) : groups.length === 0 ? (
            <p className="text-noch-muted text-sm text-center py-6">No options for this product.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map(g => (
                <div key={g.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-white text-sm font-semibold">
                      {g.name}
                      {g.is_required && <span className="text-red-400 ml-1">*</span>}
                    </h3>
                    <span className="text-noch-muted text-xs">
                      {g.max_select === 1 ? 'pick one' : `up to ${g.max_select}`}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {g.modifiers.map(m => {
                      const checked = (selections[g.id] || []).some(s => s.id === m.id)
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleModifier(g, m)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm text-left ${
                            checked
                              ? 'bg-noch-green/10 border-noch-green/50 text-white'
                              : 'border-noch-border text-noch-muted hover:border-noch-green/20'
                          }`}
                        >
                          <span>
                            {m.name}
                            {m.name_ar && <span className="text-noch-muted text-xs ml-1" dir="rtl">{m.name_ar}</span>}
                          </span>
                          <span className={`text-xs font-mono ${checked ? 'text-noch-green' : ''}`}>
                            {Number(m.price_delta) > 0 ? `+${Number(m.price_delta).toFixed(2)}` :
                             Number(m.price_delta) < 0 ? `${Number(m.price_delta).toFixed(2)}` : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-5 mb-3 bg-noch-dark/50 rounded-lg px-3 py-2">
            <span className="text-noch-muted text-sm">Total</span>
            <span className="text-noch-green font-bold">{lineTtl.toFixed(2)} LYD</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={loading || !validation.ok}
            className="btn-primary w-full py-3 text-base font-bold"
          >
            Add to cart
          </button>
        </div>
      </div>
    </div>
  )
}
