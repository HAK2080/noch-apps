import { useState } from 'react'
import './styles/AutumnBanner.css'

export default function AutumnBanner({ lang }) {
  const [paused, setPaused] = useState(false)
  const isAr = lang === 'ar'

  return (
    <section className={`menu-autumn-banner${paused ? ' is-paused' : ''}`} dir={isAr ? 'rtl' : 'ltr'} aria-label={isAr ? 'الخريف في نوتش' : 'Autumn at Noch'}>
      <div className="menu-autumn-copy">
        <p>{isAr ? 'الخريف في نوتش' : 'AUTUMN AT NOCH'}</p>
        <h2>{isAr ? 'شن مزاجك اليوم؟' : 'What’s your mood today?'}</h2>
        <span>{isAr ? 'قهوة، ماتشا، وشي حلو.' : 'Coffee, matcha & something sweet.'}</span>
      </div>
      <div className="menu-autumn-art" aria-hidden="true">
        <div className="menu-autumn-leaves">
          {[0, 1, 2, 3].map(i => <img key={i} src="/assets/autumn/leaf.svg" alt="" style={{ '--leaf': i }} />)}
        </div>
        <img className="menu-autumn-nochi" src="/assets/autumn/nochi-walking.png" alt="" />
        <img className="menu-autumn-pumpkin" src="/assets/autumn/pumpkin.svg" alt="" />
      </div>
      <button type="button" className="menu-autumn-pause" aria-pressed={paused}
        aria-label={paused ? (isAr ? 'تشغيل حركة الأوراق' : 'Play falling leaves') : (isAr ? 'إيقاف حركة الأوراق' : 'Pause falling leaves')}
        title={isAr ? 'حركة الأوراق' : 'Leaf animation'} onClick={() => setPaused(value => !value)}>
        <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
      </button>
    </section>
  )
}
