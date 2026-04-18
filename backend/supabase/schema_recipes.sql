-- ============================================================
-- RECIPES MODULE
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,           -- e.g. SL-01, ML-10
  name text not null,
  name_ar text,
  category text not null               -- coffee | matcha | specialty | signature
    check (category in ('coffee', 'matcha', 'specialty', 'signature')),
  subcategory text,                    -- iced | hot | null
  description text,
  description_ar text,
  yield_ml integer,
  serve_temp text default 'iced'       -- hot | iced | room
    check (serve_temp in ('hot', 'iced', 'room')),
  glass_type text,
  glass_type_ar text,
  -- ingredients: [{ group, group_ar, items: [{ name, name_ar, amount, unit }] }]
  ingredients jsonb default '[]'::jsonb,
  -- layers: [{ label, label_ar, color, height }]  (bottom to top order)
  layers jsonb default '[]'::jsonb,
  -- steps: [{ step, instruction, instruction_ar, warning, warning_ar }]
  steps jsonb default '[]'::jsonb,
  notes text,
  notes_ar text,
  is_archived boolean default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table recipes enable row level security;

-- All authenticated users can read non-archived recipes
create policy "recipes_read" on recipes
  for select using (auth.role() = 'authenticated' and is_archived = false);

-- Owners can read archived recipes too
create policy "recipes_read_archived" on recipes
  for select using (
    auth.role() = 'authenticated'
    and is_archived = true
    and exists (select 1 from profiles where id = auth.uid() and role = 'owner')
  );

-- Only owners can insert/update/delete
create policy "recipes_owner_write" on recipes
  for all using (
    auth.role() = 'authenticated'
    and exists (select 1 from profiles where id = auth.uid() and role = 'owner')
  );

-- ============================================================
-- SEED: Sample recipes (optional — uncomment to add)
-- ============================================================
-- insert into recipes (code, name, name_ar, category, subcategory, serve_temp, glass_type, glass_type_ar,
--   ingredients, layers, steps)
-- values (
--   'SL-01', 'Einspanner', 'أينشبانر', 'coffee', 'iced', 'iced', 'Tall Glass', 'كوب طويل',
--   '[
--     {"group":"Base","group_ar":"الأساس","items":[
--       {"name":"Cold Brew","name_ar":"قهوة باردة","amount":"120","unit":"ml"},
--       {"name":"Ice","name_ar":"ثلج","amount":"Full","unit":""}
--     ]},
--     {"group":"Topping","group_ar":"التوبينج","items":[
--       {"name":"Heavy Cream","name_ar":"كريمة ثقيلة","amount":"80","unit":"ml"},
--       {"name":"Powdered Sugar","name_ar":"سكر بودرة","amount":"10","unit":"g"}
--     ]}
--   ]'::jsonb,
--   '[
--     {"label":"Ice + Cold Brew","label_ar":"ثلج + قهوة باردة","color":"#2C1A0E","height":3},
--     {"label":"Whipped Cream","label_ar":"كريمة مخفوقة","color":"#F5F0E8","height":2}
--   ]'::jsonb,
--   '[
--     {"step":1,"instruction":"Fill glass with ice","instruction_ar":"امل الكوب بالثلج","warning":null,"warning_ar":null},
--     {"step":2,"instruction":"Pour cold brew over ice","instruction_ar":"صب القهوة الباردة على الثلج","warning":null,"warning_ar":null},
--     {"step":3,"instruction":"Whip the heavy cream to soft peaks and pour on top gently","instruction_ar":"اخفق الكريمة وصبها فوق القهوة برفق","warning":"Do not stir","warning_ar":"لا تحرك"}
--   ]'::jsonb
-- );
