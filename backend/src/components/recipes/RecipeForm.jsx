import { useState, useEffect, useRef } from 'react'
import { X, Plus, Trash2, AlertTriangle, History } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { loadDraft, saveDraft, clearDraft, draftAge } from '../../lib/drafts'
import toast from 'react-hot-toast'

const CATEGORIES = ['coffee', 'matcha', 'specialty', 'signature']
const SUBCATEGORIES = ['', 'iced', 'hot']
const SERVE_TEMPS = ['iced', 'hot', 'room']

const LAYER_PRESETS = [
  { label: 'Ice', label_ar: 'ثلج', color: '#B0D8F0' },
  { label: 'Milk', label_ar: 'حليب', color: '#F5F0E8' },
  { label: 'Espresso', label_ar: 'إسبريسو', color: '#2C1A0E' },
  { label: 'Cold Brew', label_ar: 'قهوة باردة', color: '#3D2315' },
  { label: 'Matcha', label_ar: 'ماتشا', color: '#4A7C59' },
  { label: 'Whipped Cream', label_ar: 'كريمة', color: '#FAF7F2' },
  { label: 'Syrup', label_ar: 'شراب', color: '#C8882A' },
  { label: 'Foam', label_ar: 'فوم', color: '#F0EBE3' },
]

function emptyGroup() {
  return { group: '', group_ar: '', items: [] }
}
function emptyItem() {
  return { name: '', name_ar: '', amount: '', unit: 'ml' }
}
function emptyLayer() {
  return { label: '', label_ar: '', color: '#4ADE80', height: 1 }
}
function emptyStep() {
  return { step: 1, instruction: '', instruction_ar: '', warning: '', warning_ar: '' }
}

export default function RecipeForm({ recipe, prefill, onSave, onCancel }) {
  const { t, lang } = useLanguage()
  const { user } = useAuth()
  const draftKey = `recipe:${recipe?.id || 'new'}`
  const [pendingDraft, setPendingDraft] = useState(() => loadDraft(draftKey))
  const mountedRef = useRef(false)

  const [form, setForm] = useState({
    code: recipe?.code || prefill?.code || '',
    name: recipe?.name || prefill?.name || '',
    name_ar: recipe?.name_ar || prefill?.name_ar || '',
    category: recipe?.category || prefill?.category || 'coffee',
    subcategory: recipe?.subcategory || prefill?.subcategory || '',
    description: recipe?.description || prefill?.description || '',
    description_ar: recipe?.description_ar || prefill?.description_ar || '',
    yield_ml: recipe?.yield_ml || prefill?.yield_ml || '',
    serve_temp: recipe?.serve_temp || prefill?.serve_temp || 'iced',
    glass_type: recipe?.glass_type || prefill?.glass_type || '',
    glass_type_ar: recipe?.glass_type_ar || prefill?.glass_type_ar || '',
    notes: recipe?.notes || prefill?.notes || '',
    notes_ar: recipe?.notes_ar || prefill?.notes_ar || '',
    created_by: user?.id,
  })

  const [groups, setGroups] = useState(
    recipe?.ingredients?.length ? recipe.ingredients
    : prefill?.ingredients?.length ? prefill.ingredients
    : [emptyGroup()]
  )

  const [layers, setLayers] = useState(
    recipe?.layers?.length ? recipe.layers
    : prefill?.layers?.length ? prefill.layers
    : []
  )

  const [steps, setSteps] = useState(
    recipe?.steps?.length ? recipe.steps
    : prefill?.steps?.length ? prefill.steps
    : [{ ...emptyStep(), step: 1 }]
  )

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Autosave draft on any state change (skip first render)
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    saveDraft(draftKey, { form, groups, layers, steps }, form.name || form.code || 'New recipe')
  }, [form, groups, layers, steps, draftKey])

  const restoreDraft = () => {
    const d = pendingDraft.form
    if (d.form) setForm(d.form)
    if (d.groups) setGroups(d.groups)
    if (d.layers) setLayers(d.layers)
    if (d.steps) setSteps(d.steps)
    setPendingDraft(null)
    toast.success(lang === 'ar' ? 'تم استعادة المسودة' : 'Draft restored')
  }
  const discardDraft = () => { clearDraft(draftKey); setPendingDraft(null) }
  const handleCancel = () => { clearDraft(draftKey); onCancel() }

  // --- Groups / Ingredients ---
  const addGroup = () => setGroups(g => [...g, emptyGroup()])
  const removeGroup = (gi) => setGroups(g => g.filter((_, i) => i !== gi))
  const updateGroup = (gi, key, val) =>
    setGroups(g => g.map((gr, i) => i === gi ? { ...gr, [key]: val } : gr))

  const addItem = (gi) =>
    setGroups(g => g.map((gr, i) => i === gi ? { ...gr, items: [...gr.items, emptyItem()] } : gr))
  const removeItem = (gi, ii) =>
    setGroups(g => g.map((gr, i) => i === gi ? { ...gr, items: gr.items.filter((_, j) => j !== ii) } : gr))
  const updateItem = (gi, ii, key, val) =>
    setGroups(g => g.map((gr, i) => i === gi
      ? { ...gr, items: gr.items.map((it, j) => j === ii ? { ...it, [key]: val } : it) }
      : gr
    ))

  // --- Layers ---
  const addLayer = () => setLayers(l => [...l, emptyLayer()])
  const addPresetLayer = (preset) => setLayers(l => [...l, { ...preset, height: 1 }])
  const removeLayer = (i) => setLayers(l => l.filter((_, j) => j !== i))
  const updateLayer = (i, key, val) =>
    setLayers(l => l.map((la, j) => j === i ? { ...la, [key]: val } : la))

  // --- Steps ---
  const addStep = () =>
    setSteps(s => [...s, { ...emptyStep(), step: s.length + 1 }])
  const removeStep = (i) =>
    setSteps(s => s.filter((_, j) => j !== i).map((st, j) => ({ ...st, step: j + 1 })))
  const updateStep = (i, key, val) =>
    setSteps(s => s.map((st, j) => j === i ? { ...st, [key]: val } : st))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.code.trim()) return toast.error(lang === 'ar' ? 'أدخل كود الوصفة' : 'Enter recipe code')
    if (!form.name.trim()) return toast.error(lang === 'ar' ? 'أدخل اسم الوصفة' : 'Enter recipe name')

    const payload = {
      ...form,
      yield_ml: form.yield_ml ? parseInt(form.yield_ml) : null,
      subcategory: form.subcategory || null,
      ingredients: groups.filter(g => g.group || g.items.length > 0),
      layers,
      steps: steps.map((st, i) => ({
        ...st,
        step: i + 1,
        warning: st.warning || null,
        warning_ar: st.warning_ar || null,
      })),
    }
    clearDraft(draftKey)
    onSave(payload)
  }

  const catLabels = {
    coffee: t('catCoffee'), matcha: t('catMatcha'),
    specialty: t('catSpecialty'), signature: t('catSignature')
  }
  const subcatLabels = { '': lang === 'ar' ? '— اختياري —' : '— Optional —', iced: t('subIced'), hot: t('subHot') }
  const tempLabels = { iced: t('tempIced'), hot: t('tempHot'), room: t('tempRoom') }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 px-0 md:px-4">
      <div className="card w-full md:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-2xl">

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-bold text-lg">
            {recipe ? t('editRecipe') : t('newRecipe')}
          </h2>
          <button onClick={handleCancel} type="button" className="text-noch-muted hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {pendingDraft && (
          <div className="rounded-xl px-3 py-2.5 mb-4 flex items-center gap-3" style={{ background: 'rgba(245,146,46,0.12)', border: '1px solid rgba(245,146,46,0.4)' }}>
            <History size={16} className="text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium">{lang === 'ar' ? `تغييرات غير محفوظة من ${draftAge(pendingDraft.savedAt)}` : `Unsaved changes from ${draftAge(pendingDraft.savedAt)}`}</p>
              <p className="text-zinc-400 text-xs truncate">{pendingDraft.label}</p>
            </div>
            <button type="button" onClick={restoreDraft} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: '#F5922E', color: '#0B1020' }}>{lang === 'ar' ? 'استعادة' : 'Restore'}</button>
            <button type="button" onClick={discardDraft} className="text-xs font-medium px-2 py-1.5 rounded-lg text-zinc-400 hover:text-white">{lang === 'ar' ? 'تجاهل' : 'Discard'}</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Code + Name */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">{t('recipeCode')} *</label>
              <input className="input font-mono uppercase" value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase())}
                placeholder="SL-01" />
            </div>
            <div className="col-span-2">
              <label className="label">{t('recipeName')} *</label>
              <input className="input" value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder={lang === 'ar' ? 'بالإنجليزي' : 'e.g. Einspanner'} />
            </div>
          </div>

          <div>
            <label className="label">{t('recipeName')} (AR)</label>
            <input className="input" value={form.name_ar}
              onChange={e => set('name_ar', e.target.value)}
              placeholder="بالعربي" />
          </div>

          {/* Category + Subcategory + Temp */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">{t('recipeCategory')}</label>
              <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{catLabels[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('recipeSubcategory')}</label>
              <select className="input" value={form.subcategory} onChange={e => set('subcategory', e.target.value)}>
                {SUBCATEGORIES.map(s => <option key={s} value={s}>{subcatLabels[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('recipeServeTemp')}</label>
              <select className="input" value={form.serve_temp} onChange={e => set('serve_temp', e.target.value)}>
                {SERVE_TEMPS.map(s => <option key={s} value={s}>{tempLabels[s]}</option>)}
              </select>
            </div>
          </div>

          {/* Glass + Yield */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('recipeGlass')}</label>
              <input className="input" value={form.glass_type}
                onChange={e => set('glass_type', e.target.value)} placeholder="Tall Glass" />
            </div>
            <div>
              <label className="label">{t('recipeYield')}</label>
              <input type="number" className="input" value={form.yield_ml}
                onChange={e => set('yield_ml', e.target.value)} placeholder="350" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">{t('recipeDescription')}</label>
            <textarea className="input resize-none h-16" value={form.description}
              onChange={e => set('description', e.target.value)} />
          </div>

          {/* ---- INGREDIENTS ---- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">{t('recipeIngredients')}</label>
              <button type="button" onClick={addGroup}
                className="text-xs text-noch-green hover:text-green-300 flex items-center gap-1">
                <Plus size={12} /> {t('addIngredientGroup')}
              </button>
            </div>

            {groups.map((group, gi) => (
              <div key={gi} className="border border-noch-border rounded-xl p-3 mb-2">
                <div className="flex gap-2 mb-2">
                  <input className="input text-sm" value={group.group}
                    onChange={e => updateGroup(gi, 'group', e.target.value)}
                    placeholder={lang === 'ar' ? 'Group name (EN)' : 'Group name'} />
                  <input className="input text-sm" value={group.group_ar}
                    onChange={e => updateGroup(gi, 'group_ar', e.target.value)}
                    placeholder="اسم المجموعة" />
                  {groups.length > 1 && (
                    <button type="button" onClick={() => removeGroup(gi)}
                      className="text-red-400 hover:text-red-300 flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {group.items.map((item, ii) => (
                  <div key={ii} className="grid grid-cols-12 gap-1.5 mb-1.5 items-center">
                    <input className="input text-xs col-span-3" value={item.name}
                      onChange={e => updateItem(gi, ii, 'name', e.target.value)}
                      placeholder="Name" />
                    <input className="input text-xs col-span-3" value={item.name_ar}
                      onChange={e => updateItem(gi, ii, 'name_ar', e.target.value)}
                      placeholder="الاسم" />
                    <input className="input text-xs col-span-3" value={item.amount}
                      onChange={e => updateItem(gi, ii, 'amount', e.target.value)}
                      placeholder="Amount" />
                    <input className="input text-xs col-span-2" value={item.unit}
                      onChange={e => updateItem(gi, ii, 'unit', e.target.value)}
                      placeholder="ml" />
                    <button type="button" onClick={() => removeItem(gi, ii)}
                      className="text-red-400 hover:text-red-300 col-span-1 flex justify-center">
                      <X size={12} />
                    </button>
                  </div>
                ))}

                <button type="button" onClick={() => addItem(gi)}
                  className="text-xs text-noch-muted hover:text-white flex items-center gap-1 mt-1">
                  <Plus size={11} /> {t('addIngredient')}
                </button>
              </div>
            ))}
          </div>

          {/* ---- LAYERS ---- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">{t('recipeLayers')}</label>
              <button type="button" onClick={addLayer}
                className="text-xs text-noch-green hover:text-green-300 flex items-center gap-1">
                <Plus size={12} /> {t('addLayer')}
              </button>
            </div>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {LAYER_PRESETS.map(p => (
                <button key={p.label} type="button"
                  onClick={() => addPresetLayer(p)}
                  className="text-xs px-2 py-1 rounded-lg border border-noch-border text-noch-muted hover:border-noch-green/40 hover:text-white flex items-center gap-1.5 transition-colors">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  {lang === 'ar' ? p.label_ar : p.label}
                </button>
              ))}
            </div>

            {/* Layer preview */}
            {layers.length > 0 && (
              <div className="flex h-6 rounded-xl overflow-hidden mb-3 gap-px">
                {layers.map((l, i) => (
                  <div key={i} className="flex items-center justify-center"
                    style={{ backgroundColor: l.color, flexGrow: l.height || 1, minWidth: 8 }}>
                  </div>
                ))}
              </div>
            )}

            {layers.map((layer, i) => (
              <div key={i} className="flex gap-2 mb-1.5 items-center">
                <input type="color" value={layer.color}
                  onChange={e => updateLayer(i, 'color', e.target.value)}
                  className="w-8 h-8 rounded-lg border border-noch-border cursor-pointer bg-noch-dark flex-shrink-0" />
                <input className="input text-xs" value={layer.label}
                  onChange={e => updateLayer(i, 'label', e.target.value)}
                  placeholder="Layer name" />
                <input className="input text-xs" value={layer.label_ar}
                  onChange={e => updateLayer(i, 'label_ar', e.target.value)}
                  placeholder="اسم الطبقة" />
                <input type="number" className="input text-xs w-16" value={layer.height}
                  min="1" max="10"
                  onChange={e => updateLayer(i, 'height', parseInt(e.target.value) || 1)}
                  placeholder="H" />
                <button type="button" onClick={() => removeLayer(i)}
                  className="text-red-400 hover:text-red-300 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {layers.length > 0 && (
              <p className="text-xs text-noch-muted mt-1">
                {lang === 'ar' ? 'الترتيب من أسفل إلى أعلى · H = ارتفاع نسبي' : 'Order: bottom → top · H = relative height'}
              </p>
            )}
          </div>

          {/* ---- STEPS ---- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">{t('recipeSteps')}</label>
              <button type="button" onClick={addStep}
                className="text-xs text-noch-green hover:text-green-300 flex items-center gap-1">
                <Plus size={12} /> {t('addStep')}
              </button>
            </div>

            {steps.map((step, i) => (
              <div key={i} className="border border-noch-border rounded-xl p-3 mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-noch-green text-noch-dark text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <textarea className="input resize-none text-sm h-16"
                      value={step.instruction}
                      onChange={e => updateStep(i, 'instruction', e.target.value)}
                      placeholder="Step instruction (EN)" />
                    <textarea className="input resize-none text-sm h-16"
                      value={step.instruction_ar}
                      onChange={e => updateStep(i, 'instruction_ar', e.target.value)}
                      placeholder="الخطوة بالعربي" />
                  </div>
                  {steps.length > 1 && (
                    <button type="button" onClick={() => removeStep(i)}
                      className="text-red-400 hover:text-red-300 flex-shrink-0 self-start">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-xs" value={step.warning || ''}
                    onChange={e => updateStep(i, 'warning', e.target.value)}
                    placeholder="⚠ Warning (optional)" />
                  <input className="input text-xs" value={step.warning_ar || ''}
                    onChange={e => updateStep(i, 'warning_ar', e.target.value)}
                    placeholder="⚠ تحذير (اختياري)" />
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('recipeNotes')}</label>
              <textarea className="input resize-none h-16 text-sm" value={form.notes}
                onChange={e => set('notes', e.target.value)} placeholder="Notes..." />
            </div>
            <div>
              <label className="label">{t('recipeNotes')} (AR)</label>
              <textarea className="input resize-none h-16 text-sm" value={form.notes_ar}
                onChange={e => set('notes_ar', e.target.value)} placeholder="ملاحظات..." />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1">{t('cancel')}</button>
            <button type="submit" className="btn-primary flex-1">{t('saveTask')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
