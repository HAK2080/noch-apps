// POSEndOfDay.jsx — Shift closing / end-of-day report
// Route: /pos/:branchId/end-of-day

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Printer, CheckCircle, ArrowDownCircle,
  ArrowUpCircle, Wallet, Coins, Plus, Banknote, CreditCard, ReceiptText,
} from 'lucide-react'
import {
  getPOSBranch, getOpenShift, closeShift, getShiftSummary,
  getCashMovements, getShiftControl, recordCashMovement,
} from '../lib/pos-supabase'
import { normalizeShiftControl } from '../lib/sales-control'
import { printReceipt } from '../lib/escpos'
import { getServedBy } from '../lib/pos-session'
import Layout from '../../../components/Layout'
import { usePermission } from '../../../lib/usePermission'
import { AccessDenied } from '../../../components/shared/ProtectedFeature'
import { useLanguage } from '../../../contexts/LanguageContext'
import toast from 'react-hot-toast'
import { format } from '../lib/money'
import { getCashCloseState } from '../lib/end-of-day-close'

const MOVEMENT_TYPES = [
  { key: 'paid_in', labelKey: 'eodPaidIn', icon: ArrowDownCircle, color: 'text-noch-green', hintKey: 'eodPaidInHint' },
  { key: 'paid_out', labelKey: 'eodPaidOut', icon: ArrowUpCircle, color: 'text-yellow-400', hintKey: 'eodPaidOutHint' },
  { key: 'safe_drop', labelKey: 'eodSafeDrop', icon: Wallet, color: 'text-blue-400', hintKey: 'eodSafeDropHint' },
  { key: 'tip_out', labelKey: 'eodTipOut', icon: Coins, color: 'text-purple-400', hintKey: 'eodTipOutHint' },
  { key: 'drawer_no_sale', labelKey: 'eodDrawerPop', icon: Wallet, color: 'text-noch-muted', hintKey: 'eodDrawerPopHint' },
]

function CashMovementModal({ branchId, shiftId, onClose, onSaved, t }) {
  const [type, setType] = useState('paid_in')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const meta = MOVEMENT_TYPES.find(m => m.key === type)

  const handleSave = async () => {
    if (type !== 'drawer_no_sale' && (!amount || Number(amount) <= 0)) {
      toast.error(t('eodEnterPositiveAmount'))
      return
    }
    setSaving(true)
    try {
      const servedBy = getServedBy()?.id || null
      await recordCashMovement({
        branch_id: branchId,
        shift_id: shiftId,
        movement_type: type,
        amount: type === 'drawer_no_sale' ? 0 : Number(amount),
        reason: reason || null,
        served_by: servedBy,
      })
      toast.success(t('eodMovementRecorded'))
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message || t('eodMovementFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm p-5">
        <h2 className="text-white font-bold text-lg mb-1">{t('eodCashMovement')}</h2>
        <p className="text-noch-muted text-xs mb-4">{meta && t(meta.hintKey)}</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {MOVEMENT_TYPES.map(m => (
            <button
              key={m.key}
              onClick={() => setType(m.key)}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg text-start text-xs border ${
                type === m.key ? 'bg-noch-green/10 border-noch-green/50 text-noch-green' : 'border-noch-border text-noch-muted hover:border-noch-green/20'
              }`}
            >
              <m.icon size={14} />
              {t(m.labelKey)}
            </button>
          ))}
        </div>
        {type !== 'drawer_no_sale' && (
          <>
            <label className="label block mb-1">{t('eodAmount')}</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="input w-full mb-3"
              step="0.01"
              min="0"
              autoFocus
            />
          </>
        )}
        <label className="label block mb-1">{t('eodReason')}</label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="input w-full resize-none"
          rows={2}
          placeholder={t('eodReasonPlaceholder')}
        />
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">{t('eodCancel')}</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? t('eodSaving') : t('eodSave')}
          </button>
        </div>
      </div>
    </div>
  )
}

function CloseoutMetric({ label, value, suffix, icon: Icon, tone = 'neutral' }) {
  const tones = {
    green: 'border-noch-green/40 bg-noch-green/[0.08] shadow-[0_0_24px_rgba(55,214,122,0.06)]',
    amber: 'border-amber-400/40 bg-amber-400/[0.07] shadow-[0_0_24px_rgba(251,191,36,0.05)]',
    blue: 'border-blue-400/40 bg-blue-400/[0.07] shadow-[0_0_24px_rgba(96,165,250,0.05)]',
    neutral: 'border-noch-border bg-noch-card',
  }
  const iconTones = {
    green: 'text-noch-green bg-noch-green/10',
    amber: 'text-amber-300 bg-amber-400/10',
    blue: 'text-blue-300 bg-blue-400/10',
    neutral: 'text-noch-muted bg-white/[0.04]',
  }

  return (
    <div data-closeout-metric className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        {Icon && (
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconTones[tone]}`}>
            <Icon size={16} />
          </span>
        )}
        <p className="text-noch-muted text-xs font-medium">{label}</p>
      </div>
      <p className="text-white font-bold text-2xl tracking-tight">
        {value}
        {suffix && <span className="text-noch-muted text-xs font-medium ms-1.5">{suffix}</span>}
      </p>
    </div>
  )
}

function MissingCashWarning({ t, notes, onNotesChange, onReturn, onCloseAnyway, closing }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-noch-card shadow-2xl">
        <div className="p-5 border-b border-noch-border flex gap-3">
          <span className="w-10 h-10 rounded-xl bg-amber-400/10 text-amber-300 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 className="text-white font-bold text-lg">{t('eodMissingCashTitle')}</h2>
            <p className="text-noch-muted text-sm mt-1 leading-relaxed">{t('eodMissingCashMessage')}</p>
          </div>
        </div>
        <div className="p-5">
          <label className="label block mb-1">{t('eodNotesOptional')}</label>
          <textarea
            value={notes}
            onChange={event => onNotesChange(event.target.value)}
            className="input w-full resize-none"
            rows={3}
            placeholder={t('eodNotesPlaceholder')}
          />
          <p className="text-amber-300/80 text-xs mt-2">{t('eodMissingCashNoteHint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
            <button onClick={onReturn} disabled={closing} className="btn-secondary">
              {t('eodReturnToCount')}
            </button>
            <button
              onClick={onCloseAnyway}
              disabled={closing}
              className="rounded-xl bg-amber-400 text-black font-semibold px-4 py-2.5 disabled:opacity-50"
            >
              {closing ? t('eodClosing') : t('eodCloseWithoutCount')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function POSEndOfDay() {
  const can = usePermission()
  const allowed = can('pos', 'end_of_day')
  const { t, lang } = useLanguage()
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  const [shift, setShift] = useState(null)
  const [summary, setSummary] = useState(null)
  const [shiftControl, setShiftControl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actualCash, setActualCash] = useState('')
  const [closing, setClosing] = useState(false)
  const [notes, setNotes] = useState('')
  const [cashMovements, setCashMovements] = useState([])
  const [showCashModal, setShowCashModal] = useState(false)
  const [showMissingCashWarning, setShowMissingCashWarning] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [b, s] = await Promise.all([
          getPOSBranch(branchId),
          getOpenShift(branchId),
        ])
        setBranch(b)
        setShift(s)
        if (s) {
          const [sum, movs, control] = await Promise.all([
            getShiftSummary(s.id),
            getCashMovements(s.id),
            getShiftControl(s.id),
          ])
          setSummary(sum)
          setCashMovements(movs)
          setShiftControl(normalizeShiftControl(control))
        }
      } catch (err) {
        toast.error(err.message || t('eodLoadFailed'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [branchId, t])

  const expectedCash = shiftControl?.expected_drawer_cash
    ?? (shift ? parseFloat(shift.expected_cash) : 0)
  const cashCloseState = getCashCloseState(actualCash, expectedCash)
  const actualCashNum = cashCloseState.isMissing ? null : cashCloseState.closingCash
  const cashDiff = cashCloseState.difference

  const handleCloseShift = async (allowMissing = false) => {
    if (!shift) return
    if (cashCloseState.isInvalid) {
      toast.error(t('eodInvalidCash'))
      return
    }
    if (cashCloseState.isMissing && !allowMissing) {
      setShowMissingCashWarning(true)
      toast.error(t('eodMissingCashToast'))
      return
    }

    setShowMissingCashWarning(false)
    setClosing(true)
    try {
      const auditNotes = cashCloseState.isMissing
        ? [notes.trim(), '[Cash count not entered at close]'].filter(Boolean).join('\n')
        : notes
      const result = await closeShift(shift.id, {
        closing_cash: actualCashNum,
        cash_counted: !cashCloseState.isMissing,
        cash_difference: cashDiff,
        notes: auditNotes,
        closed_by: getServedBy()?.id || null,
      })
      toast.success(t('eodShiftClosed'))
      if (result?.audit_warning) toast.error(result.audit_warning)
      navigate('/pos')
    } catch (err) {
      toast.error(err.message || t('eodCloseFailed'))
    } finally {
      setClosing(false)
    }
  }

  const handlePrintZReport = async () => {
    if (!shift || !summary) return
    // Build a z-report order-like object for printing
    const zOrder = {
      order_number: `Z-${shift.id.slice(0, 8)}`,
      subtotal: shift.total_sales,
      total: shift.total_sales,
      discount_amount: shift.total_discounts,
      payment_method: 'z-report',
      created_at: new Date().toISOString(),
    }
    const prestoTotal = parseFloat(shift.total_presto_sales || 0)
    const prestoUncollected = parseFloat(shift.total_presto_uncollected || 0)
    const paidIn   = parseFloat(shift.total_paid_in   || 0)
    const paidOut  = parseFloat(shift.total_paid_out  || 0)
    const safeDrop = parseFloat(shift.total_safe_drop || 0)
    const tipOut   = parseFloat(shift.total_tip_out   || 0)
    const zItems = [
      { product_name: `${t('eodOrders')}: ${shift.total_orders}`, quantity: 1, unit_price: 0, total: 0 },
      { product_name: t('eodCashSales'), quantity: 1, unit_price: parseFloat(shift.total_cash_sales), total: parseFloat(shift.total_cash_sales) },
      { product_name: t('eodCardSales'), quantity: 1, unit_price: parseFloat(shift.total_card_sales), total: parseFloat(shift.total_card_sales) },
      ...(prestoTotal > 0 ? [
        { product_name: t('eodPrestoSales'), quantity: 1, unit_price: prestoTotal, total: prestoTotal },
        { product_name: `  ${t('eodOwedByPresto')}`, quantity: 1, unit_price: prestoUncollected, total: prestoUncollected },
      ] : []),
      ...(paidIn   > 0 ? [{ product_name: t('eodPaidIn'),   quantity: 1, unit_price: paidIn,   total: paidIn   }] : []),
      ...(paidOut  > 0 ? [{ product_name: t('eodPaidOut'),  quantity: 1, unit_price: paidOut,  total: paidOut  }] : []),
      ...(safeDrop > 0 ? [{ product_name: t('eodSafeDrop'), quantity: 1, unit_price: safeDrop, total: safeDrop }] : []),
      ...(tipOut   > 0 ? [{ product_name: t('eodTipOut'),   quantity: 1, unit_price: tipOut,   total: tipOut   }] : []),
      ...(summary.topProducts || []).slice(0, 5).map(p => ({
        product_name: `  ${p.name} x${p.qty}`,
        quantity: 1,
        unit_price: p.total,
        total: p.total,
      })),
    ]
    try {
      await printReceipt(zOrder, { ...branch, receipt_header: `${t('eodZReport')} - ${lang === 'ar' ? (branch?.name_ar || branch?.name) : branch?.name}` }, zItems)
      toast.success(t('eodPrintSuccess'))
    } catch (err) {
      toast.error(err.message || t('eodPrintFailed'))
    }
  }

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">{t('eodLoading')}</p></Layout>
  if (!allowed) return <Layout><AccessDenied message={t('eodAccessDenied')} /></Layout>

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} className="rtl:rotate-180" />
          </button>
          <div>
            <h1 className="text-white font-bold text-xl">{t('eodTitle')}</h1>
            <p className="text-noch-muted text-sm">{lang === 'ar' ? (branch?.name_ar || branch?.name) : branch?.name}</p>
          </div>
        </div>

        {!shift && (
          <div className="card text-center py-10">
            <p className="text-noch-muted">{t('eodNoOpenShift')}</p>
            <button onClick={() => navigate('/pos')} className="btn-secondary mt-4">{t('eodGoToPos')}</button>
          </div>
        )}

        {shift && summary && (
          <>
            {shiftControl && (
              shiftControl.counterStatus === 'warning'
              || shiftControl.dataStatus !== 'complete'
              || shiftControl.paymentStatus !== 'reconciled'
            ) && (
              <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {lang === 'ar'
                  ? 'توجد فروقات أو بيانات تاريخية مُعاد بناؤها. راجع تفاصيل الوردية قبل الإقفال.'
                  : 'This shift contains a variance or reconstructed history. Review the shift details before closing.'}
              </div>
            )}
            {/* Shared by Bloom and Noch: make closeout numbers visually distinct. */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <CloseoutMetric
                label={t('eodTotalSales')}
                value={format(shiftControl?.net_sales ?? shift.total_sales)}
                suffix={t('eodCurrency')}
                icon={ReceiptText}
                tone="green"
              />
              <CloseoutMetric
                label={t('eodOrders')}
                value={shiftControl?.order_count ?? shift.total_orders}
                icon={ReceiptText}
              />
              <CloseoutMetric
                label={t('eodCashSales')}
                value={format(shiftControl?.net_cash_tender ?? shift.total_cash_sales)}
                suffix={t('eodCurrency')}
                icon={Banknote}
                tone="amber"
              />
              <CloseoutMetric
                label={t('eodCardSales')}
                value={format(shiftControl?.net_card_tender ?? shift.total_card_sales)}
                suffix={t('eodCurrency')}
                icon={CreditCard}
                tone="blue"
              />
            </div>

            {/* Presto card — shown only when there's Presto activity. Counted in
                Total Sales above; the "Owed by Presto" line is the portion not
                yet reconciled against Presto's portal. */}
            {parseFloat(shift.total_presto_sales || 0) > 0 && (
              <div className="card mb-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-semibold text-sm">{t('eodPrestoDelivery')}</p>
                  <p className="text-noch-muted text-xs">{t('eodIncludedInTotal')}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-noch-muted text-xs mb-0.5">{t('eodPrestoSales')}</p>
                    <p className="text-white font-bold">{format(shift.total_presto_sales)} {t('eodCurrency')}</p>
                  </div>
                  <div>
                    <p className="text-noch-muted text-xs mb-0.5">{t('eodOwedByPresto')}</p>
                    <p className={`font-bold ${parseFloat(shift.total_presto_uncollected || 0) > 0 ? 'text-yellow-400' : 'text-noch-green'}`}>
                      {format(shift.total_presto_uncollected || 0)} {t('eodCurrency')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Top products */}
            {summary.topProducts?.length > 0 && (
              <div className="card mb-5">
                <h3 className="text-white font-semibold mb-3 text-sm">{t('eodTopProducts')}</h3>
                {summary.topProducts.map((p, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-noch-border/50 last:border-0">
                    <span className="text-white text-sm">{lang === 'ar' ? (p.name_ar || p.name) : p.name}</span>
                    <div className="text-end">
                      <span className="text-noch-muted text-xs">{p.qty} {t('eodSold')}</span>
                      <span className="text-noch-green text-sm font-medium ms-3">{format(p.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cash Movements — paid in / out / safe drop / tip out */}
            <div className="card mb-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">{t('eodCashMovements')}</h3>
                <button
                  onClick={() => setShowCashModal(true)}
                  className="btn-secondary text-xs px-3 py-1 flex items-center gap-1"
                >
                  <Plus size={12} /> {t('eodAdd')}
                </button>
              </div>
              {/* Running totals */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <div className="flex justify-between bg-noch-dark/50 rounded px-2 py-1">
                  <span className="text-noch-muted">{t('eodPaidIn')}</span>
                  <span className="text-noch-green">+{format(shift.total_paid_in || 0)}</span>
                </div>
                <div className="flex justify-between bg-noch-dark/50 rounded px-2 py-1">
                  <span className="text-noch-muted">{t('eodPaidOut')}</span>
                  <span className="text-yellow-400">-{format(shift.total_paid_out || 0)}</span>
                </div>
                <div className="flex justify-between bg-noch-dark/50 rounded px-2 py-1">
                  <span className="text-noch-muted">{t('eodSafeDrop')}</span>
                  <span className="text-blue-400">-{format(shift.total_safe_drop || 0)}</span>
                </div>
                <div className="flex justify-between bg-noch-dark/50 rounded px-2 py-1">
                  <span className="text-noch-muted">{t('eodTipOut')}</span>
                  <span className="text-purple-400">-{format(shift.total_tip_out || 0)}</span>
                </div>
              </div>
              {/* Recent list */}
              {cashMovements.length === 0 ? (
                <p className="text-noch-muted text-xs text-center py-2">{t('eodNoMovements')}</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {cashMovements.slice(0, 10).map(m => {
                    const meta = MOVEMENT_TYPES.find(x => x.key === m.movement_type)
                    return (
                      <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b border-noch-border/30 last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {meta?.icon && <meta.icon size={12} className={meta.color} />}
                          <div className="min-w-0">
                            <p className="text-white truncate">{meta ? t(meta.labelKey) : m.movement_type}</p>
                            {m.reason && <p className="text-noch-muted truncate">{m.reason}</p>}
                          </div>
                        </div>
                        <span className={`shrink-0 font-mono ${meta?.color || 'text-white'}`}>
                          {m.movement_type === 'drawer_no_sale' ? '—' : `${m.movement_type === 'paid_in' ? '+' : '-'}${format(m.amount)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Cash count */}
            <div className="rounded-2xl border border-amber-400/25 bg-gradient-to-b from-amber-400/[0.055] to-noch-card p-4 mb-5">
              <h3 className="text-white font-bold text-lg">{t('eodCashCount')}</h3>
              <p className="text-noch-muted text-xs mt-1 mb-4">{t('eodCountBeforeClosing')}</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <CloseoutMetric
                  label={t('eodExpectedCash')}
                  value={format(expectedCash)}
                  suffix={t('eodCurrency')}
                  icon={Banknote}
                  tone="amber"
                />
                <CloseoutMetric
                  label={t('eodOpeningCash')}
                  value={format(shift.opening_cash)}
                  suffix={t('eodCurrency')}
                  icon={Wallet}
                  tone="blue"
                />
              </div>

              <label className="label block mb-1 text-amber-200">{t('eodActualCash')}</label>
              <input
                type="number"
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                placeholder={t('eodActualCashPlaceholder')}
                className={`input w-full mb-3 text-xl font-bold py-3 border-2 ${
                  cashCloseState.isMissing
                    ? 'border-amber-400/55 focus:border-amber-300'
                    : cashCloseState.isInvalid
                      ? 'border-red-400/60 focus:border-red-300'
                      : 'border-noch-green/50 focus:border-noch-green'
                }`}
                step="0.01"
                min="0"
              />

              {!cashCloseState.isMissing && !cashCloseState.isInvalid && (
                <div className={`flex justify-between items-center px-3 py-2 rounded-lg ${
                  cashDiff === 0 ? 'bg-noch-green/10 border border-noch-green/20' :
                  cashDiff > 0 ? 'bg-blue-400/10 border border-blue-400/20' :
                  'bg-red-400/10 border border-red-400/20'
                }`}>
                  <span className="text-sm text-white">{t('eodDifference')}</span>
                  <span className={`font-bold ${
                    cashDiff === 0 ? 'text-noch-green' :
                    cashDiff > 0 ? 'text-blue-400' : 'text-red-400'
                  }`}>
                    {cashDiff > 0 ? '+' : ''}{format(cashDiff)} {t('eodCurrency')}
                  </span>
                </div>
              )}

              <label className="label block mt-3 mb-1">{t('eodNotesOptional')}</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="input w-full resize-none"
                rows={2}
                placeholder={t('eodNotesPlaceholder')}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={handlePrintZReport} className="btn-secondary flex items-center gap-2 flex-1 justify-center">
                <Printer size={14} />
                {t('eodZReport')}
              </button>
              <button
                onClick={() => handleCloseShift(false)}
                disabled={closing}
                className="btn-primary flex items-center gap-2 flex-1 justify-center"
              >
                <CheckCircle size={14} />
                {closing ? t('eodClosing') : t('eodCloseShift')}
              </button>
            </div>
          </>
        )}
      </div>
      {showCashModal && shift && (
        <CashMovementModal
          branchId={branchId}
          shiftId={shift.id}
          t={t}
          onClose={() => setShowCashModal(false)}
          onSaved={async () => {
            // Refresh shift totals + movement list after save.
            const [s, movs] = await Promise.all([getOpenShift(branchId), getCashMovements(shift.id)])
            setShift(s)
            setCashMovements(movs)
          }}
        />
      )}
      {showMissingCashWarning && shift && (
        <MissingCashWarning
          t={t}
          notes={notes}
          onNotesChange={setNotes}
          onReturn={() => setShowMissingCashWarning(false)}
          onCloseAnyway={() => handleCloseShift(true)}
          closing={closing}
        />
      )}
    </Layout>
  )
}
