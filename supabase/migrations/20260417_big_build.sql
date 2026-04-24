-- ============================================================
-- NOCH BIG BUILD — 2026-04-17
-- ============================================================

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  category TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INVENTORY_ITEMS — add columns to ingredients
-- ============================================================
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'operations' CHECK (tier IN ('critical','operations','retail'));
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS restock_when_empty BOOLEAN DEFAULT true;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS discontinued BOOLEAN DEFAULT false;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS daily_usage_manual NUMERIC;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_url TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_notes TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

-- ============================================================
-- IDEA ATTACHMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS idea_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ANALYTICS TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID, product_id UUID, category TEXT,
  quantity NUMERIC, unit_price NUMERIC, total NUMERIC, cost NUMERIC,
  sold_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operating_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID, cost_type TEXT, amount NUMERIC,
  period_start DATE, period_end DATE, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, categories TEXT[], color TEXT
);

-- ============================================================
-- RBAC TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS app_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  level INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE(feature, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES app_roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES app_permissions(id) ON DELETE CASCADE,
  granted BOOLEAN DEFAULT false,
  UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS role_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  requested_role_id UUID REFERENCES app_roles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default roles
INSERT INTO app_roles (name, level, description, is_system) VALUES
  ('owner', 5, 'Full access to everything', true),
  ('supervisor', 4, 'Operations management, no billing/staff deletion', true),
  ('accountant', 3, 'Financial data, reports, costs, salaries', true),
  ('staff', 2, 'Standard: POS, inventory, tasks, recipes', true),
  ('limited_staff', 1, 'POS terminal only', true)
ON CONFLICT (name) DO NOTHING;

-- Seed all permissions
INSERT INTO app_permissions (feature, action, description) VALUES
  ('dashboard', 'view', 'View main dashboard'),
  ('dashboard', 'financial_view', 'View financial data on dashboard'),
  ('tasks', 'view', 'View all tasks'),
  ('tasks', 'manage', 'Create/edit/delete tasks'),
  ('tasks', 'own_only', 'View only assigned tasks'),
  ('staff', 'view', 'View staff list'),
  ('staff', 'edit', 'Edit staff profiles'),
  ('staff', 'salaries', 'View/edit salaries'),
  ('recipes', 'view', 'View recipes'),
  ('recipes', 'manage', 'Create/edit recipes'),
  ('cost_calculator', 'view', 'Access cost calculator'),
  ('content_studio', 'view', 'Access content studio'),
  ('content_studio', 'manage', 'Create/edit content'),
  ('inventory', 'view', 'View inventory'),
  ('inventory', 'manage', 'Full inventory management'),
  ('inventory', 'stock_update', 'Update stock levels only'),
  ('suppliers', 'view', 'View suppliers'),
  ('suppliers', 'manage', 'Create/edit suppliers'),
  ('analytics', 'view', 'View analytics'),
  ('analytics', 'financial', 'View financial analytics'),
  ('pos', 'terminal', 'Use POS terminal'),
  ('pos', 'products', 'View POS products'),
  ('pos', 'products_manage', 'Create/edit POS products'),
  ('pos', 'end_of_day', 'View/close end of day'),
  ('pos', 'void_order', 'Void completed orders'),
  ('pos', 'discount_any', 'Apply any discount amount'),
  ('pos', 'discount_limited', 'Apply discounts up to 10%'),
  ('pos', 'view_cost', 'View product cost/margin'),
  ('loyalty', 'admin', 'Full loyalty management'),
  ('loyalty', 'stamp', 'Award stamps only'),
  ('ideas', 'view', 'View and submit ideas'),
  ('ideas', 'manage', 'Manage all ideas'),
  ('vestaboard', 'manage', 'Control Vestaboard'),
  ('role_management', 'manage', 'Manage roles and permissions')
ON CONFLICT (feature, action) DO NOTHING;

-- Owner: ALL permissions
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id, true
FROM app_roles r CROSS JOIN app_permissions p
WHERE r.name = 'owner'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Supervisor: everything except staff.edit, staff.salaries, role_management
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id,
  CASE WHEN p.feature || '.' || p.action IN ('staff.edit', 'staff.salaries', 'role_management.manage') THEN false ELSE true END
FROM app_roles r CROSS JOIN app_permissions p
WHERE r.name = 'supervisor'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Accountant: financial focused
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id,
  CASE WHEN p.feature || '.' || p.action IN (
    'dashboard.view', 'dashboard.financial_view',
    'staff.salaries',
    'cost_calculator.view',
    'analytics.view', 'analytics.financial',
    'pos.end_of_day', 'pos.view_cost',
    'suppliers.view'
  ) THEN true ELSE false END
FROM app_roles r CROSS JOIN app_permissions p
WHERE r.name = 'accountant'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Staff: standard access
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id,
  CASE WHEN p.feature || '.' || p.action IN (
    'tasks.own_only',
    'recipes.view',
    'inventory.view', 'inventory.stock_update',
    'pos.terminal', 'pos.products', 'pos.discount_limited',
    'loyalty.stamp',
    'ideas.view'
  ) THEN true ELSE false END
FROM app_roles r CROSS JOIN app_permissions p
WHERE r.name = 'staff'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Limited Staff: POS only
INSERT INTO role_permissions (role_id, permission_id, granted)
SELECT r.id, p.id,
  CASE WHEN p.feature || '.' || p.action IN (
    'pos.terminal', 'pos.discount_limited',
    'loyalty.stamp'
  ) THEN true ELSE false END
FROM app_roles r CROSS JOIN app_permissions p
WHERE r.name = 'limited_staff'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- PROFILES — add columns
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contract'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_role_id UUID REFERENCES app_roles(id);

-- Set owner role for aerohaith@gmail.com
UPDATE profiles SET app_role_id = (SELECT id FROM app_roles WHERE name = 'owner')
WHERE id IN (SELECT id FROM auth.users WHERE email = 'aerohaith@gmail.com');

-- ============================================================
-- POS PRODUCTS — add columns
-- ============================================================
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS recipe_id UUID;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS cost NUMERIC;

ALTER TABLE pos_categories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ============================================================
-- LOYALTY CUSTOMERS — add columns
-- ============================================================
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'ar' CHECK (preferred_language IN ('ar','en'));
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES loyalty_customers(id);
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS birthday_day INTEGER;
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS birthday_month INTEGER;
ALTER TABLE loyalty_customers ADD COLUMN IF NOT EXISTS google_reviewed BOOLEAN DEFAULT false;

-- ============================================================
-- LOYALTY — new tables
-- ============================================================
CREATE TABLE IF NOT EXISTS loyalty_gestures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('prayer','hydration','word','puzzle','humor','affirmation','fun_fact')),
  content_ar TEXT NOT NULL,
  content_en TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES loyalty_customers(id),
  referred_id UUID REFERENCES loyalty_customers(id),
  points_awarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_spin_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  prize_type TEXT CHECK (prize_type IN ('points','discount_percent','free_drink','nothing')),
  value NUMERIC,
  probability NUMERIC DEFAULT 0.1,
  expiry_days INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS loyalty_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES loyalty_customers(id),
  prize_id UUID REFERENCES loyalty_spin_prizes(id),
  result_label TEXT,
  spun_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_customer_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES loyalty_customers(id),
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, badge_key)
);

-- ============================================================
-- LOYALTY SETTINGS — add columns
-- ============================================================
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_per_visit INTEGER DEFAULT 100;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_for_google_review INTEGER DEFAULT 200;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_for_referral INTEGER DEFAULT 150;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_for_story_share INTEGER DEFAULT 100;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_birthday_bonus INTEGER DEFAULT 50;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS points_per_reward INTEGER DEFAULT 900;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS spin_frequency TEXT DEFAULT 'weekly' CHECK (spin_frequency IN ('weekly','biweekly','monthly','off'));
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gestures_enabled BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gestures_max_per_day INTEGER DEFAULT 2;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gestures_morning_window TEXT DEFAULT '08:00-10:00';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gestures_afternoon_window TEXT DEFAULT '15:00-17:00';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_prayer BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_hydration BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_word BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_puzzle BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_humor BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS gesture_affirmation BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS feedback_enabled BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS winback_auto_send BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS birthday_message_enabled BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS milestone_message_enabled BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS milestone_silver_freebie TEXT DEFAULT 'Free drink of choice';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS milestone_gold_freebie TEXT DEFAULT 'Free drink + pastry';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS milestone_legend_freebie TEXT DEFAULT 'Free drink + pastry + Legend card';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS nochi_skin TEXT DEFAULT 'default';
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS leaderboard_public BOOLEAN DEFAULT true;
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS leaderboard_to_vestaboard BOOLEAN DEFAULT false;

-- Seed default spin prizes
INSERT INTO loyalty_spin_prizes (label, prize_type, value, probability, expiry_days) VALUES
  ('+50 points', 'points', 50, 0.25, null),
  ('+100 points', 'points', 100, 0.20, null),
  ('+200 points', 'points', 200, 0.10, null),
  ('10% off next order', 'discount_percent', 10, 0.20, 3),
  ('Free drink!', 'free_drink', 1, 0.05, 3),
  ('Better luck next time 🐰', 'nothing', 0, 0.20, null);

-- Seed 50+ gestures
INSERT INTO loyalty_gestures (content_type, content_ar, content_en) VALUES
  ('prayer', 'وقت الفجر. يوم جديد يبدأ 🌅', 'Fajr time. A new day begins 🌅'),
  ('prayer', 'وقت الظهر. خذ استراحة 🕐', 'Dhuhr time. Take a break 🕐'),
  ('prayer', 'وقت العصر. النهار يمشي بسرعة ⏳', 'Asr time. Day is moving fast ⏳'),
  ('prayer', 'وقت المغرب. خذ دقيقة 🌙', 'Maghrib time. Take a moment 🌙'),
  ('prayer', 'وقت العشاء. يوم طويل؟ تقريباً خلص 🌃', 'Isha time. Long day? Almost done 🌃'),
  ('hydration', 'الساعة 10 الصبح. شربت ماء؟ 💧', '10am. Had water yet? 💧'),
  ('hydration', 'الساعة 2. ماء. تعرف شنو تسوي. 💧', '2pm. Water. You know what to do. 💧'),
  ('hydration', 'تذكير ودي: جسمك يبي ماء مش بس قهوة 😅💧', 'Friendly reminder: your body wants water, not just coffee 😅💧'),
  ('hydration', 'نص النهار. وقفة ماء سريعة 💧', 'Midday. Quick water stop 💧'),
  ('hydration', 'آخر تذكير ماء لليوم. بعدين مسؤوليتك 💧', 'Last water reminder today. After this, you are on your own 💧'),
  ('word', 'كلمة اليوم: Serendipity — تلقى شي حلو من غير ما تدور عليه', 'Today: Serendipity — finding something good without looking for it. Use it today.'),
  ('word', 'كلمة اليوم: Resilient — قوي حتى في الأوقات الصعبة', 'Today: Resilient — strong even when things are tough.'),
  ('word', 'كلمة اليوم: Wanderlust — حب السفر والاكتشاف', 'Today: Wanderlust — a strong desire to travel and explore.'),
  ('word', 'كلمة اليوم: Ephemeral — شي جميل بس ما يدوم', 'Today: Ephemeral — something beautiful that does not last.'),
  ('word', 'كلمة اليوم: Sonder — كل شخص تشوفه عنده قصة معقدة مثلك', 'Today: Sonder — realizing every stranger has a life as complex as yours.'),
  ('word', 'كلمة اليوم: Petrichor — ريحة المطر على التراب', 'Today: Petrichor — the smell of rain on dry earth.'),
  ('word', 'كلمة اليوم: Mellifluous — صوت حلو وسلس', 'Today: Mellifluous — a sound that is sweet and smooth.'),
  ('puzzle', 'خفيفة: بات وكرة سعرهم $1.10. البات أغلى بدولار. كم سعر الكرة؟', 'Quick one: a bat and ball cost $1.10. The bat costs $1 more. How much is the ball?'),
  ('puzzle', 'أنا دايماً جاي بس ما نوصل أبداً. شنو أنا؟', 'I am always coming but never arrive. What am I? (Tomorrow)'),
  ('puzzle', 'عندي مفاتيح بس ما نفتح أي قفل. شنو أنا؟', 'I have keys but open no locks. What am I? (A piano)'),
  ('puzzle', 'كل ما تاخذ مني أكثر، أكبر نصير. شنو أنا؟', 'The more you take from me, the bigger I get. What am I? (A hole)'),
  ('puzzle', 'شنو عنده رأس وذيل بس ما عنده جسم؟', 'What has a head and tail but no body? (A coin)'),
  ('puzzle', 'كم مثلث تقدر تلقى في نجمة خماسية؟', 'How many triangles can you find in a five-pointed star?'),
  ('humor', 'ملاحظة Nochi اليومية: كل شي أحسن بعد مشروب دافي. العلم يوافق. غالباً.', 'Nochi daily observation: everything is better after a warm drink. Science agrees. Probably.'),
  ('humor', 'Nochi سمع واحد يقول "أنا مش مدمن، أنا بس نحب القهوة واجد." بالضبط.', 'Nochi overheard: "I am not addicted, I just really like coffee." Sure. Same.'),
  ('humor', 'حقيقة: أول فنجان قهوة في اليوم مش مشروب. هو شخصية.', 'Fact: the first coffee of the day is not a drink. It is a personality.'),
  ('humor', 'Nochi حاول يوم من غير قهوة. مرة. ما يتكلم عليها.', 'Nochi tried a day without coffee once. We do not talk about it.'),
  ('humor', 'لو القهوة شخص، كانت أحسن صاحبك. ما تحكم. دايماً موجودة. دافية.', 'If coffee were a person, it would be your best friend. No judgment. Always there. Warm.'),
  ('humor', 'Nochi يقول: الأكل في البيت حلو. بس الأكل اللي ما طبخته أحلى.', 'Nochi says: home cooking is great. But food you did not cook hits different.'),
  ('affirmation', 'طاقة اليوم: ثقة هادية. اللي تطلب اللي تبيه بالضبط.', 'Today energy: quiet confidence. The kind that orders exactly what she wants.'),
  ('affirmation', 'تذكير: أنت مش لازم تكون منتج كل يوم. بعض الأيام تكفي إنك موجود.', 'Reminder: you do not have to be productive every day. Some days, just existing is enough.'),
  ('affirmation', 'مهما صار اليوم، أنت تتعامل معاه. عندك سجل حافل.', 'Whatever today throws at you, you will handle it. You have a track record.'),
  ('affirmation', 'الشخص اللي كنته قبل سنة فخور بيك هسع.', 'The person you were a year ago is proud of you right now.'),
  ('affirmation', 'خذ نفس. أنت بالضبط وين لازم تكون.', 'Take a breath. You are exactly where you need to be.'),
  ('affirmation', 'طاقة اليوم: هدوء تحت ضغط. مثل إسبريسو — صغير بس قوي.', 'Today energy: calm under pressure. Like espresso — small but powerful.'),
  ('fun_fact', 'أغلى قهوة في العالم سعرها $600 للرطل. من هضم القطط. Nochi يفضل العادية.', 'World most expensive coffee: $600/pound. Made via cat digestion. Nochi will stick to regular.'),
  ('fun_fact', 'فنلندا تشرب أكثر قهوة للفرد في العالم. تقريباً 12 كيلو في السنة.', 'Finland drinks the most coffee per person. Nearly 12kg per year.'),
  ('fun_fact', 'الماتشا فيها كافيين أكثر من الشاي الأخضر العادي بـ 10 مرات.', 'Matcha has 10x more antioxidants than regular green tea.'),
  ('fun_fact', 'كلمة "قهوة" أصلها عربي. من كلمة "قهوة" اللي معناها مشروب منبه.', 'The word "coffee" comes from Arabic "qahwa" meaning stimulating drink.'),
  ('fun_fact', 'أول كاميرا ويب اخترعوها عشان يراقبوا ماكينة قهوة في كامبريدج.', 'The first webcam was invented to monitor a coffee pot at Cambridge University.'),
  ('fun_fact', 'النحل يقدر يعرف الوجوه البشرية. نعم، يمكن يعرفك.', 'Bees can recognize human faces. Yes, they might know you.'),
  ('fun_fact', 'الأخطبوط عنده 3 قلوب و دم أزرق. مبالغ شوية.', 'An octopus has 3 hearts and blue blood. A bit dramatic.'),
  ('fun_fact', 'العسل ما يفسد أبداً. لقوا عسل عمره 3000 سنة في مقابر مصرية ولسا صالح.', 'Honey never spoils. 3,000-year-old honey found in Egyptian tombs was still edible.'),
  ('fun_fact', 'شجرة واحدة تنتج أكسجين يكفي شخصين في السنة.', 'A single tree produces enough oxygen for two people per year.'),
  ('fun_fact', 'الحبار عنده أكبر عيون في مملكة الحيوانات. بحجم كرة طائرة.', 'Giant squid have the largest eyes in the animal kingdom. Size of a volleyball.'),
  ('fun_fact', 'لو تقدر تطير للشمس بطيارة، تاخذ 20 سنة.', 'If you could fly a plane to the sun, it would take about 20 years.'),
  ('fun_fact', 'دماغ الإنسان يستهلك 20% من طاقة الجسم كله. تبرير ممتاز لأكل حلويات.', 'Your brain uses 20% of your total energy. Excellent excuse for dessert.'),
  ('fun_fact', 'الزرافة ولسانها أزرق غامق، طوله 50 سم. عشان ما ينحرق من الشمس.', 'A giraffe tongue is dark blue and 50cm long. The color prevents sunburn.');
