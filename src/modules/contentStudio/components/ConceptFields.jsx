import { useEffect, useState } from 'react'

const FIELDS = [
  { id: 'hook_summary',       label: 'Hook summary',       type: 'textarea', rows: 2 },
  { id: 'content_pattern',    label: 'Content pattern',    type: 'textarea', rows: 2 },
  { id: 'emotional_driver',   label: 'Emotional driver',   type: 'text' },
  { id: 'target_audience',    label: 'Target audience',    type: 'text' },
  { id: 'why_it_works',       label: 'Why it works',       type: 'textarea', rows: 3 },
  { id: 'reusable_mechanism', label: 'Reusable mechanism', type: 'textarea', rows: 2 },
  { id: 'notes',              label: 'Notes',              type: 'textarea', rows: 2 },
]

const RISKS = [
  { id: '',     label: '—' },
  { id: 'low',  label: 'Low' },
  { id: 'med',  label: 'Medium' },
  { id: 'high', label: 'High' },
]

export default function ConceptFields({ concept, onSave, saving }) {
  const [values, setValues] = useState(() => initFrom(concept))
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setValues(initFrom(concept))
    setDirty(false)
  }, [concept?.id, concept?.updated_at])

  function update(id, val) {
    setValues(v => ({ ...v, [id]: val }))
    setDirty(true)
  }

  async function handleSave() {
    await onSave?.(values)
    setDirty(false)
  }

  return (
    <div className="space-y-3">
      {FIELDS.map(f => (
        <Field key={f.id} label={f.label}>
          {f.type === 'textarea' ? (
            <textarea
              rows={f.rows}
              value={values[f.id] || ''}
              onChange={e => update(f.id, e.target.value)}
              className={inputCls}
            />
          ) : (
            <input
              value={values[f.id] || ''}
              onChange={e => update(f.id, e.target.value)}
              className={inputCls}
            />
          )}
        </Field>
      ))}

      <Field label="Originality risk">
        <select
          value={values.originality_risk || ''}
          onChange={e => update('originality_risk', e.target.value || null)}
          className={inputCls}
        >
          {RISKS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Field>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>
    </div>
  )
}

function initFrom(c) {
  return {
    hook_summary: c?.hook_summary || '',
    content_pattern: c?.content_pattern || '',
    emotional_driver: c?.emotional_driver || '',
    target_audience: c?.target_audience || '',
    why_it_works: c?.why_it_works || '',
    reusable_mechanism: c?.reusable_mechanism || '',
    notes: c?.notes || '',
    originality_risk: c?.originality_risk || '',
  }
}

const inputCls = 'w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/60 focus:outline-none focus:border-noch-green'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-noch-muted text-xs mb-1">{label}</span>
      {children}
    </label>
  )
}
