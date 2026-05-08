// ContentCalendarTab — read-only mirror of content_posts on a calendar.

import { useEffect, useMemo, useState } from 'react'
import { Calendar, ExternalLink } from 'lucide-react'
import { listContentCalendar } from '../lib/marketing-supabase'
import toast from 'react-hot-toast'

const STATUS_COLOR = {
  draft:     'bg-noch-card text-noch-muted border-noch-border',
  pending:   'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  approved:  'bg-blue-500/15 text-blue-400 border-blue-500/40',
  scheduled: 'bg-purple-500/15 text-purple-400 border-purple-500/40',
  published: 'bg-noch-green/20 text-noch-green border-noch-green/40',
  rejected:  'bg-red-500/15 text-red-400 border-red-500/40',
}

function startOfWeek(d = new Date()) {
  const day = d.getDay() // 0=Sun
  const offset = day === 0 ? -6 : 1 - day
  const x = new Date(d); x.setDate(x.getDate() + offset); x.setHours(0,0,0,0)
  return x
}

export default function ContentCalendarTab() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(startOfWeek())

  useEffect(() => {
    setLoading(true)
    const from = weekStart.toISOString()
    const to = new Date(weekStart.getTime() + 14 * 86400e3).toISOString()
    listContentCalendar({ from, to })
      .then(setPosts)
      .catch(err => toast.error(err.message || 'Failed'))
      .finally(() => setLoading(false))
  }, [weekStart])

  const days = useMemo(() => {
    const d = []
    for (let i = 0; i < 14; i++) {
      const day = new Date(weekStart.getTime() + i * 86400e3)
      d.push(day)
    }
    return d
  }, [weekStart])

  const postsByDay = useMemo(() => {
    const m = {}
    for (const p of posts) {
      const t = p.scheduled_at || p.published_at
      if (!t) continue
      const k = new Date(t).toISOString().slice(0, 10)
      if (!m[k]) m[k] = []
      m[k].push(p)
    }
    return m
  }, [posts])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-noch-green"/>
          <h3 className="text-white text-sm font-semibold">Content calendar</h3>
          <span className="text-noch-muted text-xs">2 weeks · {posts.length} posts</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 86400e3))} className="btn-secondary text-xs px-2 py-1">‹</button>
          <button onClick={() => setWeekStart(startOfWeek())} className="btn-secondary text-xs px-2 py-1">Today</button>
          <button onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 86400e3))} className="btn-secondary text-xs px-2 py-1">›</button>
        </div>
      </div>

      <p className="text-noch-muted text-xs">Read-only mirror of <code>content_posts</code>. Edit + create posts in the <a href="/content-studio" className="text-noch-green underline">Content Studio</a>.</p>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
          {days.map(d => {
            const k = d.toISOString().slice(0, 10)
            const day = postsByDay[k] || []
            const isToday = k === new Date().toISOString().slice(0, 10)
            return (
              <div key={k} className={`card p-2 min-h-[120px] ${isToday ? 'border-noch-green/50' : ''}`}>
                <p className="text-noch-muted text-[10px] uppercase mb-1">{d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}</p>
                {day.length === 0 ? <p className="text-noch-muted text-xs italic">—</p> : (
                  <div className="flex flex-col gap-1">
                    {day.map(p => (
                      <div key={p.id} className={`px-2 py-1 rounded text-[11px] border ${STATUS_COLOR[p.status] || STATUS_COLOR.draft}`}>
                        <div className="flex items-center gap-1 truncate">
                          <span className="uppercase text-[9px] font-bold shrink-0">{p.platform}</span>
                          <span className="truncate">{(p.caption_final || p.caption_en || p.caption_ar || '').slice(0, 60)}</span>
                        </div>
                        {p.score_total != null && <span className="text-[9px] text-noch-muted">score {Number(p.score_total).toFixed(0)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
