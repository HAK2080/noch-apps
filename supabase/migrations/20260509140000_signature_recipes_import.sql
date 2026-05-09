-- ============================================================
-- SIGNATURE RECIPES IMPORT — 2026-05-09
-- Source: Matcha_Signature_Recipes.pdf + Coffee_Signature_Menu_Updated.pdf
-- Idempotent: uses INSERT ... ON CONFLICT (code) DO UPDATE so re-running
-- this migration updates existing rows in place.
-- ============================================================

-- Helper: standard updated_at touch
update recipes set updated_at = now() where false;

-- ─── MATCHA SIGNATURE DRINKS ────────────────────────────────────────
-- Codes MS-00 (batch helper) + MS-01..MS-08 (recipes)

insert into recipes (code, name, name_ar, category, subcategory, serve_temp, glass_type, ingredients, steps, notes)
values
('MS-00', 'Batch Cold Foam',         'كولد فوم باتش',     'matcha',    'iced', 'iced', NULL,
  '[{"group":"Ingredients","group_ar":"المكونات","items":[
    {"name":"Heavy cream","name_ar":"كريمة ثقيلة","amount":"90","unit":"g"},
    {"name":"Matcha (whisked with 25g water at 40°C)","name_ar":"ماتشا (مخفوقة مع 25 جم ماء عند 40 درجة)","amount":"4.5","unit":"g"},
    {"name":"Sea salt","name_ar":"ملح بحر","amount":"0.1","unit":"g"},
    {"name":"Vanilla syrup","name_ar":"صوص فانيلا","amount":"45","unit":"g"}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Batch prep — used as cold foam topping in Strawberry Matcha, Mango Matcha, Double Matcha, Matcha Blueberry, Matcha Pistachio. Updated 2026-05-09.'),

('MS-01', 'Strawberry Matcha',        'ماتشا فراولة',      'matcha', 'iced', 'iced', 'Tall glass',
  '[{"group":"Drink","group_ar":"المشروب","items":[
    {"name":"Matcha (whisked in 30g water at 40°C)","name_ar":"ماتشا (مخفوقة مع 30 جم ماء عند 40 درجة)","amount":"3","unit":"g"},
    {"name":"Strawberry sauce","name_ar":"صوص فراولة","amount":"40","unit":"g"},
    {"name":"Strawberry syrup","name_ar":"شراب فراولة","amount":"20","unit":"g"},
    {"name":"Coconut milk","name_ar":"حليب جوز الهند","amount":"100","unit":"g"}
  ]},
  {"group":"Topping","group_ar":"التوبينج","items":[
    {"name":"Cold foam (batch)","name_ar":"كولد فوم (باتش)","amount":"70","unit":"g"}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('MS-02', 'Matcha Mango Sauce',      'صوص ماتشا مانجو',   'matcha', 'iced', 'iced', NULL,
  '[{"group":"Sauce","group_ar":"الصوص","items":[
    {"name":"Mango (blended)","name_ar":"مانجو (مخلوطة)","amount":"500","unit":"g"},
    {"name":"Mango syrup","name_ar":"شراب مانجو","amount":"30","unit":"g"}
  ]}]'::jsonb,
  '[{"step":1,"instruction":"Blend mango with mango syrup until smooth.","instruction_ar":"اخلط المانجو مع شراب المانجو حتى يصبح ناعمًا.","warning":null,"warning_ar":null}]'::jsonb,
  'Sauce prep used in Mango Matcha Drink. Updated 2026-05-09.'),

('MS-03', 'Mango Matcha Drink',      'مشروب ماتشا مانجو', 'matcha', 'iced', 'iced', 'Tall glass',
  '[{"group":"Drink","group_ar":"المشروب","items":[
    {"name":"Matcha (whisked in 30g water at 40°C)","name_ar":"ماتشا (مخفوقة مع 30 جم ماء عند 40 درجة)","amount":"3","unit":"g"},
    {"name":"Mango purée","name_ar":"بيوريه مانجو","amount":"40","unit":"g"},
    {"name":"Passion fruit syrup","name_ar":"شراب باشن فروت","amount":"20","unit":"g"},
    {"name":"Coconut milk","name_ar":"حليب جوز الهند","amount":"120","unit":"g"}
  ]},
  {"group":"Topping","group_ar":"التوبينج","items":[
    {"name":"Cold foam (batch)","name_ar":"كولد فوم (باتش)","amount":"70","unit":"g"}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('MS-04', 'Double Matcha',           'ماتشا دبل',          'matcha', 'iced', 'iced', 'Tall glass',
  '[{"group":"Drink","group_ar":"المشروب","items":[
    {"name":"Matcha (whisked with 30g water at 40°C)","name_ar":"ماتشا (مخفوقة مع 30 جم ماء عند 40 درجة)","amount":"3","unit":"g"},
    {"name":"Sugar syrup","name_ar":"شراب سكر","amount":"15","unit":"g"},
    {"name":"Milk of choice","name_ar":"حليب حسب الاختيار","amount":"","unit":""}
  ]},
  {"group":"Topping","group_ar":"التوبينج","items":[
    {"name":"Cold foam (batch)","name_ar":"كولد فوم (باتش)","amount":"70","unit":"g"}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('MS-05', 'Matcha Tiramisu',         'ماتشا تيراميسو',     'matcha', 'iced', 'iced', 'Tall glass',
  '[{"group":"Drink","group_ar":"المشروب","items":[
    {"name":"Tiramisu syrup","name_ar":"شراب تيراميسو","amount":"30","unit":"g"},
    {"name":"Whole milk","name_ar":"حليب كامل الدسم","amount":"100","unit":"g"},
    {"name":"Matcha (whisked in 30g water at 40°C)","name_ar":"ماتشا (مخفوقة مع 30 جم ماء عند 40 درجة)","amount":"3","unit":"g"}
  ]},
  {"group":"Cold Foam","group_ar":"كولد فوم","items":[
    {"name":"Heavy cream","name_ar":"كريمة ثقيلة","amount":"30","unit":"g"},
    {"name":"Milk","name_ar":"حليب","amount":"50","unit":"g"},
    {"name":"Mascarpone","name_ar":"ماسكاربوني","amount":"15","unit":"g"},
    {"name":"Vanilla syrup","name_ar":"صوص فانيلا","amount":"5","unit":"g"}
  ]},
  {"group":"Garnish","group_ar":"التزيين","items":[
    {"name":"Cacao powder","name_ar":"بودرة كاكاو","amount":"","unit":""},
    {"name":"Ladyfinger","name_ar":"ليدي فينجر","amount":"","unit":""}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Garnish with cacao powder and ladyfinger. Updated 2026-05-09 — signature menu import.'),

('MS-06', 'Matcha Blueberry',        'ماتشا توت',          'matcha', 'iced', 'iced', 'Tall glass',
  '[{"group":"Drink","group_ar":"المشروب","items":[
    {"name":"Blueberry purée","name_ar":"بيوريه توت","amount":"30","unit":"g"},
    {"name":"Milk","name_ar":"حليب","amount":"100","unit":"g"},
    {"name":"Matcha (whisked with 25g water at 70°C)","name_ar":"ماتشا (مخفوقة مع 25 جم ماء عند 70 درجة)","amount":"3","unit":"g"}
  ]},
  {"group":"Topping","group_ar":"التوبينج","items":[
    {"name":"Cold foam (batch)","name_ar":"كولد فوم (باتش)","amount":"70","unit":"g"}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('MS-07', 'Matcha Date',             'ماتشا تمر',          'matcha', 'iced', 'iced', 'Tall glass',
  '[{"group":"Drink","group_ar":"المشروب","items":[
    {"name":"Date syrup","name_ar":"شراب تمر","amount":"45","unit":"g"},
    {"name":"Honey","name_ar":"عسل","amount":"3","unit":"g"},
    {"name":"Oat milk","name_ar":"حليب الشوفان","amount":"","unit":""},
    {"name":"Matcha (whisked in 30g water at 40°C)","name_ar":"ماتشا (مخفوقة مع 30 جم ماء عند 40 درجة)","amount":"3","unit":"g"}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('MS-08', 'Matcha Pistachio',        'ماتشا فستق',          'matcha', 'iced', 'iced', 'Tall glass',
  '[{"group":"Drink","group_ar":"المشروب","items":[
    {"name":"Pistachio sauce","name_ar":"صوص فستق","amount":"20","unit":"g"},
    {"name":"Pistachio syrup","name_ar":"شراب فستق","amount":"5","unit":"g"},
    {"name":"Matcha (whisked with 40g water at 70°C)","name_ar":"ماتشا (مخفوقة مع 40 جم ماء عند 70 درجة)","amount":"3","unit":"g"},
    {"name":"Whole milk","name_ar":"حليب كامل الدسم","amount":"","unit":""}
  ]},
  {"group":"Topping","group_ar":"التوبينج","items":[
    {"name":"Cold foam (batch)","name_ar":"كولد فوم (باتش)","amount":"70","unit":"g"}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.')
on conflict (code) do update set
  name           = excluded.name,
  name_ar        = excluded.name_ar,
  category       = excluded.category,
  subcategory    = excluded.subcategory,
  serve_temp     = excluded.serve_temp,
  glass_type     = excluded.glass_type,
  ingredients    = excluded.ingredients,
  steps          = excluded.steps,
  notes          = excluded.notes,
  updated_at     = now();

-- ─── COFFEE SIGNATURE DRINKS ─────────────────────────────────────────
-- Codes CS-01..CS-09

insert into recipes (code, name, name_ar, category, subcategory, serve_temp, glass_type, ingredients, steps, notes)
values
('CS-01', 'Spanish Iced Latte',          'سبانيش لاتيه آيس',      'coffee',    'iced', 'iced', 'Tall glass',
  '[{"group":"Drink","group_ar":"المشروب","items":[
    {"name":"Ready mix","name_ar":"خليط جاهز","amount":"40","unit":"g"},
    {"name":"Sugar syrup","name_ar":"شراب سكر","amount":"30","unit":"g"},
    {"name":"Double espresso shot","name_ar":"دبل اسبريسو","amount":"1","unit":"shot"},
    {"name":"Whole milk","name_ar":"حليب كامل الدسم","amount":"","unit":""},
    {"name":"Ice","name_ar":"ثلج","amount":"","unit":""}
  ]}]'::jsonb,
  '[{"step":1,"instruction":"Mix ingredients with espresso, then add milk and ice.","instruction_ar":"اخلط المكونات مع الإسبريسو ثم أضف الحليب والثلج.","warning":null,"warning_ar":null}]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('CS-02', 'Einspanner Iced (All You Need Base)', 'أينشبانر آيس',  'signature', 'iced', 'iced', 'Tall glass',
  '[{"group":"Base","group_ar":"الأساس","items":[
    {"name":"Double espresso","name_ar":"دبل اسبريسو","amount":"1","unit":"shot"},
    {"name":"Vanilla syrup","name_ar":"صوص فانيلا","amount":"15","unit":"ml"},
    {"name":"Sugar syrup","name_ar":"شراب سكر","amount":"10","unit":"ml"},
    {"name":"Whole milk","name_ar":"حليب كامل الدسم","amount":"","unit":""}
  ]},
  {"group":"Cold Foam","group_ar":"كولد فوم","items":[
    {"name":"Heavy cream","name_ar":"كريمة ثقيلة","amount":"40","unit":"ml"},
    {"name":"Sea salt","name_ar":"ملح بحر","amount":"0.1","unit":"g"},
    {"name":"Milk","name_ar":"حليب","amount":"30","unit":"ml"}
  ]},
  {"group":"Garnish","group_ar":"التزيين","items":[
    {"name":"Cocoa powder dust","name_ar":"رشّة بودرة كاكاو","amount":"","unit":""}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('CS-03', 'Iced Pistachio Latte',        'بيستاشيو لاتيه آيس',     'signature', 'iced', 'iced', 'Tall glass',
  '[{"group":"Ingredients","group_ar":"المكونات","items":[
    {"name":"Pistachio syrup","name_ar":"شراب فستق","amount":"40","unit":"g"},
    {"name":"Double espresso shot","name_ar":"دبل اسبريسو","amount":"1","unit":"shot"},
    {"name":"Whole milk","name_ar":"حليب كامل الدسم","amount":"","unit":""},
    {"name":"Ice","name_ar":"ثلج","amount":"","unit":""}
  ]},
  {"group":"Cold Foam","group_ar":"كولد فوم","items":[
    {"name":"Heavy cream","name_ar":"كريمة ثقيلة","amount":"30","unit":"ml"},
    {"name":"Milk","name_ar":"حليب","amount":"20","unit":"ml"},
    {"name":"Pistachio syrup","name_ar":"شراب فستق","amount":"5","unit":"ml"},
    {"name":"Himalayan pink salt","name_ar":"ملح هيمالايا الوردي","amount":"0.1","unit":"g"}
  ]},
  {"group":"Garnish","group_ar":"التزيين","items":[
    {"name":"Crushed pistachios","name_ar":"فستق مجروش","amount":"","unit":""}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('CS-04', 'Ice Shaken Cold Brew',        'كولد برو مشيك',           'signature', 'iced', 'iced', 'Tall glass',
  '[{"group":"Ingredients","group_ar":"المكونات","items":[
    {"name":"White mocha","name_ar":"وايت موكا","amount":"50","unit":"g"},
    {"name":"Cold brew","name_ar":"كولد برو","amount":"150","unit":"ml"},
    {"name":"Whole milk","name_ar":"حليب كامل الدسم","amount":"100","unit":"ml"},
    {"name":"Ice","name_ar":"ثلج","amount":"","unit":""}
  ]}]'::jsonb,
  '[{"step":1,"instruction":"Add all ingredients into a shaker with ice and shake well.","instruction_ar":"ضع جميع المكونات في الشيكر مع الثلج ورج بقوة.","warning":null,"warning_ar":null}]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('CS-05', 'Ice Lotus Latte',             'لوتس لاتيه آيس',          'signature', 'iced', 'iced', 'Tall glass',
  '[{"group":"Ingredients","group_ar":"المكونات","items":[
    {"name":"Lotus sauce","name_ar":"صوص لوتس","amount":"40","unit":"g"},
    {"name":"Double espresso","name_ar":"دبل اسبريسو","amount":"1","unit":"shot"},
    {"name":"Ice","name_ar":"ثلج","amount":"","unit":""},
    {"name":"Milk","name_ar":"حليب","amount":"","unit":""}
  ]},
  {"group":"Cold Foam","group_ar":"كولد فوم","items":[
    {"name":"Heavy cream","name_ar":"كريمة ثقيلة","amount":"30","unit":"ml"},
    {"name":"Milk","name_ar":"حليب","amount":"20","unit":"ml"},
    {"name":"Brown sugar syrup","name_ar":"شراب سكر بني","amount":"5","unit":"ml"}
  ]},
  {"group":"Garnish","group_ar":"التزيين","items":[
    {"name":"Crushed Lotus biscuit","name_ar":"بسكويت لوتس مجروش","amount":"","unit":""}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('CS-06', 'Honey Macadamia Ice Latte',   'هني مكاديميا لاتيه آيس',  'signature', 'iced', 'iced', '450ml cup',
  '[{"group":"Ingredients","group_ar":"المكونات","items":[
    {"name":"Macadamia syrup","name_ar":"شراب مكاديميا","amount":"20","unit":"ml"},
    {"name":"Milk (fill to cup line)","name_ar":"حليب (حتى خط الكوب)","amount":"","unit":""},
    {"name":"Ice","name_ar":"ثلج","amount":"","unit":""},
    {"name":"Single espresso shot","name_ar":"سنجل اسبريسو","amount":"1","unit":"shot"},
    {"name":"Honey","name_ar":"عسل","amount":"10","unit":"ml"}
  ]}]'::jsonb,
  '[
    {"step":1,"instruction":"Add macadamia syrup into the cup.","instruction_ar":"أضف شراب المكاديميا إلى الكوب.","warning":null,"warning_ar":null},
    {"step":2,"instruction":"Pour milk and mix well.","instruction_ar":"اسكب الحليب واخلط جيدًا.","warning":null,"warning_ar":null},
    {"step":3,"instruction":"Fill the cup with ice.","instruction_ar":"املأ الكوب بالثلج.","warning":null,"warning_ar":null},
    {"step":4,"instruction":"In a shaker, add espresso, honey, and 2 ice cubes.","instruction_ar":"في الشيكر، أضف الإسبريسو والعسل ومكعبي ثلج.","warning":null,"warning_ar":null},
    {"step":5,"instruction":"Shake well and pour over the drink.","instruction_ar":"رج جيدًا واسكب فوق المشروب.","warning":null,"warning_ar":null},
    {"step":6,"instruction":"Finish with a honey drizzle.","instruction_ar":"زيّن برذاذ من العسل.","warning":null,"warning_ar":null}
  ]'::jsonb,
  'Build: Iced Signature Latte. Cup 450ml. Updated 2026-05-09 — signature menu import.'),

('CS-07', 'Tiramisu Ice Latte',          'تيراميسو لاتيه آيس',      'signature', 'iced', 'iced', 'Tall glass',
  '[{"group":"Ingredients","group_ar":"المكونات","items":[
    {"name":"Tiramisu syrup","name_ar":"شراب تيراميسو","amount":"20","unit":"ml"},
    {"name":"Milk (fill to cup line)","name_ar":"حليب (حتى خط الكوب)","amount":"","unit":""},
    {"name":"Ice","name_ar":"ثلج","amount":"","unit":""},
    {"name":"Double espresso","name_ar":"دبل اسبريسو","amount":"1","unit":"shot"}
  ]},
  {"group":"Cold Foam","group_ar":"كولد فوم","items":[
    {"name":"Mascarpone","name_ar":"ماسكاربوني","amount":"15","unit":"g"},
    {"name":"Heavy cream","name_ar":"كريمة ثقيلة","amount":"40","unit":"ml"},
    {"name":"Vanilla syrup","name_ar":"صوص فانيلا","amount":"10","unit":"ml"},
    {"name":"Espresso","name_ar":"اسبريسو","amount":"10","unit":"ml"},
    {"name":"Whole milk","name_ar":"حليب كامل الدسم","amount":"25","unit":"ml"}
  ]},
  {"group":"Garnish","group_ar":"التزيين","items":[
    {"name":"Crushed lady finger","name_ar":"ليدي فينجر مجروش","amount":"","unit":""},
    {"name":"Cocoa powder dust","name_ar":"رشّة بودرة كاكاو","amount":"","unit":""}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Updated 2026-05-09 — signature menu import.'),

('CS-08', 'Marshmallow Ice Espresso',    'مارشميلو اسبريسو آيس',    'signature', 'iced', 'iced', 'Tall glass',
  '[{"group":"Ingredients","group_ar":"المكونات","items":[
    {"name":"Marshmallow syrup","name_ar":"شراب مارشميلو","amount":"25","unit":"ml"},
    {"name":"Espresso shots","name_ar":"شوتات اسبريسو","amount":"","unit":""},
    {"name":"Whole milk","name_ar":"حليب كامل الدسم","amount":"","unit":""},
    {"name":"Ice","name_ar":"ثلج","amount":"","unit":""},
    {"name":"Marshmallow skewer","name_ar":"سيخ مارشميلو","amount":"2","unit":"pcs"}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Presentation: soft foam texture, toasted marshmallow finish. Updated 2026-05-09 — signature menu import.'),

('CS-09', 'Cafe Double Ice (All You Need)', 'كافيه دبل آيس',         'signature', 'iced', 'iced', '450ml / 16oz cup',
  '[{"group":"Ingredients","group_ar":"المكونات","items":[
    {"name":"Ice","name_ar":"ثلج","amount":"","unit":""},
    {"name":"Whole milk (approx.)","name_ar":"حليب كامل الدسم (تقريبًا)","amount":"150","unit":"ml"},
    {"name":"Double espresso (3 shots total)","name_ar":"دبل اسبريسو (3 شوتات)","amount":"3","unit":"shot"},
    {"name":"Heavy cream","name_ar":"كريمة ثقيلة","amount":"40","unit":"ml"},
    {"name":"Vanilla syrup","name_ar":"صوص فانيلا","amount":"15","unit":"ml"},
    {"name":"Pinch of salt","name_ar":"رشّة ملح","amount":"","unit":""},
    {"name":"Cocoa powder dust","name_ar":"رشّة بودرة كاكاو","amount":"","unit":""}
  ]}]'::jsonb,
  '[]'::jsonb,
  'Cup 450ml / 16oz. Updated 2026-05-09 — signature menu import.')
on conflict (code) do update set
  name           = excluded.name,
  name_ar        = excluded.name_ar,
  category       = excluded.category,
  subcategory    = excluded.subcategory,
  serve_temp     = excluded.serve_temp,
  glass_type     = excluded.glass_type,
  ingredients    = excluded.ingredients,
  steps          = excluded.steps,
  notes          = excluded.notes,
  updated_at     = now();
