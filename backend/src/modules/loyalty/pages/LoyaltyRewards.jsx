import { useState, useEffect } from 'react'
import { Gift, RefreshCw, Check } from 'lucide-react'
import { getLoyaltyRewards, redeemLoyaltyReward } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useLanguage } from '../../../contexts/LanguageContext'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

export default function LoyaltyRewards() {
  const { user } = useAuth()
  const { lang } = useLanguage()
  const [rewards, setRewards] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const ar = lang === 'ar'

  const load = async () => {
    setLoading(true)
    try {
      const data = await getLoyaltyRewards(filter)
      setRewards(data)
    } catch {
      toast.error(ar ? 'خطأ في التحميل' : 'Load error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const handleRedeem = async (rewardId, customerName) => {
    try {
      await redeemLoyaltyReward(rewardId, user?.id)
      toast.success(ar ? `🎁 تم استرداد مكافأة ${customerName}!` : `🎁 ${customerName}'s reward redeemed!`)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-white font-bold text-xl">{ar ? 'المكافآت' : 'Rewards'}</h1>
          <p className="text-noch-muted text-sm">{rewards.length} {ar ? 'مكافأة' : 'rewards'}</p>
        </div>
        <button onClick={load} className="btn-secondary p-2.5"><RefreshCw size={16} /></button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['pending', 'redeemed', 'expired'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
              ${filter === s ? 'bg-noch-green/20 border-noch-green text-noch-green' : 'border-noch-border text-noch-muted'}`}
          >
            {s === 'pending' ? (ar ? 'بانتظار الاسترداد' : 'Pending')
              : s === 'redeemed' ? (ar ? 'مستردة' : 'Redeemed')
              : (ar ? 'منتهية' : 'Expired')}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-12">...</p>
      ) : rewards.length === 0 ? (
        <div className="text-center py-16">
          <Gift size={40} className="text-noch-muted mx-auto mb-3" />
          <p className="text-noch-muted">{ar ? 'لا توجد مكافآت' : 'No rewards'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rewards.map(r => (
            <div key={r.id} className={`card flex items-center gap-3
              ${r.status === 'pending' ? 'border-yellow-500/30 bg-yellow-500/5' : ''}`}>
              <Gift size={20} className={r.status === 'pending' ? 'text-yellow-400' : 'text-noch-muted'} />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{r.customer?.full_name}</p>
                <p className="text-noch-muted text-xs">
                  🎁 {r.description || (ar ? 'مشروب مجاني' : 'Free drink')}
                </p>
                <p className="text-noch-muted text-xs">
                  {r.status === 'redeemed'
                    ? (ar ? `مستردة في: ${new Date(r.redeemed_at).toLocaleDateString()}` : `Redeemed: ${new Date(r.redeemed_at).toLocaleDateString()}`)
                    : r.status === 'expired'
                    ? (ar ? 'منتهية الصلاحية' : 'Expired')
                    : (ar ? `تنتهي في: ${new Date(r.expires_at).toLocaleDateString()}` : `Expires: ${new Date(r.expires_at).toLocaleDateString()}`)
                  }
                </p>
              </div>
              {r.status === 'pending' && (
                <button
                  onClick={() => handleRedeem(r.id, r.customer?.full_name)}
                  className="btn-primary flex items-center gap-1 text-sm px-3 py-1.5"
                >
                  <Check size={14} />
                  {ar ? 'استرداد' : 'Redeem'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
