import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Mic, Loader2, Activity } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import VoiceProfileEditor from '../components/VoiceProfileEditor'
import { listVoiceProfiles } from '../services/voiceProfiles'
import { listSignals } from '../services/learningSignals'

const SIGNAL_TONE = {
  approved:       'text-green-400',
  rejected:       'text-red-400',
  edit:           'text-amber-400',
  rewrite:        'text-blue-400',
  evaluator_flag: 'text-noch-muted',
}

export default function VoiceLab() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [voices, setVoices] = useState([])
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeVoiceId, setActiveVoiceId] = useState('')

  const refresh = useCallback(async () => {
    if (!businessId) { setVoices([]); setSignals([]); return }
    setLoading(true)
    try {
      const [vs, sg] = await Promise.all([
        listVoiceProfiles(businessId),
        listSignals({ businessId }),
      ])
      setVoices(vs)
      setSignals(sg)
      if (!activeVoiceId && vs.length > 0) setActiveVoiceId(vs[0].id)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId])

  useEffect(() => { refresh() }, [refresh])

  if (ctxLoading) return null
  if (!businesses?.length) {
    return <EmptyState icon={Mic} title="Create a business first" ctaLabel="Add a business" ctaTo="/content-studio/businesses/new" />
  }
  if (!businessId) return <EmptyState icon={Mic} title="Pick a business" />
  if (loading) return <div className="flex justify-center py-10 text-noch-muted"><Loader2 size={20} className="animate-spin" /></div>
  if (voices.length === 0) {
    return (
      <EmptyState
        icon={Mic}
        title="No voice profiles"
        description="Define tone, dialect, and formality for this business."
        ctaLabel="Go to business detail"
        ctaTo={`/content-studio/businesses/${businessId}`}
      />
    )
  }

  const active = voices.find(v => v.id === activeVoiceId) || voices[0]
  const voiceSignals = signals.filter(s => !activeVoiceId || s.brand_voice_profile_id === activeVoiceId)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <aside className="lg:col-span-1 space-y-2">
        <h3 className="text-noch-muted text-xs uppercase tracking-wide mb-2">Voice profiles</h3>
        {voices.map(v => {
          const isActive = v.id === active?.id
          return (
            <button
              key={v.id}
              onClick={() => setActiveVoiceId(v.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                isActive ? 'bg-noch-green/10 border-noch-green/40 text-white' : 'bg-noch-card border-noch-border text-noch-muted hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Mic size={12} className="text-noch-green" />
                <span className="font-medium text-sm">{v.name}</span>
                {v.is_default && <span className="text-noch-green/70 text-[10px]">default</span>}
              </div>
              <p className="text-[11px] mt-0.5">{v.language || 'en'} · {v.dialect || '—'}</p>
            </button>
          )
        })}
      </aside>

      <div className="lg:col-span-2 space-y-4">
        {active && (
          <VoiceProfileEditor
            key={active.id}
            profile={active}
            onChanged={(row) => setVoices(vs => vs.map(x => x.id === row.id ? row : x))}
            onDeleted={(id) => {
              setVoices(vs => vs.filter(x => x.id !== id))
              if (activeVoiceId === id) setActiveVoiceId('')
            }}
          />
        )}

        <section className="bg-noch-card border border-noch-border rounded-2xl p-5">
          <header className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-noch-green" />
            <h3 className="text-white font-semibold">Learning signals</h3>
            <span className="text-noch-muted text-xs">({voiceSignals.length})</span>
          </header>
          {voiceSignals.length === 0 ? (
            <p className="text-noch-muted text-sm">No signals yet. Approve, reject, edit, or rewrite drafts to populate this feed.</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {voiceSignals.slice(0, 50).map(s => (
                <li key={s.id} className="flex items-start gap-2 text-xs">
                  <span className={`font-medium uppercase tracking-wide w-20 shrink-0 ${SIGNAL_TONE[s.signal_type] || ''}`}>
                    {s.signal_type}
                  </span>
                  <span className="text-noch-muted flex-1 break-all">
                    {fmtPayload(s.payload)}
                  </span>
                  <span className="text-noch-muted/60 shrink-0">{fmtDate(s.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function fmtPayload(p) {
  if (!p) return ''
  if (p.action) return `action: ${p.action}`
  if (p.classification?.length) return `tags: ${p.classification.join(', ')}`
  if (p.platform) return `${p.format || ''} · ${p.platform}`
  return JSON.stringify(p)
}
function fmtDate(d) {
  try { return new Date(d).toLocaleString() } catch { return '' }
}
