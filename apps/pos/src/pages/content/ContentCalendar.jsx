import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Calendar, Plus, Zap, ChevronLeft, ChevronRight } from 'lucide-react'
import { getContentPosts, getContentCalendar, schedulePost, getBrand } from '../../lib/supabase'
import { getStatusConfig, PLATFORMS, CONTENT_FORMATS } from '../../lib/contentEngine'
import Layout from '../../components/Layout'
import toast from 'react-hot-toast'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

export default function ContentCalendar() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const brandId = searchParams.get('brand')

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [brand, setBrand] = useState(null)
  const [posts, setPosts] = useState([])
  const [calendar, setCalendar] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [schedulingPost, setSchedulingPost] = useState(null)
  const [scheduleDate, setScheduleDate] = useState('')
  const [schedulePlatform, setSchedulePlatform] = useState('instagram')

  useEffect(() => {
    if (!brandId) { navigate('/content'); return }
    getBrand(brandId).then(setBrand)
    loadData()
  }, [brandId])

  async function loadData() {
    setLoading(true)
    try {
      const [postsData, calData] = await Promise.all([
        getContentPosts(brandId, { status: 'approved' }),
        getContentCalendar(brandId),
      ])
      setPosts(postsData)
      setCalendar(calData)
    } catch { toast.error('Failed to load calendar') }
    finally { setLoading(false) }
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  async function handleSchedule() {
    if (!schedulingPost || !scheduleDate) return
    try {
      await schedulePost({
        brand_id: brandId,
        post_id: schedulingPost,
        scheduled_at: new Date(scheduleDate).toISOString(),
        platform: schedulePlatform,
        status: 'queued',
      })
      toast.success('Post scheduled!')
      setShowSchedule(false)
      loadData()
    } catch { toast.error('Schedule failed') }
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  // Map calendar entries to days
  const calByDay = {}
  calendar.forEach(entry => {
    const d = new Date(entry.scheduled_at)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!calByDay[day]) calByDay[day] = []
      calByDay[day].push(entry)
    }
  })

  const selectedDayEntries = selectedDay ? (calByDay[selectedDay] || []) : []
  const unscheduledPosts = posts.filter(p => !calendar.find(c => c.post_id === p.id))

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <button onClick={() => navigate('/content')} className="text-noch-muted text-xs hover:text-white mb-1 block">← Content Studio</button>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Calendar size={20} className="text-blue-400" /> Content Calendar
            </h1>
            {brand && <p className="text-noch-muted text-sm">{brand.name}</p>}
          </div>
          <button
            onClick={() => navigate(`/content/create?brand=${brandId}`)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Zap size={15} /> Create Post
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar grid */}
          <div className="lg:col-span-2">
            <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
              {/* Month nav */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-noch-border">
                <button onClick={prevMonth} className="p-1.5 hover:bg-noch-border rounded-lg transition-colors">
                  <ChevronLeft size={16} className="text-noch-muted" />
                </button>
                <h3 className="text-white font-bold">{MONTHS[month]} {year}</h3>
                <button onClick={nextMonth} className="p-1.5 hover:bg-noch-border rounded-lg transition-colors">
                  <ChevronRight size={16} className="text-noch-muted" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-noch-border">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-noch-muted text-xs py-2 font-medium">{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {/* Empty cells before first day */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-16 border-b border-r border-noch-border/30" />
                ))}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                  const entries = calByDay[day] || []
                  const isSelected = selectedDay === day

                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                      className={`min-h-16 border-b border-r border-noch-border/30 p-1.5 cursor-pointer transition-colors ${
                        isSelected ? 'bg-noch-green/5' : 'hover:bg-noch-border/20'
                      }`}
                    >
                      <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                        isToday ? 'bg-noch-green text-noch-dark' : 'text-noch-muted'
                      }`}>
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {entries.slice(0, 2).map(entry => {
                          const fmeta = CONTENT_FORMATS.find(f => f.value === entry.post?.format)
                          return (
                            <div key={entry.id} className="text-[9px] px-1 py-0.5 rounded bg-noch-green/20 text-noch-green truncate">
                              {fmeta?.emoji} {entry.platform}
                            </div>
                          )
                        })}
                        {entries.length > 2 && (
                          <div className="text-[9px] text-noch-muted">+{entries.length - 2}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Selected day */}
            {selectedDay && (
              <div className="bg-noch-card border border-noch-border rounded-xl p-4">
                <h4 className="text-white font-semibold text-sm mb-3">
                  {MONTHS[month]} {selectedDay}
                </h4>
                {selectedDayEntries.length === 0 ? (
                  <p className="text-noch-muted text-xs">Nothing scheduled</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayEntries.map(entry => {
                      const fmeta = CONTENT_FORMATS.find(f => f.value === entry.post?.format)
                      const d = new Date(entry.scheduled_at)
                      return (
                        <div key={entry.id} className="bg-noch-dark/40 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs">{fmeta?.emoji}</span>
                            <span className="text-white text-xs font-medium">{entry.platform}</span>
                            <span className="text-noch-muted text-xs ms-auto">
                              {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-noch-muted text-xs line-clamp-2">
                            {entry.post?.caption_en || entry.post?.caption_ar || 'No caption'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Schedule post */}
            <div className="bg-noch-card border border-noch-border rounded-xl p-4">
              <h4 className="text-white font-semibold text-sm mb-3">Schedule Approved Post</h4>
              {unscheduledPosts.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-noch-muted text-xs mb-3">No approved posts to schedule</p>
                  <button
                    onClick={() => navigate(`/content/review?brand=${brandId}`)}
                    className="text-xs text-noch-green hover:underline"
                  >
                    Go to Review Queue →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Select post</label>
                    <select
                      value={schedulingPost || ''}
                      onChange={e => setSchedulingPost(e.target.value)}
                      className="input w-full text-sm"
                    >
                      <option value="">Choose...</option>
                      {unscheduledPosts.map(p => (
                        <option key={p.id} value={p.id}>
                          {(p.caption_en || p.caption_ar || 'Post').slice(0, 50)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Date & time</label>
                    <input
                      type="datetime-local"
                      value={scheduleDate}
                      onChange={e => setScheduleDate(e.target.value)}
                      className="input w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Platform</label>
                    <select
                      value={schedulePlatform}
                      onChange={e => setSchedulePlatform(e.target.value)}
                      className="input w-full text-sm"
                    >
                      {PLATFORMS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleSchedule}
                    disabled={!schedulingPost || !scheduleDate}
                    className="w-full btn-primary text-sm"
                  >
                    Schedule Post
                  </button>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="bg-noch-card border border-noch-border rounded-xl p-4">
              <h4 className="text-white font-semibold text-sm mb-3">This Month</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-noch-muted">Scheduled</span>
                  <span className="text-white font-bold">{calendar.filter(c => {
                    const d = new Date(c.scheduled_at)
                    return d.getMonth() === month && d.getFullYear() === year
                  }).length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-noch-muted">Approved (unscheduled)</span>
                  <span className="text-yellow-400 font-bold">{unscheduledPosts.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-noch-muted">In review</span>
                  <span className="text-blue-400 font-bold">
                    {posts.filter(p => p.status === 'review').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
