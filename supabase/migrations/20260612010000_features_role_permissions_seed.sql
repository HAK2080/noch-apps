-- RBAC completeness: seed role_permissions rows for feature keys that exist in
-- the app (or are being introduced in this release) but were never seeded, so
-- they can be managed from the Role Manager UI.
--
-- New feature keys introduced here:
--   finance        → /finance dashboard module (new key; legacy 'analytics' rows untouched)
--   marketing      → /marketing module (was ElevatedRoute owner+data_entry)
--   products       → /products catalog
--   content_studio → /content-studio (Content Studio 2.0)
--   messages       → /messages
--   experiments    → /experiments
--   sales          → already existed for some roles; completed for data_entry
--
-- IDEMPOTENT + NON-DESTRUCTIVE: ON CONFLICT DO NOTHING everywhere except the
-- three accountant rows this release intentionally enables (finance/expenses/
-- expenses_approve read access) — those use DO UPDATE on purpose.

-- ── 1. New keys, defaults preserve current behavior ─────────────────────────
INSERT INTO role_permissions (role, feature, can_access, can_edit) VALUES
  -- finance module (owner bypasses permissions entirely; everyone else off by default)
  ('supervisor',    'finance', false, false),
  ('staff',         'finance', false, false),
  ('limited_staff', 'finance', false, false),
  ('data_entry',    'finance', false, false),

  -- marketing (data_entry keeps its current ElevatedRoute access)
  ('supervisor',    'marketing', false, false),
  ('accountant',    'marketing', false, false),
  ('staff',         'marketing', false, false),
  ('limited_staff', 'marketing', false, false),
  ('data_entry',    'marketing', true,  true),

  -- products catalog (staff currently reach /products via staffNav; data_entry via dataEntryNav)
  ('supervisor',    'products', true,  true),
  ('accountant',    'products', false, false),
  ('staff',         'products', true,  false),
  ('limited_staff', 'products', false, false),
  ('data_entry',    'products', true,  true),

  -- content studio 2.0
  ('supervisor',    'content_studio', false, false),
  ('accountant',    'content_studio', false, false),
  ('staff',         'content_studio', false, false),
  ('limited_staff', 'content_studio', false, false),
  ('data_entry',    'content_studio', false, false),

  -- messages
  ('supervisor',    'messages', false, false),
  ('accountant',    'messages', false, false),
  ('staff',         'messages', false, false),
  ('limited_staff', 'messages', false, false),
  ('data_entry',    'messages', false, false),

  -- experiments
  ('supervisor',    'experiments', false, false),
  ('accountant',    'experiments', false, false),
  ('staff',         'experiments', false, false),
  ('limited_staff', 'experiments', false, false),
  ('data_entry',    'experiments', false, false),

  -- gap fills (keys that existed but were missing rows for some roles)
  ('data_entry',    'sales',     false, false),
  ('accountant',    'dashboard', true,  false),
  ('accountant',    'sales',     true,  false)
ON CONFLICT (role, feature) DO NOTHING;

-- ── 2. Accountant enablement — the point of this release ────────────────────
-- Read-only finance: can_access without can_edit. Owner can grant can_edit
-- later from the Role Manager.
INSERT INTO role_permissions (role, feature, can_access, can_edit) VALUES
  ('accountant', 'finance',          true, false),
  ('accountant', 'expenses',         true, false),
  ('accountant', 'expenses_approve', true, false)
ON CONFLICT (role, feature) DO UPDATE
  SET can_access = EXCLUDED.can_access,
      can_edit   = EXCLUDED.can_edit,
      updated_at = now();
