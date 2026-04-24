// LoyaltySpinWheel.jsx — Spin-to-win component for customers/staff
// Route: /loyalty/spin (staff triggers for customer)

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, RotateCcw, Clock } from 'lucide-react'
import { supabase, awardPoints, recordSpin, getLastSpin, getSpinPrizes } from '../../../lib/supabase'
import Layout from '../../../components/Layout'
import NochiAnimation from '../components/NochiAnimation'
import toast from 'react-hot-toast'

// Play spin sound
function playSpinSound(duration = 3000) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const beats = Math.floor(duration / 100)
    for (let i = 0; i < beats; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      const t = ctx.currentTime + (i * 0.1)
      osc.frequency.setValueAtTime(400 + (i % 3) * 80, t)
      gain.gain.setValueAtTime(0.1, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
      osc.start(t)
      osc.stop(t + 0.06)
    }
  } catch {}
}

const COLORS = ['#4ADE80','#60A5FA','#FBBF24','#F87171','#A78BFA','#34D399','#FB923C','#38BDF8']

function SpinWheel({ prizes, winIndex, spinning }) {
  const canvasRef = useRef(null)
  const rotationRef = useRef(0)
  const animRef = useRef(null)

  const segAngle = prizes.length > 0 ? (2 * Math.PI) / prizes.length : 1

  const draw = (angle) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const r = cx - 8
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    prizes.forEach((p, i) => {
      const start = angle + i * segAngle
      const end = start + segAngle

      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, start, end)
      ctx.closePath()
      ctx.fillStyle = COLORS[i % COLORS.length]
      ctx.fill()
      ctx.strokeStyle = '#1a1a2e'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(start + segAngle / 2)
      ctx.textAlign = 'right'
      ctx.fillStyle = '#0f1117'
      ctx.font = 'bold 11px sans-serif'
      const label = p.label?.length > 12 ? p.label.slice(0, 12) + '…' : (p.label || '')
      ctx.fillText(label, r - 10, 5)
      ctx.restore()
    })

    // Center circle
    ctx.beginPath()
    ctx.arc(cx, cy, 18, 0, 2 * Math.PI)
    ctx.fillStyle = '#0f1117'
    ctx.fill()
    ctx.strokeStyle = '#4ADE80'
    ctx.lineWidth = 2
    ctx.stroke()

    // Pointer
    ctx.beginPath()
    ctx.moveTo(cx + r + 8, cy)
    ctx.lineTo(cx + r - 4, cy - 8)
    ctx.lineTo(cx + r - 4, cy + 8)
    ctx.closePath()
    ctx.fillStyle = '#4ADE80'
    ctx.fill()
  }

  useEffect(() => {
    if (!spinning || winIndex === null) { draw(rotationRef.current); return }

    const spinDuration = 4000
    const startTime = performance.now()
    const targetAngle = -(winIndex * segAngle + segAngle / 2) + (Math.PI / 2) + Math.PI * 8

    const animate = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / spinDuration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const currentAngle = eased * targetAngle
      rotationRef.current = currentAngle
      draw(currentAngle)
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate)
      }
    }
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [spinning, winIndex, prizes.length])

  useEffect(() => { draw(rotationRef.current) }, [prizes.length])

  return (
    <div className="relative">
      <canvas ref={canvasRef} width={280} height={280} className="mx-auto block" />
    </div>
  )
}

function getFrequencyMs(freq) {
  if (freq === 'biweekly') return 14 * 24 * 60 * 60 * 1000
  if (freq === 'monthly') return 30 * 24 * 60 * 60 * 1000
  return 7 * 24 * 60 * 60 * 1000 // weekly default
}

function msToCountdown(ms) {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h`
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${mins}m`
}

export default function LoyaltySpinWheel() {
  const { customerId } = useParams()
  const [prizes, setPrizes] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [customerPhone, setCustomerPhone] = useState('')
  const [customer, setCustomer] = useState(null)
  const [searching, setSearching] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [winIndex, setWinIndex] = useState(null)
  const [wonPrize, setWonPrize] = useState(null)
  const [showAnim, setShowAnim] = useState(false)
  const [nextSpinMs, setNextSpinMs] = useState(null) // ms until eligible

  useEffect(() => {
    Promise.all([
      getSpinPrizes(),
      supabase.from('loyalty_settings').select('*').limit(1).single(),
    ]).then(async ([p, { data: s }]) => {
      setPrizes(p || [])
      setSettings(s)
      // Auto-load customer when navigated via /loyalty/spin/:customerId
      if (customerId) {
        const { data, error } = await supabase
          .from('loyalty_customers')
          .select('*')
          .eq('id', customerId)
          .single()
        if (!error && data) {
          setCustomer(data)
          if (s) {
            const freq = s.spin_frequency || 'weekly'
            if (freq !== 'off') {
              const lastSpin = await getLastSpin(data.id).catch(() => null)
              if (lastSpin) {
                const elapsed = Date.now() - new Date(lastSpin).getTime()
                const required = getFrequencyMs(freq)
                if (elapsed < required) setNextSpinMs(required - elapsed)
              }
            }
          }
        } else {
          toast.error('Customer not found')
        }
      }
    }).finally(() => setLoading(false))
  }, [customerId])

  const checkEligibility = async (cust) => {
    if (!settings) return true
    const freq = settings.spin_frequency || 'weekly'
    if (freq === 'off') return false
    const lastSpin = await getLastSpin(cust.id)
    if (!lastSpin) return true
    const elapsed = Date.now() - new Date(lastSpin).getTime()
    const required = getFrequencyMs(freq)
    if (elapsed >= required) return true
    setNextSpinMs(required - elapsed)
    return false
  }

  const findCustomer = async () => {
    setSearching(true)
    setNextSpinMs(null)
    try {
      const { data, error } = await supabase
        .from('loyalty_customers')
        .select('*')
        .or(`phone.ilike.%${customerPhone}%,full_name.ilike.%${customerPhone}%`)
        .limit(1)
        .single()
      if (error || !data) { toast.error('Customer not found'); return }
      setCustomer(data)
      await checkEligibility(data)
    } catch { toast.error('Not found') }
    finally { setSearching(false) }
  }

  const spin = async () => {
    if (!prizes.length || !customer) return

    const eligible = await checkEligibility(customer)
    if (!eligible) {
      toast.error('Not eligible yet — come back later')
      return
    }

    // Weighted random selection using probability field
    const total = prizes.reduce((s, p) => s + (p.probability || 0.1), 0)
    let r = Math.random() * total
    let idx = 0
    for (let i = 0; i < prizes.length; i++) {
      r -= (prizes[i].probability || 0.1)
      if (r <= 0) { idx = i; break }
    }

    setWinIndex(idx)
    setSpinning(true)
    setWonPrize(null)
    playSpinSound(4000)

    // Record spin immediately
    await recordSpin(customer.id, prizes[idx].id, prizes[idx].label).catch(() => {})

    // Apply prize
    const prize = prizes[idx]
    if (prize.prize_type === 'points' && prize.value > 0) {
      await awardPoints(customer.id, prize.value).catch(() => {})
      setCustomer(c => ({ ...c, points: (c.points || 0) + prize.value }))
    } else if (prize.prize_type === 'free_drink' || prize.prize_type === 'discount_percent') {
      // Create a pending reward
      await supabase.from('loyalty_rewards').insert({
        customer_id: customer.id,
        reward_type: prize.prize_type,
        reward_value: prize.value,
        description: prize.label,
        expires_at: prize.expiry_days
          ? new Date(Date.now() + prize.expiry_days * 86400000).toISOString()
          : null,
        status: 'pending',
      }).catch(() => {})
    }

    setTimeout(() => {
      setSpinning(false)
      setWonPrize(prizes[idx])
      if (prize.prize_type !== 'nothing') {
        setShowAnim(true)
      } else {
        toast('Better luck next time! 🐰', { duration: 4000 })
      }
    }, 4200)
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">Loading...</p></Layout>
  if (settings?.spin_frequency === 'off') return (
    <Layout>
      <div className="card text-center py-12">
        <p className="text-noch-muted">Spin wheel is disabled. Enable it in Loyalty Settings.</p>
      </div>
    </Layout>
  )

  return (
    <Layout>
      <NochiAnimation
        type="spin_win"
        show={showAnim}
        prize={wonPrize?.label}
        onComplete={() => setShowAnim(false)}
      />

      <div className="max-w-sm mx-auto">
        <h1 className="text-white font-bold text-xl text-center mb-6">🎡 Spin to Win</h1>

        {prizes.length === 0 ? (
          <div className="card text-center py-10 text-noch-muted">
            <p>No prizes configured. Add prizes in Loyalty Settings.</p>
          </div>
        ) : (
          <>
            <SpinWheel prizes={prizes} winIndex={winIndex} spinning={spinning} />

            <p className="text-center text-noch-muted text-xs mt-3 mb-4">
              Frequency: {settings?.spin_frequency || 'weekly'}
            </p>

            {/* Customer search */}
            {!customer ? (
              <div className="card mt-4">
                <p className="text-white text-sm font-medium mb-3">Find Customer</p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && findCustomer()}
                    placeholder="Phone or name..."
                  />
                  <button onClick={findCustomer} disabled={searching || !customerPhone} className="btn-primary px-3">
                    {searching ? <Loader2 size={14} className="animate-spin" /> : '→'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="card mt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-medium">{customer.full_name}</p>
                    <p className="text-noch-green text-sm">{customer.points || 0} points</p>
                  </div>
                  <button onClick={() => { setCustomer(null); setWonPrize(null); setWinIndex(null); setNextSpinMs(null) }} className="text-noch-muted hover:text-white">
                    <RotateCcw size={14} />
                  </button>
                </div>

                {nextSpinMs !== null && (
                  <div className="flex items-center gap-2 text-yellow-400 text-sm mb-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl px-3 py-2">
                    <Clock size={14} />
                    Come back in {msToCountdown(nextSpinMs)}
                  </div>
                )}

                {wonPrize ? (
                  <div className="text-center py-4">
                    <p className="text-4xl mb-2">🎁</p>
                    <p className="text-noch-green font-bold text-lg">{wonPrize.label}</p>
                    {wonPrize.label_ar && <p className="text-noch-muted text-sm mt-1" dir="rtl">{wonPrize.label_ar}</p>}
                    <button onClick={() => { setWonPrize(null); setWinIndex(null) }} className="btn-secondary mt-4 text-sm">
                      Spin Again
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={spin}
                    disabled={spinning || !!nextSpinMs}
                    className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                      !nextSpinMs
                        ? 'bg-noch-green text-noch-dark hover:bg-noch-green/90'
                        : 'bg-noch-border text-noch-muted cursor-not-allowed'
                    }`}
                  >
                    {spinning ? <Loader2 size={20} className="animate-spin" /> : '🎡'}
                    {spinning ? 'Spinning...' : nextSpinMs ? 'Not eligible yet' : 'Spin!'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
