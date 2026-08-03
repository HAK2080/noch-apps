import { netOf, overtimeCostOf } from './payroll-calculations.js'

const money = value => `${Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})} LYD`

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const filePart = value => String(value || 'employee')
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase() || 'employee'

function label(en, ar) {
  return `<span class="label-en">${escapeHtml(en)}</span><span class="label-ar">${escapeHtml(ar)}</span>`
}

function field(en, ar, value, className = '') {
  return `<div class="field ${className}"><div class="field-label">${label(en, ar)}</div><div class="field-value">${escapeHtml(value)}</div></div>`
}

function employeeSlip(item, { nameOf, branchOf }) {
  const name = nameOf(item.profile_id)
  const branch = branchOf(item.branch_id)
  const overtime = overtimeCostOf(item)
  const rate = item.source_rate_lyd ? money(item.source_rate_lyd) : '-'
  const note = item.note ? `<div class="note"><strong>${label('Note', 'ملاحظة')}</strong><span>${escapeHtml(item.note)}</span></div>` : ''

  return `<section class="slip">
    <div class="slip-header">
      <div>
        <div class="eyebrow">NOCH / NOCH</div>
        <h2>${escapeHtml(name)}</h2>
        <p>${escapeHtml(branch)} <span class="dot">•</span> ${label('Employee pay stub', 'قسيمة راتب الموظف')}</p>
      </div>
      <div class="status-pill">${escapeHtml(item.data_status || 'ready')}</div>
    </div>
    <div class="facts">
      ${field('Pay basis', 'أساس الأجر', item.pay_basis || '-')}
      ${field('Rate', 'المعدل', rate)}
      ${field('Evidence', 'المستندات', item.data_status || 'ready')}
    </div>
    <table class="earnings">
      <thead><tr><th>${label('Pay component', 'عنصر الأجر')}</th><th>${label('Details', 'التفاصيل')}</th><th>${label('Amount', 'المبلغ')}</th></tr></thead>
      <tbody>
        <tr><td>${label('Base pay', 'الأجر الأساسي')}</td><td>${escapeHtml(item.manual_hours_per_day || item.manual_worked_days || item.manual_scheduled_hours ? `${item.manual_hours_per_day || '-'} h/day • ${item.manual_worked_days || '-'} days • ${item.manual_scheduled_hours || '-'} scheduled h` : '-')}</td><td>${money(item.base_lyd)}</td></tr>
        <tr><td>${label('Overtime x1', 'العمل الإضافي x1')}</td><td>${escapeHtml(item.manual_overtime_hours ?? '-')} hours</td><td>${money(overtime)}</td></tr>
        <tr><td>${label('Bonus', 'المكافأة')}</td><td>-</td><td>${money(item.bonus_lyd)}</td></tr>
        <tr class="deduction"><td>${label('Deduction', 'الخصم')}</td><td>-</td><td>-${money(item.deduction_lyd)}</td></tr>
        <tr class="deduction"><td>${label('Loan repayment', 'سداد القرض')}</td><td>-</td><td>-${money(item.loan_repayment_lyd)}</td></tr>
        <tr><td>${label('Other adjustment', 'تعديل آخر')}</td><td>-</td><td>${money(item.other_lyd)}</td></tr>
      </tbody>
      <tfoot><tr><td colspan="2">${label('Net pay', 'صافي الراتب')}</td><td>${money(netOf(item))}</td></tr></tfoot>
    </table>
    ${note}
    <div class="slip-footer"><span>${label('Generated from NOCH Payroll', 'تم الإنشاء من رواتب NOCH')}</span><span>${escapeHtml(item.period_month || '')}</span></div>
  </section>`
}

function summary(items) {
  const total = items.reduce((sum, item) => sum + netOf(item), 0)
  const overtime = items.reduce((sum, item) => sum + overtimeCostOf(item), 0)
  const deductions = items.reduce((sum, item) => sum + Number(item.deduction_lyd || 0) + Number(item.loan_repayment_lyd || 0), 0)
  return `<div class="summary-grid">
    ${field('Employees', 'الموظفون', items.length)}
    ${field('Net payroll', 'إجمالي صافي الرواتب', money(total), 'accent')}
    ${field('Overtime x1', 'العمل الإضافي x1', money(overtime))}
    ${field('Deductions', 'الخصومات', money(deductions))}
  </div>`
}

export function buildPayrollPdfHtml({ run, items, nameOf, branchOf, employeeId = null }) {
  const selectedItems = employeeId ? items.filter(item => item.profile_id === employeeId) : items
  const period = String(run?.period_month || '').slice(0, 7)
  const title = employeeId && selectedItems[0]
    ? `NOCH Pay Stub - ${nameOf(selectedItems[0].profile_id)} - ${period}`
    : `NOCH Payroll - ${period}`
  const slips = selectedItems.map(item => employeeSlip({ ...item, period_month: period }, { nameOf, branchOf })).join('')
  const cover = employeeId ? '' : `<section class="cover">
    <div class="eyebrow">NOCH / NOCH</div>
    <h1>${label('Payroll report', 'تقرير الرواتب')}</h1>
    <p class="period">${escapeHtml(period)} <span class="dot">•</span> ${escapeHtml(run?.status || 'draft')}</p>
    <p class="intro">${label('Finance team copy with an individual pay stub for every employee.', 'نسخة فريق المالية مع قسيمة راتب منفصلة لكل موظف.')}</p>
    ${summary(selectedItems)}
    <div class="generated">${label('Generated', 'تاريخ الإنشاء')}: ${new Date().toISOString().slice(0, 10)}</div>
  </section>`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1a2420; background: #f5f2ea; font-family: Arial, "Segoe UI", sans-serif; font-size: 11px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report { max-width: 820px; margin: 0 auto; }
    .cover, .slip { background: #fffdf7; border: 1px solid #d7d1c4; border-radius: 14px; padding: 28px; }
    .cover { min-height: 250mm; display: flex; flex-direction: column; justify-content: center; border-top: 7px solid #1a8b63; }
    .slip { page-break-after: always; break-inside: avoid; }
    .slip:last-child { page-break-after: auto; }
    .eyebrow { color: #1a8b63; font-size: 10px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    h1 { font-size: 34px; letter-spacing: -.04em; margin: 8px 0; }
    h2 { font-size: 22px; letter-spacing: -.03em; margin: 5px 0 2px; }
    p { margin: 4px 0; }
    .period { color: #1a8b63; font-size: 16px; font-weight: 700; }
    .intro { color: #5f6a63; font-size: 13px; margin: 20px 0 32px; }
    .dot { color: #d5a72b; padding: 0 5px; }
    .summary-grid, .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
    .facts { grid-template-columns: repeat(3, 1fr); margin: 18px 0 22px; }
    .field { border: 1px solid #ded8cc; background: #f8f5ee; border-radius: 9px; padding: 10px 11px; min-height: 54px; }
    .field.accent { background: #e9f5ef; border-color: #9dd4bc; }
    .field-label { color: #667169; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .label-ar { display: block; direction: rtl; text-transform: none; letter-spacing: 0; font-weight: 600; }
    .field-value { color: #15231d; font-size: 14px; font-weight: 750; margin-top: 5px; }
    .generated { color: #667169; margin-top: auto; padding-top: 28px; border-top: 1px solid #ded8cc; }
    .slip-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; border-bottom: 2px solid #1a8b63; padding-bottom: 14px; }
    .slip-header p { color: #667169; }
    .status-pill { border: 1px solid #d5a72b; color: #876714; background: #fff7d8; border-radius: 999px; padding: 5px 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background: #18352b; color: white; font-size: 9px; text-align: left; text-transform: uppercase; letter-spacing: .04em; padding: 9px 10px; }
    th .label-ar { color: #dfece5; }
    td { border-bottom: 1px solid #e5e0d6; padding: 10px; vertical-align: top; }
    td:last-child, th:last-child { text-align: right; white-space: nowrap; }
    td:nth-child(2) { color: #667169; }
    tr.deduction td:last-child { color: #a34738; }
    tfoot td { border-top: 2px solid #1a8b63; border-bottom: 0; font-weight: 800; font-size: 15px; padding-top: 14px; }
    tfoot td:last-child { color: #1a8b63; }
    .note { display: flex; gap: 10px; margin-top: 18px; padding: 11px 12px; background: #f8f5ee; border-left: 3px solid #d5a72b; color: #536159; }
    .note .label-ar { display: inline; margin-left: 4px; }
    .slip-footer { display: flex; justify-content: space-between; gap: 10px; margin-top: 28px; padding-top: 10px; border-top: 1px solid #ded8cc; color: #7a837d; font-size: 9px; }
    .print-actions { position: fixed; right: 20px; bottom: 20px; border: 0; border-radius: 8px; background: #1a8b63; color: white; padding: 10px 15px; font-weight: 700; cursor: pointer; }
    @media print { body { background: white; } .print-actions { display: none; } .cover, .slip { border-radius: 0; } }
    @media (max-width: 650px) { .summary-grid, .facts { grid-template-columns: repeat(2, 1fr); } .cover, .slip { padding: 18px; } }
  </style></head><body><main class="report">${cover}${slips}</main><button class="print-actions" onclick="window.print()">Save as PDF / حفظ PDF</button>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250))</script></body></html>`
}

export function openPayrollPdf(options) {
  const popup = window.open('', '_blank')
  if (!popup) throw new Error('Allow pop-ups to export the payroll PDF')
  popup.opener = null
  popup.document.open()
  popup.document.write(buildPayrollPdfHtml(options))
  popup.document.close()
  return popup
}

export function payrollPdfFilename({ period, name } = {}) {
  return name ? `noch-paystub-${String(period || '').slice(0, 7)}-${filePart(name)}.pdf` : `noch-payroll-${String(period || '').slice(0, 7)}.pdf`
}
