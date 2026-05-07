// BadgeGrid.jsx — Display earned/unearned badges for a customer

import { useState, useEffect } from 'react'
import { getCustomerBadges } from '../../../lib/supabase'

const BADGES = [
  { key: 'goat', emoji: '🐐', name: 'GOAT', nameAr: 'الأفضل', desc: 'One of the first 100 customers' },
  { key: 'on_a_roll', emoji: '🔥', name: 'On a Roll', nameAr: 'على المسار', desc: '7-day visit streak' },
  { key: 'ice_queen', emoji: '🧊', name: 'Ice Queen', nameAr: 'ملكة الجليد', desc: '10 cold drink orders' },
  { key: 'night_owl', emoji: '📚', name: 'Night Owl', nameAr: 'بومة الليل', desc: 'Check in after 9pm' },
  { key: 'ramadan', emoji: '🌙', name: 'Ramadan Regular', nameAr: 'زبون رمضان', desc: 'Visit during Ramadan' },
  { key: 'matcha_brain', emoji: '💚', name: 'Matcha Brain', nameAr: 'عاشق الماتشا', desc: '5 matcha orders' },
  { key: 'connector', emoji: '👯', name: 'Connector', nameAr: 'الرابط', desc: 'Refer a friend who registers' },
  { key: 'loyal_friend', emoji: '🌸', name: 'Loyal Friend', nameAr: 'الصديق الوفي', desc: '5-day engagement streak' },
  { key: 'silver_star', emoji: '⭐', name: 'Silver Star', nameAr: 'نجمة فضية', desc: 'Reach Silver tier' },
  { key: 'gold_star', emoji: '✨', name: 'Gold Star', nameAr: 'نجمة ذهبية', desc: 'Reach Gold tier' },
  { key: 'legend', emoji: '👑', name: 'Legend', nameAr: 'أسطورة', desc: 'Reach Legend tier' },
]

function ShareBadgeModal({ badge, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-noch-card border border-noch-border rounded-2xl p-6 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
        <div className="text-6xl mb-3">{badge.emoji}</div>
        <p className="text-white font-bold text-lg">{badge.name}</p>
        <p className="text-noch-muted text-sm mt-1" dir="rtl">{badge.nameAr}</p>
        <p className="text-noch-muted text-xs mt-2">{badge.desc}</p>
        <p className="text-noch-muted text-xs mt-4">Share this badge with friends!</p>
        <button onClick={onClose} className="mt-4 text-noch-muted hover:text-white text-sm">Close</button>
      </div>
    </div>
  )
}

export default function BadgeGrid({ customerId }) {
  const [earnedBadges, setEarnedBadges] = useState([])
  const [loading, setLoading] = useState(true)
  const [shareBadge, setShareBadge] = useState(null)

  useEffect(() => {
    if (!customerId) return
    getCustomerBadges(customerId)
      .then(setEarnedBadges)
      .catch(() => setEarnedBadges([]))
      .finally(() => setLoading(false))
  }, [customerId])

  if (loading) return <div className="text-noch-muted text-sm text-center py-4">Loading badges...</div>

  const earnedKeys = new Set(earnedBadges.map(b => b.badge_key))

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {BADGES.map(badge => {
          const earned = earnedKeys.has(badge.key)
          const earnedData = earnedBadges.find(b => b.badge_key === badge.key)
          return (
            <button
              key={badge.key}
              onClick={() => earned && setShareBadge(badge)}
              title={`${badge.name}: ${badge.desc}`}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                earned
                  ? 'border-noch-green/30 bg-noch-green/5 hover:bg-noch-green/10 cursor-pointer'
                  : 'border-noch-border bg-noch-dark cursor-default'
              }`}
              style={{ opacity: earned ? 1 : 0.4, filter: earned ? 'none' : 'grayscale(100%)' }}
            >
              <span className="text-3xl">{badge.emoji}</span>
              <span className="text-xs text-white font-medium text-center leading-tight">{badge.name}</span>
              {earned && earnedData?.earned_at && (
                <span className="text-[9px] text-noch-muted">
                  {new Date(earnedData.earned_at).toLocaleDateString('ar-LY', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {shareBadge && <ShareBadgeModal badge={shareBadge} onClose={() => setShareBadge(null)} />}
    </>
  )
}

export { BADGES }
