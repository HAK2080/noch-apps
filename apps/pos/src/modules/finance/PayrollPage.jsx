// PayrollPage.jsx — entry for /payroll. Split out of FinanceDashboard's
// Payroll tab so payroll runs and staff loans get their own sidebar item,
// independent of Team (staff records) and Finance (P&L/cash/reports).

import { Banknote } from 'lucide-react'
import Layout from '../../components/Layout'
import { usePermission } from '../../lib/usePermission'
import ProtectedFeature from '../../components/shared/ProtectedFeature'
import PayrollTab from './tabs/PayrollTab'

export default function PayrollPage() {
  const can = usePermission()
  const readOnly = !can('finance', 'edit')

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Banknote className="text-noch-green" size={24} />
          <h1 className="text-2xl font-bold text-white">Payroll</h1>
        </div>

        <ProtectedFeature feature="finance" action="view" fallback={
          <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
            <Banknote size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
            <p className="text-noch-muted text-sm">You don't have permission to view Payroll.</p>
          </div>
        }>
          <PayrollTab readOnly={readOnly} />
        </ProtectedFeature>
      </div>
    </Layout>
  )
}
