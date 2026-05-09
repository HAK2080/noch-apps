// Campaigns.jsx — Phase 6 list of CONTENT campaigns (groups briefs +
// drafts + bank items by goal). Distinct from marketing campaigns
// (whatsapp/sms outreach) which live in MarketingDashboard.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Megaphone, Plus, Filter, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { listCampaigns, createCampaign, blankCampaign, CAMPAIGN_STATUSES } from '../services/campaigns'

const STATUS_PILL = {
  planning:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  active:    'bg-noch-green/15 text-noch-green border-noch-green/30',
  paused:    'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-noch-card text-noch-muted border-noch-border',
  archived:  'bg-noch-border/50 text-noch-muted/70 border-noch-border',
}

export default function Campaigns() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const navigate = useNavigate()

  const reload = async () => {
    setLoading(true)
    try {
      setList(await listCampaigns(statusFilter === 'all' ? {} : { status: statusFilter }))
    } catch (e) { toast.error(e.message || 'Load failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [statusFilter])

  const onNew = async () => {
    try {
      const row = await createCampaign(blankCampaign({ name: 'New campaign' }))
      navigate(`/content-studio/campaigns/${row.id}`)
    } catch (e) { toast.error(e.message || 'Create failed') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Megaphone size={18} className="text-noch-green" />
          <h1 className="text-white text-lg font-semibold">Content Campaigns</h1>
          <span className="text-noch-muted text-xs">{list.length}</span>
        </div>
        <button onClick={onNew} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
          <Plus size={12} /> New campaign
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <Filter size={12} className="text-noch-muted self-center" />
        {['all', ...CAMPAIGN_STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded-full border ${
              statusFilter === s
                ? 'border-noch-green text-noch-green bg-noch-green/10'
                : 'border-noch-border text-noch-muted hover:text-white'
            }`}
          >{s}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-12 flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-noch-muted text-sm">
          <Megaphone size={28} className="mx-auto mb-2 opacity-50" />
          No campaigns yet. Campaigns group briefs and drafts under one goal.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map(c => (
            <Link key={c.id} to={`/content-studio/campaigns/${c.id}`} className="block bg-noch-card border border-noch-border rounded-2xl p-4 hover:border-noch-green/50 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-white text-sm font-semibold line-clamp-1">{c.name || 'Untitled'}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold border ${STATUS_PILL[c.status] || STATUS_PILL.planning}`}>{c.status}</span>
              </div>
              {c.goal && <p className="text-noch-muted text-xs line-clamp-2 mb-2">{c.goal}</p>}
              <div className="flex items-center gap-2 text-[11px] text-noch-muted flex-wrap">
                {c.audience_segment && <span>{c.audience_segment}</span>}
                {c.product_focus && <span>· {c.product_focus}</span>}
                {(c.start_date || c.end_date) && (
                  <span className="ml-auto text-[10px]">
                    {c.start_date ? new Date(c.start_date).toLocaleDateString('en-GB') : '—'}
                    {' → '}
                    {c.end_date ? new Date(c.end_date).toLocaleDateString('en-GB') : '—'}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
