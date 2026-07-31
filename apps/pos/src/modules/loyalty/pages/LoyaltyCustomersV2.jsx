import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../../components/Layout'
import { useLanguage } from '../../../contexts/LanguageContext'
import { getLoyaltyV2Customers } from '../lib/loyalty-supabase'

export default function LoyaltyCustomersV2() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (search = '') => {
    setLoading(true)
    setError('')
    try {
      setRows(await getLoyaltyV2Customers(search))
    } catch (loadError) {
      setError(loadError.message || 'Could not load customers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load('') }, [load])

  return (
    <Layout>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <button className="btn-secondary p-2.5" onClick={() => navigate('/loyalty')}><ArrowLeft size={17} /></button>
          <div>
            <h1 className="text-xl font-bold text-white">{ar ? 'عملاء الولاء V2' : 'V2 loyalty customers'}</h1>
            <p className="text-sm text-noch-muted">{ar ? 'عرض تشغيلي مخفي البيانات الحساسة؛ لا تظهر أرقام الهاتف الكاملة.' : 'Privacy-safe owner view; full contact details are never displayed.'}</p>
          </div>
        </div>
        <button className="btn-secondary p-2.5" onClick={() => load(query)}><RefreshCw size={16} /></button>
      </header>

      <form className="card mb-4 flex gap-2" onSubmit={event => { event.preventDefault(); load(query) }}>
        <Search size={17} className="mt-2.5 text-noch-muted" />
        <input className="input flex-1" value={query} onChange={event => setQuery(event.target.value)} placeholder={ar ? 'الاسم أو رقم العضوية' : 'Name or loyalty number'} />
        <button className="btn-primary" type="submit">{ar ? 'بحث' : 'Search'}</button>
      </form>

      {error && <div className="card mb-4 border-red-400/30 text-red-300">{error}</div>}
      {loading ? <p className="py-12 text-center text-noch-muted">{ar ? 'جارٍ التحميل…' : 'Loading…'}</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="text-xs text-noch-muted">
              <tr>
                <th className="py-2 text-start">{ar ? 'العميل' : 'Customer'}</th>
                <th className="text-start">{ar ? 'الهاتف' : 'Phone'}</th>
                <th className="text-end">{ar ? 'النقاط' : 'Points'}</th>
                <th className="text-end">{ar ? 'الطلبات' : 'Orders'}</th>
                <th className="text-end">{ar ? 'المبيعات' : 'Sales'}</th>
                <th className="text-end">{ar ? 'المكافآت' : 'Rewards'}</th>
                <th className="text-start">{ar ? 'الموافقة' : 'Consent'}</th>
                <th className="text-start">{ar ? 'آخر طلب' : 'Last order'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-t border-noch-border">
                  <td className="py-3">
                    <p className="font-medium text-white">{row.full_name}</p>
                    <p className="text-xs text-noch-muted">{row.loyalty_number}{row.auth_linked ? ' · OTP' : ''}</p>
                  </td>
                  <td className="text-noch-muted">{row.masked_phone || '—'}</td>
                  <td className="text-end text-white">{row.points_balance}</td>
                  <td className="text-end text-white">{row.linked_orders}</td>
                  <td className="text-end text-white">{Number(row.linked_sales_lyd || 0).toFixed(2)} LYD</td>
                  <td className="text-end text-white">{row.pending_rewards}</td>
                  <td>
                    <span className={row.consent_status === 'verified' ? 'text-noch-green' : 'text-orange-200'}>
                      {row.consent_status === 'verified' ? (ar ? 'موثقة' : 'Verified') : (ar ? 'لا إرسال' : 'Suppressed')}
                    </span>
                  </td>
                  <td className="text-noch-muted">{row.last_linked_order_at ? new Date(row.last_linked_order_at).toLocaleDateString(ar ? 'ar-LY' : 'en-GB') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="py-12 text-center text-noch-muted"><ShieldAlert className="mx-auto mb-2" />{ar ? 'لا توجد نتائج' : 'No matching customers'}</div>}
        </div>
      )}
    </Layout>
  )
}
