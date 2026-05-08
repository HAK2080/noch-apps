// SegmentBadge.jsx — small coloured pill for a customer segment.

const STYLES = {
  vip:        { bg: 'bg-noch-green/15 border-noch-green/40',     fg: 'text-noch-green',   label: 'VIP' },
  regular:    { bg: 'bg-blue-500/15 border-blue-500/40',         fg: 'text-blue-400',     label: 'Regular' },
  occasional: { bg: 'bg-noch-card border-noch-border',           fg: 'text-noch-muted',   label: 'Occasional' },
  at_risk:    { bg: 'bg-yellow-500/15 border-yellow-500/40',     fg: 'text-yellow-400',   label: 'At risk' },
  churned:    { bg: 'bg-red-500/15 border-red-500/40',           fg: 'text-red-400',      label: 'Churned' },
  new:        { bg: 'bg-purple-500/15 border-purple-500/40',     fg: 'text-purple-400',   label: 'New' },
}

export default function SegmentBadge({ segment }) {
  const s = STYLES[segment] || STYLES.occasional
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${s.bg} ${s.fg}`}>
      {s.label}
    </span>
  )
}

SegmentBadge.STYLES = STYLES
