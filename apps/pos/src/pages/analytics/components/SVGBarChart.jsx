// SVGBarChart — lightweight SVG bar chart
export default function SVGBarChart({ data = [], valueKey = 'value', labelKey = 'label', color = '#4ADE80', height = 120 }) {
  if (!data.length) return null
  const values = data.map(d => d[valueKey] || 0)
  const max = Math.max(...values, 1)
  const W = 600
  const H = height
  const padX = 8
  const padY = 4
  const barW = Math.max(4, (W - 2 * padX) / data.length - 4)

  return (
    <div className="w-full" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
        {data.map((d, i) => {
          const x = padX + i * ((W - 2 * padX) / data.length)
          const barH = ((d[valueKey] || 0) / max) * (H - padY * 2)
          const y = H - padY - barH
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={Math.max(2, barH)} rx="2" fill={color} opacity="0.7" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
