import { useLanguage } from '../../contexts/LanguageContext'

const labels = {
  ar: { urgent: 'عاجل', high: 'مرتفع', medium: 'متوسط', low: 'منخفض' },
  en: { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' },
}

export default function PriorityBadge({ priority }) {
  const { lang } = useLanguage()
  const label = labels[lang]?.[priority] || priority
  return (
    <span className={`badge-${priority}`}>{label}</span>
  )
}
