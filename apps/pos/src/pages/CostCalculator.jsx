import { useState } from 'react'
import Layout from '../components/Layout'

// ─── STATIC DATA ──────────────────────────────────────────────────────────────
const RECIPES = {
  'matcha-latte': { name: 'Matcha latte', rows: [
    { n: 'Ceremonial matcha', q: 3,   u: 'g',  c: 0.45,  cur: 'USD', y: 93, vol: false },
    { n: 'Oat milk',          q: 200, u: 'ml', c: 0.018, cur: 'LYD', y: 98, vol: false },
    { n: 'Simple syrup',      q: 15,  u: 'ml', c: 0.008, cur: 'LYD', y: 99, vol: false },
  ]},
  'pistachio-cf': { name: 'Pistachio cold foam cold brew', rows: [
    { n: 'Cold brew concentrate', q: 120, u: 'ml', c: 0.022, cur: 'LYD', y: 97, vol: false },
    { n: 'Pistachio paste',       q: 15,  u: 'g',  c: 0.42,  cur: 'USD', y: 94, vol: true  },
    { n: 'Heavy cream',           q: 60,  u: 'ml', c: 0.014, cur: 'LYD', y: 98, vol: false },
    { n: 'Monin vanilla',         q: 10,  u: 'ml', c: 0.12,  cur: 'USD', y: 99, vol: false },
  ]},
  'cafe-due': { name: 'Café due', rows: [
    { n: 'Espresso (double)', q: 40,  u: 'ml', c: 0.025, cur: 'LYD', y: 97, vol: false },
    { n: 'Whole milk',        q: 180, u: 'ml', c: 0.011, cur: 'LYD', y: 98, vol: false },
    { n: 'Tonka bean syrup',  q: 10,  u: 'ml', c: 0.09,  cur: 'USD', y: 99, vol: true  },
  ]},
  'mango-matcha': { name: 'Mango matcha duo', rows: [
    { n: 'Ceremonial matcha',  q: 3,   u: 'g',  c: 0.45,  cur: 'USD', y: 93, vol: false },
    { n: 'Mango puree',        q: 60,  u: 'ml', c: 0.038, cur: 'LYD', y: 95, vol: true  },
    { n: 'Oat milk',           q: 120, u: 'ml', c: 0.018, cur: 'LYD', y: 98, vol: false },
    { n: 'Passionfruit syrup', q: 15,  u: 'ml', c: 0.13,  cur: 'USD', y: 99, vol: true  },
  ]},
}

const COMP = {
  matcha: [
    { n: 'Cha Cha Matcha (NY)',    f: '$7–8',    l: '34–39' },
    { n: 'Blank Street (London)',  f: '£5.5',    l: '34'    },
    { n: 'Tripoli specialty avg',  f: '—',       l: '18–24' },
  ],
  cold: [
    { n: 'Blue Bottle (US)',       f: '$6',      l: '29'    },
    { n: 'Dutch Bros (US)',        f: '$5.5',    l: '27'    },
    { n: 'Tripoli specialty avg',  f: '—',       l: '18–22' },
  ],
  def: [
    { n: 'Specialty latte – global', f: '$5–6',   l: '24–29' },
    { n: 'Specialty café – Tripoli', f: '—',      l: '18–24' },
    { n: 'Black Sheep Coffee (UK)',  f: '£4.5–5', l: '28–31' },
  ],
}

const MARGIN_PRESETS = [20, 30, 40, 50]
const UNITS      = ['g', 'ml', 'oz', 'l', 'kg', 'pc']
const BULK_UNITS = ['g', 'ml', 'oz', 'l', 'kg']
const CURRENCIES = ['LYD', 'USD', 'EUR', 'GBP']

const DEFAULT_SETTINGS = {
  fxUsd: 4.88, fxGbp: 6.24, fxEur: 5.52,
  rent: 4500, labor: 6000, utilities: 1200, cups: 2000,
  packaging: 1.5,
}

// ─── PURE CALC HELPERS ────────────────────────────────────────────────────────
function getFX(cur, s) {
  if (cur === 'USD') return s.fxUsd
  if (cur === 'GBP') return s.fxGbp
  if (cur === 'EUR') return s.fxEur
  return 1
}

function getOH(s) {
  return (s.rent + s.labor + s.utilities) / Math.max(1, s.cups)
}

function calcIngredients(rows, settings, batch) {
  let rawTotal = 0, wasteTotal = 0
  const perRow = rows.map(r => {
    const raw = r.q * r.c * getFX(r.cur, settings)
    const eff = raw / (r.y / 100)
    rawTotal  += raw
    wasteTotal += (eff - raw)
    return eff / batch
  })
  return {
    ingPerCup:   (rawTotal + wasteTotal) / batch,
    wastePerCup: wasteTotal / batch,
    perRow,
  }
}

function calcPrice(total, margin) {
  return margin < 100 ? total / (1 - margin / 100) : 0
}

function marginColor(m) {
  return m >= 35 ? '#4ade80' : m >= 25 ? '#fbbf24' : '#f87171'
}

function marginLabel(m) {
  return m >= 35 ? 'healthy' : m >= 25 ? 'thin' : 'below threshold'
}

// ─── STYLE TOKENS ─────────────────────────────────────────────────────────────
const S = {
  wrap:    { maxWidth: 820, margin: '0 auto', color: '#f0f0f0', fontFamily: 'system-ui,sans-serif', fontSize: 14, lineHeight: 1.5 },
  card:    { background: '#161616', border: '0.5px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 18, marginBottom: 12 },
  sec:     { fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: '#555', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  lbl:     { fontSize: 12, color: '#9a9a9a', minWidth: 130, flexShrink: 0 },
  input:   { background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.14)', borderRadius: 6, color: '#f0f0f0', fontSize: 12, height: 32, padding: '0 10px', outline: 'none' },
  select:  { background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.14)', borderRadius: 6, color: '#f0f0f0', fontSize: 12, height: 32, padding: '0 8px', outline: 'none' },
  tdInput: { background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.14)', borderRadius: 6, color: '#f0f0f0', fontSize: 12, height: 28, padding: '0 6px', width: '100%', outline: 'none' },
  metric:  { background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.08)', borderRadius: 6, padding: '10px 12px' },
  btn:     { height: 32, padding: '0 14px', fontSize: 12, fontWeight: 500, border: '0.5px solid rgba(255,255,255,.14)', borderRadius: 6, background: 'transparent', color: '#f0f0f0', cursor: 'pointer' },
  btnAdd:  { height: 32, padding: '0 14px', fontSize: 12, fontWeight: 500, border: '0.5px solid rgba(37,99,235,.3)', borderRadius: 6, background: 'transparent', color: '#93bbfd', cursor: 'pointer' },
  btnPrimary: { height: 32, padding: '0 14px', fontSize: 12, fontWeight: 500, border: '0.5px solid #2563eb', borderRadius: 6, background: '#2563eb', color: '#fff', cursor: 'pointer' },
  div:     { height: '0.5px', background: 'rgba(255,255,255,.08)', margin: '14px 0' },
  th:      { fontSize: 10, fontWeight: 500, color: '#555', textTransform: 'uppercase', letterSpacing: '.07em', padding: '0 6px 10px', textAlign: 'left', whiteSpace: 'nowrap' },
  td:      { padding: '5px 6px', borderTop: '0.5px solid rgba(255,255,255,.08)', verticalAlign: 'middle' },
  badge:   (color, bg) => ({ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: bg, color, whiteSpace: 'nowrap' }),
  dot:     (color) => ({ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: color, verticalAlign: 'middle' }),
}

const TABS = [
  { key: 'calc',     label: 'Calculator'      },
  { key: 'bulk',     label: 'Bulk converter'  },
  { key: 'dash',     label: 'Menu dashboard'  },
  { key: 'settings', label: 'Settings'        },
]

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function CostCalculator() {
  const [tab, setTab]         = useState('calc')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  // Calculator
  const [itemName, setItemName]       = useState('')
  const [batchSize, setBatchSize]     = useState(1)
  const [rows, setRows]               = useState([
    { n: '', q: 1, u: 'g', c: 0, cur: 'LYD', y: 95, vol: false },
    { n: '', q: 1, u: 'g', c: 0, cur: 'LYD', y: 95, vol: false },
  ])
  const [selM, setSelM]               = useState(40)
  const [customMargin, setCustomMargin] = useState(35)
  const [targetPrice, setTargetPrice] = useState('')
  const [packaging, setPackaging]     = useState(1.5)

  // Bulk
  const [bulkRows, setBulkRows] = useState([
    { name: 'Ceremonial matcha', size: 100,  unit: 'g',  cost: 18,  cur: 'USD', vol: false },
    { name: 'Monin syrup (1L)',  size: 1000, unit: 'ml', cost: 12,  cur: 'USD', vol: false },
    { name: 'Pistachio paste',   size: 500,  unit: 'g',  cost: 28,  cur: 'USD', vol: true  },
    { name: 'Oat milk',          size: 1000, unit: 'ml', cost: 8.5, cur: 'LYD', vol: false },
    { name: 'DaVinci Gourmet',   size: 750,  unit: 'ml', cost: 10,  cur: 'USD', vol: false },
  ])

  // Menu dashboard
  const [menuItems, setMenuItems] = useState([])

  // ─── DERIVED ──────────────────────────────────────────────────────────────
  const batch = Math.max(1, batchSize)
  const oh = getOH(settings)
  const { ingPerCup, wastePerCup, perRow } = calcIngredients(rows, settings, batch)
  const total = ingPerCup + oh + packaging
  const customPrice = calcPrice(total, customMargin)
  const tp = parseFloat(targetPrice) || 0
  const revMargin = tp > 0 && total > 0 ? ((tp - total) / tp) * 100 : null

  const fxStress = [
    { label: 'USD −15%', mult: 0.85 },
    { label: 'USD base', mult: 1    },
    { label: 'USD +15%', mult: 1.15 },
  ].map(s => {
    const adj = { ...settings, fxUsd: settings.fxUsd * s.mult }
    const { ingPerCup: ai } = calcIngredients(rows, adj, batch)
    const at = ai + oh + packaging
    return { ...s, value: at, delta: at - total }
  })

  const name = itemName.toLowerCase()
  const compData = name.includes('matcha') ? COMP.matcha
    : (name.includes('cold') || name.includes('brew')) ? COMP.cold
    : COMP.def

  // ─── HANDLERS ─────────────────────────────────────────────────────────────
  const updateRow     = (i, f, v) => setRows(p => p.map((r, idx) => idx === i ? { ...r, [f]: v } : r))
  const addRow        = ()        => setRows(p => [...p, { n: '', q: 1, u: 'g', c: 0, cur: 'LYD', y: 95, vol: false }])
  const removeRow     = (i)       => setRows(p => p.filter((_, idx) => idx !== i))

  const updateBulk    = (i, f, v) => setBulkRows(p => p.map((r, idx) => idx === i ? { ...r, [f]: v } : r))
  const addBulkRow    = ()        => setBulkRows(p => [...p, { name: '', size: 1000, unit: 'g', cost: 0, cur: 'LYD', vol: false }])
  const removeBulkRow = (i)       => setBulkRows(p => p.filter((_, idx) => idx !== i))

  const setSetting    = (k, v)    => setSettings(p => ({ ...p, [k]: parseFloat(v) || 0 }))

  function loadRecipe(key) {
    if (!key) return
    const rec = RECIPES[key]
    setItemName(rec.name)
    setRows(rec.rows.map(r => ({ ...r })))
  }

  function saveToMenu() {
    const price = calcPrice(total, selM)
    setMenuItems(p => [...p, { name: itemName || 'Unnamed item', cost: total, price: price.toFixed(2), margin: selM }])
    setTab('dash')
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div style={S.wrap}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>NOCH · Cost Calculator</h1>
          <span style={{ fontSize: 11, color: '#555' }}>v2.0</span>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.08)', borderRadius: 6, padding: 3, marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '7px 10px', fontSize: 12, fontWeight: 500,
              border: tab === t.key ? '0.5px solid rgba(255,255,255,.14)' : 'none',
              borderRadius: 4,
              background: tab === t.key ? '#262626' : 'transparent',
              color: tab === t.key ? '#f0f0f0' : '#9a9a9a',
              cursor: 'pointer',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ CALCULATOR ══════════════════════════════════════════════════════ */}
        {tab === 'calc' && <>

          {/* Item */}
          <div style={S.card}>
            <div style={S.sec}>Item</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={S.lbl}>Load recipe</span>
                <select style={{ ...S.select, flex: 1 }} defaultValue="" onChange={e => loadRecipe(e.target.value)}>
                  <option value="">— build from scratch —</option>
                  <option value="matcha-latte">Matcha latte</option>
                  <option value="pistachio-cf">Pistachio cold foam cold brew</option>
                  <option value="cafe-due">Café due</option>
                  <option value="mango-matcha">Mango matcha duo</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={S.lbl}>Batch size</span>
                <input type="number" value={batchSize} min={1} step={1}
                  onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ ...S.input, width: 60 }} />
                <span style={{ fontSize: 11, color: '#555' }}>cups → cost per cup</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.lbl}>Item name</span>
              <input type="text" value={itemName} placeholder="e.g. Mango matcha duo"
                onChange={e => setItemName(e.target.value)}
                style={{ ...S.input, flex: 1 }} />
            </div>
          </div>

          {/* Ingredients */}
          <div style={S.card}>
            <div style={S.sec}>Ingredients</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: '22%' }}>Ingredient</th>
                    <th style={{ ...S.th, width: '9%'  }}>Qty</th>
                    <th style={{ ...S.th, width: '8%'  }}>Unit</th>
                    <th style={{ ...S.th, width: '12%' }}>Unit cost</th>
                    <th style={{ ...S.th, width: '8%'  }}>Cur</th>
                    <th style={{ ...S.th, width: '9%'  }}>Yield %</th>
                    <th style={{ ...S.th, width: '7%'  }}>Volatile</th>
                    <th style={{ ...S.th, width: '11%', textAlign: 'right' }}>LYD / cup</th>
                    <th style={{ ...S.th, width: '4%'  }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={S.td}><input type="text"   value={r.n}   placeholder="Ingredient" onChange={e => updateRow(i, 'n', e.target.value)}                        style={S.tdInput} /></td>
                      <td style={S.td}><input type="number" value={r.q}   min={0}  step={0.1}      onChange={e => updateRow(i, 'q', parseFloat(e.target.value) || 0)}        style={S.tdInput} /></td>
                      <td style={S.td}>
                        <select value={r.u} onChange={e => updateRow(i, 'u', e.target.value)} style={{ ...S.tdInput, padding: '0 4px' }}>
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td style={S.td}><input type="number" value={r.c}   min={0}  step={0.001}    onChange={e => updateRow(i, 'c', parseFloat(e.target.value) || 0)}        style={S.tdInput} /></td>
                      <td style={S.td}>
                        <select value={r.cur} onChange={e => updateRow(i, 'cur', e.target.value)} style={{ ...S.tdInput, padding: '0 4px' }}>
                          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={S.td}><input type="number" value={r.y}   min={50} max={100} step={1} onChange={e => updateRow(i, 'y', parseFloat(e.target.value) || 95)}   style={S.tdInput} /></td>
                      <td style={{ ...S.td, textAlign: 'center' }}><input type="checkbox" checked={r.vol} onChange={e => updateRow(i, 'vol', e.target.checked)} /></td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{(perRow[i] ?? 0).toFixed(3)}</td>
                      <td style={S.td}><button onClick={() => removeRow(i)} style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 16, padding: '0 6px', cursor: 'pointer' }}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={addRow} style={S.btnAdd}>+ Add ingredient</button>
              <span style={{ fontSize: 10, color: '#555' }}>Yield % = usable portion after waste. Default: 95% powders · 98% liquids · 99% syrups</span>
            </div>
          </div>

          {/* Cost breakdown */}
          <div style={S.card}>
            <div style={S.sec}>Cost breakdown</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
              <div style={S.metric}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Ingredients</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{ingPerCup.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>LYD / cup</div>
              </div>
              <div style={S.metric}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Overhead / cup</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{oh.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>from settings</div>
              </div>
              <div style={S.metric}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Packaging</div>
                <input type="number" value={packaging} min={0} step={0.5}
                  onChange={e => setPackaging(parseFloat(e.target.value) || 0)}
                  style={{ ...S.input, width: 58, height: 26, fontSize: 14, fontWeight: 600 }} />
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>LYD (editable)</div>
              </div>
              <div style={S.metric}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Waste uplift</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{wastePerCup.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>LYD (included)</div>
              </div>
            </div>
            <div style={S.div} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Total baseline cost</span>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{total.toFixed(2)} LYD</span>
            </div>
          </div>

          {/* Pricing simulator */}
          <div style={S.card}>
            <div style={S.sec}>Pricing simulator</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
              {MARGIN_PRESETS.map(m => {
                const sel = m === selM
                return (
                  <div key={m} onClick={() => setSelM(m)} style={{
                    background: sel ? 'rgba(37,99,235,.12)' : '#1e1e1e',
                    border: sel ? '1.5px solid #2563eb' : '0.5px solid rgba(255,255,255,.08)',
                    borderRadius: 6, padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: sel ? '#93bbfd' : '#f0f0f0' }}>{m}%</div>
                    <div style={{ fontSize: 11, color: sel ? '#93bbfd' : '#9a9a9a', marginTop: 3 }}>
                      {total > 0 ? calcPrice(total, m).toFixed(2) : '0.00'} LYD
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>
              <div>
                <div style={{ fontSize: 12, color: '#9a9a9a', marginBottom: 6 }}>Custom margin %</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" value={customMargin} min={1} max={90} step={1}
                    onChange={e => setCustomMargin(parseFloat(e.target.value) || 35)}
                    style={{ ...S.input, width: 70 }} />
                  <span style={{ fontSize: 12, color: '#9a9a9a' }}>→ sale price:</span>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{customMargin < 100 ? customPrice.toFixed(2) + ' LYD' : '—'}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#9a9a9a', marginBottom: 6 }}>Min viable price (break-even + overhead)</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{total.toFixed(2)} LYD</div>
                <div style={{ height: 4, borderRadius: 2, background: '#262626', marginTop: 8 }}>
                  {revMargin !== null && (
                    <div style={{ height: 4, borderRadius: 2, width: Math.min(100, Math.max(0, revMargin)) + '%', background: marginColor(revMargin), transition: 'width .4s,background .4s' }} />
                  )}
                </div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
                  {revMargin !== null ? `${revMargin.toFixed(1)}% margin at ${tp.toFixed(2)} LYD` : 'Enter a target price below'}
                </div>
              </div>
            </div>
            <div style={S.div} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#9a9a9a' }}>Target price:</span>
              <input type="number" value={targetPrice} placeholder="e.g. 22" min={0} step={0.5}
                onChange={e => setTargetPrice(e.target.value)}
                style={{ ...S.input, width: 80 }} />
              <span style={{ fontSize: 12, color: '#9a9a9a' }}>LYD → margin:</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{revMargin !== null ? revMargin.toFixed(1) + '%' : '—'}</span>
              {revMargin !== null && (
                <span style={S.badge(
                  marginColor(revMargin),
                  revMargin >= 35 ? 'rgba(74,222,128,.1)' : revMargin >= 25 ? 'rgba(251,191,36,.1)' : 'rgba(248,113,113,.1)'
                )}>
                  {marginLabel(revMargin)}
                </span>
              )}
            </div>
          </div>

          {/* FX stress test */}
          <div style={S.card}>
            <div style={S.sec}>
              FX stress-test
              <span style={S.badge('#fbbf24', 'rgba(251,191,36,.1)')}>USD ±15%</span>
            </div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>Total baseline cost impact when USD rate shifts. Relevant for imported ingredients.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {fxStress.map(s => {
                const col = s.mult === 1 ? '#f0f0f0' : s.delta > 0 ? '#f87171' : '#4ade80'
                return (
                  <div key={s.label} style={{ background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.08)', borderRadius: 6, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: col }}>{s.value.toFixed(2)} LYD</div>
                    <div style={{ fontSize: 11, marginTop: 2, color: col }}>
                      {s.mult === 1 ? 'current' : (s.delta > 0 ? '+' : '') + s.delta.toFixed(2) + ' LYD'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Market reference */}
          <div style={S.card}>
            <div style={S.sec}>
              Market reference
              <span style={S.badge('#93bbfd', 'rgba(37,99,235,.12)')}>indicative only</span>
            </div>
            {compData.map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,.08)', fontSize: 12 }}>
                <span>{c.n}</span>
                <span style={{ color: '#9a9a9a' }}>{c.f !== '—' ? c.f + ' · ' : ''}~{c.l} LYD</span>
              </div>
            ))}
          </div>

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 14 }}>
            <button onClick={saveToMenu} style={S.btnPrimary}>Save to menu dashboard</button>
          </div>
        </>}

        {/* ══ BULK CONVERTER ══════════════════════════════════════════════════ */}
        {tab === 'bulk' && <>
          <div style={S.card}>
            <div style={S.sec}>Bulk ingredient cost converter</div>
            <div style={{ fontSize: 11, color: '#9a9a9a', background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.08)', borderRadius: 6, padding: '8px 10px', marginBottom: 14 }}>
              Enter pack size and total cost paid. Calculates cost per gram/ml to use as unit cost in the Calculator.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width: '22%' }}>Ingredient</th>
                    <th style={{ ...S.th, width: '12%' }}>Pack size</th>
                    <th style={{ ...S.th, width: '8%'  }}>Unit</th>
                    <th style={{ ...S.th, width: '13%' }}>Pack cost</th>
                    <th style={{ ...S.th, width: '9%'  }}>Currency</th>
                    <th style={{ ...S.th, width: '15%' }}>Cost / unit (LYD)</th>
                    <th style={{ ...S.th, width: '8%'  }}>Volatile</th>
                    <th style={{ ...S.th, width: '3%'  }}></th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((r, i) => {
                    const pu = r.size > 0 ? (r.cost * getFX(r.cur, settings)) / r.size : 0
                    return (
                      <tr key={i}>
                        <td style={S.td}><input type="text"   value={r.name} placeholder="Ingredient" onChange={e => updateBulk(i, 'name', e.target.value)}                        style={S.tdInput} /></td>
                        <td style={S.td}><input type="number" value={r.size} min={1}  step={10}        onChange={e => updateBulk(i, 'size', parseFloat(e.target.value) || 1)}        style={S.tdInput} /></td>
                        <td style={S.td}>
                          <select value={r.unit} onChange={e => updateBulk(i, 'unit', e.target.value)} style={{ ...S.tdInput, padding: '0 4px' }}>
                            {BULK_UNITS.map(u => <option key={u}>{u}</option>)}
                          </select>
                        </td>
                        <td style={S.td}><input type="number" value={r.cost} min={0}  step={0.5}       onChange={e => updateBulk(i, 'cost', parseFloat(e.target.value) || 0)}        style={S.tdInput} /></td>
                        <td style={S.td}>
                          <select value={r.cur} onChange={e => updateBulk(i, 'cur', e.target.value)} style={{ ...S.tdInput, padding: '0 4px' }}>
                            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td style={{ ...S.td, fontWeight: 600, color: '#93bbfd' }}>{pu.toFixed(3)} LYD</td>
                        <td style={{ ...S.td, textAlign: 'center' }}><input type="checkbox" checked={r.vol} onChange={e => updateBulk(i, 'vol', e.target.checked)} /></td>
                        <td style={S.td}><button onClick={() => removeBulkRow(i)} style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 16, padding: '0 6px', cursor: 'pointer' }}>×</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 10 }}>
              <button onClick={addBulkRow} style={S.btnAdd}>+ Add ingredient</button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#9a9a9a', background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.08)', borderRadius: 6, padding: '8px 10px' }}>
            Volatile = price changes frequently (imported fruit, seasonal). Use to trigger periodic cost review reminders in the app.
          </div>
        </>}

        {/* ══ MENU DASHBOARD ══════════════════════════════════════════════════ */}
        {tab === 'dash' && (
          <div style={S.card}>
            <div style={S.sec}>Menu cost overview</div>
            {menuItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#555', fontSize: 12 }}>
                No items saved yet. Cost items in the Calculator tab and click "Save to menu dashboard".
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
                  <div style={S.metric}>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Items costed</div>
                    <div style={{ fontSize: 17, fontWeight: 600 }}>{menuItems.length}</div>
                  </div>
                  <div style={S.metric}>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Avg margin</div>
                    <div style={{ fontSize: 17, fontWeight: 600 }}>{(menuItems.reduce((a, b) => a + b.margin, 0) / menuItems.length).toFixed(1)}%</div>
                  </div>
                  <div style={S.metric}>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Below 25%</div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: menuItems.filter(m => m.margin < 25).length > 0 ? '#f87171' : '#4ade80' }}>
                      {menuItems.filter(m => m.margin < 25).length}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {menuItems.map((item, i) => {
                    const dotColor = item.margin >= 35 ? '#4ade80' : item.margin >= 25 ? '#fbbf24' : '#f87171'
                    return (
                      <div key={i} style={{ background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.08)', borderRadius: 6, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {item.name}
                            <span style={{ ...S.dot(dotColor), marginLeft: 6 }} />
                          </div>
                          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Baseline: {item.cost.toFixed(2)} LYD</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{item.price} LYD</div>
                          <div style={{ fontSize: 10, color: '#9a9a9a', marginTop: 2 }}>{item.margin}% margin</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            <div style={{ marginTop: 12, fontSize: 10, color: '#555' }}>
              <span style={{ ...S.dot('#4ade80'), marginRight: 4 }} /> Margin ≥ 35% — healthy &nbsp;&nbsp;
              <span style={{ ...S.dot('#fbbf24'), marginRight: 4 }} /> 25–35% — thin &nbsp;&nbsp;
              <span style={{ ...S.dot('#f87171'), marginRight: 4 }} /> Below 25% — review pricing
            </div>
          </div>
        )}

        {/* ══ SETTINGS ════════════════════════════════════════════════════════ */}
        {tab === 'settings' && <>
          <div style={S.card}>
            <div style={S.sec}>
              Currency rates (1 unit = LYD)
              <span style={S.badge('#fbbf24', 'rgba(251,191,36,.1)')}>update manually</span>
            </div>
            {[
              { label: '1 USD', key: 'fxUsd' },
              { label: '1 GBP', key: 'fxGbp' },
              { label: '1 EUR', key: 'fxEur' },
            ].map(({ label, key }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ ...S.lbl, fontWeight: 600 }}>{label}</span>
                <span style={{ color: '#555', fontSize: 12 }}>=</span>
                <input type="number" value={settings[key]} step={0.01}
                  onChange={e => setSetting(key, e.target.value)}
                  style={{ ...S.input, width: 110 }} />
                <span style={{ fontSize: 12, color: '#555' }}>LYD</span>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={S.sec}>Monthly overhead — drives overhead per cup</div>
            {[
              { label: 'Rent / lease (LYD)', key: 'rent'      },
              { label: 'Labor total (LYD)',  key: 'labor'     },
              { label: 'Utilities (LYD)',    key: 'utilities' },
              { label: 'Avg cups / month',   key: 'cups'      },
            ].map(({ label, key }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={S.lbl}>{label}</span>
                <input type="number" value={settings[key]}
                  onChange={e => setSetting(key, e.target.value)}
                  style={{ ...S.input, flex: 1 }} />
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#9a9a9a', background: '#1e1e1e', border: '0.5px solid rgba(255,255,255,.08)', borderRadius: 6, padding: '8px 10px', marginTop: 8 }}>
              Overhead per cup: {oh.toFixed(2)} LYD &nbsp;|&nbsp; SCA benchmark: 25–35% of drink sale price
            </div>
          </div>
          <div style={S.card}>
            <div style={S.sec}>Default packaging cost (LYD)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={S.lbl}>Cup + lid + sleeve</span>
              <input type="number" value={settings.packaging} step={0.5}
                onChange={e => { setSetting('packaging', e.target.value); setPackaging(parseFloat(e.target.value) || 0) }}
                style={{ ...S.input, flex: 1 }} />
            </div>
          </div>
        </>}

      </div>
    </Layout>
  )
}
