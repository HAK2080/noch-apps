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

const PHRASES = {
  ...buildTranslationPhrases(),
  ...MANUAL_PHRASES,
}

const PLACEHOLDERS = {
  'Select cost center...': 'اختر مركز التكلفة...',
  'Select category...': 'اختر الفئة...',
  'e.g. Al-Amal Hardware': 'مثال: مورد الأجهزة',
  'Brief note about this expense...': 'ملاحظة مختصرة عن المصروف...',
  'Supplier name': 'اسم المورد',
  'Select ingredient...': 'اختر المكون...',
  'Optional notes': 'ملاحظات اختيارية',
  'Transfer, cash receipt, cheque...': 'تحويل، إيصال كاش، شيك...',
  'Receipt, transfer, cheque...': 'إيصال، تحويل، شيك...',
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

function translateTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (!shouldSkipTextNode(node)) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue)
      node.nodeValue = translateExact(originalText.get(node))
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
      if (!el.dataset[key]) el.dataset[key] = el.getAttribute(attr)
      const original = el.dataset[key]
      el.setAttribute(attr, PLACEHOLDERS[original] || PHRASES[original] || original)
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
    if (lang === 'ar') {
      translateTextNodes(root)
      translateAttributes(root)
    } else {
      restoreTextNodes(root)
      restoreAttributes(root)
    }
  }

  apply()
  if (lang !== 'ar') return () => {}

  const observer = new MutationObserver(() => apply())
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}
