import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { TrendingUp, Zap } from 'lucide-react'
import { getContentExperiments, getBrand } from '../../lib/supabase'
import Layout from '../../components/Layout'
import toast from 'react-hot-toast'

export default function Experiments() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const brandId = searchParams.get('brand')
  const [brand, setBrand] = useState(null)
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!brandId) { navigate('/content'); return }
    getBrand(brandId).then(setBrand)
    getContentExperiments(brandId).then(setExperiments).catch(() => toast.error('Failed to load')).finally(() => setLoading(false))
  }, [brandId])

  const avgDelta = experiments.length > 0
    ? experiments.reduce((sum, e) => sum + (e.delta || 0), 0) / experiments.length
    : 0

  const wins = experiments.filter(e => (e.delta || 0) > 0).length

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <button onClick={() => navigate('/content')} className="text-noch-muted text-xs hover:text-white mb-1 block">← Content Studio</button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-purple-400" /> Experiments
          </h1>
          {brand && <p className="text-noch-muted text-sm">{brand.name} · The self-improvement loop</p>}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-noch-card border border-noch-border rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-white">{experiments.length}</p>
            <p className="text-noch-muted text-xs mt-1">Total experiments</p>
          </div>
          <div className="bg-noch-card border border-noch-border rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-emerald-400">{wins}</p>
            <p className="text-noch-muted text-xs mt-1">Improvements</p>
          </div>
          <div className="bg-noch-card border border-noch-border rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold ${avgDelta > 0 ? 'text-emerald-400' : avgDelta < 0 ? 'text-red-400' : 'text-white'}`}>
              {avgDelta > 0 ? '+' : ''}{avgDelta.toFixed(1)}
            </p>
            <p className="text-noch-muted text-xs mt-1">Avg delta</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-noch-muted">Loading...</div>
        ) : experiments.length === 0 ? (
          <div className="text-center py-16 bg-noch-card border border-noch-border rounded-xl">
            <TrendingUp size={32} className="text-noch-muted mx-auto mb-3" />
            <h3 className="text-white font-semibold mb-2">No experiments yet</h3>
            <p className="text-noch-muted text-sm mb-4">
              Approve and reject posts in the Review Queue. The loop logs every lesson automatically.
            </p>
            <button
              onClick={() => navigate(`/content/review?brand=${brandId}`)}
              className="btn-primary text-sm"
            >
              Go to Review Queue →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {experiments.map(exp => (
              <div key={exp.id} className="bg-noch-card border border-noch-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-400/10 text-purple-400 font-medium capitalize">
                      {exp.experiment_type?.replace('_', ' ')}
                    </span>
                    <p className="text-white text-sm font-medium mt-1">{exp.hypothesis}</p>
                  </div>
                  {exp.delta != null && (
                    <span className={`text-sm font-bold shrink-0 ${exp.delta > 0 ? 'text-emerald-400' : exp.delta < 0 ? 'text-red-400' : 'text-noch-muted'}`}>
                      {exp.delta > 0 ? '+' : ''}{exp.delta?.toFixed(1)}
                    </span>
                  )}
                </div>
                {exp.lesson_learned && (
                  <div className="bg-noch-green/5 border border-noch-green/20 rounded-lg p-2">
                    <p className="text-noch-green text-xs">📌 {exp.lesson_learned}</p>
                  </div>
                )}
                <p className="text-noch-muted text-[10px] mt-2">{new Date(exp.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
