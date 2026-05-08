// SVGLineChart — lightweight SVG line chart, no dependencies
export default function SVGLineChart({ data = [], valueKey = 'value', labelKey = 'label', color = '#4ADE80', height = 120 }) {
  if (!data.length) return null
  const values = data.map(d => d[valueKey] || 0)
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const W = 600
  const H = height
  const padX = 8
  const padY = 10

  const pts = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * (W - 2 * padX)
    const y = H - padY - ((d[valueKey] || 0) - min) / range * (H - 2 * padY)
    return [x, y]
  })

  const pathD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
  const areaD = `${pathD} L ${pts[pts.length - 1][0]} ${H - padY} L ${pts[0][0]} ${H - padY} Z`

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#lineGrad)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill={color} />
        ))}
      </svg>
    </div>
  )
}
