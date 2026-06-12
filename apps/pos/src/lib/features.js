// features.js — single source of truth for RBAC features + sidebar navigation.
//
// FEATURE_GROUPS drives the Role Manager matrix (/staff/roles).
// NAV_ITEMS drives the Layout sidebar. Adding a future module = add its
// feature key to FEATURE_GROUPS and (if it has a page) one NAV_ITEMS entry.
//
// NAV_ITEMS semantics (consumed by Layout.jsx):
//   feature        role_permissions key that unlocks the link for non-owners
//   fallbackRoles  roles that ALWAYS see the link (transcribed from the old
//                  hardcoded staffNav/dataEntryNav arrays — zero-regression)
//   ownerOnly      never shown to non-owners (route is OwnerRoute regardless)
//   hideForOwner   not shown to owner (e.g. /my-tasks; owner uses /tasks)
//   labelKey       i18n key for t(); otherwise labelEn/labelAr
import {
  LayoutDashboard, CheckSquare, Users, BarChart2, Coffee, Calculator,
  Sparkles, Package, BarChart3, Heart, ShoppingCart, Lightbulb, Monitor,
  ShoppingBag, Receipt, Settings, ListOrdered, FlaskConical, MessageSquare,
  ClipboardList,
} from 'lucide-react'

// ── Role Manager matrix ───────────────────────────────────────────────
export const FEATURE_GROUPS = [
  {
    label: 'Operations',
    features: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'tasks', label: 'Tasks' },
      { key: 'inventory', label: 'Inventory' },
      { key: 'suppliers', label: 'Suppliers' },
      { key: 'recipes', label: 'Recipes' },
      { key: 'products', label: 'Products Catalog' },
      { key: 'pos', label: 'POS Terminal' },
      { key: 'pos_eod', label: 'POS End of Day' },
      { key: 'pos_void', label: 'POS Cancel Orders' },
      { key: 'pos_discounts', label: 'POS Discounts' },
      { key: 'sales', label: 'Sales Sessions' },
      { key: 'loyalty', label: 'Loyalty Admin' },
      { key: 'loyalty_stamp', label: 'Loyalty Stamp' },
    ],
  },
  {
    label: 'Finance',
    features: [
      { key: 'finance', label: 'Finance Dashboard (P&L, Cash, Variance)' },
      { key: 'analytics', label: 'Analytics (legacy)' },
      { key: 'cost_calculator', label: 'Cost Calculator' },
      { key: 'staff_salaries', label: 'Staff Salaries' },
      { key: 'reports', label: 'Reports' },
      { key: 'expenses', label: 'Expenses — Submit & View Own' },
      { key: 'expenses_approve', label: 'Expenses — Approve & Dashboard' },
    ],
  },
  {
    label: 'Content & Marketing',
    features: [
      { key: 'ideas', label: 'Ideas' },
      { key: 'content', label: 'Content (legacy)' },
      { key: 'content_studio', label: 'Content Studio' },
      { key: 'marketing', label: 'Marketing' },
      { key: 'experiments', label: 'Experiments' },
      { key: 'messages', label: 'Messages' },
    ],
  },
  {
    label: 'Ops Checklist',
    features: [
      { key: 'ops', label: 'Ops Checklist (view = staff, edit = manager)' },
    ],
  },
  {
    label: 'System',
    features: [
      { key: 'staff', label: 'Staff Management' },
      { key: 'vestaboard', label: 'Vestaboard' },
    ],
  },
]

export const ALL_FEATURES = FEATURE_GROUPS.flatMap(g => g.features.map(f => f.key))

// ── Sidebar navigation ────────────────────────────────────────────────
const STAFFISH = ['supervisor', 'accountant', 'staff', 'limited_staff']
const EVERYONE = [...STAFFISH, 'data_entry']

export const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard', feature: 'dashboard', end: true, fallbackRoles: STAFFISH },
  { to: '/staff/my-profile', icon: Settings, labelEn: 'My Profile', labelAr: 'ملفي', feature: null, end: true, fallbackRoles: EVERYONE },

  { type: 'group', labelEn: 'OPERATIONS', labelAr: 'العمليات' },
  { to: '/tasks', icon: CheckSquare, labelKey: 'tasks', feature: 'tasks', ownerOnly: true },
  { to: '/my-tasks', icon: CheckSquare, labelKey: 'myTasks', feature: null, hideForOwner: true, fallbackRoles: EVERYONE },
  { to: '/expenses', icon: Receipt, labelEn: 'Expenses', labelAr: 'المصاريف', feature: 'expenses', fallbackRoles: ['data_entry'] },
  { to: '/inventory', icon: Package, labelEn: 'Inventory', labelAr: 'المخزون', feature: 'inventory', fallbackRoles: EVERYONE },
  { to: '/pos', icon: ShoppingCart, labelEn: 'POS', labelAr: 'نقطة البيع', feature: 'pos', fallbackRoles: STAFFISH },
  { to: '/sales', icon: ListOrdered, labelEn: 'Sales', labelAr: 'المبيعات', feature: 'sales', fallbackRoles: STAFFISH },
  { to: '/products', icon: ShoppingBag, labelEn: 'Products', labelAr: 'المنتجات', feature: 'products', fallbackRoles: EVERYONE },
  { to: '/staff', icon: Users, labelEn: 'Team', labelAr: 'الفريق', feature: 'staff', ownerOnly: true },
  { to: '/loyalty', icon: Heart, labelEn: 'Nochi Loyalty', labelAr: 'نوتشي لويالتي', feature: 'loyalty', fallbackRoles: EVERYONE },
  { to: '/vestaboard', icon: Monitor, labelEn: 'Vestaboard', labelAr: 'فيستابورد', feature: 'vestaboard', fallbackRoles: STAFFISH },

  { type: 'group', labelEn: 'MANAGEMENT', labelAr: 'الإدارة' },
  { to: '/report', icon: BarChart2, labelKey: 'report', feature: 'reports' },
  { to: '/finance', icon: BarChart3, labelEn: 'Finance', labelAr: 'المالية', feature: 'finance' },
  { to: '/marketing', icon: BarChart3, labelEn: 'Marketing', labelAr: 'التسويق', feature: 'marketing', fallbackRoles: ['data_entry'] },

  { type: 'group', labelEn: 'CONTENT', labelAr: 'المحتوى' },
  { to: '/content-studio', icon: Sparkles, labelEn: 'Content Studio', labelAr: 'استوديو المحتوى', feature: 'content_studio', ownerOnly: true },

  // Ops Checklist — only renders when ops_settings.module_enabled (Layout filters
  // out items flagged requiresOpsEnabled when the module is off).
  { type: 'group', labelEn: 'OPS CHECKLIST', labelAr: 'قائمة المهام', requiresOpsEnabled: true },
  { to: '/ops',           icon: ClipboardList, labelEn: 'Checklist',         labelAr: 'القائمة',     feature: 'ops', fallbackRoles: EVERYONE, requiresOpsEnabled: true },
  { to: '/ops/dashboard', icon: BarChart3,     labelEn: 'Ops dashboard',     labelAr: 'لوحة المهام', feature: 'ops', fallbackRoles: ['supervisor'], requiresOpsEnabled: true, requiresOpsEdit: true },
  { to: '/ops/settings',  icon: Settings,      labelEn: 'Ops settings',      labelAr: 'إعدادات المهام', feature: 'ops', fallbackRoles: ['supervisor'], requiresOpsEnabled: true, requiresOpsEdit: true },

  { type: 'group', labelEn: 'TOOLS', labelAr: 'الأدوات' },
  { to: '/ideas', icon: Lightbulb, labelEn: 'Ideas', labelAr: 'الأفكار', feature: 'ideas', fallbackRoles: ['data_entry'] },
  { to: '/cost-calculator', icon: Calculator, labelEn: 'Cost Calculator', labelAr: 'حاسبة التكلفة', feature: 'cost_calculator', ownerOnly: true },
  { to: '/recipes', icon: Coffee, labelKey: 'recipes', feature: 'recipes', fallbackRoles: EVERYONE },
]

// Icons exported for any consumer that needs them by name (future use)
export const NAV_ICONS = { FlaskConical, MessageSquare }
