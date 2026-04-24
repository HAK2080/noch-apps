-- ============================================================
-- NOCH BIG BUILD v2 — schema additions
-- 2026-04-17
-- ============================================================

-- INVENTORY additions (on ingredients table which is the actual inventory)
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'operations';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS restock_when_empty BOOLEAN DEFAULT true;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS discontinued BOOLEAN DEFAULT false;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS daily_usage_manual NUMERIC;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_url TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_notes TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS ai_tier_suggested BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  category TEXT DEFAULT 'Other',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- POS additions
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS recipe_id UUID;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS cost NUMERIC;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS cost_source TEXT DEFAULT 'manual';

-- STAFF additions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full_time';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_requested TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_approved BOOLEAN DEFAULT false;

-- Role permissions table (simple role-feature model)
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  feature TEXT NOT NULL,
  can_access BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, feature)
);

INSERT INTO role_permissions (role, feature, can_access, can_edit) VALUES
('owner','all',true,true),
('supervisor','dashboard',true,true),('supervisor','tasks',true,true),('supervisor','recipes',true,true),
('supervisor','cost_calculator',true,true),('supervisor','inventory',true,true),('supervisor','analytics',true,false),
('supervisor','pos',true,true),('supervisor','pos_eod',true,true),('supervisor','loyalty',true,true),
('supervisor','ideas',true,true),('supervisor','staff',true,false),('supervisor','suppliers',true,true),
('accountant','analytics',true,true),('accountant','pos_eod',true,false),('accountant','cost_calculator',true,false),
('accountant','staff_salaries',true,false),
('staff','pos',true,true),('staff','tasks',true,true),('staff','recipes',true,false),
('staff','inventory',true,false),('staff','loyalty_stamp',true,true),('staff','ideas',true,true),
('limited_staff','pos',true,false),('limited_staff','loyalty_stamp',true,true)
ON CONFLICT (role, feature) DO NOTHING;

-- IDEAS attachments
CREATE TABLE IF NOT EXISTS idea_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- LOYALTY additions
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'ar';
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS birthday_day INTEGER;
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS birthday_month INTEGER;

ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_per_visit INTEGER DEFAULT 100;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_for_google_review INTEGER DEFAULT 200;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_for_referral INTEGER DEFAULT 150;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_for_story_share INTEGER DEFAULT 100;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_per_reward INTEGER DEFAULT 900;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS spin_frequency TEXT DEFAULT 'weekly';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gestures_enabled BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gestures_max_per_day INTEGER DEFAULT 2;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_prayer BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_hydration BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_word BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_puzzle BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_humor BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_affirmation BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS feedback_enabled BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS feedback_delay_hours INTEGER DEFAULT 2;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS winback_auto_send BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS birthday_message_enabled BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS leaderboard_public BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS leaderboard_to_vestaboard BOOLEAN DEFAULT false;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS nochi_skin TEXT DEFAULT 'default';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS milestone_silver_freebie TEXT DEFAULT 'Free drink of choice';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS milestone_gold_freebie TEXT DEFAULT 'Free drink + pastry';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS milestone_legend_freebie TEXT DEFAULT 'Free drink + pastry + Legend card';

CREATE TABLE IF NOT EXISTS loyalty_spin_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  label_ar TEXT,
  prize_type TEXT,
  value NUMERIC,
  probability NUMERIC DEFAULT 0.15,
  expiry_days INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO loyalty_spin_prizes (label, label_ar, prize_type, value, probability, expiry_days) VALUES
('50 Points','50 نقطة','points',50,0.25,null),
('100 Points','100 نقطة','points',100,0.20,null),
('200 Points','200 نقطة','points',200,0.10,null),
('10% Off','10% خصم','discount_percent',10,0.20,3),
('Free Drink','مشروب مجاني','free_drink',1,0.05,3),
('Better luck next time 🐰','حظاً أوفر 🐰','nothing',0,0.20,null)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS loyalty_customer_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, badge_key)
);

CREATE TABLE IF NOT EXISTS loyalty_gestures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_ar TEXT NOT NULL,
  content_en TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID,
  referred_id UUID,
  points_awarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  prize_id UUID,
  result_label TEXT,
  spun_at TIMESTAMPTZ DEFAULT now()
);
