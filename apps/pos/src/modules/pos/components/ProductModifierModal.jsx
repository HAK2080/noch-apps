// ProductModifierModal.jsx — picker shown when a product has modifier
// groups. Renders one section per group; single-choice (max_select=1)
// uses radios, multi-choice uses checkboxes. Required groups must be
// satisfied before "Add to cart".

import { useEffect, useState } from 'react'
import { X, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { getModifierGroupsForProduct } from '../lib/pos-supabase'
import { round, lineTotal } from '../lib/money'
import toast from 'react-hot-toast'

export default function ProductModifierModal({ product, onAdd, onClose, groups: groupsProp = null, posLang = 'en' }) {
  const isAr = posLang === 'ar'
  // Display name helpers — prefer Arabic when in AR mode
  const gName = (g) => (isAr && g.name_ar) ? g.name_ar : g.name
  const mName = (m) => (isAr && m.name_ar) ? m.name_ar : m.name
  const pName = (isAr && product.name_ar) ? product.name_ar : product.name
  const [groups, setGroups] = useState([])
  const [selections, setSelections] = useState({}) // groupId → array of modifier objects
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState({}) // groupId → bool

  useEffect(() => {
    if (!product?.id) return
    const initFromGroups = (g) => {
      const sel = {}
      const col = {}
      for (let i = 0; i < g.length; i++) {
        const grp = g[i]
        sel[grp.id] = grp.modifiers.filter(m => m.is_default)
        // All collapsed by default — staff tap to expand when needed
        col[grp.id] = true
      }
      setSelections(sel)
      setCollapsed(col)
    }
    if (Array.isArray(groupsProp)) {
      setGroups(groupsProp)
      initFromGroups(groupsProp)
      setLoading(false)
      return
    }
    getModifierGroupsForProduct(product.id)
      .then(g => {
        setGroups(g)
        initFromGroups(g)
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
      <div className="bg-noch-card border border-noch-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between p-4 border-b border-noch-border sticky top-0 bg-noch-card">
          <div>
            <h2 className="text-white font-bold">{pName}</h2>
            <p className="text-noch-muted text-xs">{isAr ? 'تخصيص المشروب' : 'Customise this drink'}</p>
          </div>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-noch-muted">
              <Loader2 size={16} className="animate-spin mr-2" /> {isAr ? 'جاري التحميل…' : 'Loading options…'}
            </div>
          ) : groups.length === 0 ? (
            <p className="text-noch-muted text-sm text-center py-6">{isAr ? 'لا توجد خيارات لهذا المنتج.' : 'No options for this product.'}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map(g => {
                const isOpen = !collapsed[g.id]
                const picked = selections[g.id] || []
                const summary = picked.length > 0
                  ? picked.map(m => mName(m)).join(', ')
                  : null
                return (
                  <div key={g.id} className="border border-noch-border/40 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setCollapsed(c => ({ ...c, [g.id]: !c[g.id] }))}
                      className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-noch-border/20 transition-colors"
                      dir={isAr ? 'rtl' : 'ltr'}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isOpen ? <ChevronDown size={14} className="text-noch-muted shrink-0" /> : <ChevronRight size={14} className={`text-noch-muted shrink-0 ${isAr ? 'rotate-180' : ''}`} />}
                        <h3 className="text-white text-sm font-semibold truncate">
                          {gName(g)}
                          {g.is_required && <span className="text-red-400 mx-1">*</span>}
                        </h3>
                        {!isOpen && summary && (
                          <span className="text-noch-green text-xs truncate mx-1">{summary}</span>
                        )}
                      </div>
                      <span className="text-noch-muted text-xs shrink-0 mx-2">
                        {g.max_select === 1
                          ? (isAr ? 'اختر واحد' : 'pick one')
                          : (isAr ? `حتى ${g.max_select}` : `up to ${g.max_select}`)}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-1.5 px-3 pb-3">
                        {g.modifiers.map(m => {
                          const checked = picked.some(s => s.id === m.id)
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleModifier(g, m)}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm text-left ${
                                checked
                                  ? 'bg-noch-green/10 border-noch-green/50 text-white'
                                  : 'border-noch-border text-noch-muted hover:border-noch-green/20'
                              }`}
                              dir={isAr ? 'rtl' : 'ltr'}
                            >
                              <span>{mName(m)}</span>
                              <span className={`text-xs font-mono ${checked ? 'text-noch-green' : ''}`}>
                                {Number(m.price_delta) > 0 ? `+${Number(m.price_delta).toFixed(2)}` :
                                 Number(m.price_delta) < 0 ? `${Number(m.price_delta).toFixed(2)}` : ''}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex items-center justify-between mt-5 mb-3 bg-noch-dark/50 rounded-lg px-3 py-2">
            <span className="text-noch-muted text-sm">{isAr ? 'المجموع' : 'Total'}</span>
            <span className="text-noch-green font-bold">{lineTtl.toFixed(2)} LYD</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={loading || !validation.ok}
            className="btn-primary w-full py-3 text-base font-bold"
          >
            {isAr ? 'أضف للسلة' : 'Add to cart'}
          </button>
        </div>
      </div>
    </div>
  )
}
