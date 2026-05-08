import { useLanguage } from '../../contexts/LanguageContext'

const labels = {
  ar: { pending: 'قيد الانتظار', in_progress: 'جاري', done: 'مكتمل' },
  en: { pending: 'Pending', in_progress: 'In Progress', done: 'Done' },
}

export default function StatusBadge({ status }) {
  const { lang } = useLanguage()
  const label = labels[lang]?.[status] || status
  return (
    <span className={`badge-${status}`}>{label}</span>
  )
}
