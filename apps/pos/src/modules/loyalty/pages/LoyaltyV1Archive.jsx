import { useEffect, useState } from 'react'
import { ArrowLeft, Archive } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../../components/Layout'
import { supabase } from '../../../lib/supabase'

export default function LoyaltyV1Archive() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [archiveStats, setArchiveStats] = useState({ stamps: 0, rewards: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('loyalty_v2_migration_reconciliation').select('*').order('archived_name'),
      supabase.from('loyalty_v1_stamp_archive').select('*', { count: 'exact', head: true }),
      supabase.from('loyalty_v1_reward_archive').select('*', { count: 'exact', head: true }),
    ]).then(([memberResult, stampResult, rewardResult]) => {
        const loadError = memberResult.error || stampResult.error || rewardResult.error
        if (loadError) setError(loadError.message)
        else {
          setRows(memberResult.data || [])
          setArchiveStats({
            stamps: stampResult.count || 0,
            rewards: rewardResult.count || 0,
          })
        }
        setLoading(false)
      })
  }, [])

  return (
    <Layout>
      <div className="mb-6 flex items-start gap-3">
        <button className="btn-secondary p-2.5" onClick={() => navigate('/loyalty')} aria-label="Back to Loyalty V2">
          <ArrowLeft size={17} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <Archive size={19} className="text-noch-muted" />
            <h1 className="text-xl font-bold text-white">Loyalty V1 archive</h1>
            <span className="rounded-full border border-noch-border px-2 py-0.5 text-xs text-noch-muted">Read only</span>
          </div>
          <p className="mt-1 text-sm text-noch-muted">Original names and value preserved at the V2 migration boundary</p>
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-noch-muted">Loading archive…</p>
      ) : error ? (
        <div className="card border-red-400/30 text-sm text-red-300">{error}</div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="card">
              <p className="text-2xl font-bold text-white">{rows.length}</p>
              <p className="mt-1 text-xs text-noch-muted">Archived members</p>
            </div>
            <div className="card">
              <p className="text-2xl font-bold text-white">{archiveStats.stamps}</p>
              <p className="mt-1 text-xs text-noch-muted">Preserved stamp events</p>
            </div>
            <div className="card">
              <p className="text-2xl font-bold text-white">{archiveStats.rewards}</p>
              <p className="mt-1 text-xs text-noch-muted">Preserved reward records</p>
            </div>
          </div>
          <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-noch-border text-xs uppercase tracking-wide text-noch-muted">
              <tr>
                <th className="px-4 py-3">Archived name</th>
                <th className="px-4 py-3">Current name</th>
                <th className="px-4 py-3 text-right">Old points</th>
                <th className="px-4 py-3 text-right">Stamp conversion</th>
                <th className="px-4 py-3 text-right">V2 opening</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.customer_id} className="border-b border-noch-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-white">{row.archived_name}</td>
                  <td className="px-4 py-3 text-white">{row.current_name}</td>
                  <td className="px-4 py-3 text-right text-noch-muted">{row.legacy_points}</td>
                  <td className="px-4 py-3 text-right text-noch-muted">{row.converted_stamp_points}</td>
                  <td className="px-4 py-3 text-right font-semibold text-noch-green">{row.recorded_opening_points}</td>
                  <td className="px-4 py-3">
                    <span className={row.reconciled ? 'text-noch-green' : 'text-red-300'}>
                      {row.reconciled ? 'Matched' : 'Mismatch'}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan="6" className="px-4 py-12 text-center text-noch-muted">No archived members</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </>
      )}
    </Layout>
  )
}
