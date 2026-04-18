import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Edit, Trash2, Upload } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { getRecipe, updateRecipe, deleteRecipe, archiveRecipe, uploadRecipeImage } from '../lib/supabase'
import RecipeForm from '../components/recipes/RecipeForm'
import ConfirmModal from '../components/shared/ConfirmModal'
import Layout from '../components/Layout'
import toast from 'react-hot-toast'

/* ── tokens ── */
const C = {
  bg:      '#f5f2ed',
  black:   '#111111',
  red:     '#c8372d',
  blue:    '#2b4acb',
  midGrey: '#888888',
  grey:    '#d9d5cf',
  green:   '#2a7a3b',
}
const mono  = '"Space Mono", monospace'
const bebas = '"Bebas Neue", sans-serif'
const sans  = '"DM Sans", sans-serif'
const border = `1.5px solid ${C.black}`

/* ── tiny helpers ── */
const Label = ({ children }) => (
  <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.red, display: 'block', marginBottom: 6 }}>
    {children}
  </span>
)
const MonoVal = ({ children, color }) => (
  <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: color || C.black }}>
    {children}
  </div>
)

export default function RecipeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, lang } = useLanguage()
  const { isOwner } = useAuth()
  const [recipe, setRecipe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  useEffect(() => {
    const load = async () => {
      try { setRecipe(await getRecipe(id)) }
      catch (err) { console.error(err); toast.error(t('error')); navigate('/recipes') }
      finally { setLoading(false) }
    }
    load()
  }, [id, t, navigate])

  if (loading) return (
    <Layout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, fontFamily: mono, fontSize: 11, color: C.midGrey, letterSpacing: '0.12em' }}>
        LOADING...
      </div>
    </Layout>
  )
  if (!recipe) return null

  const name   = lang === 'ar' && recipe.name_ar        ? recipe.name_ar        : recipe.name
  const desc   = lang === 'ar' && recipe.description_ar ? recipe.description_ar : recipe.description
  const notes  = lang === 'ar' && recipe.notes_ar       ? recipe.notes_ar       : recipe.notes
  const glass  = lang === 'ar' && recipe.glass_type_ar  ? recipe.glass_type_ar  : recipe.glass_type

  const serveVal = recipe.serve_temp === 'iced' ? 'ICED' : recipe.serve_temp === 'hot' ? 'HOT' : 'ROOM TEMP'

  const handleSave = async (payload) => {
    try {
      const { code, created_by, ...updates } = payload
      await updateRecipe(id, updates)
      setRecipe(await getRecipe(id))
      setEditing(false)
      toast.success(t('recipeUpdated'))
    } catch (err) { console.error(err); toast.error(err?.message || t('error')) }
  }

  const handleDelete = async () => {
    try { await deleteRecipe(id); toast.success(t('recipeDeleted')); navigate('/recipes') }
    catch (err) { console.error(err); toast.error(t('error')) }
  }

  const handleArchive = async () => {
    try { await archiveRecipe(id); toast.success(lang === 'ar' ? 'تم أرشفة الوصفة' : 'Recipe archived'); navigate('/recipes') }
    catch (err) { console.error(err); toast.error(t('error')) }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const url = await uploadRecipeImage(id, file)
      await updateRecipe(id, { image_url: url })
      setRecipe(await getRecipe(id))
      toast.success(lang === 'ar' ? 'تم تحديث الصورة' : 'Image updated')
    } catch (err) {
      console.error(err)
      toast.error(err?.message || t('error'))
    }
    finally { setUploadingImage(false) }
  }

  return (
    <Layout>
      <div style={{ background: C.bg, fontFamily: sans, color: C.black, minHeight: '100vh' }}>

        {/* ══ TOP BAR ══ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 36px', borderBottom: border }}>
          <button
            onClick={() => navigate('/recipes')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.red, padding: 0 }}
          >
            <ChevronLeft size={13} strokeWidth={2.5} />
            {lang === 'ar' ? 'الوصفات · مرجع الباريستا' : 'Recipes · Barista Reference'}
          </button>

          <span style={{ fontFamily: bebas, fontSize: 26, color: C.blue, letterSpacing: '0.05em' }}>NOCH</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.red }}>
              {(recipe.category || '').toUpperCase()} · {recipe.code}
            </span>
            {isOwner && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: `1.5px solid ${C.black}`, padding: '5px 12px', cursor: 'pointer', color: C.black }}>
                  <Edit size={10} strokeWidth={2.5} /> EDIT
                </button>
                {!recipe.is_archived && (
                  <button onClick={handleArchive} style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'none', border: `1.5px solid ${C.grey}`, padding: '5px 12px', cursor: 'pointer', color: C.midGrey }}>
                    ARCHIVE
                  </button>
                )}
                <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', background: 'none', border: `1.5px solid ${C.red}`, padding: '5px 9px', cursor: 'pointer', color: C.red }}>
                  <Trash2 size={10} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ══ HERO ══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: border, minHeight: 560 }}>

          {/* Hero Left — Oatly-style structured info card */}
          <div style={{ borderRight: border, display: 'flex', flexDirection: 'column' }}>

            {/* Breadcrumb row */}
            <div style={{ padding: '14px 28px', borderBottom: `1px solid ${C.grey}`, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.red }}>
                {lang === 'ar' ? 'الوصفات' : 'Recipes'}
              </span>
              <span style={{ fontFamily: mono, fontSize: 9, color: C.grey }}>·</span>
              <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.midGrey }}>
                {lang === 'ar' ? 'مرجع الباريستا' : 'Barista Reference'}
              </span>
            </div>

            {/* Big title area */}
            <div style={{ padding: '32px 28px', flex: 1, display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ fontFamily: bebas, fontSize: 64, lineHeight: 0.92, letterSpacing: '0.02em' }}>
                {name}
              </div>
            </div>

            {/* Description row */}
            {desc && (
              <div style={{ padding: '0 28px 24px' }}>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: C.midGrey, fontWeight: 300, fontStyle: 'italic', maxWidth: 360 }}>
                  {desc}
                </p>
              </div>
            )}

            {/* Category / Tags row — like Oatly's TRENDS row */}
            <div style={{ borderTop: `1px solid ${C.grey}`, padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Label>{lang === 'ar' ? 'الفئة' : 'Category'}</Label>
                <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.black }}>
                  {recipe.category || '—'}
                </span>
              </div>
              {recipe.yield_ml && (
                <div style={{ textAlign: 'right' }}>
                  <Label>{lang === 'ar' ? 'الكمية' : 'Yield'}</Label>
                  <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', fontWeight: 700 }}>
                    {recipe.yield_ml} ml
                  </span>
                </div>
              )}
            </div>

            {/* Serve / Milk — like Oatly's SKILL LEVEL / SERVE split row */}
            <div style={{ borderTop: `1px solid ${C.grey}`, display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
              <div style={{ padding: '14px 28px' }}>
                <Label>{lang === 'ar' ? 'التقديم' : 'Serve'}</Label>
                <MonoVal>{serveVal}</MonoVal>
              </div>
              <div style={{ background: C.grey }} />
              <div style={{ padding: '14px 28px' }}>
                <Label>{lang === 'ar' ? 'الكوب / الحليب' : 'Milk'}</Label>
                <MonoVal>{glass || '—'}</MonoVal>
              </div>
            </div>

          </div>

          {/* Hero Right — image */}
          <div style={{ position: 'relative', overflow: 'hidden', minHeight: 560, background: '#e8e4dd' }}>
            {recipe.image_url ? (
              <>
                <img
                  src={recipe.image_url}
                  alt={name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {isOwner && (
                  <label
                    style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(0,0,0,0.5)', opacity: 0, cursor: 'pointer', transition: 'opacity 0.2s', fontFamily: mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0}
                  >
                    <Upload size={18} />
                    {uploadingImage ? 'UPLOADING...' : (lang === 'ar' ? 'تحديث الصورة' : 'Replace Image')}
                    <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} style={{ display: 'none' }} />
                  </label>
                )}
              </>
            ) : (
              /* Oatly-style image placeholder — clean, proportional */
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, cursor: isOwner ? 'pointer' : 'default', background: '#e8e4dd' }}>
                {/* Placeholder graphic */}
                <div style={{ width: 64, height: 64, border: `1.5px solid ${C.grey}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload size={22} style={{ color: C.grey }} />
                </div>
                <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.midGrey }}>
                  {uploadingImage ? 'UPLOADING...' : (lang === 'ar' ? 'رفع صورة الوصفة' : 'Upload Recipe Image')}
                </span>
                {isOwner && <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} style={{ display: 'none' }} />}
              </label>
            )}
          </div>
        </div>

        {/* ══ NOTE BAR ══ */}
        {notes && (
          <div style={{ padding: '16px 36px', borderBottom: border, fontFamily: mono, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.6, color: C.black }}>
            {notes}
          </div>
        )}

        {/* ══ BODY — Ingredients + Steps ══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', borderBottom: border }}>

          {/* LEFT — Ingredients */}
          <div style={{ padding: '36px', borderRight: border }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.red, marginBottom: 28 }}>
              {lang === 'ar' ? 'المكونات' : 'All You Need'}
            </div>

            {recipe.ingredients?.length > 0 ? recipe.ingredients.map((group, gi) => (
              <div key={gi} style={{ marginBottom: 32 }}>
                {group.group && (
                  <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.midGrey, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.grey}` }}>
                    {lang === 'ar' && group.group_ar ? group.group_ar : group.group}
                  </div>
                )}
                <div>
                  {group.items?.map((item, ii) => (
                    <div key={ii} style={{ display: 'flex', alignItems: 'baseline', gap: 16, padding: '10px 0', borderBottom: `1px solid ${C.grey}` }}>
                      <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, minWidth: 60, flexShrink: 0 }}>
                        {item.amount ? `${item.amount}${item.unit ? item.unit : ''}` : '—'}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 400, flex: 1 }}>
                        {lang === 'ar' && item.name_ar ? item.name_ar : item.name}
                      </span>
                      {item.note && (
                        <span style={{ fontSize: 11, color: C.midGrey, fontStyle: 'italic', textAlign: 'right', flexShrink: 0 }}>
                          {item.note}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <p style={{ fontSize: 13, color: C.midGrey, fontStyle: 'italic' }}>
                {lang === 'ar' ? 'لا توجد مكونات' : 'No ingredients listed'}
              </p>
            )}
          </div>

          {/* RIGHT — Layers + Steps */}
          <div style={{ padding: '36px' }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.red, marginBottom: 28 }}>
              {lang === 'ar' ? 'قائمة التحضير' : 'To-Do List'}
            </div>

            {/* Layer Diagram */}
            {recipe.layers?.length > 0 && (
              <div style={{ marginBottom: 36, border: `1.5px solid ${C.black}` }}>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.red, padding: '10px 20px', borderBottom: `1.5px solid ${C.black}` }}>
                  {lang === 'ar' ? 'ترتيب الطبقات — من الأسفل إلى الأعلى' : 'Layer Order — Bottom to Top'}
                </div>
                {[...recipe.layers].reverse().map((layer, i, arr) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '12px 20px', borderBottom: i < arr.length - 1 ? `1px solid ${C.grey}` : 'none' }}>
                    {/* Color swatch — always rendered, grey border if no color */}
                    <div style={{
                      width: 34, height: 20, borderRadius: 2, flexShrink: 0,
                      background: layer.color || '#e8e4dd',
                      border: layer.color ? 'none' : `1px solid ${C.grey}`,
                    }} />
                    <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
                      {lang === 'ar' && layer.label_ar ? layer.label_ar : layer.label}
                    </span>
                    {/* Detail — show layer.detail OR layer.description as fallback */}
                    <span style={{ fontSize: 11, color: C.midGrey, fontStyle: 'italic', textAlign: 'right', minWidth: 0 }}>
                      {layer.detail || layer.description || ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Steps */}
            {recipe.steps?.length > 0 ? recipe.steps.map((step, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 20, marginBottom: 28, alignItems: 'start' }}>
                {/* Circle step number */}
                <div style={{ width: 40, height: 40, border: `1.5px solid ${C.black}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                  {step.step || i + 1}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.65, paddingTop: 8 }}>
                  <span>{lang === 'ar' && step.instruction_ar ? step.instruction_ar : step.instruction}</span>
                  {step.warning && (
                    <span style={{ display: 'block', marginTop: 6, fontFamily: mono, fontSize: 11, letterSpacing: '0.04em', color: C.red }}>
                      △ {lang === 'ar' && step.warning_ar ? step.warning_ar : step.warning}
                    </span>
                  )}
                  {step.tip && (
                    <span style={{ display: 'block', marginTop: 6, fontFamily: mono, fontSize: 11, letterSpacing: '0.04em', color: C.green }}>
                      ✓ {step.tip}
                    </span>
                  )}
                </div>
              </div>
            )) : (
              <p style={{ fontSize: 13, color: C.midGrey, fontStyle: 'italic' }}>
                {lang === 'ar' ? 'لا توجد خطوات' : 'No steps listed'}
              </p>
            )}
          </div>
        </div>

        {/* ══ BOTTOM BAR ══ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: lang === 'ar' ? 'الفئة'       : 'Category',  value: (recipe.category || '—').toUpperCase() },
            { label: lang === 'ar' ? 'رقم البطاقة' : 'Card No.',  value: recipe.code },
            { label: lang === 'ar' ? 'التقديم'     : 'Serve',     value: serveVal },
            { label: lang === 'ar' ? 'الحالة'      : 'Status',    value: recipe.is_archived ? 'ARCHIVED' : 'ACTIVE', color: recipe.is_archived ? C.midGrey : C.green },
          ].map((item, i) => (
            <div key={i} style={{ padding: '18px 28px', borderRight: i < 3 ? border : 'none', borderTop: border }}>
              <Label>{item.label}</Label>
              <MonoVal color={item.color}>{item.value}</MonoVal>
            </div>
          ))}
        </div>

      </div>

      {editing && <RecipeForm recipe={recipe} onSave={handleSave} onCancel={() => setEditing(false)} />}
      {confirmDelete && <ConfirmModal title={t('deleteTask')} message={t('confirmDeleteRecipe')} onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} danger />}
    </Layout>
  )
}
