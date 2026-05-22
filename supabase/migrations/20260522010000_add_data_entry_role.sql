-- Add data_entry role permissions
-- data_entry staff can submit expenses, manage inventory/products/recipes,
-- enter payroll hours, and access marketing/loyalty/content.
-- They cannot access POS terminal, financial reports, or staff management.

INSERT INTO role_permissions (role, feature, can_access, can_edit) VALUES
  ('data_entry', 'expenses',         true,  true),
  ('data_entry', 'expenses_approve', false, false),
  ('data_entry', 'inventory',        true,  true),
  ('data_entry', 'suppliers',        true,  true),
  ('data_entry', 'recipes',          true,  true),
  ('data_entry', 'staff_salaries',   true,  true),
  ('data_entry', 'loyalty',          true,  true),
  ('data_entry', 'loyalty_stamp',    true,  true),
  ('data_entry', 'ideas',            true,  true),
  ('data_entry', 'content',          true,  true),
  ('data_entry', 'tasks',            true,  true),
  ('data_entry', 'cost_calculator',  true,  true),
  ('data_entry', 'dashboard',        false, false),
  ('data_entry', 'analytics',        false, false),
  ('data_entry', 'reports',          false, false),
  ('data_entry', 'pos',              false, false),
  ('data_entry', 'pos_eod',          false, false),
  ('data_entry', 'pos_void',         false, false),
  ('data_entry', 'pos_discounts',    false, false),
  ('data_entry', 'staff',            false, false),
  ('data_entry', 'vestaboard',       false, false)
ON CONFLICT (role, feature) DO UPDATE
  SET can_access = EXCLUDED.can_access,
      can_edit   = EXCLUDED.can_edit,
      updated_at = now();
