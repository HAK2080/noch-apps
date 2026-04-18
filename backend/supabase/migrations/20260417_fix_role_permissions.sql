-- Fix role_permissions: ensure the TEXT-based schema exists
-- (big_build.sql defined a conflicting UUID-FK schema; this is the authoritative one)

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  feature TEXT NOT NULL,
  can_access BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, feature)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions_owner_all" ON role_permissions;
CREATE POLICY "role_permissions_owner_all" ON role_permissions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

DROP POLICY IF EXISTS "role_permissions_read" ON role_permissions;
CREATE POLICY "role_permissions_read" ON role_permissions
  FOR SELECT TO authenticated USING (true);

INSERT INTO role_permissions (role, feature, can_access, can_edit) VALUES
('supervisor','dashboard',true,true),
('supervisor','tasks',true,true),
('supervisor','inventory',true,true),
('supervisor','suppliers',true,true),
('supervisor','recipes',true,true),
('supervisor','pos',true,true),
('supervisor','pos_eod',true,true),
('supervisor','pos_void',true,true),
('supervisor','pos_discounts',true,true),
('supervisor','loyalty',true,true),
('supervisor','loyalty_stamp',true,true),
('supervisor','analytics',true,false),
('supervisor','cost_calculator',true,true),
('supervisor','staff_salaries',false,false),
('supervisor','reports',true,true),
('supervisor','ideas',true,true),
('supervisor','content',false,false),
('supervisor','staff',true,false),
('supervisor','vestaboard',true,false),
('supervisor','sales',true,true),
('accountant','analytics',true,true),
('accountant','pos_eod',true,false),
('accountant','cost_calculator',true,false),
('accountant','staff_salaries',true,false),
('accountant','reports',true,true),
('accountant','sales',true,false),
('staff','pos',true,true),
('staff','tasks',true,true),
('staff','recipes',true,false),
('staff','inventory',true,false),
('staff','loyalty_stamp',true,true),
('staff','ideas',true,true),
('staff','sales',false,false),
('limited_staff','pos',true,false),
('limited_staff','loyalty_stamp',true,true),
('limited_staff','sales',false,false)
ON CONFLICT (role, feature) DO NOTHING;
