import { TrendingUp, TrendingDown } from 'lucide-react'

export default function KPICard({ icon: Icon, label, value, change, suffix, color = 'text-noch-green' }) {
  const isPositive = change > 0
  const isNegative = change < 0
  return (
    <div className="bg-noch-card border border-noch-border rounded-xl p-5">
      <div className="flex items-center gap-2 text-noch-muted text-sm mb-1">
        {Icon && <Icon size={16} />}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>
        {value}
        {suffix && <span className="text-sm text-noch-muted ml-1">{suffix}</span>}
      </div>
      {change !== null && change !== undefined && (
        <div className={`flex items-center gap-1 text-xs mt-1 ${isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-noch-muted'}`}>
          {isPositive ? <TrendingUp size={12} /> : isNegative ? <TrendingDown size={12} /> : null}
          <span>{isPositive ? '+' : ''}{change}% vs previous</span>
        </div>
      )}
    </div>
  )
}
