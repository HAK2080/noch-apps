import { Banknote, CreditCard, Clock3 } from 'lucide-react'

const META = {
  unpaid: {
    label: 'Submitter: Not paid',
    className: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
    icon: Clock3,
  },
  cash: {
    label: 'Submitter: Paid cash',
    className: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
    icon: Banknote,
  },
  card: {
    label: 'Submitter: Paid card',
    className: 'text-blue-300 bg-blue-400/10 border-blue-400/20',
    icon: CreditCard,
  },
}

function paymentDeclarationKey(expense) {
  if (expense?.payment_status_reported === 'unpaid') return 'unpaid'
  if (expense?.payment_status_reported === 'paid') {
    return expense.payment_method_reported === 'card' ? 'card' : 'cash'
  }
  return null
}

export default function PaymentDeclarationBadge({ expense }) {
  const key = paymentDeclarationKey(expense)
  if (!key) return null
  const meta = META[key]
  const Icon = meta.icon

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      <Icon size={11} />
      {meta.label}
    </span>
  )
}
