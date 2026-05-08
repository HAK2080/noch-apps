import { useEffect, useState } from 'react'
import { Trash2, Loader2, Save, ChevronDown, ChevronRight, Plus, X, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateVoiceProfile, deleteVoiceProfile } from '../services/voiceProfiles'
import { LIBYAN_TRIPOLI_SEED } from '../lib/libyanDialectSeed'

export default function VoiceProfileEditor({ profile, onChanged, onDeleted }) {
  const [v, setV] = useState(() => init(profile))
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [dialectOpen, setDialectOpen] = useState(false)

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
        dialect_rules: v.dialect_rules || null,
        dialect_lexicon: v.dialect_lexicon,
        gold_examples: v.gold_examples,
        forbidden_msa_forms: v.forbidden_msa_forms,
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

  function seedLibyan() {
    if (!confirm('Load the Tripoli Libyan reference into this profile? Existing dialect rules, lexicon, gold examples, and forbidden forms will be replaced.')) return
    setV(s => ({
      ...s,
      dialect: s.dialect || 'Libyan (Tripoli)',
      language: s.language || 'ar',
      dialect_rules: LIBYAN_TRIPOLI_SEED.dialect_rules,
      dialect_lexicon: [...LIBYAN_TRIPOLI_SEED.dialect_lexicon],
      gold_examples: [...LIBYAN_TRIPOLI_SEED.gold_examples],
      forbidden_msa_forms: [...LIBYAN_TRIPOLI_SEED.forbidden_msa_forms],
    }))
    setDirty(true)
    setDialectOpen(true)
    toast.success('Tripoli reference loaded — review and save')
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

      {/* Dialect training section */}
      <div className="border border-noch-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setDialectOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-noch-dark/40 hover:bg-noch-dark/60 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            {dialectOpen ? <ChevronDown size={14} className="text-noch-muted" /> : <ChevronRight size={14} className="text-noch-muted" />}
            <span className="text-white text-sm font-medium">Dialect training</span>
            <TrainingHealthBadge
              lexicon={v.dialect_lexicon?.length || 0}
              gold={v.gold_examples?.length || 0}
              forbidden={v.forbidden_msa_forms?.length || 0}
            />
          </div>
          <span
            role="button"
            onClick={e => { e.stopPropagation(); seedLibyan() }}
            className="flex items-center gap-1 text-xs text-noch-green hover:text-white px-2 py-1 rounded-lg bg-noch-green/10 hover:bg-noch-green/20 transition-colors cursor-pointer"
          >
            <Sparkles size={11} /> Seed Tripoli Libyan
          </span>
        </button>

        {dialectOpen && (
          <div className="p-4 space-y-4 bg-noch-dark/20">
            <TrainingHealthPanel
              lexicon={v.dialect_lexicon?.length || 0}
              gold={v.gold_examples?.length || 0}
              forbidden={v.forbidden_msa_forms?.length || 0}
            />
            <Field label="Dialect rules (prose — injected as the top of the system prompt)">
              <textarea
                rows={6}
                value={v.dialect_rules || ''}
                onChange={e => up('dialect_rules', e.target.value)}
                className={`${inputCls} font-mono text-xs leading-relaxed`}
                placeholder="Write in Tripoli Libyan. Use نديرو not نعملوا. Use هلبة not بزاف alone..."
              />
            </Field>

            <LexiconEditor
              items={v.dialect_lexicon || []}
              onChange={list => up('dialect_lexicon', list)}
            />

            <GoldExamplesEditor
              items={v.gold_examples || []}
              onChange={list => up('gold_examples', list)}
            />

            <ForbiddenEditor
              items={v.forbidden_msa_forms || []}
              onChange={list => up('forbidden_msa_forms', list)}
            />
          </div>
        )}
      </div>

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

function LexiconEditor({ items, onChange }) {
  function update(i, key, val) {
    const next = items.slice()
    next[i] = { ...next[i], [key]: val }
    onChange(next)
  }
  function add() { onChange([...items, { msa: '', dialect: '', note: '' }]) }
  function remove(i) { onChange(items.filter((_, idx) => idx !== i)) }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-noch-muted text-xs uppercase tracking-wide">Lexicon (MSA → Dialect)</span>
        <button type="button" onClick={add} className="flex items-center gap-1 text-xs text-noch-green hover:text-white">
          <Plus size={11} /> Add row
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-noch-muted text-xs italic">No entries. Click "Seed Tripoli Libyan" to load the reference or add rows manually.</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {items.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-1.5 items-start">
              <input
                value={row.msa || ''}
                onChange={e => update(i, 'msa', e.target.value)}
                placeholder="MSA"
                className={inputTightCls}
                dir="auto"
              />
              <input
                value={row.dialect || ''}
                onChange={e => update(i, 'dialect', e.target.value)}
                placeholder="Dialect"
                className={inputTightCls}
                dir="auto"
              />
              <input
                value={row.note || ''}
                onChange={e => update(i, 'note', e.target.value)}
                placeholder="Note (optional)"
                className={inputTightCls}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-noch-muted hover:text-red-400 p-1.5"
              ><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GoldExamplesEditor({ items, onChange }) {
  function updateText(i, val) {
    const next = items.slice()
    next[i] = { ...next[i], text: val }
    onChange(next)
  }
  function add() { onChange([...items, { text: '', source_type: 'manual', rating: 5 }]) }
  function remove(i) { onChange(items.filter((_, idx) => idx !== i)) }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-noch-muted text-xs uppercase tracking-wide">Gold examples (few-shot reference)</span>
        <button type="button" onClick={add} className="flex items-center gap-1 text-xs text-noch-green hover:text-white">
          <Plus size={11} /> Add
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-noch-muted text-xs italic">No gold examples yet. Approve a draft to add it here, or paste a reference post.</p>
      ) : (
        <div className="space-y-2">
          {items.map((row, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                value={row.text || ''}
                onChange={e => updateText(i, e.target.value)}
                rows={2}
                className={`${inputTightCls} flex-1`}
                dir="auto"
                placeholder="Paste a real Libyan post to use as a reference for generation..."
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-noch-muted hover:text-red-400 p-1.5 self-start"
              ><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ForbiddenEditor({ items, onChange }) {
  const [input, setInput] = useState('')
  function add() {
    const val = input.trim()
    if (!val) return
    if (items.includes(val)) { toast('Already in list'); return }
    onChange([...items, val])
    setInput('')
  }
  function remove(v) { onChange(items.filter(x => x !== v)) }

  return (
    <div>
      <span className="text-noch-muted text-xs uppercase tracking-wide block mb-2">Forbidden MSA / foreign-dialect forms</span>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Type a forbidden word and press Enter"
          className={inputTightCls + ' flex-1'}
          dir="auto"
        />
        <button type="button" onClick={add} className="px-3 py-1.5 text-xs rounded-lg bg-noch-green/10 text-noch-green hover:bg-noch-green/20">Add</button>
      </div>
      {items.length === 0 ? (
        <p className="text-noch-muted text-xs italic">No forbidden forms. Add words like مش, شو, هسّا to block them in generation.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map(v => (
            <span key={v} className="flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5 text-xs">
              {v}
              <button type="button" onClick={() => remove(v)} className="hover:text-white"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
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
    dialect_rules: p?.dialect_rules || '',
    dialect_lexicon: Array.isArray(p?.dialect_lexicon) ? p.dialect_lexicon : [],
    gold_examples: Array.isArray(p?.gold_examples) ? p.gold_examples : [],
    forbidden_msa_forms: Array.isArray(p?.forbidden_msa_forms) ? p.forbidden_msa_forms : [],
  }
}
function splitList(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean) }

// ── Training health ──────────────────────────────────────────────────────────
const METRICS = [
  {
    key: 'lexicon',
    label: 'Word bank',
    plain: 'Dialect-specific words & phrases the AI has learned (e.g. "نديرو" instead of "نعملوا").',
    targets: [{ n: 50, label: 'Starter' }, { n: 150, label: 'Solid' }, { n: 200, label: 'Strong' }],
    max: 200,
    color: 'bg-blue-500',
  },
  {
    key: 'gold',
    label: 'Example sentences',
    plain: 'Real sentences written in the correct dialect — used to show the AI what good output looks like.',
    targets: [{ n: 100, label: 'Starter' }, { n: 300, label: 'Solid' }, { n: 500, label: 'Strong' }],
    max: 500,
    color: 'bg-noch-green',
  },
  {
    key: 'forbidden',
    label: 'Words to avoid',
    plain: 'MSA or foreign-dialect words that should NOT appear (e.g. Egyptian "بزاف", formal "يجب").',
    targets: [{ n: 20, label: 'Starter' }, { n: 50, label: 'Strong' }],
    max: 50,
    color: 'bg-amber-500',
  },
]

function healthLevel(lexicon, gold, forbidden) {
  const scores = [
    Math.min(lexicon / 200, 1),
    Math.min(gold / 500, 1),
    Math.min(forbidden / 50, 1),
  ]
  const avg = scores.reduce((a, b) => a + b, 0) / 3
  if (avg >= 0.75) return { label: 'Strong', color: 'text-noch-green', bg: 'bg-noch-green/10 border-noch-green/30' }
  if (avg >= 0.35) return { label: 'Growing', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30' }
  return { label: 'Getting started', color: 'text-noch-muted', bg: 'bg-noch-dark/40 border-noch-border' }
}

function TrainingHealthBadge({ lexicon, gold, forbidden }) {
  const h = healthLevel(lexicon, gold, forbidden)
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${h.bg} ${h.color}`}>
      {lexicon} words · {gold} examples · {forbidden} avoid · <strong>{h.label}</strong>
    </span>
  )
}

function TrainingHealthPanel({ lexicon, gold, forbidden }) {
  const h = healthLevel(lexicon, gold, forbidden)
  const vals = { lexicon, gold, forbidden }
  return (
    <div className={`rounded-xl border p-4 space-y-4 ${h.bg}`}>
      <div className="flex items-center justify-between">
        <span className="text-white text-sm font-semibold">Training health</span>
        <span className={`text-sm font-bold ${h.color}`}>{h.label}</span>
      </div>
      {METRICS.map(m => {
        const count = vals[m.key]
        const pct = Math.min(count / m.max, 1) * 100
        const reached = m.targets.filter(t => count >= t.n)
        const next = m.targets.find(t => count < t.n)
        return (
          <div key={m.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-white text-xs font-medium">{m.label}</span>
              <span className="text-noch-muted text-xs">{count} / {m.max}</span>
            </div>
            <p className="text-noch-muted text-[11px] leading-relaxed">{m.plain}</p>
            <div className="relative h-2 bg-noch-dark rounded-full overflow-hidden">
              <div className={`h-full ${m.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              {m.targets.map(t => (
                <span
                  key={t.n}
                  className="absolute top-0 bottom-0 w-px bg-white/20"
                  style={{ left: `${Math.min(t.n / m.max, 1) * 100}%` }}
                />
              ))}
            </div>
            <div className="flex gap-3">
              {m.targets.map(t => (
                <span key={t.n} className={`text-[10px] ${count >= t.n ? m.color.replace('bg-', 'text-') : 'text-noch-muted/50'}`}>
                  {t.label} ({t.n})
                </span>
              ))}
            </div>
            {next && (
              <p className="text-noch-muted/70 text-[10px]">
                {next.n - count} more to reach <strong className="text-noch-muted">{next.label}</strong>
              </p>
            )}
          </div>
        )
      })}
      {h.label === 'Strong' && (
        <p className="text-noch-green/80 text-xs italic">
          Saturation reached — new chapters will add diminishing new material. You can keep going for breadth, but quality is already high.
        </p>
      )}
    </div>
  )
}
const inputCls = 'w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green'
const inputTightCls = 'bg-noch-dark border border-noch-border rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-noch-green'
function Field({ label, children }) {
  return <label className="block"><span className="block text-noch-muted text-xs mb-1">{label}</span>{children}</label>
}
