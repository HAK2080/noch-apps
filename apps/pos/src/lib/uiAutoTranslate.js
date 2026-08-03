import { translations } from './i18n.js'

export function buildTranslationPhrases(dictionary = translations) {
  return Object.fromEntries(
    Object.entries(dictionary.en || {})
      .filter(([key, english]) => english && dictionary.ar?.[key])
      .map(([key, english]) => [english, dictionary.ar[key]]),
  )
}

const MANUAL_PHRASES = {
  'Dashboard': 'لوحة التحكم',
  'My Profile': 'ملفي',
  'Tasks': 'المهام',
  'Expenses': 'المصاريف',
  'Inventory': 'المخزون',
  'POS': 'نقطة البيع',
  'Sales': 'المبيعات',
  'Products': 'المنتجات',
  'Team': 'الفريق',
  'Nochi Loyalty': 'ولاء نوتشي',
  'Vestaboard': 'فيستابورد',
  'Finance': 'المالية',
  'Accounting': 'المحاسبة',
  'Marketing': 'التسويق',
  'Content Studio': 'استوديو المحتوى',
  'Checklist': 'قائمة المهام',
  'Ops dashboard': 'لوحة العمليات',
  'Ops settings': 'إعدادات العمليات',
  'Ideas': 'الأفكار',
  'Cost Calculator': 'حاسبة التكلفة',
  'Recipes': 'الوصفات',
  'OPERATIONS': 'العمليات',
  'MANAGEMENT': 'الإدارة',
  'CONTENT': 'المحتوى',
  'OPS CHECKLIST': 'قائمة العمليات',
  'TOOLS': 'الأدوات',

  'Submit': 'إدخال',
  'My Expenses': 'مصاريفي',
  'Approve': 'الموافقة',
  'Settings': 'الإعدادات',
  'Log, approve, and track costs by cost center': 'إدخال المصاريف واعتمادها وتتبعها حسب مركز التكلفة',
  'Auto-approve my expenses': 'اعتماد مصاريفي تلقائياً',
  'Your submissions skip the queue': 'تتجاوز مدخلاتك قائمة الانتظار',
  'Date': 'التاريخ',
  'Cost Center': 'مركز التكلفة',
  'Category': 'الفئة',
  'Amount': 'المبلغ',
  'Currency': 'العملة',
  'Source of Payment': 'مصدر الدفع',
  'Business': 'الشركة',
  'Personal': 'شخصي',
  'Vendor / Supplier': 'المورد',
  'Description': 'الوصف',
  'Submit Expense': 'إدخال المصروف',
  'Pay from Cash / Bank': 'دفع من الكاش / البنك',
  'Pay Expense': 'دفع المصروف',
  'Edit Expense': 'تعديل المصروف',
  'Save Changes': 'حفظ التعديلات',
  'Payment date': 'تاريخ الدفع',
  'Payment Date': 'تاريخ الدفع',
  'Pay from': 'الدفع من',
  'Cash': 'الكاش',
  'Bank': 'البنك',
  'Reference': 'المرجع',
  'Notes': 'ملاحظات',
  'Cancel': 'إلغاء',
  'Pay': 'دفع',
  'Edit': 'تعديل',
  'Approved': 'معتمد',
  'Pending': 'قيد الانتظار',
  'Rejected': 'مرفوض',
  'Paid': 'مدفوع',
  'All': 'الكل',
  'No expenses found': 'لا توجد مصاريف',
  'No pending expenses': 'لا توجد مصاريف بانتظار الاعتماد',

  'Procurement Orders': 'أوامر الشراء',
  'Add Order': 'إضافة أمر',
  'Status': 'الحالة',
  'Ingredient': 'المكون',
  'Supplier': 'المورد',
  'Supplier Name': 'اسم المورد',
  'Qty': 'الكمية',
  'Quantity': 'الكمية',
  'Unit': 'الوحدة',
  'Unit Cost': 'تكلفة الوحدة',
  'Unit Cost (LYD)': 'تكلفة الوحدة (LYD)',
  'Shipping': 'الشحن',
  'Customs': 'الجمارك',
  'Other': 'أخرى',
  'Total': 'الإجمالي',
  'Total Cost': 'إجمالي التكلفة',
  'Actions': 'الإجراءات',
  'No procurement orders': 'لا توجد أوامر شراء',
  'New Procurement Order': 'أمر شراء جديد',
  'Create Order': 'إنشاء الأمر',
  'Mark as Received': 'تسجيل الاستلام',
  'Confirm Received': 'تأكيد الاستلام',
  'Pay Supplier Invoice': 'دفع فاتورة المورد',
  'Invoice No.': 'رقم الفاتورة',
  'Invoice Date': 'تاريخ الفاتورة',
  'Due Date': 'تاريخ الاستحقاق',
  'Ordered': 'مطلوب',
  'Received': 'مستلم',
  'Cancelled': 'ملغي',
  'Unpaid': 'غير مدفوع',

  'Loading...': 'جاري التحميل...',
  'Loading…': 'جاري التحميل...',
  'Create': 'إنشاء',
  'Save': 'حفظ',
  'Delete': 'حذف',
  'Remove': 'إزالة',
  'Search': 'بحث',
  'Filter': 'تصفية',
  'Today': 'اليوم',
  '7 days': '7 أيام',
  'Custom': 'مخصص',
  'All branches': 'كل الفروع',
  'Export CSV': 'تصدير CSV',
  'Export detailed sales': 'تصدير تفاصيل المبيعات',
}

const WINDOWS_1252_BYTES = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
])

const PHRASES = repairDictionary({
  ...buildTranslationPhrases(),
  ...MANUAL_PHRASES,
})

const PLACEHOLDERS = repairDictionary({
  'Select cost center...': 'اختر مركز التكلفة...',
  'Select category...': 'اختر الفئة...',
  'e.g. Al-Amal Hardware': 'مثال: مورد الأجهزة',
  'Brief note about this expense...': 'ملاحظة مختصرة عن المصروف...',
  'Supplier name': 'اسم المورد',
  'Select ingredient...': 'اختر المكون...',
  'Optional notes': 'ملاحظات اختيارية',
  'Transfer, cash receipt, cheque...': 'تحويل، إيصال كاش، شيك...',
  'Receipt, transfer, cheque...': 'إيصال، تحويل، شيك...',
})

// Repair legacy Arabic literals that were accidentally decoded as Latin-1.
export function repairMojibake(value) {
  if (typeof value !== 'string') return value
  let repaired = value
  for (let pass = 0; pass < 3 && /[\u00c3\u00c2\u00d8\u00d9\u00d0\u00d1]/.test(repaired); pass += 1) {
    try {
      const points = Array.from(repaired, char => char.charCodeAt(0))
      const bytes = points.map(point => WINDOWS_1252_BYTES.get(point) ?? (point <= 255 ? point : -1))
      if (bytes.some(byte => byte < 0)) break
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
      if (!decoded || decoded === repaired) break
      repaired = decoded
    } catch {
      break
    }
  }
  return repaired
}

function repairDictionary(dictionary) {
  return Object.fromEntries(Object.entries(dictionary).map(([key, value]) => [key, repairMojibake(value)]))
}

const originalText = new WeakMap()

function translateExact(text) {
  const trimmed = text.trim()
  if (!trimmed) return text
  const translated = PHRASES[trimmed]
  if (!translated) return text
  return text.replace(trimmed, translated)
}

function shouldSkipTextNode(node) {
  const parent = node.parentElement
  if (!parent) return true
  return ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)
}

function repairTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (!shouldSkipTextNode(node)) {
      const repaired = repairMojibake(node.nodeValue)
      if (repaired !== node.nodeValue) node.nodeValue = repaired
    }
    node = walker.nextNode()
  }
}

function repairAttributes(root) {
  root.querySelectorAll?.('[placeholder], [title], [aria-label]').forEach(el => {
    ;['placeholder', 'title', 'aria-label'].forEach(attr => {
      if (!el.hasAttribute(attr)) return
      const current = el.getAttribute(attr)
      const repaired = repairMojibake(current)
      if (repaired !== current) el.setAttribute(attr, repaired)
    })
  })
}

function translateTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (!shouldSkipTextNode(node)) {
      const source = originalText.get(node) ?? node.nodeValue
      const translated = translateExact(source)
      if (translated !== source) {
        if (!originalText.has(node)) originalText.set(node, source)
        node.nodeValue = translated
      }
    }
    node = walker.nextNode()
  }
}

function restoreTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (originalText.has(node)) node.nodeValue = originalText.get(node)
    node = walker.nextNode()
  }
}

function translateAttributes(root) {
  root.querySelectorAll?.('[placeholder], [title], [aria-label]').forEach(el => {
    ;['placeholder', 'title', 'aria-label'].forEach(attr => {
      if (!el.hasAttribute(attr)) return
      const key = `i18nOriginal${attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`
      const current = el.dataset[key] || el.getAttribute(attr)
      const translated = PLACEHOLDERS[current] || PHRASES[current]
      if (!translated) return
      if (!el.dataset[key]) el.dataset[key] = current
      el.setAttribute(attr, translated)
    })
  })
}

function restoreAttributes(root) {
  root.querySelectorAll?.('[data-i18n-original-placeholder], [data-i18n-original-title], [data-i18n-original-aria-label]').forEach(el => {
    if (el.dataset.i18nOriginalPlaceholder) el.setAttribute('placeholder', el.dataset.i18nOriginalPlaceholder)
    if (el.dataset.i18nOriginalTitle) el.setAttribute('title', el.dataset.i18nOriginalTitle)
    if (el.dataset.i18nOriginalAriaLabel) el.setAttribute('aria-label', el.dataset.i18nOriginalAriaLabel)
  })
}

export function applyUiAutoTranslate(lang) {
  const root = document.getElementById('root')
  if (!root) return () => {}

  const apply = () => {
    repairTextNodes(root)
    repairAttributes(root)
    if (lang === 'ar') {
      translateTextNodes(root)
      translateAttributes(root)
    } else {
      restoreTextNodes(root)
      restoreAttributes(root)
    }
  }

  apply()
  const observer = new MutationObserver(() => apply())
  observer.observe(root, { childList: true, characterData: true, subtree: true })
  return () => observer.disconnect()
}
