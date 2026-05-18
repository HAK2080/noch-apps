import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const PRESETS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
]

function fmtG(n) { return n != null ? Number(n).toFixed(1) : '—' }

export default function ConsumptionCard({ ingredient }) {
  const [days, setDays] = useState(7)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const end = new Date()
    const start = new Date(+end - days * 86400000)
    const toDate = d => d.toISOString().split('T')[0]
    supabase.rpc('get_ingredient_consumption', {
      p_ingredient_name: ingredient,
      p_start_date: toDate(start),
      p_end_date: toDate(end),
    }).then(({ data: rows }) => {
      const total = (rows || []).reduce((s, r) => s + Number(r.total_consumed_g || 0), 0)
      const serves = (rows || []).reduce((s, r) => s + Number(r.total_serves || 0), 0)
      const source = rows?.[0]?.source || 'manual_default'
      const qps = rows?.[0]?.qty_per_serve_g
      setData({ total, serves, source, qps })
      setLoading(false)
    })
  }, [ingredient, days])

  return (
    <div style={{ background: '#f9f9f9', borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ textTransform: 'capitalize', fontSize: 14 }}>{ingredient}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          {PRESETS.map(p => (
            <button key={p.days} onClick={() => setDays(p.days)}
              style={{
                padding: '2px 10px', borderRadius: 20, border: '1px solid #ccc', cursor: 'pointer', fontSize: 12,
                background: days === p.days ? '#222' : 'white',
                color: days === p.days ? 'white' : '#222',
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {loading
        ? <p style={{ color: '#999', fontSize: 13, margin: 0 }}>Loading...</p>
        : data
          ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <Stat label="Total used" value={`${fmtG(data.total)} g`} />
              <Stat label="Serves" value={data.serves} />
              <Stat label="Per serve" value={data.qps ? `${fmtG(data.qps)} g` : '—'}
                sub={data.source === 'recipe' ? 'from recipe' : 'manual default'} />
            </div>
          : <p style={{ color: '#999', fontSize: 13, margin: 0 }}>No data</p>
      }
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
