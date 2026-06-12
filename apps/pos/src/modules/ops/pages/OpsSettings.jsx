// OpsSettings — manager-gated admin for the Ops Checklist module.
// Everything is data: enable/disable the whole module, configure reminders,
// CRUD shift windows, task templates, and inventory items. No deploys
// required to change content.

import { useEffect, useState } from 'react'
import { Settings, Plus, Save, Trash2, X, ClipboardList, Clock, Package, Bell } from 'lucide-react'
import Layout from '../../../components/Layout'
import { useLanguage } from '../../../contexts/LanguageContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { useOpsSettings } from '../lib/useOps'
import {
  updateOpsSettings,
  listShiftWindows, upsertShiftWindow, deleteShiftWindow,
  listInventoryItems, upsertInventoryItem, deleteInventoryItem,
  listTaskTemplates, upsertTaskTemplate, deleteTaskTemplate,
} from '../lib/ops-supabase'
import { AccessDenied } from '../../../components/shared/ProtectedFeature'
import toast from 'react-hot-toast'

export default function OpsSettings() {
  const { isOwner, canEdit, loading: permLoading } = usePermissions()
  const canManage = isOwner || canEdit('ops')
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { settings, refresh } = useOpsSettings()

  if (permLoading) return <Layout><p className="text-noch-muted text-center py-16">…</p></Layout>
  if (!canManage) return <Layout><AccessDenied message="Manager only." /></Layout>

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Settings className="text-noch-green" size={22} />
          <h1 className="text-2xl font-bold text-white">{ar ? 'إعدادات المهام' : 'Ops settings'}</h1>
        </div>

        <ModuleAndReminderCard settings={settings} onSaved={refresh} ar={ar} />
        <ShiftWindowsCard ar={ar} />
        <InventoryItemsCard ar={ar} />
        <TaskTemplatesCard ar={ar} />
      </div>
    </Layout>
  )
}

// ── Master + reminder controls ─────────────────────────────────────────
function ModuleAndReminderCard({ settings, onSaved, ar }) {
  const [moduleEnabled, setModuleEnabled] = useState(!!settings?.module_enabled)
  const [reminders, setReminders] = useState(settings?.reminders_enabled !== false)
  const [repeatCount, setRepeatCount] = useState(settings?.reminder_repeat_count ?? 2)
  const [repeatDelay, setRepeatDelay] = useState(settings?.reminder_repeat_delay_minutes ?? 30)
  const [persistentBadge, setPersistentBadge] = useState(settings?.persistent_badge_enabled !== false)
  const [restockAlerts, setRestockAlerts] = useState(settings?.restock_alerts_enabled !== false)
  const [generateAtHour, setGenerateAtHour] = useState(settings?.generate_at_hour ?? 5)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!settings) return
    setModuleEnabled(!!settings.module_enabled)
    setReminders(settings.reminders_enabled !== false)
    setRepeatCount(settings.reminder_repeat_count ?? 2)
    setRepeatDelay(settings.reminder_repeat_delay_minutes ?? 30)
    setPersistentBadge(settings.persistent_badge_enabled !== false)
    setRestockAlerts(settings.restock_alerts_enabled !== false)
    setGenerateAtHour(settings.generate_at_hour ?? 5)
  }, [settings])

  const save = async () => {
    setSaving(true)
    try {
      await updateOpsSettings({
        module_enabled: moduleEnabled,
        reminders_enabled: reminders,
        reminder_repeat_count: Math.max(1, Number(repeatCount) || 1),
        reminder_repeat_delay_minutes: Math.max(1, Number(repeatDelay) || 1),
        persistent_badge_enabled: persistentBadge,
        restock_alerts_enabled: restockAlerts,
        generate_at_hour: Math.min(23, Math.max(0, Number(generateAtHour) || 5)),
      })
      toast.success(ar ? 'تم الحفظ' : 'Saved')
      onSaved?.()
    } catch (err) { toast.error(err.message || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className={`card ${moduleEnabled ? '' : 'border-yellow-500/40'}`}>
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={16} className="text-noch-green" />
        <h2 className="text-white font-semibold">{ar ? 'الوحدة والتذكيرات' : 'Module & reminders'}</h2>
        {!moduleEnabled && (
          <span className="ms-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">
            {ar ? 'معطّلة' : 'DISABLED'}
          </span>
        )}
      </div>

      <label className="flex items-start gap-3 cursor-pointer mb-4 p-3 rounded-xl bg-noch-dark/40">
        <input type="checkbox" checked={moduleEnabled} onChange={e => setModuleEnabled(e.target.checked)} className="mt-1" />
        <div>
          <p className="text-white font-medium">{ar ? 'تفعيل وحدة المهام' : 'Enable the Ops Checklist module'}</p>
          <p className="text-noch-muted text-xs mt-1">
            {ar ? 'عند الإيقاف، لا تظهر القائمة ولا التذكيرات ولا تُنشأ المهام تلقائياً.'
                : 'When off, no nav entry, no popups, no badge, no daily instance generation.'}
          </p>
        </div>
      </label>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${moduleEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <label className="flex items-center justify-between gap-3 bg-noch-dark/30 rounded-lg p-3 cursor-pointer">
          <span className="text-sm text-white">{ar ? 'تفعيل التذكيرات' : 'Reminders enabled'}</span>
          <input type="checkbox" checked={reminders} onChange={e => setReminders(e.target.checked)} />
        </label>
        <div className="bg-noch-dark/30 rounded-lg p-3">
          <label className="block text-sm text-white mb-1">{ar ? 'عدد التذكيرات لكل وردية' : 'Reminder count per window'}</label>
          <input type="number" min="1" max="10" value={repeatCount} onChange={e => setRepeatCount(e.target.value)}
                 className="input w-20" />
        </div>
        <div className="bg-noch-dark/30 rounded-lg p-3">
          <label className="block text-sm text-white mb-1">{ar ? 'دقائق بين كل تذكير' : 'Delay between reminders (min)'}</label>
          <input type="number" min="1" max="240" value={repeatDelay} onChange={e => setRepeatDelay(e.target.value)}
                 className="input w-20" />
        </div>
        <label className="flex items-center justify-between gap-3 bg-noch-dark/30 rounded-lg p-3 cursor-pointer">
          <span className="text-sm text-white">{ar ? 'شارة دائمة بعد آخر تذكير' : 'Persistent badge after last reminder'}</span>
          <input type="checkbox" checked={persistentBadge} onChange={e => setPersistentBadge(e.target.checked)} />
        </label>
        <label className="flex items-center justify-between gap-3 bg-noch-dark/30 rounded-lg p-3 cursor-pointer">
          <span className="text-sm text-white">{ar ? 'تنبيهات إعادة التموين تلقائياً' : 'Auto restock alerts'}</span>
          <input type="checkbox" checked={restockAlerts} onChange={e => setRestockAlerts(e.target.checked)} />
        </label>
        <div className="bg-noch-dark/30 rounded-lg p-3">
          <label className="block text-sm text-white mb-1">{ar ? 'ساعة إنشاء مهام اليوم' : 'Daily generation hour (local)'}</label>
          <input type="number" min="0" max="23" value={generateAtHour} onChange={e => setGenerateAtHour(e.target.value)}
                 className="input w-20" />
          <p className="text-noch-muted text-[11px] mt-1">{settings?.timezone || 'Africa/Tripoli'}</p>
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <button onClick={save} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
          <Save size={13} /> {saving ? '…' : (ar ? 'حفظ' : 'Save')}
        </button>
      </div>
    </div>
  )
}

// ── Shift windows CRUD ────────────────────────────────────────────────
function ShiftWindowsCard({ ar }) {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)
  const reload = () => listShiftWindows().then(setRows)
  useEffect(() => { reload() }, [])

  const blank = { name_ar: '', name_en: '', start_time: '06:00', end_time: '11:00', sort_order: rows.length * 10, active: true }

  const save = async () => {
    try { await upsertShiftWindow(editing); setEditing(null); reload(); toast.success(ar ? 'تم الحفظ' : 'Saved') }
    catch (err) { toast.error(err.message || 'Save failed') }
  }
  const remove = async (id) => {
    if (!confirm(ar ? 'حذف الوردية؟ سيتم حذف المهام التابعة منها.' : 'Delete this window?')) return
    try { await deleteShiftWindow(id); reload() }
    catch (err) { toast.error(err.message || 'Delete failed') }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-noch-green" />
        <h2 className="text-white font-semibold">{ar ? 'الورديّات' : 'Shift windows'}</h2>
        <button onClick={() => setEditing(blank)} className="ms-auto btn-secondary text-xs flex items-center gap-1">
          <Plus size={12}/> {ar ? 'إضافة' : 'Add'}
        </button>
      </div>
      {editing && <WindowForm row={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} ar={ar}/>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-noch-muted text-xs">
            <tr>
              <th className="text-left py-1">{ar ? 'الاسم' : 'Name'}</th>
              <th className="text-left py-1">{ar ? 'من' : 'From'}</th>
              <th className="text-left py-1">{ar ? 'إلى' : 'To'}</th>
              <th className="text-left py-1">#</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(w => (
              <tr key={w.id} className={`border-t border-noch-border/40 ${!w.active ? 'opacity-50' : ''}`}>
                <td className="py-1.5 text-white">{w.name_en} · <span className="text-noch-muted">{w.name_ar}</span></td>
                <td className="py-1.5">{w.start_time?.slice(0, 5)}</td>
                <td className="py-1.5">{w.end_time?.slice(0, 5)}</td>
                <td className="py-1.5 text-noch-muted">{w.sort_order}</td>
                <td className="py-1.5 text-right">
                  <button onClick={() => setEditing(w)} className="text-noch-muted hover:text-white me-2 text-xs">{ar ? 'تعديل' : 'Edit'}</button>
                  <button onClick={() => remove(w.id)} className="text-red-400 hover:text-red-300 text-xs"><Trash2 size={12}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WindowForm({ row, onChange, onSave, onCancel, ar }) {
  const set = (k, v) => onChange({ ...row, [k]: v })
  return (
    <div className="bg-noch-dark/50 rounded-xl p-3 mb-3 grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
      <input className="input md:col-span-2" placeholder={ar ? 'الاسم (عربي)' : 'Name (Arabic)'} value={row.name_ar} onChange={e => set('name_ar', e.target.value)} />
      <input className="input md:col-span-2" placeholder={ar ? 'الاسم (إنجليزي)' : 'Name (English)'} value={row.name_en} onChange={e => set('name_en', e.target.value)} />
      <input type="time" className="input" value={row.start_time?.slice(0, 5) || ''} onChange={e => set('start_time', e.target.value)} />
      <input type="time" className="input" value={row.end_time?.slice(0, 5) || ''} onChange={e => set('end_time', e.target.value)} />
      <input type="number" className="input" placeholder="sort" value={row.sort_order ?? 0} onChange={e => set('sort_order', Number(e.target.value))} />
      <label className="flex items-center gap-2 text-white text-xs"><input type="checkbox" checked={row.active !== false} onChange={e => set('active', e.target.checked)} /> {ar ? 'مفعّلة' : 'Active'}</label>
      <div className="md:col-span-6 flex justify-end gap-2 mt-1">
        <button onClick={onCancel} className="btn-secondary text-xs">{ar ? 'إلغاء' : 'Cancel'}</button>
        <button onClick={onSave} className="btn-primary text-xs">{ar ? 'حفظ' : 'Save'}</button>
      </div>
    </div>
  )
}

// ── Inventory items CRUD ──────────────────────────────────────────────
function InventoryItemsCard({ ar }) {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)
  const reload = () => listInventoryItems().then(setRows)
  useEffect(() => { reload() }, [])

  const blank = { name_ar: '', name_en: '', unit: 'pcs', par_level: 0, active: true }
  const save = async () => {
    try { await upsertInventoryItem(editing); setEditing(null); reload(); toast.success(ar ? 'تم الحفظ' : 'Saved') }
    catch (err) { toast.error(err.message || 'Save failed') }
  }
  const remove = async (id) => {
    if (!confirm(ar ? 'حذف العنصر؟' : 'Delete this item?')) return
    try { await deleteInventoryItem(id); reload() }
    catch (err) { toast.error(err.message || 'Delete failed') }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Package size={16} className="text-noch-green" />
        <h2 className="text-white font-semibold">{ar ? 'عناصر المخزون (بار)' : 'Inventory items (par levels)'}</h2>
        <button onClick={() => setEditing(blank)} className="ms-auto btn-secondary text-xs flex items-center gap-1">
          <Plus size={12}/> {ar ? 'إضافة' : 'Add'}
        </button>
      </div>
      {editing && (
        <div className="bg-noch-dark/50 rounded-xl p-3 mb-3 grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
          <input className="input md:col-span-2" placeholder={ar ? 'الاسم (عربي)' : 'Name (Arabic)'} value={editing.name_ar} onChange={e => setEditing({ ...editing, name_ar: e.target.value })} />
          <input className="input md:col-span-2" placeholder={ar ? 'الاسم (إنجليزي)' : 'Name (English)'} value={editing.name_en} onChange={e => setEditing({ ...editing, name_en: e.target.value })} />
          <input className="input" placeholder={ar ? 'الوحدة' : 'Unit'} value={editing.unit} onChange={e => setEditing({ ...editing, unit: e.target.value })} />
          <input type="number" step="0.01" className="input" placeholder="par" value={editing.par_level} onChange={e => setEditing({ ...editing, par_level: Number(e.target.value) })} />
          <label className="flex items-center gap-2 text-white text-xs col-span-1"><input type="checkbox" checked={editing.active !== false} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> {ar ? 'مفعّل' : 'Active'}</label>
          <div className="md:col-span-6 flex justify-end gap-2 mt-1">
            <button onClick={() => setEditing(null)} className="btn-secondary text-xs">{ar ? 'إلغاء' : 'Cancel'}</button>
            <button onClick={save} className="btn-primary text-xs">{ar ? 'حفظ' : 'Save'}</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-noch-muted text-xs">
            <tr>
              <th className="text-left py-1">{ar ? 'الاسم' : 'Name'}</th>
              <th className="text-left py-1">{ar ? 'الوحدة' : 'Unit'}</th>
              <th className="text-right py-1">{ar ? 'الحد الأدنى' : 'Par'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(it => (
              <tr key={it.id} className={`border-t border-noch-border/40 ${!it.active ? 'opacity-50' : ''}`}>
                <td className="py-1.5 text-white">{it.name_en} · <span className="text-noch-muted">{it.name_ar}</span></td>
                <td className="py-1.5">{it.unit}</td>
                <td className="py-1.5 text-right font-mono">{it.par_level}</td>
                <td className="py-1.5 text-right">
                  <button onClick={() => setEditing(it)} className="text-noch-muted hover:text-white me-2 text-xs">{ar ? 'تعديل' : 'Edit'}</button>
                  <button onClick={() => remove(it.id)} className="text-red-400 hover:text-red-300 text-xs"><Trash2 size={12}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Task templates CRUD ───────────────────────────────────────────────
function TaskTemplatesCard({ ar }) {
  const [rows, setRows] = useState([])
  const [windows, setWindows] = useState([])
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)

  const reload = async () => {
    const [t, w, i] = await Promise.all([
      listTaskTemplates(), listShiftWindows({ activeOnly: true }), listInventoryItems({ activeOnly: true }),
    ])
    setRows(t); setWindows(w); setItems(i)
  }
  useEffect(() => { reload() }, [])

  const blank = {
    title_ar: '', title_en: '', description_ar: '', description_en: '',
    shift_window_id: windows[0]?.id || '', requires_value: false,
    inventory_item_id: null, sort_order: 0, active: true,
  }
  const save = async () => {
    if (!editing.shift_window_id) { toast.error(ar ? 'اختر وردية' : 'Pick a shift window'); return }
    try { await upsertTaskTemplate(editing); setEditing(null); reload(); toast.success(ar ? 'تم الحفظ' : 'Saved') }
    catch (err) { toast.error(err.message || 'Save failed') }
  }
  const remove = async (id) => {
    if (!confirm(ar ? 'حذف المهمة؟' : 'Delete this task?')) return
    try { await deleteTaskTemplate(id); reload() }
    catch (err) { toast.error(err.message || 'Delete failed') }
  }

  // Group by window
  const grouped = windows.map(w => ({
    window: w,
    tasks: rows.filter(r => r.shift_window_id === w.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  }))

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={16} className="text-noch-green" />
        <h2 className="text-white font-semibold">{ar ? 'مهام المهام' : 'Task templates'}</h2>
        <button onClick={() => setEditing(blank)} className="ms-auto btn-secondary text-xs flex items-center gap-1" disabled={windows.length === 0}>
          <Plus size={12}/> {ar ? 'مهمة جديدة' : 'New task'}
        </button>
      </div>
      {editing && (
        <div className="bg-noch-dark/50 rounded-xl p-3 mb-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <input className="input" placeholder={ar ? 'العنوان (عربي)' : 'Title (Arabic)'} value={editing.title_ar} onChange={e => setEditing({ ...editing, title_ar: e.target.value })} />
          <input className="input" placeholder={ar ? 'العنوان (إنجليزي)' : 'Title (English)'} value={editing.title_en} onChange={e => setEditing({ ...editing, title_en: e.target.value })} />
          <input className="input" placeholder={ar ? 'الوصف (عربي)' : 'Description (Arabic)'} value={editing.description_ar || ''} onChange={e => setEditing({ ...editing, description_ar: e.target.value })} />
          <input className="input" placeholder={ar ? 'الوصف (إنجليزي)' : 'Description (English)'} value={editing.description_en || ''} onChange={e => setEditing({ ...editing, description_en: e.target.value })} />
          <select className="input" value={editing.shift_window_id || ''} onChange={e => setEditing({ ...editing, shift_window_id: e.target.value })}>
            <option value="">{ar ? '— اختر وردية —' : '— Pick window —'}</option>
            {windows.map(w => <option key={w.id} value={w.id}>{w.name_en} / {w.name_ar}</option>)}
          </select>
          <input type="number" className="input" placeholder="sort" value={editing.sort_order ?? 0} onChange={e => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
          <label className="flex items-center gap-2 text-white text-xs"><input type="checkbox" checked={editing.requires_value} onChange={e => setEditing({ ...editing, requires_value: e.target.checked })} /> {ar ? 'يتطلّب قيمة رقمية' : 'Requires numeric value'}</label>
          <select className="input" value={editing.inventory_item_id || ''} onChange={e => setEditing({ ...editing, inventory_item_id: e.target.value || null })}>
            <option value="">{ar ? '— بدون عنصر مرتبط —' : '— No linked inventory item —'}</option>
            {items.map(it => <option key={it.id} value={it.id}>{it.name_en} ({it.unit})</option>)}
          </select>
          <label className="flex items-center gap-2 text-white text-xs"><input type="checkbox" checked={editing.active !== false} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> {ar ? 'مفعّلة' : 'Active'}</label>
          <div className="md:col-span-2 flex justify-end gap-2 mt-1">
            <button onClick={() => setEditing(null)} className="btn-secondary text-xs">{ar ? 'إلغاء' : 'Cancel'}</button>
            <button onClick={save} className="btn-primary text-xs">{ar ? 'حفظ' : 'Save'}</button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {grouped.map(({ window: w, tasks }) => (
          <section key={w.id}>
            <h3 className="text-noch-muted text-xs font-semibold mb-1 uppercase tracking-wider">
              {ar ? w.name_ar : w.name_en} <span className="text-noch-muted/60">· {w.start_time?.slice(0, 5)}–{w.end_time?.slice(0, 5)}</span>
            </h3>
            <div className="flex flex-col gap-1">
              {tasks.length === 0 ? (
                <p className="text-noch-muted text-xs italic">{ar ? 'لا توجد مهام' : 'No tasks'}</p>
              ) : tasks.map(t => (
                <div key={t.id} className={`flex items-center gap-2 bg-noch-dark/30 rounded-lg px-3 py-2 text-sm ${!t.active ? 'opacity-50' : ''}`}>
                  <span className="text-white">{ar ? t.title_ar : t.title_en}</span>
                  {t.requires_value && <span className="text-[10px] text-noch-green border border-noch-green/30 rounded-full px-1.5">val</span>}
                  {t.item && <span className="text-[10px] text-noch-muted">→ {ar ? t.item.name_ar : t.item.name_en}</span>}
                  <span className="ms-auto flex gap-2">
                    <button onClick={() => setEditing(t)} className="text-noch-muted hover:text-white text-xs">{ar ? 'تعديل' : 'Edit'}</button>
                    <button onClick={() => remove(t.id)} className="text-red-400 hover:text-red-300 text-xs"><Trash2 size={11}/></button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
