// LoyaltyStamp.jsx — Staff-facing QR scan / manual phone stamp screen
// Route: /loyalty/stamp

import { useState, useEffect, useRef } from 'react'
import { QrCode, Phone, Search, Star, Gift, Check, Loader2, ChevronRight, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import Layout from '../../../components/Layout'
import NochiBunny from '../components/NochiBunny'
import toast from 'react-hot-toast'

// Play a quick "ding" using Web Audio API
function playStampSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

function WinAnimation({ onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t) }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 animate-fade-in">
      <div className="text-center">
        <div className="text-8xl mb-4 animate-bounce">🎉</div>
        <p className="text-noch-green font-bold text-2xl">Free Drink!</p>
        <p className="text-noch-muted text-sm mt-1">Tell the customer — they've earned a reward!</p>
      </div>
    </div>
  )
}

export default function LoyaltyStamp() {
  const [mode, setMode] = useState('search') // search | result
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [customer, setCustomer] = useState(null)
  const [settings, setSettings] = useState(null)
  const [stamping, setStamping] = useState(false)
  const [showWin, setShowWin] = useState(false)
  const [gestureList, setGestureList] = useState([])
  const [selectedGesture, setSelectedGesture] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    // Load settings + gestures
    Promise.all([
      supabase.from('loyalty_settings').select('*').single(),
      supabase.from('loyalty_gestures').select('*').eq('is_active', true).order('sort_order'),
    ]).then(([{ data: s }, { data: g }]) => {
      if (s) setSettings(s)
      setGestureList(g || [])
    }).catch(() => {})
    inputRef.current?.focus()
  }, [])

  const searchCustomer = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    try {
      let res
      if (q.length === 36 && q.includes('-')) {
        // UUID — direct QR scan
        res = await supabase.from('loyalty_customers').select('*').eq('id', q).single()
      } else {
        // Phone / name search
        res = await supabase.from('loyalty_customers').select('*')
          .or(`phone.ilike.%${q}%,full_name.ilike.%${q}%`)
          .eq('is_active', true)
          .limit(1)
          .single()
      }
      if (res.error || !res.data) { toast.error('Customer not found'); return }
      setCustomer(res.data)
      setMode('result')
    } catch {
      toast.error('Customer not found')
    } finally {
      setSearching(false)
    }
  }

  const handleStamp = async () => {
    if (!customer || !settings) return
    setStamping(true)
    try {
      const newStamps = (customer.current_stamps || 0) + 1
      const stampGoal = settings.stamp_goal || 9
      const pointsPerVisit = settings.points_per_visit || 100
      const newPoints = (customer.points || 0) + pointsPerVisit
      const newLifetime = (customer.lifetime_stamps || 0) + 1
      const isReward = newStamps >= stampGoal
      const finalStamps = isReward ? 0 : newStamps

      const updates = {
        current_stamps: finalStamps,
        lifetime_stamps: newLifetime,
        points: newPoints,
        last_visit_at: new Date().toISOString(),
        visit_count: (customer.visit_count || 0) + 1,
        nochi_state: 'happy',
      }

      const { error } = await supabase.from('loyalty_customers').update(updates).eq('id', customer.id)
      if (error) throw error

      playStampSound()
      setCustomer(c => ({ ...c, ...updates }))
      setSelectedGesture(null)

      if (isReward) {
        setShowWin(true)
        toast.success('🎉 Reward earned!', { duration: 4000 })
      } else {
        toast.success(`+1 stamp · ${finalStamps}/${stampGoal} · +${pointsPerVisit} pts`)
      }
    } catch (err) {
      toast.error(err.message || 'Stamp failed')
    } finally {
      setStamping(false)
    }
  }

  const reset = () => { setMode('search'); setCustomer(null); setQuery(''); setSelectedGesture(null); inputRef.current?.focus() }

  const stampGoal = settings?.stamp_goal || 9
  const stamps = customer?.current_stamps || 0

  return (
    <Layout>
      {showWin && <WinAnimation onDone={() => { setShowWin(false); reset() }} />}

      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <QrCode size={20} className="text-noch-green" />
          <h1 className="text-white font-bold text-xl">Stamp Counter</h1>
        </div>

        {mode === 'search' && (
          <div className="card">
            <p className="text-noch-muted text-sm mb-4">Search by phone number, name, or scan customer QR code</p>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchCustomer()}
                  className="input w-full pl-9"
                  placeholder="0911234567 or customer name..."
                />
              </div>
              <button onClick={searchCustomer} disabled={searching || !query} className="btn-primary px-4 flex items-center gap-1">
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
            </div>
            <p className="text-noch-muted text-xs text-center">Or scan QR from customer's Nochi card</p>
          </div>
        )}

        {mode === 'result' && customer && (
          <>
            {/* Customer card */}
            <div className="card mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-noch-green/10 border border-noch-green/20 flex items-center justify-center">
                  <NochiBunny state={customer.nochi_state || 'happy'} size="sm" showLabel={false} />
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold text-lg">{customer.full_name}</p>
                  <div className="flex items-center gap-2 text-xs text-noch-muted">
                    <span>{customer.phone}</span>
                    {customer.tier && <span className="text-yellow-400 capitalize">{customer.tier}</span>}
                    <span className="text-noch-green">{customer.points || 0} pts</span>
                  </div>
                </div>
                <button onClick={reset} className="text-noch-muted hover:text-white"><X size={16} /></button>
              </div>

              {/* Stamp grid */}
              <div className="mb-4">
                <p className="text-noch-muted text-xs mb-2">{stamps}/{stampGoal} stamps</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: stampGoal }).map((_, i) => (
                    <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                      i < stamps
                        ? 'bg-noch-green/20 border-noch-green text-noch-green'
                        : 'border-noch-border text-noch-border'
                    }`}>
                      {i < stamps ? '☕' : '○'}
                    </div>
                  ))}
                </div>
              </div>

              {/* Gesture picker */}
              {gestureList.length > 0 && (
                <div className="mb-4">
                  <p className="text-noch-muted text-xs mb-2">Add a gesture (optional)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {gestureList.slice(0, 8).map(g => {
                        const typeEmojis = { prayer: '🕌', hydration: '💧', word: '📖', puzzle: '🧩', humor: '😄', affirmation: '✨', fun_fact: '🌍' }
                        const emoji = typeEmojis[g.content_type] || '💌'
                        const label = g.content_ar?.slice(0, 20) || g.content_en?.slice(0, 20) || g.content_type
                        return (
                          <button
                            key={g.id}
                            onClick={() => setSelectedGesture(selectedGesture?.id === g.id ? null : g)}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                              selectedGesture?.id === g.id
                                ? 'bg-noch-green/20 border-noch-green text-noch-green'
                                : 'border-noch-border text-noch-muted hover:text-white'
                            }`}
                            title={g.content_ar || g.content_en}
                          >
                            {emoji} {label}…
                          </button>
                        )
                      })}
                  </div>
                </div>
              )}

              <button
                onClick={handleStamp}
                disabled={stamping}
                className="w-full py-4 rounded-2xl bg-noch-green text-noch-dark font-bold text-lg hover:bg-noch-green/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {stamping ? <Loader2 size={20} className="animate-spin" /> : <Star size={20} />}
                {stamping ? 'Stamping...' : 'Give Stamp'}
              </button>
            </div>

            <button onClick={reset} className="w-full text-center text-noch-muted text-sm hover:text-white transition-colors">
              Search another customer
            </button>
          </>
        )}
      </div>
    </Layout>
  )
}
