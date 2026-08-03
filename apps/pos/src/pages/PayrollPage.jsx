import Layout from '../components/Layout'
import PayrollTab from '../modules/finance/tabs/PayrollTab'
import { useLanguage } from '../contexts/LanguageContext'

export default function PayrollPage() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-none" dir={ar ? 'rtl' : 'ltr'}>
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-white">
            {ar ? 'الرواتب' : 'Payroll'}
          </h1>
          <p className="text-sm text-noch-muted mt-1">
            {ar
              ? 'إنشاء مسودات الرواتب وتعديلها وإتمامها.'
              : 'Generate draft payrolls, edit them, and complete runs.'}
          </p>
        </div>
        <PayrollTab />
      </div>
    </Layout>
  )
}
