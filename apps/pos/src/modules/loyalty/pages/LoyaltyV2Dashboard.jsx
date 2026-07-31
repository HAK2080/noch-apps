import { createElement, useEffect, useState } from 'react'
import { Archive, Gift, RefreshCw, Sparkles, Target, TrendingUp, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../../components/Layout'
import { getLoyaltyV2Dashboard } from '../lib/loyalty-supabase'

const StatCard = ({ icon, label, value, hint, tone = 'text-noch-green' }) => (
  <div className="card">
    {createElement(icon, { size: 18, className: tone })}
    <p className={`mt-2 text-2xl font-bold ${tone}`}>{value ?? '—'}</p>
    <p className="mt-1 text-sm text-white">{label}</p>
    {hint && <p className="mt-1 text-xs text-noch-muted">{hint}</p>}
  </div>
)

export default function LoyaltyV2Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setStats(await getLoyaltyV2Dashboard())
    } catch (err) {
      setError(err.message || 'Could not load Loyalty V2')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const migrationComplete = stats && stats.migration_total === stats.migration_reconciled
  const attach30 = Number(stats?.attach_rate_30d || 0)
  const attach90 = Number(stats?.attach_rate_90d || 0)

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Loyalty V2</h1>
            <span className="rounded-full border border-noch-green/30 bg-noch-green/10 px-2 py-0.5 text-xs font-semibold text-noch-green">
              Active
            </span>
          </div>
          <p className="mt-1 text-sm text-noch-muted">Private transaction QR, points ledger, rewards and missions</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-2" onClick={() => navigate('/loyalty/missions')}>
            <Target size={16} /> Missions
          </button>
          <button className="btn-secondary flex items-center gap-2" onClick={() => navigate('/loyalty/archive-v1')}>
            <Archive size={16} /> V1 archive
          </button>
          <button className="btn-secondary p-2.5" onClick={load} aria-label="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-noch-muted">Loading Loyalty V2…</p>
      ) : error ? (
        <div className="card border-red-400/30 bg-red-400/5">
          <h2 className="font-semibold text-red-300">Loyalty V2 is not active in the local database</h2>
          <p className="mt-2 text-sm text-noch-muted">{error}</p>
          <p className="mt-3 text-xs text-noch-muted">Apply supabase/migrations/20260730180000_loyalty_v2.sql locally, then retry.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Users} label="Active members" value={stats.members} />
            <StatCard icon={Sparkles} label="Points outstanding" value={stats.points_outstanding} tone="text-cyan-400" />
            <StatCard icon={Gift} label="Pending rewards" value={stats.pending_rewards} tone="text-yellow-400" />
            <StatCard icon={Target} label="Active missions" value={stats.active_missions} tone="text-purple-400" />
          </div>

          <section className="card mb-6">
            <div className="mb-4">
              <h2 className="font-semibold text-white">Last 30 days</h2>
              <p className="text-xs text-noch-muted">Mission, reward, member revenue, QR, and reversal health</p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={Users} label="Mission participants" value={stats.mission_participants_30d} />
              <StatCard icon={Target} label="Mission completions" value={stats.mission_completions_30d} tone="text-purple-400" />
              <StatCard icon={Gift} label="Rewards redeemed" value={stats.rewards_redeemed_30d} tone="text-yellow-400" />
              <StatCard
                icon={TrendingUp}
                label="Linked member revenue"
                value={`${Number(stats.member_revenue_30d || 0).toLocaleString('en', { maximumFractionDigits: 0 })} LYD`}
              />
              <StatCard icon={Sparkles} label="QR claims" value={stats.qr_claims_30d} tone="text-cyan-400" />
              <StatCard
                icon={Sparkles}
                label="QR expired/cancelled"
                value={stats.qr_expired_or_cancelled_30d}
                tone="text-orange-300"
              />
              <StatCard icon={RefreshCw} label="Points reversed" value={stats.reversed_points_30d} tone="text-orange-300" />
            </div>
          </section>

          <section className="card mb-6">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-noch-green" />
              <div>
                <h2 className="font-semibold text-white">Loyalty capture goal</h2>
                <p className="text-xs text-noch-muted">Paid orders linked to an identified member</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 flex items-end justify-between">
                  <span className="text-sm text-white">30-day target</span>
                  <span className={attach30 >= 30 ? 'font-bold text-noch-green' : 'font-bold text-white'}>{attach30}% / 30%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-noch-dark">
                  <div className="h-full rounded-full bg-noch-green" style={{ width: `${Math.min(100, attach30 / 30 * 100)}%` }} />
                </div>
                <p className="mt-2 text-xs text-noch-muted">{stats.linked_orders_30d} of {stats.eligible_orders_30d} completed orders linked</p>
              </div>
              <div>
                <div className="mb-2 flex items-end justify-between">
                  <span className="text-sm text-white">90-day target</span>
                  <span className={attach90 >= 50 ? 'font-bold text-noch-green' : 'font-bold text-white'}>{attach90}% / 50%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-noch-dark">
                  <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(100, attach90 / 50 * 100)}%` }} />
                </div>
                <p className="mt-2 text-xs text-noch-muted">Primary behavior: customer scans the transaction QR; phone lookup remains fallback.</p>
              </div>
            </div>
          </section>

          <section className={`card ${migrationComplete ? 'border-noch-green/30' : 'border-yellow-400/30'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">V1 transfer reconciliation</h2>
                <p className="mt-1 text-sm text-noch-muted">
                  {stats.migration_reconciled} of {stats.migration_total} archived members have matching names and opening balances.
                </p>
              </div>
              <span className={migrationComplete ? 'text-sm font-semibold text-noch-green' : 'text-sm font-semibold text-yellow-300'}>
                {migrationComplete ? 'Reconciled' : 'Needs review'}
              </span>
            </div>
          </section>
        </>
      )}
    </Layout>
  )
}
