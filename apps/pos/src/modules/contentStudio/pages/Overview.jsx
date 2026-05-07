import { useEffect, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { Building2, Lightbulb, Sparkles, FileText, Mic, Library } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { listInspirations } from '../services/inspirations'
import { listConcepts } from '../services/concepts'
import { listDrafts } from '../services/drafts'
import { listVoiceProfiles } from '../services/voiceProfiles'
import { listBankItems } from '../services/contentBank'

const TILES = [
  { to: '/content-studio/businesses',  icon: Building2,  label: 'Businesses',    desc: 'Brands & voice profiles', key: null },
  { to: '/content-studio/inspiration', icon: Lightbulb,  label: 'Inspiration',   desc: 'URLs, screenshots, notes', key: 'inspirations' },
  { to: '/content-studio/concepts',    icon: Sparkles,   label: 'Concepts',      desc: 'Extracted ideas', key: 'concepts' },
  { to: '/content-studio/drafts',      icon: FileText,   label: 'Drafts',        desc: 'AI-generated variants', key: 'drafts' },
  { to: '/content-studio/voice-lab',   icon: Mic,        label: 'Voice Lab',     desc: 'Profiles & learning signals', key: 'voices' },
  { to: '/content-studio/bank',        icon: Library,    label: 'Content Bank',  desc: 'Approved & reusable', key: 'bank' },
]

export default function Overview() {
  const { businesses, businessId, loading } = useOutletContext()
  const [counts, setCounts] = useState({})

  useEffect(() => {
    if (!businessId) { setCounts({}); return }
    let cancelled = false
    Promise.all([
      listInspirations({ businessId }).then(r => r.length).catch(() => 0),
      listConcepts({ businessId }).then(r => r.length).catch(() => 0),
      listDrafts({ businessId }).then(r => r.length).catch(() => 0),
      listVoiceProfiles(businessId).then(r => r.length).catch(() => 0),
      listBankItems({ businessId, status: 'approved' }).then(r => r.length).catch(() => 0),
    ]).then(([inspirations, concepts, drafts, voices, bank]) => {
      if (!cancelled) setCounts({ inspirations, concepts, drafts, voices, bank })
    })
    return () => { cancelled = true }
  }, [businessId])

  if (loading) return null

  if (!businesses?.length) {
    return (
      <EmptyState
        icon={Building2}
        title="Welcome to Content Studio"
        description="Start by adding your first business. Each business gets its own brand voice profiles and content workflow."
        ctaLabel="Add a business"
        ctaTo="/content-studio/businesses/new"
      />
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {TILES.map(t => {
        const count = t.key ? counts[t.key] : undefined
        return (
          <Link
            key={t.to}
            to={t.to}
            className="bg-noch-card border border-noch-border hover:border-noch-green/40 rounded-2xl p-5 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-noch-green/10 text-noch-green flex items-center justify-center">
                <t.icon size={18} />
              </div>
              {count !== undefined && businessId && (
                <span className="text-noch-muted text-xs font-mono">{count}</span>
              )}
            </div>
            <h3 className="text-white font-semibold">{t.label}</h3>
            <p className="text-noch-muted text-sm">{t.desc}</p>
          </Link>
        )
      })}
    </div>
  )
}
