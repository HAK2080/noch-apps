// NochiAnimation.jsx — Celebration overlay for loyalty events
// Types: stamp | badge | tier_up | streak | spin_win | birthday
// Renders as fixed portal overlay with confetti + Web Audio tones

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const DURATIONS = {
  stamp: 1500,
  badge: 2500,
  tier_up: 3000,
  streak: 2000,
  spin_win: 2500,
  birthday: 3000,
}

const CONFIGS = {
  stamp: { emoji: '⭐', title: 'Stamp Added!', titleAr: 'تم منح الطابع!', color: '#4ADE80' },
  badge: { emoji: '🏅', title: 'Badge Earned!', titleAr: 'حصلت على شارة!', color: '#F59E0B' },
  tier_up: { emoji: '🏆', title: 'Tier Up!', titleAr: 'مستوى جديد!', color: '#A78BFA' },
  streak: { emoji: '🔥', title: 'Streak!', titleAr: 'سلسلة!', color: '#F87171' },
  spin_win: { emoji: '🎉', title: 'You Won!', titleAr: 'ربحت!', color: '#FBBF24' },
  birthday: { emoji: '🎂', title: 'Happy Birthday!', titleAr: 'عيد ميلاد سعيد!', color: '#EC4899' },
}

function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const schedule = (freq, waveform, startT, duration) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = waveform
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startT)
      gain.gain.setValueAtTime(0.25, ctx.currentTime + startT)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startT + duration)
      osc.start(ctx.currentTime + startT)
      osc.stop(ctx.currentTime + startT + duration + 0.05)
    }

    if (type === 'stamp') {
      schedule(220, 'sawtooth', 0, 0.1)
    } else if (type === 'badge') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.35)
    } else if (type === 'tier_up') {
      schedule(523, 'sine', 0, 0.15)
      schedule(659, 'sine', 0.15, 0.15)
      schedule(784, 'sine', 0.30, 0.25)
    } else if (type === 'streak') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(200, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.2)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.25)
    } else if (type === 'spin_win' || type === 'birthday') {
      schedule(523, 'sine', 0, 0.1)
      schedule(659, 'sine', 0.1, 0.1)
      schedule(784, 'sine', 0.2, 0.1)
      schedule(1047, 'sine', 0.3, 0.3)
    }
  } catch {}
}

function Confetti({ color }) {
  const pieces = Array.from({ length: 20 }, (_, i) => i)
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map(i => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${Math.random() * 100}%`,
            top: '-10px',
            width: `${6 + Math.random() * 6}px`,
            height: `${6 + Math.random() * 6}px`,
            backgroundColor: i % 3 === 0 ? color : i % 3 === 1 ? '#ffffff' : '#FBBF24',
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            animation: `confetti-fall ${1 + Math.random() * 1.5}s ease-in ${Math.random() * 0.5}s forwards`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  )
}

export default function NochiAnimation({ type = 'stamp', show, onComplete, prize = null }) {
  const timerRef = useRef(null)
  const config = CONFIGS[type] || CONFIGS.stamp
  const duration = DURATIONS[type] || 1500

  useEffect(() => {
    if (!show) return
    playSound(type)
    timerRef.current = setTimeout(() => {
      onComplete?.()
    }, duration)
    return () => clearTimeout(timerRef.current)
  }, [show, type])

  if (!show) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
      style={{ animation: 'fade-in 0.2s ease' }}
      onClick={onComplete}
    >
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes pop-in {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <Confetti color={config.color} />
      <div
        className="text-center px-8 py-10 rounded-3xl border-2 relative"
        style={{
          background: '#141414',
          borderColor: config.color,
          animation: 'pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
          maxWidth: '320px',
          width: '90%',
        }}
      >
        <div className="text-7xl mb-4">{config.emoji}</div>
        <p className="text-white font-bold text-2xl mb-1">{config.title}</p>
        <p className="text-lg mb-1" style={{ color: config.color }}>{config.titleAr}</p>
        {prize && (
          <p className="text-white text-lg font-semibold mt-3">{prize}</p>
        )}
        <p className="text-gray-500 text-xs mt-4">Tap to dismiss</p>
      </div>
    </div>,
    document.body
  )
}
