// StatusBadge.jsx — expense status pill
import { Clock, CheckCircle2, Ban, Wallet } from 'lucide-react'

const STATUS_META = {
  pending:  { label: 'Pending',  color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: Clock },
  approved: { label: 'Approved', color: 'text-noch-green', bg: 'bg-noch-green/10',  icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-400',    bg: 'bg-red-400/10',     icon: Ban },
  paid:     { label: 'Paid',     color: 'text-blue-400',   bg: 'bg-blue-400/10',    icon: Wallet },
}

export default function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.color}`}>
      <m.icon size={11} />
      {m.label}
    </span>
  )
}
