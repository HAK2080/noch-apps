// KPICard.jsx — KPI tile with actual value, optional target band, and a
// status indicator dot. Used across Finance dashboard.

import { STATUS, STATUS_BG, STATUS_CLASS, pct } from '../lib/thresholds'

const DOT = {
  good:   'bg-noch-green',
  edge:   'bg-yellow-400',
  bad:    'bg-red-400',
  neutral:'bg-noch-border',
}

export default function KPICard({
  label,
  value,            // string already formatted (e.g. "1,250.00 LYD" or "32.5%")
  ratio,            // optional 0–1 used to derive status
  status,           // optional override of computed status
  bandLabel,        // optional "target 25–32%" text
  sub,              // optional small caption under value
  emphasis = false, // bigger card (used for Prime Cost)
}) {
  const eff = status || (ratio != null ? STATUS.NEUTRAL : STATUS.NEUTRAL)
  const bg  = STATUS_BG[eff] || STATUS_BG.neutral
  const txt = STATUS_CLASS[eff] || STATUS_CLASS.neutral
  return (
    <div className={`rounded-xl border p-3 ${bg} ${emphasis ? 'sm:col-span-2 sm:row-span-2' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-noch-muted text-[11px] uppercase tracking-wide">{label}</span>
        <span className={`w-2 h-2 rounded-full ${DOT[eff] || DOT.neutral}`} />
      </div>
      <p className={`font-bold ${emphasis ? 'text-3xl' : 'text-lg'} ${txt}`}>
        {value ?? '—'}
      </p>
      {bandLabel && <p className="text-noch-muted text-[10px] mt-1">{bandLabel}</p>}
      {sub && <p className="text-noch-muted text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

// Convenience: derive a "32.5%" string from a ratio.
KPICard.pct = pct
