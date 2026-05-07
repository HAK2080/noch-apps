// POSModifiers.jsx — admin page for modifier groups + modifiers + product assignment.
// Route: /pos/:branchId/modifiers
// Minimal UI: create/edit/delete groups; per group, add modifiers; per
// group, attach a list of products that should show the group at sale.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Edit2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { getAllProducts } from '../lib/pos-supabase'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

function GroupForm({ group, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: group?.name || '', name_ar: group?.name_ar || '',
    min_select: group?.min_select ?? 0, max_select: group?.max_select ?? 1,
    is_required: !!group?.is_required, sort_order: group?.sort_order ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const handleSave = async () => {
    if (!form.name) { toast.error('Name required'); return }
    setSaving(true)
    try {
      if (group?.id) {
        const { error } = await supabase.from('pos_modifier_groups').update(form).eq('id', group.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('pos_modifier_groups').insert(form)
        if (error) throw error
      }
      toast.success('Saved')
      onSave()
    } catch (err) { toast.error(err.message || 'Save failed') }
    finally { setSaving(false) }
  }
  return (
    <div className="bg-noch-dark border border-noch-border rounded-xl p-4 mb-3">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label block mb-1">Name</label>
          <input className="input w-full" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Milk" />
        </div>
        <div>
          <label className="label block mb-1">Arabic name</label>
          <input className="input w-full" value={form.name_ar} onChange={e => set('name_ar', e.target.value)} dir="rtl" />
        </div>
        <div>
          <label className="label block mb-1">Min select</label>
          <input type="number" className="input w-full" value={form.min_select} onChange={e => set('min_select', Number(e.target.value))} min="0" />
        </div>
        <div>
          <label className="label block mb-1">Max select</label>
          <input type="number" className="input w-full" value={form.max_select} onChange={e => set('max_select', Number(e.target.value))} min="1" />
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm text-white">
            <input type="checkbox" checked={form.is_required} onChange={e => set('is_required', e.target.checked)} />
            Required (cannot add to cart without picking)
          </label>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}

function ModifierRows({ group, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', name_ar: '', price_delta: '0', sort_order: 0, is_default: false })

  const addModifier = async () => {
    if (!form.name) return
    const payload = { ...form, group_id: group.id, price_delta: Number(form.price_delta) || 0 }
    const { error } = await supabase.from('pos_modifiers').insert(payload)
    if (error) return toast.error(error.message)
    setForm({ name: '', name_ar: '', price_delta: '0', sort_order: 0, is_default: false })
    setAdding(false)
    onChanged()
  }
  const remove = async (id) => {
    const { error } = await supabase.from('pos_modifiers').update({ is_active: false }).eq('id', id)
    if (error) return toast.error(error.message)
    onChanged()
  }

  const items = (group.pos_modifiers || []).filter(m => m.is_active)

  return (
    <div className="ml-4 mt-2">
      <p className="text-noch-muted text-xs mb-1.5">Options</p>
      <div className="flex flex-col gap-1">
        {items.length === 0 && <p className="text-noch-muted text-xs italic">No options yet.</p>}
        {items.map(m => (
          <div key={m.id} className="flex items-center justify-between bg-noch-dark/50 rounded px-2 py-1 text-xs">
            <span className="text-white">
              {m.name}
              {m.name_ar && <span className="text-noch-muted ml-1" dir="rtl">{m.name_ar}</span>}
              {m.is_default && <span className="text-noch-green ml-2">(default)</span>}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-noch-muted">
                {Number(m.price_delta) > 0 ? `+${Number(m.price_delta).toFixed(2)}` :
                 Number(m.price_delta) < 0 ? `${Number(m.price_delta).toFixed(2)}` : '—'}
              </span>
              <button onClick={() => remove(m.id)} className="text-red-400"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <input className="input col-span-2 text-sm" placeholder="Option name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input text-sm" placeholder="Arabic" value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} dir="rtl" />
          <input className="input text-sm" placeholder="Price delta" type="number" step="0.01" value={form.price_delta} onChange={e => setForm(f => ({ ...f, price_delta: e.target.value }))} />
          <label className="col-span-2 flex items-center gap-2 text-xs text-white">
            <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
            Default (pre-selected at sale)
          </label>
          <button onClick={() => setAdding(false)} className="btn-secondary text-xs">Cancel</button>
          <button onClick={addModifier} className="btn-primary text-xs">Add option</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-noch-green text-xs mt-2 flex items-center gap-1">
          <Plus size={12} /> Add option
        </button>
      )}
    </div>
  )
}

function ProductAssignments({ groupId, onChanged }) {
  const [products, setProducts] = useState([])
  const [assigned, setAssigned] = useState(new Set())
  const [search, setSearch] = useState('')

  const reload = async () => {
    const [allProds, links] = await Promise.all([
      getAllProducts(),
      supabase.from('pos_product_modifier_groups').select('product_id').eq('group_id', groupId),
    ])
    setProducts(allProds)
    setAssigned(new Set((links.data || []).map(l => l.product_id)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [groupId])

  const toggle = async (pid) => {
    if (assigned.has(pid)) {
      await supabase.from('pos_product_modifier_groups').delete().match({ product_id: pid, group_id: groupId })
    } else {
      await supabase.from('pos_product_modifier_groups').insert({ product_id: pid, group_id: groupId })
    }
    reload()
    onChanged?.()
  }

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="mt-3">
      <p className="text-noch-muted text-xs mb-1.5">Applies to products</p>
      <input className="input w-full text-sm mb-2" placeholder="Search products" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className={`text-left text-xs px-2 py-1 rounded border ${
              assigned.has(p.id) ? 'bg-noch-green/10 border-noch-green/50 text-white' : 'border-noch-border text-noch-muted'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function POSModifiers() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('pos_modifier_groups')
      .select('*, pos_modifiers(*)')
      .eq('is_active', true)
      .order('sort_order')
      .order('name')
    if (error) toast.error(error.message)
    setGroups(data || [])
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload() }, [])

  const removeGroup = async (id) => {
    if (!window.confirm('Delete this group? All its options and product links will be removed.')) return
    const { error } = await supabase.from('pos_modifier_groups').update({ is_active: false }).eq('id', id)
    if (error) return toast.error(error.message)
    reload()
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(`/pos/${branchId}/settings`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">Modifiers</h1>
            <p className="text-noch-muted text-sm">Drink configurations: milk, syrup, sugar, size…</p>
          </div>
          {!creating && (
            <button onClick={() => setCreating(true)} className="btn-primary text-xs px-3 py-1 flex items-center gap-1">
              <Plus size={12} /> Group
            </button>
          )}
        </div>

        {creating && (
          <GroupForm onSave={() => { setCreating(false); reload() }} onCancel={() => setCreating(false)} />
        )}

        {loading ? <p className="text-noch-muted text-center py-8">Loading…</p> : (
          <div className="flex flex-col gap-3">
            {groups.map(g => (
              <div key={g.id} className="card">
                {editing === g.id ? (
                  <GroupForm group={g} onSave={() => { setEditing(null); reload() }} onCancel={() => setEditing(null)} />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-semibold">{g.name}</h3>
                        <p className="text-noch-muted text-xs">
                          {g.is_required ? 'required · ' : ''}min {g.min_select} · max {g.max_select}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setExpanded(expanded === g.id ? null : g.id)} className="btn-secondary text-xs px-2 py-1">
                          {expanded === g.id ? 'Hide' : 'Manage'}
                        </button>
                        <button onClick={() => setEditing(g.id)} className="text-noch-muted hover:text-white"><Edit2 size={14} /></button>
                        <button onClick={() => removeGroup(g.id)} className="text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    {expanded === g.id && (
                      <>
                        <ModifierRows group={g} onChanged={reload} />
                        <ProductAssignments groupId={g.id} />
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
            {!loading && groups.length === 0 && !creating && (
              <p className="text-noch-muted text-center text-sm py-8">No modifier groups yet. Create one to start.</p>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
