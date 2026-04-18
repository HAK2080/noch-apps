import { useLanguage } from '../../contexts/LanguageContext'

const STATS = [
  { key: 'total', color: 'text-white' },
  { key: 'pending', color: 'text-yellow-400' },
  { key: 'in_progress', color: 'text-blue-400' },
  { key: 'done', color: 'text-noch-green' },
  { key: 'overdue', color: 'text-red-400' },
]

const LABELS = {
  ar: { total: 'الكل', pending: 'انتظار', in_progress: 'جاري', done: 'مكتمل', overdue: 'متأخر' },
  en: { total: 'Total', pending: 'Pending', in_progress: 'In Progress', done: 'Done', overdue: 'Overdue' },
}

export default function StatsBar({ stats }) {
  const { lang } = useLanguage()
  const labels = LABELS[lang]

  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {STATS.map(({ key, color }) => (
        <div key={key} className="card text-center">
          <p className={`text-2xl font-bold ${color}`}>{stats?.[key] ?? 0}</p>
          <p className="text-noch-muted text-xs mt-1">{labels[key]}</p>
        </div>
      ))}
    </div>
  )
}
