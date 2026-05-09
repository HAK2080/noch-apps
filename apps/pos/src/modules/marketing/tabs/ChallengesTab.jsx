// ChallengesTab — Phase 9 owner admin.
// CRUD over nochi_challenges. v1 has no auto-progress trigger — staff
// uses bump_challenge_progress per redemption (not exposed here yet).
// Existing loyalty routes (leaderboard / spin / gestures / feedback)
// are untouched — rationalize them before scaling this further.

import { useEffect, useMemo, useState } from 'react'
import { Trophy, Plus, X, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import { listChallenges, createChallenge, updateChallenge } from '../lib/marketing-supabase'
import toast from 'react-hot-toast'

const RULE_TYPES = [
  { id: 'stamps_in_period',     label: 'Stamps in a period' },
  { id: 'product_discovery',    label: 'Product discovery' },
  { id: 'referrals_in_period',  label: 'Referrals in a period' },
  { id: 'manual',               label: 'Manual (staff bumps)' },
]

export default function ChallengesTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const reload = async () => {
    setLoading(true)
    try { setList(await listChallenges()) }
    catch (err) { toast.error(err.message || 'Failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const toggle = async (c) => {
    try { await updateChallenge(c.id, { active: !c.active }); reload() }
    catch (err) { toast.error(err.message || 'Toggle failed') }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-noch-green" />
          <h3 className="text-white text-sm font-semibold">Challenges</h3>
          <span className="text-noch-muted text-xs">{list.length} total</span>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-3 py-1 flex items-center gap-1">
          <Plus size={11} /> New challenge
        </button>
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-12 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>
      ) : list.length === 0 ? (
        <div className="card text-center py-10 text-noch-muted text-sm">
          <Trophy size={28} className="mx-auto mb-2" />No challenges yet.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Slug</th>
                <th className="text-left py-1 pr-2">Name</th>
                <th className="text-left py-1 pr-2">Rule</th>
                <th className="text-right py-1 pr-2">Target</th>
                <th className="text-left py-1 pr-2">Reward</th>
                <th className="text-left py-1 pr-2">Window</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id} className="border-t border-noch-border/40">
                  <td className="py-1.5 pr-2 text-noch-muted font-mono">{c.slug}</td>
                  <td className="py-1.5 pr-2 text-white">{c.name_en}<br/><span className="text-noch-muted text-[11px]" dir="rtl">{c.name_ar}</span></td>
                  <td className="py-1.5 pr-2 text-noch-muted">{c.rule_type}</td>
                  <td className="py-1.5 pr-2 text-right">{c.target_count}</td>
                  <td className="py-1.5 pr-2 text-noch-muted truncate max-w-[140px]">{c.reward_description || '—'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted text-[11px]">
                    {c.starts_at ? new Date(c.starts_at).toLocaleDateString('en-GB') : '—'}
                    {c.ends_at ? ` → ${new Date(c.ends_at).toLocaleDateString('en-GB')}` : ''}
                  </td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => toggle(c)} title={c.active ? 'Active — click to disable' : 'Inactive — click to enable'} className={c.active ? 'text-noch-green' : 'text-noch-muted'}>
                      {c.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <ChallengeForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload() }} />}

      <p className="text-noch-muted text-[11px] pt-2">
        v1 — challenges show on the customer's Pass. Auto-progress isn't wired yet; staff bumps progress per redemption (UI coming in v1.1). Existing loyalty routes (leaderboard / spin / gestures / feedback) are unchanged pending the planned rationalization.
      </p>
    </div>
  )
}

function ChallengeForm({ onClose, onSaved }) {
  const [f, setF] = useState({
    slug: '', name_en: '', name_ar: '',
    description_en: '', description_ar: '',
    rule_type: 'stamps_in_period', target_count: 5,
    reward_description: '',
    starts_at: '', ends_at: '',
    active: true,
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!f.slug) return toast.error('Slug required')
    if (!f.name_en) return toast.error('English name required')
    setSaving(true)
    try {
      await createChallenge({
        slug: f.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
        name_en: f.name_en, name_ar: f.name_ar || f.name_en,
        description_en: f.description_en || null,
        description_ar: f.description_ar || null,
        rule_type: f.rule_type,
        target_count: Math.max(1, Number(f.target_count) || 1),
        reward_description: f.reward_description || null,
        starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : new Date().toISOString(),
        ends_at:   f.ends_at   ? new Date(f.ends_at).toISOString()   : null,
        active: f.active,
      })
      toast.success('Challenge created')
      onSaved()
    } catch (err) { toast.error(err.message || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold flex items-center gap-2"><Trophy size={16} className="text-noch-green" />New challenge</h2>
          <button onClick={onClose}><X className="text-noch-muted" size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><label className="label block mb-1">Slug</label>
            <input className="input w-full font-mono" value={f.slug} onChange={e => set('slug', e.target.value)} placeholder="ramadan-warmup" /></div>
          <div><label className="label block mb-1">Rule type</label>
            <select className="input w-full" value={f.rule_type} onChange={e => set('rule_type', e.target.value)}>
              {RULE_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select></div>
          <div><label className="label block mb-1">Name (EN)</label>
            <input className="input w-full" value={f.name_en} onChange={e => set('name_en', e.target.value)} placeholder="Ramadan warm-up" /></div>
          <div><label className="label block mb-1">Name (AR)</label>
            <input className="input w-full" value={f.name_ar} onChange={e => set('name_ar', e.target.value)} placeholder="استعداد رمضان" dir="rtl" /></div>
          <div className="col-span-2"><label className="label block mb-1">Description (EN)</label>
            <textarea rows={2} className="input w-full resize-none" value={f.description_en} onChange={e => set('description_en', e.target.value)} placeholder="Earn 5 stamps before iftar each week and unlock a free dessert." /></div>
          <div className="col-span-2"><label className="label block mb-1">Description (AR)</label>
            <textarea rows={2} className="input w-full resize-none" value={f.description_ar} onChange={e => set('description_ar', e.target.value)} dir="rtl" placeholder="اجمع ٥ أختام قبل الإفطار وخذ حلى مجاني" /></div>
          <div><label className="label block mb-1">Target count</label>
            <input type="number" min={1} className="input w-full" value={f.target_count} onChange={e => set('target_count', e.target.value)} /></div>
          <div><label className="label block mb-1">Reward description</label>
            <input className="input w-full" value={f.reward_description} onChange={e => set('reward_description', e.target.value)} placeholder="Free dessert" /></div>
          <div><label className="label block mb-1">Starts</label>
            <input type="datetime-local" className="input w-full" value={f.starts_at} onChange={e => set('starts_at', e.target.value)} /></div>
          <div><label className="label block mb-1">Ends</label>
            <input type="datetime-local" className="input w-full" value={f.ends_at} onChange={e => set('ends_at', e.target.value)} /></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={11} className="animate-spin inline mr-1" /> : null}
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
