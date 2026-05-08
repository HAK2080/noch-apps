// StockCheckAll.jsx — Combined stock check across all locations
// Route: /inventory/stock-check

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, ClipboardCheck,
} from 'lucide-react'
import {
  getAllStockCheckItems,
  getAllLatestStockEntries,
  bulkSaveStockEntries,
} from '../modules/pos/lib/pos-supabase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import toast from 'react-hot-toast'

const PRIORITIES = [
  { key: 'critical',  label: 'Critical',     emoji: '🔴', color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30' },
  { key: 'important', label: 'Important',    emoji: '🟡', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  { key: 'low',       label: 'Low Priority', emoji: '🟢', color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30' },
]

const STATUS_OPTS = [
  { key: 'ok',  label: 'OK',  Icon: CheckCircle,   activeCls: 'bg-green-500  text-white border-green-500',  cls: 'border-noch-border text-noch-muted' },
  { key: 'low', label: 'Low', Icon: AlertTriangle, activeCls: 'bg-yellow-500 text-white border-yellow-500', cls: 'border-noch-border text-noch-muted' },
  { key: 'out', label: 'Out', Icon: XCircle,       activeCls: 'bg-red-500    text-white border-red-500',    cls: 'border-noch-border text-noch-muted' },
]

const UNITS = ['units', 'kg', 'g', 'L', 'ml', 'boxes', 'bags', 'packs', 'portions', 'pieces']

function CheckRow({ item, latestEntry, draftEntry, onChange }) {
  const [expanded, setExpanded] = useState(false)
  const status = draftEntry?.status ?? latestEntry?.status ?? null

  const handleStatus = (s) => {
    setExpanded(s === 'low' || s === 'out')
    onChange({ ...draftEntry, status: s, unit: draftEntry?.unit || item.unit })
  }

  return (
    <div className={`rounded-xl border mb-2 transition-all ${
      status === 'out' ? 'border-red-500/40 bg-red-500/5' :
      status === 'low' ? 'border-yellow-500/40 bg-yellow-500/5' :
      status === 'ok'  ? 'border-green-500/30 bg-green-500/5' :
                         'border-noch-border bg-noch-card'
    }`}>
      <div className="flex items-center gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium leading-tight">{item.name}</p>
          <p className="text-noch-muted text-xs mt-0.5">{item.branch_name}</p>
          {latestEntry && !draftEntry?.status && (
            <p className="text-noch-muted text-xs">
              Last: <span className={
                latestEntry.status === 'out' ? 'text-red-400' :
                latestEntry.status === 'low' ? 'text-yellow-400' : 'text-green-400'
              }>{latestEntry.status}</span>
            </p>
          )}
        </div>

        <div className="flex gap-1.5 shrink-0">
          {STATUS_OPTS.map(({ key, label, Icon, activeCls, cls }) => (
            <button
              key={key}
              onClick={() => handleStatus(key)}
              className={`flex items-center gap-1 px-2.5 rounded-lg border text-xs font-bold transition-all min-w-[50px] justify-center ${
                status === key ? activeCls : cls
              }`}
              style={{ minHeight: 44 }}
            >
              <Icon size={12} /><span>{label}</span>
            </button>
          ))}
        </div>

        {status && (
          <button onClick={() => setExpanded(e => !e)} className="text-noch-muted hover:text-white shrink-0 ml-1">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {expanded && status && (
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-noch-border/50 pt-3">
          <div className="flex gap-2">
            <input
              type="number" min={0} step={0.1}
              value={draftEntry?.qty || ''}
              onChange={e => onChange({ ...draftEntry, qty: e.target.value })}
              placeholder="Qty"
              className="input flex-1 py-2 text-sm"
            />
            <select
              value={draftEntry?.unit || item.unit}
              onChange={e => onChange({ ...draftEntry, unit: e.target.value })}
              className="input py-2 text-sm"
            >
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <textarea
            value={draftEntry?.note || ''}
            onChange={e => onChange({ ...draftEntry, note: e.target.value })}
            placeholder="Note — e.g. move stock from Bloom (optional)"
            className="input text-sm resize-none py-2"
            rows={2}
          />
        </div>
      )}
    </div>
  )
}

function Section({ pConfig, items, latestMap, draftMap, onItemChange }) {
  const [open, setOpen] = useState(true)
  const flagged = items.filter(i => {
    const s = draftMap[i.id]?.status || latestMap[i.id]?.status
    return s === 'low' || s === 'out'
  }).length

  return (
    <div className={`mb-4 rounded-2xl border overflow-hidden ${pConfig.border} ${pConfig.bg}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{pConfig.emoji}</span>
          <span className={`font-bold text-sm ${pConfig.color}`}>{pConfig.label}</span>
          <span className="text-noch-muted text-xs">({items.length})</span>
          {flagged > 0 && !open && (
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">
              {flagged} flagged
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-noch-muted" /> : <ChevronDown size={16} className="text-noch-muted" />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1">
          {items.length === 0 ? (
            <p className="text-noch-muted text-xs text-center py-3">No {pConfig.label.toLowerCase()} items</p>
          ) : items.map(item => (
            <CheckRow
              key={item.id}
              item={item}
              latestEntry={latestMap[item.id]}
              draftEntry={draftMap[item.id]}
              onChange={entry => onItemChange(item.id, entry)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function StockCheckAll() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [items, setItems]       = useState([])
  const [latestMap, setLatestMap] = useState({})
  const [draftMap, setDraftMap]   = useState({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [submitDone, setSubmitDone] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [its, lmap] = await Promise.all([
        getAllStockCheckItems(),
        getAllLatestStockEntries().catch(() => ({})),
      ])
      setItems(its)
      setLatestMap(lmap)
      // Pre-fill draft from latest
      const pre = {}
      for (const [id, entry] of Object.entries(lmap)) {
        pre[id] = { status: entry.status, qty: entry.qty || '', unit: entry.unit, note: entry.note || '' }
      }
      setDraftMap(pre)
    } catch (err) {
      toast.error(`Load error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    const entries = Object.entries(draftMap)
      .filter(([, e]) => e?.status)
      .map(([item_id, e]) => {
        const item = items.find(i => i.id === item_id)
        return { item_id, branch_id: item?.branch_id, ...e }
      })
      .filter(e => e.branch_id)

    if (!entries.length) {
      toast('Tap a status on at least one item.', { icon: 'ℹ️' })
      return
    }
    setSaving(true)
    try {
      await bulkSaveStockEntries(entries, user?.id)
      const lmap = await getAllLatestStockEntries().catch(() => ({}))
      setLatestMap(lmap)
      setSubmitDone(true)
      toast.success(`${entries.length} item${entries.length !== 1 ? 's' : ''} saved`)
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Group by priority
  const byPriority = {}
  PRIORITIES.forEach(p => { byPriority[p.key] = [] })
  items.forEach(item => { if (byPriority[item.priority]) byPriority[item.priority].push(item) })

  const updatedCount = Object.values(draftMap).filter(e => e?.status).length

  // Summary counts across all locations
  const outCount = Object.values(latestMap).filter(e => e.status === 'out').length
  const lowCount = Object.values(latestMap).filter(e => e.status === 'low').length

  return (
    <Layout>
      <div className="max-w-lg mx-auto pb-28">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/inventory')} className="p-2 text-noch-muted hover:text-white rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold flex items-center gap-2">
              <ClipboardCheck size={18} className="text-noch-green" />
              Stock Check — All Locations
            </h1>
            <p className="text-noch-muted text-xs">{items.length} items across all branches</p>
          </div>
        </div>

        {/* Status summary */}
        {!loading && (outCount > 0 || lowCount > 0) && (
          <div className="flex gap-3 mb-4">
            {outCount > 0 && (
              <div className="flex-1 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-center">
                <p className="text-red-400 text-2xl font-bold">{outCount}</p>
                <p className="text-red-400/70 text-xs mt-0.5">Out of stock</p>
              </div>
            )}
            {lowCount > 0 && (
              <div className="flex-1 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 text-center">
                <p className="text-yellow-400 text-2xl font-bold">{lowCount}</p>
                <p className="text-yellow-400/70 text-xs mt-0.5">Running low</p>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-noch-muted">
            <div className="w-6 h-6 border-2 border-noch-border border-t-noch-green rounded-full animate-spin mr-3" />
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="card text-center py-10 text-noch-muted">
            <ClipboardCheck size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No items configured yet.</p>
            <p className="text-xs mt-1">Owner can add items from POS → Stock Check → ⚙ Setup.</p>
          </div>
        ) : (
          PRIORITIES.map(pConfig => (
            <Section
              key={pConfig.key}
              pConfig={pConfig}
              items={byPriority[pConfig.key]}
              latestMap={latestMap}
              draftMap={draftMap}
              onItemChange={(id, entry) => { setDraftMap(d => ({ ...d, [id]: entry })); setSubmitDone(false) }}
            />
          ))
        )}

        {/* Success banner */}
        {submitDone && (
          <div className="rounded-xl bg-green-500/15 border border-green-500/30 px-4 py-3 mb-4 flex items-center gap-3">
            <CheckCircle size={18} className="text-green-400 shrink-0" />
            <div>
              <p className="text-green-400 font-semibold text-sm">Check submitted!</p>
              <p className="text-noch-muted text-xs">
                {new Date().toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Fixed submit */}
      {!loading && items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-noch-bg border-t border-noch-border">
          <div className="max-w-lg mx-auto">
            <button
              onClick={handleSubmit}
              disabled={saving || updatedCount === 0}
              className="btn-primary w-full py-4 text-base font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                : <><ClipboardCheck size={18} /> Submit Check{updatedCount > 0 ? ` · ${updatedCount} item${updatedCount !== 1 ? 's' : ''}` : ''}</>
              }
            </button>
          </div>
        </div>
      )}
    </Layout>
  )
}
