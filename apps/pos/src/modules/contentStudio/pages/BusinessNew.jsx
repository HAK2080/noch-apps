import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../../../contexts/AuthContext'
import { createBusiness } from '../services/businesses'

export default function BusinessNew() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState({ name: '', name_ar: '', description: '' })
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const row = await createBusiness({
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        description: form.description.trim() || null,
        owner_id: user?.id || null,
      })
      toast.success('Business created')
      nav(`/content-studio/businesses/${row.id}`)
    } catch (err) {
      toast.error(err.message || 'Failed to create')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4 bg-noch-card border border-noch-border rounded-2xl p-5">
      <h2 className="text-white font-semibold text-lg">New business</h2>
      <Field label="Name *">
        <input
          autoFocus
          value={form.name}
          onChange={e => update('name', e.target.value)}
          className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green"
        />
      </Field>
      <Field label="Arabic name">
        <input
          dir="rtl"
          value={form.name_ar}
          onChange={e => update('name_ar', e.target.value)}
          className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green"
        />
      </Field>
      <Field label="Description">
        <textarea
          value={form.description}
          onChange={e => update('description', e.target.value)}
          rows={3}
          className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green"
        />
      </Field>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => nav(-1)} className="px-3 py-2 rounded-lg text-noch-muted hover:text-white text-sm">Cancel</button>
        <button disabled={saving} className="px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Create business'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-noch-muted text-xs uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
