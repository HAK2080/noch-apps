// PeriodSelector.jsx — Today / 7d / 30d / 90d / Custom.
// Returns { from, to } as ISO date strings (YYYY-MM-DD).

import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'

const PRESETS = [
  { key: 'today', label: 'Today',  days: 0  },
  { key: '7d',    label: '7d',     days: 6  },
  { key: '30d',   label: '30d',    days: 29 },
  { key: '90d',   label: '90d',    days: 89 },
]

function ymd(d) { return d.toISOString().slice(0, 10) }
function rangeFor(preset) {
  const to = new Date(); to.setHours(23, 59, 59, 999)
  const from = new Date(); from.setHours(0, 0, 0, 0)
  if (preset === 'today') return { from, to }
  const meta = PRESETS.find(p => p.key === preset)
  from.setDate(from.getDate() - (meta?.days ?? 6))
  return { from, to }
}

export default function PeriodSelector({ value, onChange, defaultPreset = '7d' }) {
  // Keep preset + dates in one state object so a preset click updates both atomically.
  const initial = (() => {
    const r = rangeFor(defaultPreset)
    return { preset: defaultPreset, from: ymd(r.from), to: ymd(r.to) }
  })()
  const [range, setRange] = useState(value || initial)

  // Seed the parent on mount so consumers don't have to handle a null
  // initial period (the bug that caused /finance Daily P&L to hang
  // indefinitely on load).
  useEffect(() => {
    if (!value) onChange?.({ preset: range.preset, from: range.from, to: range.to })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (value && (value.from !== range.from || value.to !== range.to)) setRange(value)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.from, value?.to])

  const apply = (next) => {
    setRange(next)
    onChange?.({ preset: next.preset, from: next.from, to: next.to })
  }

  const choosePreset = (p) => {
    if (p === 'custom') return apply({ ...range, preset: 'custom' })
    const r = rangeFor(p)
    apply({ preset: p, from: ymd(r.from), to: ymd(r.to) })
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => choosePreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs border ${
              range.preset === p.key
                ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
                : 'border-noch-border text-noch-muted hover:text-white'
            }`}
          >{p.label}</button>
        ))}
        <button
          onClick={() => choosePreset('custom')}
          className={`px-3 py-1.5 rounded-lg text-xs border flex items-center gap-1 ${
            range.preset === 'custom'
              ? 'bg-noch-green/10 border-noch-green/50 text-noch-green'
              : 'border-noch-border text-noch-muted hover:text-white'
          }`}
        ><Calendar size={11}/>Custom</button>
      </div>
      {range.preset === 'custom' && (
        <div className="flex gap-2">
          <input type="date" value={range.from} max={range.to}
            onChange={e => apply({ ...range, from: e.target.value })}
            className="input py-1 px-2 text-xs" />
          <span className="text-noch-muted text-xs self-center">→</span>
          <input type="date" value={range.to} min={range.from}
            onChange={e => apply({ ...range, to: e.target.value })}
            className="input py-1 px-2 text-xs" />
        </div>
      )}
    </div>
  )
}
