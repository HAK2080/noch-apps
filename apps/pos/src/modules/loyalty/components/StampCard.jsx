// StampCard — Visual stamp progress with Nochi theme

export default function StampCard({ currentStamps = 0, goal = 9, tier = 'bronze', lang = 'ar' }) {
  const progress = Math.min(currentStamps / goal, 1)
  const remaining = goal - currentStamps

  const tierColors = {
    bronze: { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', label: lang === 'ar' ? 'برونز' : 'Bronze' },
    silver: { bg: 'bg-slate-400/20', border: 'border-slate-400/40', text: 'text-slate-300', label: lang === 'ar' ? 'فضي' : 'Silver' },
    gold: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400', label: lang === 'ar' ? 'ذهبي' : 'Gold' },
    legend: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400', label: lang === 'ar' ? 'نوتشي ليجيند' : 'Nochi Legend' },
  }

  const tc = tierColors[tier] || tierColors.bronze

  return (
    <div className={`rounded-2xl p-4 border ${tc.bg} ${tc.border}`}>
      {/* Tier badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tc.bg} ${tc.border} ${tc.text} border`}>
          ☕ {tc.label}
        </span>
        <span className="text-xs text-noch-muted">
          {currentStamps}/{goal} {lang === 'ar' ? 'طوابع' : 'stamps'}
        </span>
      </div>

      {/* Stamp grid */}
      <div className="grid grid-cols-9 gap-1.5 mb-3">
        {Array.from({ length: goal }).map((_, i) => (
          <div
            key={i}
            className={`aspect-square rounded-full flex items-center justify-center text-xs transition-all duration-300
              ${i < currentStamps
                ? 'bg-noch-green text-noch-dark font-bold scale-110'
                : 'bg-noch-border text-noch-muted'
              }`}
          >
            {i < currentStamps ? '☕' : '○'}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-noch-border rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-noch-green rounded-full transition-all duration-500"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Status message */}
      <p className="text-xs text-center text-noch-muted">
        {currentStamps === 0
          ? (lang === 'ar' ? '🐰 ابدأ رحلتك مع نوتشي!' : '🐰 Start your Nochi journey!')
          : currentStamps >= goal
          ? (lang === 'ar' ? '🎉 لقد حصلت على مشروب مجاني!' : '🎉 You earned a free drink!')
          : (lang === 'ar'
            ? `${remaining} طوابع للمشروب المجاني! 🐰`
            : `${remaining} more stamps for your free drink! 🐰`)
        }
      </p>
    </div>
  )
}
