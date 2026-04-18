import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CAT_EMOJI = {
  'hot coffee': '☕', 'coffee': '☕',
  'iced drinks': '🧊', 'cold drinks': '🧊', 'iced coffee': '🧊',
  'ice teas': '🍹', 'ice tea': '🍹', 'iced tea': '🍹',
  'tea': '🫖',
  'matcha': '🍵',
  'desserts': '🍰', 'dessert': '🍰', 'sweets': '🍰',
  'specials': '🔥', 'special': '🔥',
  'other': '✨',
  'pastries': '🥐', 'pastry': '🥐',
  'food': '🥗', 'savory': '🥗',
}

function getEmoji(name) {
  const n = (name || '').toLowerCase()
  for (const [key, emoji] of Object.entries(CAT_EMOJI)) {
    if (n.includes(key)) return emoji
  }
  return '✨'
}

export default function Menu({ lang = 'en' }) {
  const [active, setActive] = useState('all')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const isAr = lang === 'ar'

  useEffect(() => {
    async function load() {
      try {
        const [catRes, prodRes] = await Promise.all([
          supabase.from('pos_categories').select('id,name,name_ar').eq('is_active', true).order('sort_order'),
          supabase.from('pos_products')
            .select('id,name,name_ar,price,description,visible_on_website,category_id,pos_categories(id,name,name_ar)')
            .eq('is_active', true)
            .eq('visible_on_website', true)
            .order('name'),
        ])

        if (catRes.data?.length) {
          setCategories([
            { id: 'all', name: 'All', name_ar: 'الكل', emoji: '✨' },
            ...catRes.data.map(c => ({ ...c, emoji: getEmoji(c.name) })),
          ])
        }

        if (prodRes.data?.length) {
          setItems(prodRes.data.map(p => ({
            id: p.id,
            cat_id: p.category_id,
            name: p.name,
            name_ar: p.name_ar || '',
            price: parseFloat(p.price),
            desc: p.description || '',
          })))
        }
      } catch (e) {
        console.error('Menu load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = items.filter(i =>
    (active === 'all' || i.cat_id === active) &&
    (query === '' ||
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      (i.name_ar || '').includes(query))
  )

  const activeCat = categories.find(c => c.id === active)
  const sectionTitle = isAr ? (activeCat?.name_ar || 'الكل') : (activeCat?.name || 'All')

  return (
    <div className={`menu-page${isAr ? ' rtl' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <nav className="nav">
        <Link to="/" className="back">{isAr ? '→ رجوع' : '← Back'}</Link>
        <Link to="/" className="logo-sm">
          <img src="/assets/logo.svg" alt="Noch" style={{height:32}} />
        </Link>
        <div className="nav-right">
          <button className="icon-btn" title={isAr ? 'English' : 'عربي'}>ع</button>
        </div>
      </nav>

      <section className="m-hero">
        <span className="kicker">✿ {isAr ? 'قائمة اليوم · محدّثة مباشرة' : "today's menu · updated live"}</span>
        <h1>
          {isAr
            ? <><em>شو</em> عندنا<br /><span className="underline">في نوتش</span> اليوم؟</>
            : <>what's <em>on</em><br /><span className="underline">at noch</span> today?</>
          }
        </h1>
        <img className="mascot" src="/assets/mascot-2.svg" alt="Nochi holding menu" />
      </section>

      <div className="search-wrap">
        <div className="search">
          <span style={{fontSize:18}}>🔎</span>
          <input
            placeholder={isAr ? 'ابحث عن أي شيء...' : 'search the menu...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="cats">
        {categories.map(c => (
          <button
            key={c.id}
            className={'chip' + (active === c.id ? ' active' : '')}
            onClick={() => setActive(c.id)}
          >
            <span className="chip-emoji">{c.emoji}</span>
            {isAr ? c.name_ar : c.name}
          </button>
        ))}
      </div>

      <main className="grid-wrap">
        <div className="section-header">
          <h2>{sectionTitle} <span className="dot">✦</span></h2>
          <span style={{ color: '#6A7290', fontSize: 14 }}>
            {filtered.length} {isAr ? 'منتج' : 'items'}
          </span>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>{isAr ? 'جاري التحميل...' : 'Loading menu...'}</p>
          </div>
        ) : (
          <div className="grid">
            {filtered.map((item, idx) => (
              <article className="card" key={item.id || idx}>
                <div className="card-illus">
                  {getEmoji(activeCat?.name || '')}
                </div>
                <div className="card-head">
                  <div className="card-name">
                    {item.name}
                    {item.name_ar && <span className="ar">{item.name_ar}</span>}
                  </div>
                  <div className="price">{item.price.toFixed(3)}<span>LYD</span></div>
                </div>
                {item.desc && <p className="card-desc">{item.desc}</p>}
              </article>
            ))}
            {!loading && filtered.length === 0 && (
              <p style={{ padding: 40, color: '#6A7290' }}>
                {isAr ? 'لا يوجد نتائج.' : 'Nothing here yet — check back soon.'}
              </p>
            )}
          </div>
        )}
      </main>

      <section className="bottom">
        <h3>{isAr ? <>ما لقيت؟ <em>اسألنا.</em></> : <>Didn't find it? <em>Ask us.</em></>}</h3>
        <p style={{ marginTop: 8, color: '#485070' }}>
          {isAr
            ? 'القائمة تتغير حسب الموسم. راسلنا على إنستغرام أو تعال بنفسك.'
            : "Menu changes with what's fresh. DM us on Instagram or just come in."}
        </p>
        <div className="btn-row">
          <a className="btn" href="https://www.instagram.com/noch.cafe" target="_blank" rel="noreferrer">
            {isAr ? 'راسلنا على إنستغرام' : 'DM us on Instagram'}
          </a>
          <Link className="btn ghost" to="/">{isAr ? 'رجوع للرئيسية' : 'Back to hub'}</Link>
        </div>
      </section>

      <footer className="m-footer">
        {isAr ? 'الأسعار بالدينار الليبي · محدّثة من نظام المبيعات · ' : 'Prices in LYD · Live from our POS · '}
        <Link to="/">noch.cloud</Link>
      </footer>
    </div>
  )
}
