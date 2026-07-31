import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Layout from '../../../components/Layout'
import { useLanguage } from '../../../contexts/LanguageContext'
import { getAllTeamMembers } from '../../../lib/profiles'
import PayrollTab from '../../finance/tabs/PayrollTab'
import {
  getWorkforceSummary,
  listActiveBranches,
  listWorkforceAttendance,
  listWorkforceSchedule,
  publishScheduleWeek,
  upsertScheduleShift,
} from '../lib/workforce-supabase'

const isoDate = date => date.toISOString().slice(0, 10)

function monday(date = new Date()) {
  const result = new Date(date)
  const day = result.getDay() || 7
  result.setDate(result.getDate() - day + 1)
  result.setHours(0, 0, 0, 0)
  return result
}

function metricState(value) {
  return value === null || value === undefined ? '—' : value
}

export default function WorkforceHub() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [tab, setTab] = useState('overview')
  const [summary, setSummary] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [schedule, setSchedule] = useState([])
  const [team, setTeam] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(isoDate(monday()))
  const [form, setForm] = useState({ profileId: '', branchId: '', startsAt: '', endsAt: '', note: '' })

  const weekEnd = useMemo(() => {
    const result = new Date(`${weekStart}T00:00:00`)
    result.setDate(result.getDate() + 7)
    return result
  }, [weekStart])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const from = new Date(`${weekStart}T00:00:00`)
      const [nextSummary, nextAttendance, nextSchedule, nextTeam, nextBranches] = await Promise.all([
        getWorkforceSummary(isoDate(from), isoDate(new Date(weekEnd.getTime() - 86400000))),
        listWorkforceAttendance(),
        listWorkforceSchedule(from.toISOString(), weekEnd.toISOString()),
        getAllTeamMembers(),
        listActiveBranches(),
      ])
      setSummary(nextSummary)
      setAttendance(nextAttendance)
      setSchedule(nextSchedule)
      setTeam(nextTeam.filter(person => person.is_active !== false))
      setBranches(nextBranches)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }, [weekEnd, weekStart])

  useEffect(() => { load() }, [load])

  const saveShift = async event => {
    event.preventDefault()
    try {
      await upsertScheduleShift({
        profileId: form.profileId,
        branchId: form.branchId,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        note: form.note,
      })
      setForm({ profileId: '', branchId: '', startsAt: '', endsAt: '', note: '' })
      toast.success(ar ? 'تم حفظ الوردية كمسودة' : 'Shift saved as draft')
      await load()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const publish = async () => {
    try {
      const count = await publishScheduleWeek(weekStart)
      toast.success(ar ? `تم نشر ${count} وردية` : `${count} shifts published`)
      await load()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const labels = {
    overview: ar ? 'نظرة عامة' : 'Overview',
    attendance: ar ? 'الحضور' : 'Attendance',
    schedule: ar ? 'الجدول' : 'Schedule',
    payroll: ar ? 'الرواتب' : 'Payroll',
  }
  const teamSummary = summary?.team || {}
  const attendanceSummary = summary?.attendance || {}
  const scheduleSummary = summary?.schedule || {}
  const payrollSummary = summary?.payroll || {}

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5" dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{ar ? 'الفريق والحضور والرواتب' : 'Team, attendance & payroll'}</h1>
            <p className="text-sm text-noch-muted mt-1">
              {ar ? 'مصدر واحد للموظفين، الحضور، الجدول، واعتماد الرواتب.' : 'One control point for employees, attendance, schedules, and payroll approval.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/staff/team" className="btn-secondary">{ar ? 'دليل الفريق' : 'Team directory'}</Link>
            <button onClick={load} className="btn-secondary flex items-center gap-2"><RefreshCw size={14} />{ar ? 'تحديث' : 'Refresh'}</button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-noch-border">
          {Object.entries(labels).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 whitespace-nowrap border-b-2 ${tab === id ? 'border-noch-green text-noch-green' : 'border-transparent text-noch-muted'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading && <div className="text-noch-muted">{ar ? 'جارٍ تحميل أدلة العمل…' : 'Loading workforce evidence…'}</div>}

        {!loading && tab === 'overview' && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                [ar ? 'الموظفون النشطون' : 'Active employees', teamSummary.active_employees],
                [ar ? 'سجلات حضور مفتوحة' : 'Open attendance', attendanceSummary.open_attendance],
                [ar ? 'ساعات منشورة' : 'Published hours', scheduleSummary.published_hours],
                [ar ? 'حالة الرواتب' : 'Payroll evidence', payrollSummary.evidence_status || payrollSummary.status],
              ].map(([label, value]) => (
                <div key={label} className="bg-noch-card border border-noch-border rounded-xl p-4">
                  <p className="text-xs text-noch-muted">{label}</p>
                  <p className="text-xl font-bold text-white mt-1">{metricState(value)}</p>
                </div>
              ))}
            </div>
            <div className="bg-noch-card border border-noch-border rounded-xl p-5">
              <h2 className="text-white font-semibold">{ar ? 'استثناءات تتطلب الانتباه' : 'Exceptions requiring attention'}</h2>
              <div className="mt-3 space-y-2 text-sm">
                {[
                  [teamSummary.missing_start_date, ar ? 'موظفون بدون تاريخ بدء' : 'Employees missing a start date'],
                  [teamSummary.missing_allocation, ar ? 'موظفون بدون فرع أو مركز تكلفة' : 'Employees missing branch/cost allocation'],
                  [attendanceSummary.stale_open_attendance, ar ? 'حضور مفتوح لأكثر من 16 ساعة' : 'Attendance open longer than 16 hours'],
                ].map(([count, label]) => (
                  <div key={label} className="flex items-center justify-between border-b border-noch-border/60 pb-2">
                    <span className="flex items-center gap-2 text-noch-muted"><AlertTriangle size={15} className={count ? 'text-amber-400' : 'text-noch-green'} />{label}</span>
                    <strong className="text-white">{metricState(count)}</strong>
                  </div>
                ))}
              </div>
              <p className="text-xs text-noch-muted mt-4">
                {ar ? 'يبدأ يوم العمل في طرابلس الساعة 05:00. القيم غير المتاحة لا تُعرض كصفر.' : 'Tripoli business day starts at 05:00. Unavailable evidence is never converted to zero.'}
              </p>
            </div>
          </>
        )}

        {!loading && tab === 'attendance' && (
          <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-noch-border">
              <h2 className="text-white font-semibold">{ar ? 'دليل الحضور' : 'Attendance evidence'}</h2>
              <p className="text-xs text-noch-muted">{ar ? 'الفترات المفتوحة لا تُحسب كساعات مدفوعة.' : 'Open intervals never count as paid hours.'}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-noch-muted"><tr><th className="p-3 text-start">{ar ? 'الموظف' : 'Employee'}</th><th className="p-3 text-start">{ar ? 'الدخول' : 'Clock in'}</th><th className="p-3 text-start">{ar ? 'الخروج' : 'Clock out'}</th><th className="p-3 text-start">{ar ? 'الساعات' : 'Hours'}</th></tr></thead>
                <tbody>{attendance.map(row => <tr key={row.id} className="border-t border-noch-border"><td className="p-3 text-white">{row.full_name}</td><td className="p-3 text-noch-muted">{new Date(row.clocked_in_at).toLocaleString(ar ? 'ar-LY' : 'en-GB')}</td><td className="p-3 text-noch-muted">{row.clocked_out_at ? new Date(row.clocked_out_at).toLocaleString(ar ? 'ar-LY' : 'en-GB') : (ar ? 'مفتوح' : 'Open')}</td><td className="p-3 text-white">{metricState(row.hours)}</td></tr>)}</tbody>
              </table>
              {!attendance.length && <p className="p-8 text-center text-noch-muted">{ar ? 'لا يوجد دليل حضور مسجل.' : 'No attendance evidence recorded.'}</p>}
            </div>
          </div>
        )}

        {!loading && tab === 'schedule' && (
          <div className="grid lg:grid-cols-[360px_1fr] gap-4">
            <form onSubmit={saveShift} className="bg-noch-card border border-noch-border rounded-xl p-4 space-y-3">
              <h2 className="text-white font-semibold">{ar ? 'إضافة وردية مخططة' : 'Add planned shift'}</h2>
              <input type="date" value={weekStart} onChange={event => setWeekStart(event.target.value)} className="input-field w-full" />
              <select required value={form.profileId} onChange={event => setForm({ ...form, profileId: event.target.value })} className="input-field w-full"><option value="">{ar ? 'اختر الموظف' : 'Select employee'}</option>{team.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select>
              <select required value={form.branchId} onChange={event => setForm({ ...form, branchId: event.target.value })} className="input-field w-full"><option value="">{ar ? 'اختر الفرع' : 'Select branch'}</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{ar && branch.name_ar ? branch.name_ar : branch.name}</option>)}</select>
              <input required type="datetime-local" value={form.startsAt} onChange={event => setForm({ ...form, startsAt: event.target.value })} className="input-field w-full" />
              <input required type="datetime-local" value={form.endsAt} onChange={event => setForm({ ...form, endsAt: event.target.value })} className="input-field w-full" />
              <input value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder={ar ? 'ملاحظة اختيارية' : 'Optional note'} className="input-field w-full" />
              <button className="btn-primary w-full">{ar ? 'حفظ كمسودة' : 'Save draft'}</button>
              <button type="button" onClick={publish} className="btn-secondary w-full">{ar ? 'نشر أسبوع العمل' : 'Publish this week'}</button>
            </form>
            <div className="bg-noch-card border border-noch-border rounded-xl p-4">
              <h2 className="text-white font-semibold mb-3">{ar ? 'ورديات الأسبوع' : 'Week shifts'}</h2>
              <div className="space-y-2">{schedule.map(shift => <div key={shift.id} className="border border-noch-border rounded-lg p-3"><div className="flex justify-between gap-3"><strong className="text-white">{shift.profiles?.full_name}</strong><span className={shift.status === 'published' ? 'text-noch-green' : 'text-amber-400'}>{shift.status}</span></div><p className="text-xs text-noch-muted mt-1">{new Date(shift.starts_at).toLocaleString(ar ? 'ar-LY' : 'en-GB')} — {new Date(shift.ends_at).toLocaleTimeString(ar ? 'ar-LY' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</p></div>)}</div>
              {!schedule.length && <p className="py-8 text-center text-noch-muted">{ar ? 'لا توجد ورديات مخططة لهذا الأسبوع.' : 'No planned shifts for this week.'}</p>}
            </div>
          </div>
        )}

        {tab === 'payroll' && <PayrollTab />}
      </div>
    </Layout>
  )
}
