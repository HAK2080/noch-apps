import { Outlet } from 'react-router-dom'
import { Wand2 } from 'lucide-react'
import Layout from '../../../components/Layout'
import SubNav from './SubNav'
import BusinessSelector, { useSelectedBusiness } from './BusinessSelector'

export default function StudioShell() {
  const { businesses, businessId, setBusinessId, loading } = useSelectedBusiness()

  return (
    <Layout>
      <header className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wand2 size={20} className="text-noch-green" />
          <h1 className="text-white text-2xl font-bold">Content Studio</h1>
          <span className="text-noch-muted/60 text-xs ms-2">Noch 4.0</span>
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
