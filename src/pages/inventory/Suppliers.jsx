// Suppliers.jsx — Supplier management
// Route: /inventory/suppliers (Owner + manage permission)

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Save, ExternalLink, Phone, Mail, Building2, Loader2 } from 'lucide-react'
import Layout from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const BLANK = { name: '', contact_name: '', phone: '', email: '', website: '', category: '', notes: '' }

function SupplierModal({ supplier, onSave, onClose }) {
  const [form, setForm] = useState(supplier ? { ...supplier } : { ...BLANK })
  const [saving, setSaving] = useState(false)
  const isEdit = !!supplier?.id
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    try {
      if (isEdit) {
        await supabase.from('suppliers').update({ ...form, name: form.name.trim() }).eq('id', supplier.id)
      } else {
        await supabase.from('suppliers').insert({ ...form, name: form.name.trim() })
      }
      toast.success(isEdit ? 'Supplier updated' : 'Supplier added')
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-noch-border">
          <h2 className="text-white font-bold">{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h2>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <div>
            <label className="label block mb-1">Supplier Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="input w-full" placeholder="e.g. Al-Watan Trading" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1">Contact Name</label>
              <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className="input w-full" placeholder="Ahmed Mohamed" />
            </div>
            <div>
              <label className="label block mb-1">Category</label>
              <input value={form.category} onChange={e => set('category', e.target.value)} className="input w-full" placeholder="Dairy, Coffee, etc." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} className="input w-full" placeholder="+218..." />
            </div>
            <div>
              <label className="label block mb-1">Email</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} className="input w-full" placeholder="supplier@mail.com" type="email" />
            </div>
          </div>
          <div>
            <label className="label block mb-1">Website / Order URL</label>
            <input value={form.website} onChange={e => set('website', e.target.value)} className="input w-full" placeholder="https://..." />
          </div>
          <div>
            <label className="label block mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="input w-full resize-none" rows={3} placeholder="Payment terms, order minimums, etc." />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : (isEdit ? 'Update' : 'Add Supplier')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [itemCounts, setItemCounts] = useState({}) // supplierId → count
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editSupplier, setEditSupplier] = useState(null)
  const [search, setSearch] = useState('')

  async function loadData() {
    setLoading(true)
    try {
      const { data: suppData } = await supabase.from('suppliers').select('*').order('name')
      setSuppliers(suppData || [])
      // Load item counts
      const { data: ingData } = await supabase.from('ingredients').select('supplier_id').not('supplier_id', 'is', null)
      const counts = {}
      ;(ingData || []).forEach(i => { counts[i.supplier_id] = (counts[i.supplier_id] || 0) + 1 })
      setItemCounts(counts)
    } catch (err) {
      toast.error('Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier? Items linked to them will lose the supplier reference.')) return
    try {
      await supabase.from('suppliers').delete().eq('id', id)
      setSuppliers(prev => prev.filter(s => s.id !== id))
      toast.success('Supplier deleted')
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  const filtered = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category?.toLowerCase().includes(search.toLowerCase()) ||
    s.contact_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Suppliers</h1>
            <p className="text-noch-muted text-sm mt-1">{suppliers.length} suppliers</p>
          </div>
          <button onClick={() => { setEditSupplier(null); setShowModal(true) }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Supplier
          </button>
        </div>

        <input type="text" placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 bg-noch-card border border-noch-border rounded-lg text-white text-sm placeholder:text-noch-muted focus:outline-none focus:border-noch-green/50"
        />

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-noch-green" size={24} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-noch-muted">
            <Building2 size={40} className="mx-auto mb-3 opacity-50" />
            <p>{search ? 'No suppliers match your search' : 'No suppliers yet — add your first one'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-noch-muted text-xs border-b border-noch-border">
                  <th className="text-left py-3 px-3">Name</th>
                  <th className="text-left py-3 px-3">Contact</th>
                  <th className="text-left py-3 px-3">Category</th>
                  <th className="text-left py-3 px-3">Phone</th>
                  <th className="text-left py-3 px-3">Items</th>
                  <th className="text-left py-3 px-3">Links</th>
                  <th className="text-left py-3 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-noch-border/50 hover:bg-noch-card/50 transition-colors">
                    <td className="py-3 px-3">
                      <p className="text-white font-medium">{s.name}</p>
                      {s.notes && <p className="text-noch-muted text-xs truncate max-w-[200px]" title={s.notes}>{s.notes}</p>}
                    </td>
                    <td className="py-3 px-3 text-noch-muted">{s.contact_name || '—'}</td>
                    <td className="py-3 px-3">
                      {s.category ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-noch-green/10 text-noch-green border border-noch-green/20">{s.category}</span>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-3">
                      {s.phone ? (
                        <a href={`tel:${s.phone}`} className="text-noch-green hover:underline flex items-center gap-1">
                          <Phone size={11} /> {s.phone}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-xs font-medium ${itemCounts[s.id] ? 'text-noch-green' : 'text-noch-muted'}`}>
                        {itemCounts[s.id] || 0} items
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex gap-2">
                        {s.email && <a href={`mailto:${s.email}`} className="text-noch-muted hover:text-white" title={s.email}><Mail size={14} /></a>}
                        {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="text-noch-muted hover:text-noch-green" title={s.website}><ExternalLink size={14} /></a>}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditSupplier(s); setShowModal(true) }} className="p-1.5 text-noch-muted hover:text-white transition-colors"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(s.id)} className="p-1.5 text-noch-muted hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <SupplierModal
          supplier={editSupplier}
          onSave={() => { setShowModal(false); setEditSupplier(null); loadData() }}
          onClose={() => { setShowModal(false); setEditSupplier(null) }}
        />
      )}
    </Layout>
  )
}
