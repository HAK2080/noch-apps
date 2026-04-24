import { useEffect, useState } from 'react'
import { Trash2, Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateVoiceProfile, deleteVoiceProfile } from '../services/voiceProfiles'

export default function VoiceProfileEditor({ profile, onChanged, onDeleted }) {
  const [v, setV] = useState(() => init(profile))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setV(init(profile)); setDirty(false) }, [profile?.id, profile?.updated_at])

  function up(key, val) { setV(s => ({ ...s, [key]: val })); setDirty(true) }

  async function save() {
    setSaving(true)
    try {
      const row = await updateVoiceProfile(profile.id, {
        name: v.name,
        tone: v.tone || null,
        language: v.language || 'en',
        dialect: v.dialect || null,
        formality: Number(v.formality) || 3,
        humor_tolerance: Number(v.humor_tolerance) || 3,
        cta_style: v.cta_style || null,
        audience_descriptors: splitList(v.audience_descriptors),
        banned_phrases: splitList(v.banned_phrases),
        preferred_phrases: splitList(v.preferred_phrases),
        notes: v.notes || null,
      })
      toast.success('Saved')
      setDirty(false)
      onChanged?.(row)
    } catch (e) { toast.error(e.message || 'Save failed') }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!confirm(`Delete voice profile "${profile.name}"? Drafts referencing it will be restricted.`)) return
    try {
      await deleteVoiceProfile(profile.id)
      toast.success('Deleted')
      onDeleted?.(profile.id)
    } catch (e) { toast.error(e.message || 'Delete failed') }
  }

  return (
    <div className="bg-noch-card border border-noch-border rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">{profile.name}{profile.is_default && <span className="text-noch-green/70 text-xs ml-2">default</span>}</h3>
        <button onClick={remove} className="text-noch-muted hover:text-red-400"><Trash2 size={14} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input value={v.name || ''} onChange={e => up('name', e.target.value)} className={inputCls} /></Field>
        <Field label="Tone"><input value={v.tone || ''} onChange={e => up('tone', e.target.value)} className={inputCls} placeholder="warm, witty, direct" /></Field>
        <Field label="Language"><input value={v.language || ''} onChange={e => up('language', e.target.value)} className={inputCls} placeholder="en / ar" /></Field>
        <Field label="Dialect"><input value={v.dialect || ''} onChange={e => up('dialect', e.target.value)} className={inputCls} placeholder="Libyan, MSA, etc." /></Field>
        <Field label={`Formality: ${v.formality}/5`}>
          <input type="range" min={1} max={5} value={v.formality} onChange={e => up('formality', e.target.value)} className="w-full" />
        </Field>
        <Field label={`Humor tolerance: ${v.humor_tolerance}/5`}>
          <input type="range" min={1} max={5} value={v.humor_tolerance} onChange={e => up('humor_tolerance', e.target.value)} className="w-full" />
        </Field>
      </div>

      <Field label="CTA style"><input value={v.cta_style || ''} onChange={e => up('cta_style', e.target.value)} className={inputCls} placeholder="soft / direct / none" /></Field>
      <Field label="Audience (comma-separated)"><input value={v.audience_descriptors} onChange={e => up('audience_descriptors', e.target.value)} className={inputCls} /></Field>
      <Field label="Preferred phrases (comma-separated)"><input value={v.preferred_phrases} onChange={e => up('preferred_phrases', e.target.value)} className={inputCls} /></Field>
      <Field label="Banned phrases (comma-separated)"><input value={v.banned_phrases} onChange={e => up('banned_phrases', e.target.value)} className={inputCls} /></Field>
      <Field label="Notes"><textarea rows={2} value={v.notes || ''} onChange={e => up('notes', e.target.value)} className={inputCls} /></Field>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>
    </div>
  )
}

function init(p) {
  return {
    name: p?.name || '',
    tone: p?.tone || '',
    language: p?.language || 'en',
    dialect: p?.dialect || '',
    formality: p?.formality ?? 3,
    humor_tolerance: p?.humor_tolerance ?? 3,
    cta_style: p?.cta_style || '',
    audience_descriptors: (p?.audience_descriptors || []).join(', '),
    banned_phrases: (p?.banned_phrases || []).join(', '),
    preferred_phrases: (p?.preferred_phrases || []).join(', '),
    notes: p?.notes || '',
  }
}
function splitList(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean) }
const inputCls = 'w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green'
function Field({ label, children }) {
  return <label className="block"><span className="block text-noch-muted text-xs mb-1">{label}</span>{children}</label>
}
