import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'

export default function ApprovalSettings() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.from('expense_approval_settings').select('auto_approve').eq('id', true).maybeSingle()
      .then(({ data, error: loadError }) => {
        if (cancelled) return
        if (loadError) setError('Could not load approval settings. Reload to try again.')
        else setEnabled(data?.auto_approve === true)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load approval settings. Reload to try again.')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  async function toggle() {
    setSaving(true)
    try {
      const { data, error: saveError } = await supabase.rpc('set_expense_auto_approval', { p_enabled: !enabled })
      if (saveError) throw saveError
      setEnabled(data.auto_approve)
      toast.success(data.auto_approve ? 'Expense auto-approval enabled' : 'Expense auto-approval disabled')
    } catch (err) {
      toast.error(err.message || 'Could not save approval setting')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-noch-card border border-noch-border rounded-xl p-4">
      <h3 className="text-white font-semibold mb-3">Expense approvals</h3>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id="expense-auto-approval-label" className="text-sm text-white font-medium">Auto-approve all new expenses</p>
          <p id="expense-auto-approval-help" className="text-xs text-noch-muted mt-1">
            Applies to submissions from all employees, including Receipt Snap. Existing pending expenses stay in the approval queue.
            Expenses reported as paid are also settled using the reported payment method.
            When off, the usual approval process applies, including your separate setting for your own expenses.
          </p>
          {error && <p role="alert" className="text-sm text-red-400 mt-2">{error}</p>}
        </div>
        <button type="button" role="switch" aria-checked={enabled}
          aria-labelledby="expense-auto-approval-label" aria-describedby="expense-auto-approval-help"
          disabled={loading || saving || !!error} onClick={toggle}
          className={`relative w-11 h-6 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-noch-green' : 'bg-noch-border'}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
      <p className="text-xs text-noch-muted mt-2">{loading ? 'Loading…' : saving ? 'Saving…' : enabled ? 'On' : 'Off (default)'}</p>
    </section>
  )
}
