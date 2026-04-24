// InventoryHub.jsx — Inventory landing page with proactive stock review system
// Features: consumption-based days-to-out, twice-weekly review banner, alert prefs, Telegram report

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, ShoppingCart, AlertTriangle, CheckCircle, TrendingDown,
  Bell, BellOff, Send, Users, Clock, RefreshCw, ChevronDown,
  ChevronUp, Loader2, MessageCircle, Settings, Lock, ClipboardList,
} from 'lucide-react'
import Layout from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { supabase } from '../lib/supabase'
import { sendTelegram } from '../lib/telegram'
import { getPOSBranches, getAllLatestStockEntries } from '../modules/pos/lib/pos-supabase'
import toast from 'react-hot-toast'

// ── Review day detection ─────────────────────────────────────
function isReviewDay() {
  const day = new Date().getDay() // 0=Sun, 3=Wed
  return day === 0 || day === 3
}

// ── Status helpers ───────────────────────────────────────────
function calcDaysToOut(qty, consumptionRate, manualRate) {
  const rate = consumptionRate > 0 ? consumptionRate : (manualRate || 0)
  if (!rate || qty <= 0) return qty <= 0 ? 0 : null
  return Math.round(qty / rate)
}

function flagLevel(item) {
  if (item.qty_available <= 0) return 'out'
  if (item.min_threshold > 0 && item.qty_available <= item.min_threshold) return 'low'
  if (item.daysToOut !== null && item.daysToOut < 7) return 'urgent'
  if (item.daysToOut !== null && item.daysToOut <= 14) return 'watch'
  return 'ok'
}

const FLAG_META = {
  out:    { label: 'OUT',    color: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/20' },
  low:    { label: 'LOW',    color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  urgent: { label: 'URGENT', color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  watch:  { label: 'WATCH',  color: 'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/20' },
  ok:     { label: 'OK',     color: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/20' },
}

function FlagBadge({ level }) {
  const m = FLAG_META[level] || FLAG_META.ok
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${m.bg} ${m.color} ${m.border}`}>
      {m.label}
    </span>
  )
}

// ── Alert Preferences Panel ──────────────────────────────────
function AlertPrefsPanel({ userId, hasTelegram }) {
  const [prefs, setPrefs] = useState({ in_app: true, telegram: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('inventory_alert_prefs').select('*').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data) setPrefs({ in_app: data.in_app, telegram: data.telegram }) })
  }, [userId])

  async function toggle(key) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setSaving(true)
    await supabase.from('inventory_alert_prefs')
      .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="text-xs text-noch-muted flex items-center gap-1">
        <Bell size={12} /> Alert channels:
      </span>
      {[
        { key: 'in_app', label: 'In-app' },
        { key: 'telegram', label: 'Telegram', disabled: !hasTelegram },
      ].map(({ key, label, disabled }) => (
        <button key={key} onClick={() => !disabled && toggle(key)}
          disabled={disabled || saving}
          title={disabled ? 'Connect Telegram in your profile first' : undefined}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors
            ${prefs[key] && !disabled
              ? 'bg-noch-green/10 text-noch-green border-noch-green/30'
              : 'bg-noch-card text-noch-muted border-noch-border'
            }
            ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-80'}`}>
          {prefs[key] && !disabled ? <Bell size={11} /> : <BellOff size={11} />}
          {label}
          {disabled && <span className="opacity-60">(not set)</span>}
        </button>
      ))}
    </div>
  )
}

// ── Flagged Items Panel ──────────────────────────────────────
function FlaggedPanel({ items, loading }) {
  const [expanded, setExpanded] = useState(true)

  const flagged = items.filter(i => ['out', 'low', 'urgent'].includes(i.flag))

  if (!flagged.length && !loading) return null

  return (
    <div className="bg-noch-card border border-red-500/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-red-500/5 transition-colors">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-400" />
          <span className="text-red-400 font-semibold text-sm">
            {loading ? 'Loading…' : `${flagged.length} item${flagged.length !== 1 ? 's' : ''} need attention`}
          </span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-noch-muted" /> : <ChevronDown size={16} className="text-noch-muted" />}
      </button>

      {expanded && (
        <div className="border-t border-noch-border">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-noch-muted">
              <Loader2 size={16} className="animate-spin mr-2" /> Computing…
            </div>
          ) : (
            <div className="divide-y divide-noch-border">
              {flagged.map(item => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.name}</p>
                    <p className="text-noch-muted text-xs">
                      {item.qty_available} {item.unit}
                      {item.min_threshold > 0 && ` · min: ${item.min_threshold}`}
                      {item.consumptionSource && (
                        <span className="ml-1 opacity-70">
                          · {item.consumptionSource === 'logs' ? '📊 from logs' : '📝 manual estimate'}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.daysToOut !== null && (
                      <span className={`text-xs tabular-nums ${
                        item.daysToOut <= 3 ? 'text-red-400' : item.daysToOut <= 7 ? 'text-orange-400' : 'text-yellow-400'
                      }`}>
                        {item.daysToOut === 0 ? 'OUT' : `~${item.daysToOut}d`}
                      </span>
                    )}
                    <FlagBadge level={item.flag} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Send Telegram Report ─────────────────────────────────────
async function sendStockReport(flaggedItems, senderProfile) {
  // Load all users with Telegram connected + inventory alerts on
  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, telegram_chat_id')
    .not('telegram_chat_id', 'is', null)

  const { data: prefs } = await supabase
    .from('inventory_alert_prefs')
    .select('user_id, telegram')

  const prefsMap = {}
  prefs?.forEach(p => { prefsMap[p.user_id] = p })

  // Users with telegram enabled (default: enabled if no pref row)
  const targets = (users || []).filter(u => {
    const pref = prefsMap[u.id]
    return !pref || pref.telegram !== false
  })

  if (!targets.length) throw new Error('No Telegram recipients configured')

  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]
  const date = new Date().toLocaleDateString('en-GB')

  const lines = flaggedItems.map(item => {
    const status = item.flag === 'out' ? '🔴 OUT' : item.flag === 'low' ? '🟡 LOW' : '🟠 URGENT'
    const days = item.daysToOut !== null ? ` (~${item.daysToOut}d left)` : ''
    return `${status} ${item.name} — ${item.qty_available} ${item.unit}${days}`
  })

  const msg = [
    `📦 *Stock Review — ${day} ${date}*`,
    `Sent by: ${senderProfile?.full_name || 'Manager'}`,
    '',
    ...lines,
    '',
    `_${flaggedItems.length} item${flaggedItems.length !== 1 ? 's' : ''} flagged — please update stock or arrange reorder._`,
  ].join('\n')

  let sent = 0
  for (const user of targets) {
    try {
      await sendTelegram(user.telegram_chat_id, msg)
      sent++
    } catch {}
  }

  // Log the alert
  await supabase.from('stock_alert_log').insert({
    flagged_count: flaggedItems.length,
    sent_telegram: sent > 0,
    summary: `${flaggedItems.length} flagged · ${sent}/${targets.length} Telegram sent`,
  })

  return { sent, total: targets.length }
}

// ── Main Hub ─────────────────────────────────────────────────
export default function InventoryHub() {
  const { user, profile, isOwner } = useAuth()
  const { hasAccess } = usePermissions()
  const navigate = useNavigate()

  const canManageInventory = isOwner || hasAccess('suppliers')

  const [items, setItems] = useState([])        // merged stock + consumption
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [reviewDay] = useState(isReviewDay())
  const [lastAlert, setLastAlert] = useState(null)
  const [stockCheckMap, setStockCheckMap] = useState({})

  useEffect(() => {
    loadData()
    getAllLatestStockEntries().then(m => setStockCheckMap(m || {})).catch(() => {})
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [stockRes, consumptionRes, alertRes] = await Promise.all([
        supabase.from('stock').select('*, ingredient:ingredients(id, name, base_unit)'),
        Promise.resolve(supabase.from('ingredient_consumption').select('*')).catch(() => ({ data: [] })),
        Promise.resolve(supabase.from('stock_alert_log').select('triggered_at, summary').order('triggered_at', { ascending: false }).limit(1).maybeSingle()).catch(() => ({ data: null })),
      ])

      // Surface the real error if the stock query was denied/failed
      if (stockRes.error) throw new Error(stockRes.error.message || stockRes.error.code || 'stock query failed')

      const stockData = stockRes.data || []
      const consumptionData = consumptionRes.data || []
      const consumptionMap = {}
      consumptionData.forEach(c => { consumptionMap[c.ingredient_id] = c })

      const merged = stockData.map(s => {
        const ing = s.ingredient || {}
        const cons = consumptionMap[s.ingredient_id]
        const rate30d = cons?.avg_daily_usage_30d || 0
        const manualRate = 0
        const daysToOut = calcDaysToOut(s.qty_available, rate30d, manualRate)
        const consumptionSource = rate30d > 0 ? 'logs' : manualRate > 0 ? 'manual' : null
        const item = {
          id: s.ingredient_id,
          name: ing.name || 'Unknown',
          qty_available: parseFloat(s.qty_available) || 0,
          unit: s.unit || ing.base_unit || '',
          min_threshold: parseFloat(s.min_threshold) || 0,
          daysToOut,
          consumptionSource,
          avgDailyUsage: rate30d || manualRate,
        }
        item.flag = flagLevel(item)
        return item
      })

      setItems(merged)
      setLastAlert(alertRes.data)
    } catch (err) {
      console.error('[InventoryHub] loadData error:', err)
      toast.error(`Inventory error: ${err.message || 'unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  const total = items.length
  const outItems = items.filter(i => i.flag === 'out')
  const lowItems = items.filter(i => i.flag === 'low')
  const urgentItems = items.filter(i => i.flag === 'urgent')
  const watchItems = items.filter(i => i.flag === 'watch')
  const flaggedItems = [...outItems, ...lowItems, ...urgentItems]

  const scEntries = Object.values(stockCheckMap)
  const outCount  = scEntries.filter(e => e.status === 'out').length
  const lowCount  = scEntries.filter(e => e.status === 'low').length

  async function handleSendReport() {
    if (!flaggedItems.length) { toast('Nothing to report — all items look good!', { icon: '✅' }); return }
    setSending(true)
    try {
      const { sent, total: targetCount } = await sendStockReport(flaggedItems, profile)
      toast.success(`Stock report sent to ${sent}/${targetCount} recipients`)
      setLastAlert({ triggered_at: new Date().toISOString(), summary: `${flaggedItems.length} flagged · ${sent}/${targetCount} Telegram sent` })
    } catch (err) {
      toast.error(err.message || 'Failed to send report')
    } finally {
      setSending(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Inventory</h1>
            <p className="text-noch-muted text-sm mt-1">Stock levels and supply management</p>
          </div>
          <button onClick={loadData} className="p-2 text-noch-muted hover:text-white rounded-lg hover:bg-noch-card transition-colors" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Review day banner */}
        {reviewDay && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Clock size={18} className="text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-400 font-semibold text-sm">Stock Review Day</p>
                <p className="text-blue-400/70 text-xs mt-0.5">
                  Today is a scheduled review day (Sun / Wed). Check flagged items below and update stock levels.
                </p>
                {lastAlert && (
                  <p className="text-blue-400/50 text-xs mt-1">
                    Last report: {new Date(lastAlert.triggered_at).toLocaleDateString('en-GB')} · {lastAlert.summary}
                  </p>
                )}
              </div>
            </div>
            {(isOwner || hasAccess('inventory')) && (
              <button
                onClick={handleSendReport}
                disabled={sending}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium hover:bg-blue-500/30 disabled:opacity-50">
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Send Report
              </button>
            )}
          </div>
        )}

        {/* Flagged items panel */}
        <FlaggedPanel items={items} loading={loading} />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Tracked', value: total, color: 'text-white' },
            { label: 'Low Stock', value: lowItems.length + urgentItems.length, color: 'text-yellow-400' },
            { label: 'Out of Stock', value: outItems.length, color: 'text-red-400' },
            { label: 'Watch (14d)', value: watchItems.length, color: 'text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-noch-card border border-noch-border rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{loading ? '—' : value}</p>
              <p className="text-noch-muted text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Weekly Stock Check */}
        <button
          onClick={() => navigate('/inventory/stock-check')}
          className="w-full bg-noch-card border border-noch-border rounded-xl p-5 text-left hover:border-noch-green/50 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-noch-green/10 flex items-center justify-center shrink-0">
                <ClipboardList size={20} className="text-noch-green" />
              </div>
              <div>
                <h2 className="text-white font-semibold group-hover:text-noch-green transition-colors">Weekly Stock Check</h2>
                <p className="text-noch-muted text-sm">All locations · OK / Low / Out per item</p>
              </div>
            </div>
            {(outCount > 0 || lowCount > 0) ? (
              <div className="flex gap-2 shrink-0">
                {outCount > 0 && <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">{outCount} out</span>}
                {lowCount > 0 && <span className="text-xs font-bold px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">{lowCount} low</span>}
              </div>
            ) : null}
          </div>
        </button>

        {/* Navigation cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Stock Levels */}
          <button onClick={() => navigate('/inventory/stock')}
            className="bg-noch-card border border-noch-border rounded-xl p-6 text-left hover:border-noch-green/50 transition-colors group">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-noch-green/10 flex items-center justify-center">
                <Package size={20} className="text-noch-green" />
              </div>
              <h2 className="text-white font-semibold text-lg group-hover:text-noch-green transition-colors">Stock Levels</h2>
            </div>
            <p className="text-noch-muted text-sm">Update quantities, view days-to-out, manage tiers</p>
            <div className="flex items-center gap-4 mt-4 text-xs">
              <span className="text-green-400 flex items-center gap-1">
                <CheckCircle size={13} />
                {items.filter(i => i.flag === 'ok').length} OK
              </span>
              {(lowItems.length + urgentItems.length) > 0 && (
                <span className="text-yellow-400 flex items-center gap-1">
                  <AlertTriangle size={13} />
                  {lowItems.length + urgentItems.length} Low
                </span>
              )}
              {outItems.length > 0 && (
                <span className="text-red-400 flex items-center gap-1">
                  <TrendingDown size={13} />
                  {outItems.length} Out
                </span>
              )}
            </div>
          </button>

          {/* Suppliers — owner/supervisor only */}
          {canManageInventory ? (
            <button onClick={() => navigate('/inventory/suppliers')}
              className="bg-noch-card border border-noch-border rounded-xl p-6 text-left hover:border-noch-green/50 transition-colors group">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users size={20} className="text-blue-400" />
                </div>
                <h2 className="text-white font-semibold text-lg group-hover:text-noch-green transition-colors">Suppliers</h2>
              </div>
              <p className="text-noch-muted text-sm">Manage supplier contacts, categories, and terms</p>
            </button>
          ) : null}

          {/* Procurement — owner only, shaded + locked for others */}
          <div className="relative">
            {isOwner ? (
              <button onClick={() => navigate('/inventory/procurement')}
                className="w-full bg-noch-card border border-noch-border rounded-xl p-6 text-left hover:border-noch-green/50 transition-colors group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <ShoppingCart size={20} className="text-purple-400" />
                  </div>
                  <h2 className="text-white font-semibold text-lg group-hover:text-noch-green transition-colors">Procurement</h2>
                </div>
                <p className="text-noch-muted text-sm">Track orders, costs, shipping, customs, and receiving</p>
              </button>
            ) : (
              <div className="w-full bg-noch-card border border-noch-border rounded-xl p-6 opacity-50 select-none cursor-not-allowed">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <ShoppingCart size={20} className="text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-white font-semibold text-lg">Procurement</h2>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Lock size={11} className="text-noch-muted" />
                      <span className="text-xs text-noch-muted">Owner access only · Contact manager to reorder</span>
                    </div>
                  </div>
                </div>
                <p className="text-noch-muted text-sm">Order tracking and cost management</p>
              </div>
            )}
          </div>
        </div>

        {/* Alert preferences */}
        <div className="bg-noch-card border border-noch-border rounded-xl px-4 py-3">
          <AlertPrefsPanel
            userId={user?.id}
            hasTelegram={!!profile?.telegram_chat_id}
          />
          {!profile?.telegram_chat_id && (
            <p className="text-xs text-noch-muted mt-2">
              To enable Telegram alerts, add your Telegram Chat ID in Staff settings.
            </p>
          )}
        </div>

        {/* Non-review day: manual send button */}
        {!reviewDay && isOwner && flaggedItems.length > 0 && (
          <button onClick={handleSendReport} disabled={sending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-noch-card border border-noch-border rounded-xl text-noch-muted text-sm hover:text-white hover:border-noch-green/30 transition-colors disabled:opacity-50">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
            {sending ? 'Sending…' : `Send stock report to team (${flaggedItems.length} flagged)`}
          </button>
        )}
      </div>
    </Layout>
  )
}
