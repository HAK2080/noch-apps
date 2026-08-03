import { Outlet } from 'react-router-dom'
import { Wand2 } from 'lucide-react'
import Layout from '../../../components/Layout'
import SubNav from './SubNav'
import BusinessSelector, { useSelectedBusiness } from './BusinessSelector'
import { useLanguage } from '../../../contexts/LanguageContext'

export default function StudioShell() {
  const { businesses, businessId, setBusinessId, loading } = useSelectedBusiness()
  const { lang } = useLanguage()

  return (
    <Layout>
      <header className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wand2 size={20} className="text-noch-green" />
          <h1 className="text-white text-2xl font-bold">{lang === 'ar' ? 'استوديو المحتوى' : 'Content Studio'}</h1>
          <span className="text-noch-muted/60 text-xs ms-2">{lang === 'ar' ? 'نظام التشغيل' : 'Owner workspace'}</span>
        </div>
        {!loading && businesses.length > 0 && (
          <BusinessSelector value={businessId} onChange={setBusinessId} businesses={businesses} />
        )}
      </header>
      <SubNav />
      <Outlet context={{ businesses, businessId, setBusinessId, loading }} />
    </Layout>
  )
}
