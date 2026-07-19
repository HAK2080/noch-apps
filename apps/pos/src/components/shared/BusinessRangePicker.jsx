/* eslint-disable react-refresh/only-export-components */
import { Calendar } from 'lucide-react'

export const DEFAULT_BUSINESS_PRESETS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: '7d', days: 6 },
  { key: '30d', label: '30d', days: 29 },
  { key: '90d', label: '90d', days: 89 },
]

export function localYmd(value) {
  if (typeof value === 'string') return value.slice(0, 10)
  const pad = number => String(number).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

export function businessPresetRange(preset, presets = DEFAULT_BUSINESS_PRESETS) {
  const to = new Date(Date.now() - 5 * 3600e3)
  const from = new Date(to)
  const definition = presets.find(item => item.key === preset)
  from.setDate(from.getDate() - (definition?.days ?? 0))
  return { from: localYmd(from), to: localYmd(to) }
}

export default function BusinessRangePicker({
  value,
  onChange,
  presets = DEFAULT_BUSINESS_PRESETS,
  labels = {},
  resolveRange,
  compact = false,
}) {
  const choose = preset => {
    if (preset === 'custom') return onChange({ ...value, preset })
    const range = resolveRange?.(preset) || businessPresetRange(preset, presets)
    onChange({ preset, from: localYmd(range.from), to: localYmd(range.to) })
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex gap-1 flex-wrap">
        {presets.map(item => (
          <button key={item.key} onClick={() => choose(item.key)} className={`${compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5'} rounded-lg text-xs border ${value.preset === item.key ? 'bg-noch-green/10 border-noch-green/50 text-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}>
            {labels[item.key] || item.label}
          </button>
        ))}
        <button onClick={() => choose('custom')} className={`${compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5'} rounded-lg text-xs border flex items-center gap-1 ${value.preset === 'custom' ? 'bg-noch-green/10 border-noch-green/50 text-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}>
          <Calendar size={11} />{labels.custom || 'Custom'}
        </button>
      </div>
      {value.preset === 'custom' && (
        <div className="flex gap-2 items-center">
          <input type="date" value={value.from} max={value.to} onChange={event => onChange({ ...value, from: event.target.value })} className="input py-1 px-2 text-xs" />
          <span className="text-noch-muted text-xs">→</span>
          <input type="date" value={value.to} min={value.from} onChange={event => onChange({ ...value, to: event.target.value })} className="input py-1 px-2 text-xs" />
        </div>
      )}
    </div>
  )
}
