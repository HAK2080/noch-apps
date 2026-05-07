import { EVALUATOR_LABELS } from '../lib/constants'

const TONE_CLASS = {
  green: 'bg-green-500/10 text-green-400 border-green-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  red:   'bg-red-500/10 text-red-400 border-red-500/20',
  grey:  'bg-noch-border text-noch-muted border-noch-border',
}

export default function EvaluatorBadge({ label }) {
  const meta = EVALUATOR_LABELS[label] || { label, tone: 'grey' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${TONE_CLASS[meta.tone]}`}>
      {meta.label}
    </span>
  )
}
