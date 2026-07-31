// Authoritative feature catalogue and navigation. Navigation and routes both
// consume the same access-policy objects; there are no role-name fallbacks.
import {
  LayoutDashboard, CheckSquare, Users, BarChart2, Coffee, Calculator,
  Sparkles, Package, BarChart3, Heart, ShoppingCart, Lightbulb, Monitor,
  ShoppingBag, Receipt, Settings, ListOrdered, ClipboardList, BookOpen,
  MoreHorizontal,
} from 'lucide-react'
import { AUTH_POLICY, OWNER_POLICY, featurePolicy } from './access-control'

export const FEATURE_GROUPS = [
  {
    labelEn: 'Daily operations',
    labelAr: 'العمليات اليومية',
    features: [
      { key: 'dashboard', labelEn: 'Business dashboard', labelAr: 'لوحة الأعمال' },
      { key: 'expenses', labelEn: 'Submit and view expenses', labelAr: 'تسجيل وعرض المصروفات' },
      { key: 'expenses_approve', labelEn: 'Approve expenses', labelAr: 'اعتماد المصروفات' },
      { key: 'inventory', labelEn: 'Inventory', labelAr: 'المخزون' },
      { key: 'suppliers', labelEn: 'Suppliers', labelAr: 'الموردون' },
      { key: 'products', labelEn: 'Product catalogue', labelAr: 'دليل المنتجات' },
      { key: 'recipes', labelEn: 'Recipes', labelAr: 'الوصفات' },
      { key: 'ops', labelEn: 'Operations checklist', labelAr: 'قائمة مهام التشغيل' },
    ],
  },
  {
    labelEn: 'Sales and cash',
    labelAr: 'المبيعات والنقدية',
    features: [
      { key: 'pos', labelEn: 'POS terminal', labelAr: 'نقطة البيع' },
      { key: 'pos_eod', labelEn: 'End-of-day close', labelAr: 'إقفال نهاية اليوم' },
      { key: 'pos_void', labelEn: 'Cancel orders', labelAr: 'إلغاء الطلبات' },
      { key: 'pos_discounts', labelEn: 'Apply discounts', labelAr: 'تطبيق الخصومات' },
      { key: 'sales', labelEn: 'Sales and sessions', labelAr: 'المبيعات والجلسات' },
    ],
  },
  {
    labelEn: 'Owner reporting',
    labelAr: 'تقارير المالك',
    features: [
      { key: 'reports', labelEn: 'Reports', labelAr: 'التقارير' },
      { key: 'finance', labelEn: 'Finance', labelAr: 'المالية' },
      { key: 'accounting', labelEn: 'Accounting', labelAr: 'المحاسبة' },
    ],
  },
  {
    labelEn: 'Communication',
    labelAr: 'التواصل',
    features: [
      { key: 'marketing', labelEn: 'Marketing overview', labelAr: 'نظرة عامة على التسويق' },
      { key: 'ideas', labelEn: 'Ideas', labelAr: 'الأفكار' },
      { key: 'vestaboard', labelEn: 'Vestaboard', labelAr: 'فيستابورد' },
    ],
  },
]

export const ALL_FEATURES = FEATURE_GROUPS.flatMap(group => group.features.map(feature => feature.key))

export const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, labelEn: 'Dashboard', labelAr: 'لوحة الأعمال', policy: featurePolicy('dashboard'), end: true, mobilePriority: 2 },
  { to: '/vestaboard', icon: Monitor, labelEn: 'Vestaboard', labelAr: 'فيستابورد', policy: featurePolicy('vestaboard') },
  { to: '/staff/my-profile', icon: Settings, labelEn: 'My profile', labelAr: 'ملفي', policy: AUTH_POLICY, end: true },

  { type: 'group', labelEn: 'Operations', labelAr: 'العمليات' },
  { to: '/tasks', icon: CheckSquare, labelEn: 'Task management', labelAr: 'إدارة المهام', policy: OWNER_POLICY },
  { to: '/my-tasks', icon: CheckSquare, labelEn: 'My tasks', labelAr: 'مهامي', policy: AUTH_POLICY, hideForOwner: true, mobilePriority: 4 },
  { to: '/expenses', icon: Receipt, labelEn: 'Expenses', labelAr: 'المصروفات', policy: featurePolicy('expenses') },
  { to: '/inventory', icon: Package, labelEn: 'Inventory', labelAr: 'المخزون', policy: featurePolicy('inventory'), mobilePriority: 3 },
  { to: '/pos', icon: ShoppingCart, labelEn: 'POS', labelAr: 'نقطة البيع', policy: featurePolicy('pos'), mobilePriority: 1 },
  { to: '/sales', icon: ListOrdered, labelEn: 'Sales', labelAr: 'المبيعات', policy: featurePolicy('sales') },
  { to: '/products', icon: ShoppingBag, labelEn: 'Products', labelAr: 'المنتجات', policy: featurePolicy('products') },
  { to: '/staff', icon: Users, labelEn: 'Team', labelAr: 'الفريق', policy: OWNER_POLICY },
  { to: '/loyalty', icon: Heart, labelEn: 'Nochi loyalty', labelAr: 'برنامج ولاء نوتشي', policy: OWNER_POLICY },

  { type: 'group', labelEn: 'Management', labelAr: 'الإدارة' },
  { to: '/report', icon: BarChart2, labelEn: 'Reports', labelAr: 'التقارير', policy: featurePolicy('reports') },
  { to: '/finance', icon: BarChart3, labelEn: 'Finance', labelAr: 'المالية', policy: featurePolicy('finance') },
  { to: '/accounting', icon: BookOpen, labelEn: 'Accounting', labelAr: 'المحاسبة', policy: featurePolicy('accounting') },
  { to: '/marketing', icon: BarChart3, labelEn: 'Marketing', labelAr: 'التسويق', policy: featurePolicy('marketing') },
  { to: '/content-studio', icon: Sparkles, labelEn: 'Content Studio', labelAr: 'استوديو المحتوى', policy: OWNER_POLICY },

  { type: 'group', labelEn: 'Operations checklist', labelAr: 'قائمة مهام التشغيل', requiresOpsEnabled: true },
  { to: '/ops', icon: ClipboardList, labelEn: 'Checklist', labelAr: 'القائمة', policy: featurePolicy('ops'), requiresOpsEnabled: true },
  { to: '/ops/dashboard', icon: BarChart3, labelEn: 'Checklist dashboard', labelAr: 'لوحة مهام التشغيل', policy: featurePolicy('ops', 'edit'), requiresOpsEnabled: true },
  { to: '/ops/settings', icon: Settings, labelEn: 'Checklist settings', labelAr: 'إعدادات مهام التشغيل', policy: featurePolicy('ops', 'edit'), requiresOpsEnabled: true },

  { type: 'group', labelEn: 'Tools', labelAr: 'الأدوات' },
  { to: '/ideas', icon: Lightbulb, labelEn: 'Ideas', labelAr: 'الأفكار', policy: featurePolicy('ideas') },
  { to: '/cost-calculator', icon: Calculator, labelEn: 'Cost calculator', labelAr: 'حاسبة التكلفة', policy: OWNER_POLICY },
  { to: '/recipes', icon: Coffee, labelEn: 'Recipes', labelAr: 'الوصفات', policy: featurePolicy('recipes') },
]

export const MORE_NAV_ICON = MoreHorizontal
