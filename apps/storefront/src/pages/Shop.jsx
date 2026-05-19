import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Shop({ lang = 'en' }) {
  const [active, setActive] = useState('all')
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const isAr = lang === 'ar'

  useEffect(() => {
    Promise.all([
      supabase.from('pos_products')
        .select('id,name,name_ar,price,description,image_url,category_id,visible_on_website,is_active')
        .eq('visible_on_website', true)
        .eq('is_active', true)
        .order('name'),
      supabase.from('pos_categories')
        .select('id,name,name_ar')
        .eq('show_in_online_store', true)
        .eq('is_active', true)
        .order('sort_order'),
    ]).then(([pr, cr]) => {
      const cats = cr.data || []
      const catIds = new Set(cats.map(c => c.id))
      const prods = (pr.data || []).filter(p => !p.category_id || catIds.has(p.category_id))
      setProducts(prods)
      setCategories([{ id: 'all', name: 'All', name_ar: 'الكل', emoji: '✨' }, ...cats.map(c => ({ ...c, emoji: '☕' }))])
      setLoading(false)
    }).catch(err => {
      console.error('Shop load failed:', err)
      setLoading(false)
    })
  }, [])

  const filtered = products.filter(p => {
    if (active !== 'all' && p.category_id !== active) return false
    if (query === '') return true
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const hay = `${p.name || ''} ${p.name_ar || ''} ${p.description || ''}`.toLowerCase()
    return words.some(w => hay.includes(w))
  })

  const activeCat = categories.find(c => c.id === active)

  return (
    <div className={`menu-page${isAr ? ' rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <nav className="nav">
        <Link to="/" className="back">{isAr ? '→ رجوع' : '← Back'}</Link>
        <Link to="/" className="logo-sm"><img src="/assets/logo.svg" alt="Noch" style={{ height: 32 }} /></Link>
      </nav>
      <section className="m-hero">
        <span className="kicker">✿ {isAr ? 'متجر نوتش' : 'noch shop'}</span>
        <h1>{isAr ? <><em>المتجر</em><br /><span className="underline">أونلاين</span></> : <>the <em>shop</em><br /><span className="underline">online</span></>}</h1>
        <p>{isAr ? `${products.length} منتج — حبوب، أدوات، وأكواب.` : `${products.length} products — beans, gear and brewing tools.`}</p>
        <img className="mascot" src="/assets/mascot-1.svg" alt="Nochi shopping" />
      </section>
      <div className="search-wrap">
        <div className="search">
          <span style={{ fontSize: 18 }}>🔎</span>
          <input placeholder={isAr ? 'ابحث...' : 'search products...'} value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="cats">
        {categories.map(c => (
          <button key={c.id} className={'chip' + (active === c.id ? ' active' : '')} onClick={() => setActive(c.id)}>
            <span className="chip-emoji">{c.emoji || '✨'}</span>{isAr ? c.name_ar : c.name}
          </button>
        ))}
      </div>
      <main className="grid-wrap">
        <div className="section-header">
          <h2>{isAr ? (activeCat?.name_ar || 'الكل') : (activeCat?.name || 'All')} <span className="dot">✦</span></h2>
          <span style={{ color: '#6A7290', fontSize: 14 }}>{filtered.length} {isAr ? 'منتج' : 'products'}</span>
        </div>
        {loading
          ? <p style={{ padding: 40, color: '#6A7290' }}>{isAr ? 'جاري التحميل...' : 'Loading...'}</p>
          : <div className="grid">
              {filtered.map(p => (
                <article className="card shop-card" key={p.id}>
                  <div className="card-img-wrap">
                    {p.image_url ? <img src={p.image_url} alt={p.name} className="card-product-img" loading="lazy" /> : <div className="card-illus-fallback">☕</div>}
                  </div>
                  <div className="card-head">
                    <div className="card-name">{p.name}{p.name_ar && <span className="ar"> · {p.name_ar}</span>}</div>
                    <div className="price">{Number(p.price).toFixed(3)}<span>{isAr ? ' دينار' : ' LYD'}</span></div>
                  </div>
                  {p.description && <p className="card-desc">{p.description}</p>}
                </article>
              ))}
              {!loading && filtered.length === 0 && <p style={{ padding: 40, color: '#6A7290' }}>{isAr ? 'لا يوجد نتائج.' : 'Nothing here yet.'}</p>}
            </div>
        }
      </main>
      <footer className="m-footer">{isAr ? 'الأسعار بالدينار الليبي · ' : 'Prices in LYD · '}<Link to="/">noch.cloud</Link></footer>
    </div>
  )
}
