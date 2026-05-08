// POSStockCheck.jsx — Weekly stock check tool (simple, mobile-first)
// Route: /pos/:branchId/stock-check

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Settings, X, Plus, Edit2, Trash2,
  CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp,
  ClipboardCheck, Save,
} from 'lucide-react'
import {
  getStockCheckItems, getLatestStockEntries, hasCheckThisWeek,
  getLastCheckInfo, saveStockCheckSession,
  createStockCheckItem, updateStockCheckItem, deleteStockCheckItem,
  getStockCheckReminder, upsertStockCheckReminder,
  getPOSBranch, getPOSProducts,
} from '../lib/pos-supabase'
import { createTask, getStaffProfiles, supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────
const PRIORITIES = [
  { key: 'critical',  label: 'Critical',     emoji: '🔴', color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    activeBg: 'bg-red-500/20' },
  { key: 'important', label: 'Important',    emoji: '🟡', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', activeBg: 'bg-yellow-500/20' },
  { key: 'low',       label: 'Low Priority', emoji: '🟢', color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  activeBg: 'bg-green-500/20' },
]

const STATUS_OPTS = [
  { key: 'ok',  label: 'OK',  icon: CheckCircle,     cls: 'border-green-500  text-green-400',  activeCls: 'bg-green-500  text-white border-green-500'  },
  { key: 'low', label: 'Low', icon: AlertTriangle,   cls: 'border-yellow-500 text-yellow-400', activeCls: 'bg-yellow-500 text-white border-yellow-500' },
  { key: 'out', label: 'Out', icon: XCircle,         cls: 'border-red-500    text-red-400',    activeCls: 'bg-red-500    text-white border-red-500'    },
]

const UNITS = ['units', 'kg', 'g', 'L', 'ml', 'boxes', 'bags', 'packs', 'portions', 'pieces']

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

// ── Item Edit Modal ────────────────────────────────────────────
function ItemModal({ item, branchId, onSave, onClose }) {
  const [name, setName] = useState(item?.name || '')
  const [priority, setPriority] = useState(item?.priority || 'important')
  const [unit, setUnit] = useState(item?.unit || 'units')
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState(item?.id ? 'custom' : 'pick')  // 'pick' | 'custom'

  useEffect(() => {
    if (!item?.id) {
      getPOSProducts(branchId)
        .then(p => setProducts(p || []))
        .catch(() => {})
    }
  }, [branchId, item?.id])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const handlePick = (product) => {
    setName(product.name)
    setTab('custom')  // switch to confirm/edit view after picking
  }

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Item name is required')
    setSaving(true)
    try {
      if (item?.id) {
        await updateStockCheckItem(item.id, { name: name.trim(), priority, unit })
      } else {
        await createStockCheckItem({ branch_id: branchId, name: name.trim(), priority, unit })
      }
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <h3 className="text-white font-bold">{item?.id ? 'Edit Item' : 'Add Item'}</h3>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>

        {/* Tabs — only for new items */}
        {!item?.id && (
          <div className="flex gap-1 mx-5 mb-3 p-1 bg-noch-dark rounded-xl shrink-0">
            {[['pick', 'From Product List'], ['custom', 'Custom Name']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === k ? 'bg-noch-card text-white shadow' : 'text-noch-muted hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 pb-5">

          {/* Pick from products tab */}
          {tab === 'pick' && !item?.id && (
            <div>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input w-full mb-3"
                placeholder="Search products…"
                autoFocus
              />
              {filtered.length === 0 ? (
                <p className="text-noch-muted text-sm text-center py-4">
                  {search ? 'No products match' : 'No products found'}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {filtered.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handlePick(p)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-noch-dark text-left transition-colors group"
                    >
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-noch-dark flex items-center justify-center shrink-0">
                          <span className="text-noch-muted text-xs">?</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm group-hover:text-noch-green transition-colors truncate">{p.name}</p>
                        {p.pos_categories?.name && (
                          <p className="text-noch-muted text-xs">{p.pos_categories.name}</p>
                        )}
                      </div>
                      <Plus size={14} className="text-noch-muted group-hover:text-noch-green shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setTab('custom')}
                className="w-full mt-3 py-2 text-xs text-noch-muted hover:text-white border border-dashed border-noch-border rounded-xl transition-colors"
              >
                + Type a custom name instead
              </button>
            </div>
          )}

          {/* Custom / confirm tab */}
          {(tab === 'custom' || item?.id) && (
            <div>
              <label className="label block mb-1">Item name *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="input w-full mb-4"
                placeholder="e.g. Fresh Milk"
                autoFocus={tab === 'custom'}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />

              <label className="label block mb-2">Priority</label>
              <div className="flex gap-2 mb-4">
                {PRIORITIES.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPriority(p.key)}
                    className={`flex-1 py-2 px-1 rounded-xl border text-xs font-semibold transition-all ${
                      priority === p.key
                        ? `${p.activeBg} ${p.color} ${p.border}`
                        : 'border-noch-border text-noch-muted hover:text-white'
                    }`}
                  >
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>

              <label className="label block mb-1">Default unit</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="input w-full mb-5"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>

              <div className="flex gap-3">
                <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Saving…' : (item?.id ? 'Update' : 'Add Item')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Single item row (check mode) ───────────────────────────────
function CheckItem({ item, latestEntry, draftEntry, onChange }) {
  const [expanded, setExpanded] = useState(false)
  const status = draftEntry?.status || latestEntry?.status || null
  const isChanged = draftEntry?.status != null

  const handleStatus = (newStatus) => {
    const shouldExpand = newStatus === 'low' || newStatus === 'out'
    setExpanded(shouldExpand)
    onChange({ ...draftEntry, status: newStatus, unit: draftEntry?.unit || item.unit })
  }

  return (
    <div className={`rounded-xl border mb-2 transition-all ${
      status === 'out' ? 'border-red-500/40 bg-red-500/5' :
      status === 'low' ? 'border-yellow-500/40 bg-yellow-500/5' :
      status === 'ok'  ? 'border-green-500/30 bg-green-500/5' :
                         'border-noch-border bg-noch-card'
    }`}>
      <div className="flex items-center gap-3 p-3">
        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium leading-tight">{item.name}</p>
          {latestEntry && !isChanged && (
            <p className="text-noch-muted text-xs mt-0.5">
              Last: <span className={
                latestEntry.status === 'out' ? 'text-red-400' :
                latestEntry.status === 'low' ? 'text-yellow-400' : 'text-green-400'
              }>{latestEntry.status}</span>
            </p>
          )}
        </div>

        {/* Status buttons */}
        <div className="flex gap-1.5 shrink-0">
          {STATUS_OPTS.map(s => {
            const Icon = s.icon
            const active = status === s.key
            return (
              <button
                key={s.key}
                onClick={() => handleStatus(s.key)}
                className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs font-bold transition-all min-w-[52px] justify-center
                  ${active ? s.activeCls : `border-noch-border text-noch-muted hover:${s.cls}`}`}
                style={{ minHeight: 44 }}
              >
                <Icon size={12} />
                <span>{s.label}</span>
              </button>
            )
          })}
        </div>

        {/* Expand toggle for qty/note */}
        {status && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-noch-muted hover:text-white shrink-0 ml-1"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {/* Expandable qty + note */}
      {expanded && status && (
        <div className="px-3 pb-3 flex flex-col gap-2 border-t border-noch-border/50 pt-3">
          <div className="flex gap-2">
            <input
              type="number"
              value={draftEntry?.qty || ''}
              onChange={e => onChange({ ...draftEntry, qty: e.target.value })}
              placeholder="Qty"
              className="input flex-1 py-2 text-sm"
              min={0}
              step={0.1}
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
            placeholder="Note (optional)"
            className="input text-sm resize-none py-2"
            rows={2}
          />
        </div>
      )}
    </div>
  )
}

// ── Collapsible section ────────────────────────────────────────
function PrioritySection({ pConfig, items, latestMap, draftMap, onItemChange, setupMode, onEdit, onDelete, onAdd }) {
  const [open, setOpen] = useState(true)
  const flagged = items.filter(i => {
    const s = draftMap[i.id]?.status || latestMap[i.id]?.status
    return s === 'low' || s === 'out'
  }).length

  return (
    <div className={`mb-4 rounded-2xl border overflow-hidden ${pConfig.border} ${pConfig.bg}`}>
      {/* Section header */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5`}
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
        <div className="flex items-center gap-2">
          {setupMode && (
            <button
              onClick={e => { e.stopPropagation(); onAdd(pConfig.key) }}
              className="flex items-center gap-1 text-xs text-noch-green border border-noch-green/30 bg-noch-green/10 px-2.5 py-1 rounded-full hover:bg-noch-green/20 transition-colors"
            >
              <Plus size={11} /> Add
            </button>
          )}
          {open ? <ChevronUp size={16} className="text-noch-muted" /> : <ChevronDown size={16} className="text-noch-muted" />}
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1">
          {items.length === 0 ? (
            <p className="text-noch-muted text-xs text-center py-3">
              {setupMode ? `No ${pConfig.label.toLowerCase()} items yet — tap + Add` : `No ${pConfig.label.toLowerCase()} items`}
            </p>
          ) : setupMode ? (
            // Setup mode: show edit/delete controls
            items.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-2.5 border-b border-noch-border/40 last:border-0">
                <p className="flex-1 text-white text-sm">{item.name}
                  <span className="text-noch-muted text-xs ml-2">{item.unit}</span>
                </p>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => onEdit(item)} className="p-1.5 text-noch-muted hover:text-white rounded-lg hover:bg-noch-dark transition-colors">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => onDelete(item)} className="p-1.5 text-noch-muted hover:text-red-400 rounded-lg hover:bg-noch-dark transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            // Check mode: show status buttons
            items.map(item => (
              <CheckItem
                key={item.id}
                item={item}
                latestEntry={latestMap[item.id]}
                draftEntry={draftMap[item.id]}
                onChange={entry => onItemChange(item.id, entry)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────
export default function POSStockCheck() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const { user, isOwner } = useAuth()

  const [branch, setBranch]           = useState(null)
  const [items, setItems]             = useState([])
  const [latestMap, setLatestMap]     = useState({})   // { item_id: entry }
  const [draftMap, setDraftMap]       = useState({})   // { item_id: {status,qty,unit,note} }
  const [lastCheck, setLastCheck]     = useState(null)
  const [checkedThisWeek, setCheckedThisWeek] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [submitDone, setSubmitDone]   = useState(false)

  // Setup mode
  const [setupMode, setSetupMode]     = useState(false)
  const [editingItem, setEditingItem] = useState(null)   // null | item | {newPriority}
  const [addingPriority, setAddingPriority] = useState(null)

  // Reminder settings
  const [reminder, setReminder]       = useState(null)
  const [reminderDay, setReminderDay] = useState(3)
  const [reminderUser, setReminderUser] = useState('')
  const [reminderActive, setReminderActive] = useState(false)
  const [staffList, setStaffList]     = useState([])
  const [savingReminder, setSavingReminder] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch branch + items in parallel; make secondary fetches non-fatal
      const [b, its] = await Promise.all([
        getPOSBranch(branchId),
        getStockCheckItems(branchId),
      ])
      setBranch(b)
      setItems(its)

      // Secondary data — failures here don't blank the page
      const [lmap, done, lc] = await Promise.all([
        getLatestStockEntries(branchId).catch(err => { console.warn('[StockCheck] entries:', err.message); return {} }),
        hasCheckThisWeek(branchId).catch(() => false),
        getLastCheckInfo(branchId).catch(() => null),
      ])
      setLatestMap(lmap)
      setCheckedThisWeek(done)
      setLastCheck(lc)

      const rem = await getStockCheckReminder(branchId).catch(() => null)
      setReminder(rem)
      if (rem) {
        setReminderDay(rem.reminder_day)
        setReminderUser(rem.assigned_user_id || '')
        setReminderActive(rem.is_active)
      }

      if (isOwner) {
        try {
          const { data } = await supabase.from('profiles').select('id, full_name, role').eq('is_active', true).order('full_name')
          setStaffList(data || [])
        } catch {}
      }

      // Pre-populate draft from latest entries
      const preDraft = {}
      for (const [itemId, entry] of Object.entries(lmap)) {
        preDraft[itemId] = { status: entry.status, qty: entry.qty || '', unit: entry.unit, note: entry.note || '' }
      }
      setDraftMap(preDraft)

      // Check reminder
      if (rem?.is_active && rem?.assigned_user_id && user?.id) {
        maybeCreateReminderTask(rem, done, b)
      }
    } catch (err) {
      console.error('[StockCheck] load error', err)
      toast.error(`Stock check: ${err.message || 'Failed to load'}`)
    } finally {
      setLoading(false)
    }
  }, [branchId, isOwner, user])

  useEffect(() => { loadAll() }, [loadAll])

  async function maybeCreateReminderTask(rem, doneThisWeek, br) {
    if (!rem?.is_active || !rem.assigned_user_id) return
    if (doneThisWeek) return
    const today = new Date()
    const weekStart = getMonday(today)
    // Convert reminder_day (0=Sun) to this week's date
    const dayOffset = (rem.reminder_day === 0 ? 6 : rem.reminder_day - 1)
    const reminderDate = new Date(weekStart)
    reminderDate.setDate(weekStart.getDate() + dayOffset)
    if (today < reminderDate) return   // not yet the reminder day
    // Check if task already created this week
    if (rem.last_task_created_at) {
      if (new Date(rem.last_task_created_at) >= weekStart) return
    }
    try {
      await createTask({
        title: `⚠️ Stock Check Not Completed — ${br?.name || 'Branch'}`,
        description: 'The weekly stock check has not been submitted. Please open POS → Stock Check and complete it.',
        assigned_to: rem.assigned_user_id,
        created_by: user.id,
        priority: 'high',
        due_date: today.toISOString().slice(0, 10),
        is_group: false,
        has_attachments: false,
      })
      await upsertStockCheckReminder(branchId, { last_task_created_at: new Date().toISOString() })
    } catch (err) {
      console.warn('[StockCheck] reminder task failed:', err.message)
    }
  }

  const handleItemChange = (itemId, entry) => {
    setDraftMap(d => ({ ...d, [itemId]: entry }))
    setSubmitDone(false)
  }

  const handleSubmit = async () => {
    const entries = Object.entries(draftMap)
      .filter(([, e]) => e?.status)
      .map(([item_id, e]) => ({ item_id, ...e }))
    if (!entries.length) { toast('No items updated — tap a status on at least one item.', { icon: 'ℹ️' }); return }
    setSaving(true)
    try {
      await saveStockCheckSession(branchId, entries, user?.id)
      // Reload latest
      const [lmap, done, lc] = await Promise.all([
        getLatestStockEntries(branchId),
        hasCheckThisWeek(branchId),
        getLastCheckInfo(branchId),
      ])
      setLatestMap(lmap)
      setCheckedThisWeek(done)
      setLastCheck(lc)
      setSubmitDone(true)
      toast.success(`Check submitted — ${entries.length} item${entries.length !== 1 ? 's' : ''} saved`)
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteItem = async (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return
    try {
      await deleteStockCheckItem(item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success('Item removed')
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    }
  }

  const handleSaveReminder = async () => {
    setSavingReminder(true)
    try {
      await upsertStockCheckReminder(branchId, {
        reminder_day: reminderDay,
        assigned_user_id: reminderUser || null,
        is_active: reminderActive,
      })
      toast.success('Reminder settings saved')
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSavingReminder(false)
    }
  }

  // Group items by priority
  const byPriority = {}
  PRIORITIES.forEach(p => { byPriority[p.key] = [] })
  items.forEach(item => {
    if (byPriority[item.priority]) byPriority[item.priority].push(item)
  })

  const updatedCount = Object.values(draftMap).filter(e => e?.status).length

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center py-20 text-noch-muted">
        <div className="w-6 h-6 border-2 border-noch-border border-t-noch-green rounded-full animate-spin mr-3" />
        Loading…
      </div>
    </Layout>
  )

  return (
    <Layout>
      <div className="max-w-lg mx-auto pb-28">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(`/pos/${branchId}/settings`)} className="p-2 text-noch-muted hover:text-white rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold flex items-center gap-2">
              <ClipboardCheck size={18} className="text-noch-green" />
              Stock Check
            </h1>
            <p className="text-noch-muted text-xs">{branch?.name}</p>
          </div>
          {isOwner && (
            <button
              onClick={() => setSetupMode(s => !s)}
              className={`p-2 rounded-xl border transition-all ${
                setupMode
                  ? 'bg-noch-green/10 text-noch-green border-noch-green/30'
                  : 'text-noch-muted border-noch-border hover:text-white'
              }`}
              title="Setup"
            >
              {setupMode ? <X size={16} /> : <Settings size={16} />}
            </button>
          )}
        </div>

        {/* Last check banner */}
        {!setupMode && (
          <div className={`rounded-xl border px-4 py-3 mb-4 flex items-center gap-3 ${
            checkedThisWeek
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-yellow-500/10 border-yellow-500/30'
          }`}>
            {checkedThisWeek
              ? <CheckCircle size={16} className="text-green-400 shrink-0" />
              : <AlertTriangle size={16} className="text-yellow-400 shrink-0" />
            }
            <div className="min-w-0">
              {checkedThisWeek
                ? <p className="text-green-400 text-sm font-medium">Checked this week ✓</p>
                : <p className="text-yellow-400 text-sm font-medium">No check submitted this week</p>
              }
              {lastCheck && (
                <p className="text-noch-muted text-xs mt-0.5">
                  Last: {new Date(lastCheck.checked_at).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}
                  {lastCheck.checked_by_name && ` · ${lastCheck.checked_by_name}`}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── SETUP MODE ──────────────────────────────────────── */}
        {setupMode && (
          <div className="mb-4">
            <div className="card mb-4">
              <p className="text-noch-muted text-xs uppercase tracking-wider font-semibold mb-3">Items</p>
              {PRIORITIES.map(pConfig => (
                <PrioritySection
                  key={pConfig.key}
                  pConfig={pConfig}
                  items={byPriority[pConfig.key]}
                  latestMap={latestMap}
                  draftMap={draftMap}
                  onItemChange={handleItemChange}
                  setupMode
                  onEdit={item => setEditingItem(item)}
                  onDelete={handleDeleteItem}
                  onAdd={priority => setAddingPriority(priority)}
                />
              ))}
            </div>

            {/* Reminder settings (owner only) */}
            <div className="card">
              <p className="text-noch-muted text-xs uppercase tracking-wider font-semibold mb-3">Reminder Settings</p>

              <div className="flex items-center justify-between mb-4">
                <span className="text-white text-sm">Send reminder if no check by:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-noch-muted text-xs">{reminderActive ? 'On' : 'Off'}</span>
                  <div
                    onClick={() => setReminderActive(a => !a)}
                    className={`w-10 h-6 rounded-full border-2 transition-colors cursor-pointer flex items-center px-0.5 ${
                      reminderActive ? 'bg-noch-green border-noch-green' : 'bg-noch-dark border-noch-border'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${reminderActive ? 'translate-x-4' : ''}`} />
                  </div>
                </label>
              </div>

              {/* Day picker */}
              <div className="flex gap-1.5 mb-4">
                {DAYS.map((day, i) => (
                  <button
                    key={i}
                    onClick={() => setReminderDay(i)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      reminderDay === i
                        ? 'bg-noch-green/10 text-noch-green border-noch-green/30'
                        : 'border-noch-border text-noch-muted hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              {/* Staff picker */}
              <label className="label block mb-1">Assign reminder to</label>
              <select
                value={reminderUser}
                onChange={e => setReminderUser(e.target.value)}
                className="input w-full mb-4"
              >
                <option value="">— select staff —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>

              <button
                onClick={handleSaveReminder}
                disabled={savingReminder}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Save size={14} />
                {savingReminder ? 'Saving…' : 'Save Reminder Settings'}
              </button>

              {reminder?.is_active && reminder?.last_task_created_at && (
                <p className="text-noch-muted text-xs text-center mt-2">
                  Last task created: {new Date(reminder.last_task_created_at).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── CHECK MODE ──────────────────────────────────────── */}
        {!setupMode && (
          <>
            {items.length === 0 ? (
              <div className="card text-center py-10 text-noch-muted">
                <ClipboardCheck size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No items configured yet.</p>
                {isOwner && (
                  <button
                    onClick={() => setSetupMode(true)}
                    className="btn-primary mt-4 text-sm flex items-center gap-2 mx-auto"
                  >
                    <Settings size={14} /> Set up items
                  </button>
                )}
              </div>
            ) : (
              PRIORITIES.map(pConfig => (
                <PrioritySection
                  key={pConfig.key}
                  pConfig={pConfig}
                  items={byPriority[pConfig.key]}
                  latestMap={latestMap}
                  draftMap={draftMap}
                  onItemChange={handleItemChange}
                  setupMode={false}
                />
              ))
            )}
          </>
        )}

        {/* Submit success banner */}
        {submitDone && !setupMode && (
          <div className="rounded-xl bg-green-500/15 border border-green-500/30 px-4 py-3 mb-4 flex items-center gap-3">
            <CheckCircle size={18} className="text-green-400 shrink-0" />
            <div>
              <p className="text-green-400 font-semibold text-sm">Check submitted!</p>
              <p className="text-noch-muted text-xs">{new Date().toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</p>
            </div>
          </div>
        )}
      </div>

      {/* Fixed submit button */}
      {!setupMode && items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-noch-bg border-t border-noch-border">
          <div className="max-w-lg mx-auto">
            <button
              onClick={handleSubmit}
              disabled={saving || updatedCount === 0}
              className="btn-primary w-full py-4 text-base font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
              ) : (
                <><ClipboardCheck size={18} /> Submit Check{updatedCount > 0 ? ` · ${updatedCount} item${updatedCount !== 1 ? 's' : ''}` : ''}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Item add/edit modal */}
      {(editingItem || addingPriority) && (
        <ItemModal
          item={editingItem || { priority: addingPriority }}
          branchId={branchId}
          onSave={async () => {
            setEditingItem(null)
            setAddingPriority(null)
            const its = await getStockCheckItems(branchId)
            setItems(its)
            toast.success('Item saved')
          }}
          onClose={() => { setEditingItem(null); setAddingPriority(null) }}
        />
      )}
    </Layout>
  )
}
