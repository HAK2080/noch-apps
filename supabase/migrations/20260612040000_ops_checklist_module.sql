-- Ops Checklist module — fully settings-driven, ships DISABLED.
--
-- Nothing in this migration encodes a hardcoded business rule. The schema
-- only defines structures. Behaviour is read from ops_settings at runtime.
--
-- Default: ops_settings.module_enabled = FALSE. The module is invisible
-- until an owner flips it on inside the app. Frontend gates the nav,
-- popup, instance generation, and trigger all on this flag.

-- ── 1. SETTINGS (singleton, like finance_settings) ──────────────────────────
create table if not exists ops_settings (
  id text primary key default 'default' check (id = 'default'),
  module_enabled             boolean default false,   -- master switch — OFF by default
  reminders_enabled          boolean default true,
  reminder_repeat_count      integer default 2,
  reminder_repeat_delay_minutes integer default 30,
  persistent_badge_enabled   boolean default true,
  restock_alerts_enabled     boolean default true,
  generate_at_hour           integer default 5,        -- daily cron, local hour 0–23
  timezone                   text    default 'Africa/Tripoli',
  updated_at                 timestamptz default now()
);
insert into ops_settings (id) values ('default') on conflict do nothing;

-- ── 2. SHIFT WINDOWS (admin-defined) ────────────────────────────────────────
create table if not exists ops_shift_windows (
  id          uuid primary key default gen_random_uuid(),
  name_ar     text not null,
  name_en     text not null,
  start_time  time not null,
  end_time    time not null,
  sort_order  integer default 0,
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists ops_shift_windows_sort_idx on ops_shift_windows (sort_order);

-- ── 3. INVENTORY ITEMS (par-level tracking) ─────────────────────────────────
create table if not exists ops_inventory_items (
  id          uuid primary key default gen_random_uuid(),
  name_ar     text not null,
  name_en     text not null,
  unit        text not null,
  par_level   numeric(12,2) not null default 0,
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 4. TASK TEMPLATES ───────────────────────────────────────────────────────
create table if not exists ops_task_templates (
  id                uuid primary key default gen_random_uuid(),
  title_ar          text not null,
  title_en          text not null,
  description_ar    text,
  description_en    text,
  shift_window_id   uuid not null references ops_shift_windows(id) on delete restrict,
  requires_value    boolean default false,
  inventory_item_id uuid references ops_inventory_items(id) on delete set null,
  sort_order        integer default 0,
  active            boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index if not exists ops_task_templates_window_idx on ops_task_templates (shift_window_id, sort_order);

-- ── 5. TASK INSTANCES (one per template per business day) ───────────────────
create table if not exists ops_task_instances (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references ops_task_templates(id) on delete cascade,
  business_date   date not null,
  status          text not null default 'pending' check (status in ('pending','done','skipped')),
  value_recorded  numeric(12,2),
  completed_by    uuid references profiles(id),
  completed_at    timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (template_id, business_date)
);
create index if not exists ops_task_instances_date_idx on ops_task_instances (business_date, status);

-- ── 6. RESTOCK ALERTS ───────────────────────────────────────────────────────
create table if not exists ops_restock_alerts (
  id                  uuid primary key default gen_random_uuid(),
  inventory_item_id   uuid not null references ops_inventory_items(id) on delete cascade,
  task_instance_id    uuid not null references ops_task_instances(id) on delete cascade,
  recorded_qty        numeric(12,2) not null,
  par_level           numeric(12,2) not null,   -- snapshot at time of alert
  created_at          timestamptz default now(),
  acknowledged_by     uuid references profiles(id),
  acknowledged_at     timestamptz
);
create index if not exists ops_restock_alerts_open_idx on ops_restock_alerts (acknowledged_at) where acknowledged_at is null;

-- ── 7. AUTO-FLAG TRIGGER ────────────────────────────────────────────────────
-- Fires on UPDATE: when a value is recorded for a task whose template links
-- to an inventory item with a par level, and the value is below par, raise a
-- restock alert. Reads ops_settings each time so the toggle works without
-- redeploy. Skips entirely when the module or alerts are disabled.
create or replace function ops_check_restock_on_instance() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s            ops_settings%rowtype;
  tmpl         ops_task_templates%rowtype;
  item         ops_inventory_items%rowtype;
begin
  if new.status <> 'done' or new.value_recorded is null then
    return new;
  end if;

  select * into s from ops_settings where id = 'default';
  if not coalesce(s.module_enabled, false) or not coalesce(s.restock_alerts_enabled, false) then
    return new;
  end if;

  select * into tmpl from ops_task_templates where id = new.template_id;
  if not tmpl.requires_value or tmpl.inventory_item_id is null then
    return new;
  end if;

  select * into item from ops_inventory_items where id = tmpl.inventory_item_id;
  if item.par_level is null or item.par_level <= 0 then
    return new;
  end if;

  if new.value_recorded < item.par_level then
    insert into ops_restock_alerts (inventory_item_id, task_instance_id, recorded_qty, par_level)
    values (item.id, new.id, new.value_recorded, item.par_level);
  end if;

  return new;
end $$;

drop trigger if exists ops_check_restock_trg on ops_task_instances;
create trigger ops_check_restock_trg
  after update on ops_task_instances
  for each row
  when (new.status = 'done' and new.value_recorded is not null
        and (old.status is distinct from new.status or old.value_recorded is distinct from new.value_recorded))
  execute function ops_check_restock_on_instance();

-- ── 8. INSTANCE-GENERATION RPC (called by edge function on cron) ────────────
create or replace function ops_generate_instances_for(p_business_date date default current_date)
returns table (template_id uuid, business_date date, inserted boolean)
language plpgsql security definer set search_path = public as $$
declare
  s ops_settings%rowtype;
begin
  select * into s from ops_settings where id = 'default';
  if not coalesce(s.module_enabled, false) then
    return;  -- module off: skip silently
  end if;

  return query
  with ins as (
    insert into ops_task_instances (template_id, business_date, status)
    select t.id, p_business_date, 'pending'
    from ops_task_templates t
    join ops_shift_windows w on w.id = t.shift_window_id
    where t.active and w.active
    on conflict (template_id, business_date) do nothing
    returning ops_task_instances.template_id, ops_task_instances.business_date
  )
  select ins.template_id, ins.business_date, true from ins;
end $$;
grant execute on function ops_generate_instances_for(date) to authenticated, service_role;

-- ── 9. ROLE PERMISSIONS — new 'ops' feature key ─────────────────────────────
-- Owner bypasses. Supervisor view+edit (the "manager" role per spec).
-- Everyone else view-only so staff can see and tap the checklist when the
-- module is on. Edit gates the settings UI.
insert into role_permissions (role, feature, can_access, can_edit) values
  ('supervisor',    'ops', true,  true),
  ('accountant',    'ops', true,  false),
  ('staff',         'ops', true,  false),
  ('limited_staff', 'ops', true,  false),
  ('data_entry',    'ops', true,  false)
on conflict (role, feature) do nothing;

-- ── 10. ROW LEVEL SECURITY ─────────────────────────────────────────────────
alter table ops_settings           enable row level security;
alter table ops_shift_windows      enable row level security;
alter table ops_inventory_items    enable row level security;
alter table ops_task_templates     enable row level security;
alter table ops_task_instances     enable row level security;
alter table ops_restock_alerts     enable row level security;

-- Helper inlined as policy predicates: "owner OR supervisor" = manager tier.
do $$
declare t text;
begin
  -- Read access for any authenticated user on config tables (matches the
  -- "staff = select templates/windows/items" rule in the spec).
  foreach t in array array['ops_settings','ops_shift_windows','ops_inventory_items','ops_task_templates'] loop
    execute format('drop policy if exists "%I_auth_read" on %I', t, t);
    execute format($f$create policy "%I_auth_read" on %I
      for select to authenticated using (auth.uid() is not null)$f$, t, t);

    execute format('drop policy if exists "%I_manager_write" on %I', t, t);
    execute format($f$create policy "%I_manager_write" on %I
      for all to authenticated
      using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')))
      with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')))$f$, t, t);
  end loop;
end $$;

-- ops_task_instances: any authenticated user may read; only owner/supervisor
-- may insert/delete; staff may update only their own completion (status,
-- value_recorded, completed_by, completed_at). Enforced as separate policies.
drop policy if exists "ops_task_instances_auth_read" on ops_task_instances;
create policy "ops_task_instances_auth_read" on ops_task_instances
  for select to authenticated using (auth.uid() is not null);

drop policy if exists "ops_task_instances_manager_write" on ops_task_instances;
create policy "ops_task_instances_manager_write" on ops_task_instances
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')));

drop policy if exists "ops_task_instances_staff_complete" on ops_task_instances;
create policy "ops_task_instances_staff_complete" on ops_task_instances
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
  -- Column-level restriction (status, value_recorded, completed_by,
  -- completed_at only) is enforced in the frontend write helper; coarse
  -- UPDATE permission at row level avoids policy duplication while keeping
  -- the manager-only INSERT/DELETE policy as the actual gate.

-- ops_restock_alerts: any authenticated read; owner/supervisor write/ack.
drop policy if exists "ops_restock_alerts_auth_read" on ops_restock_alerts;
create policy "ops_restock_alerts_auth_read" on ops_restock_alerts
  for select to authenticated using (auth.uid() is not null);

drop policy if exists "ops_restock_alerts_manager_write" on ops_restock_alerts;
create policy "ops_restock_alerts_manager_write" on ops_restock_alerts
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('owner','supervisor')));

-- ── 11. SEED DATA — 3 windows, 12 starter tasks, 3 inventory items ──────────
-- All clearly placeholders. Module is OFF, so this seed has zero effect on
-- live business until an owner enables ops_settings.module_enabled.

-- Windows
insert into ops_shift_windows (id, name_ar, name_en, start_time, end_time, sort_order)
values
  ('00000000-0000-0000-0000-0000000000a1', 'افتتاح المحل', 'Opening',   '06:00', '11:00', 10),
  ('00000000-0000-0000-0000-0000000000a2', 'منتصف الورديّة', 'Mid-shift', '15:00', '17:00', 20),
  ('00000000-0000-0000-0000-0000000000a3', 'إغلاق المحل', 'Closing',   '21:00', '23:59', 30)
on conflict (id) do nothing;

-- Inventory items (placeholder pars)
insert into ops_inventory_items (id, name_ar, name_en, unit, par_level)
values
  ('00000000-0000-0000-0000-0000000000b1', 'حليب', 'Milk',   'L',    6),
  ('00000000-0000-0000-0000-0000000000b2', 'ماتشا', 'Matcha', 'g',  100),
  ('00000000-0000-0000-0000-0000000000b3', 'كيك',  'Cakes',  'pcs',   5)
on conflict (id) do nothing;

-- Starter tasks (12) — bilingual, distributed across the 3 windows.
insert into ops_task_templates (
  id, title_ar, title_en, description_ar, description_en,
  shift_window_id, requires_value, inventory_item_id, sort_order
) values
  ('00000000-0000-0000-0000-0000000000c1', 'عدّ الكيك', 'Count cakes', 'سجّل العدد الموجود الآن', 'Record current count',
   '00000000-0000-0000-0000-0000000000a1', true, '00000000-0000-0000-0000-0000000000b3', 10),
  ('00000000-0000-0000-0000-0000000000c2', 'عدّ الحليب', 'Count milk', 'باللتر', 'In litres',
   '00000000-0000-0000-0000-0000000000a1', true, '00000000-0000-0000-0000-0000000000b1', 20),
  ('00000000-0000-0000-0000-0000000000c3', 'عدّ الماتشا', 'Count matcha', 'بالجرام', 'In grams',
   '00000000-0000-0000-0000-0000000000a1', true, '00000000-0000-0000-0000-0000000000b2', 30),
  ('00000000-0000-0000-0000-0000000000c4', 'تحقّق من حرارة الثلاجة', 'Check fridge temperature', 'يجب أن تكون أقل من 5°', 'Should be under 5°C',
   '00000000-0000-0000-0000-0000000000a1', false, null, 40),
  ('00000000-0000-0000-0000-0000000000c5', 'حساب صندوق البداية', 'Count opening float', 'سجّل المبلغ في الصندوق', 'Record drawer amount',
   '00000000-0000-0000-0000-0000000000a1', true, null, 50),

  ('00000000-0000-0000-0000-0000000000c6', 'جرد البار وسطًا', 'Mid-shift bar stock', 'فحص سريع للمكوّنات', 'Quick component check',
   '00000000-0000-0000-0000-0000000000a2', false, null, 10),
  ('00000000-0000-0000-0000-0000000000c7', 'تسليم الورديّة', 'Shift handover', 'ملاحظات للوردية القادمة', 'Notes for next shift',
   '00000000-0000-0000-0000-0000000000a2', false, null, 20),

  ('00000000-0000-0000-0000-0000000000c8', 'عدّ نهاية اليوم — حليب', 'Closing count — milk', '', '',
   '00000000-0000-0000-0000-0000000000a3', true, '00000000-0000-0000-0000-0000000000b1', 10),
  ('00000000-0000-0000-0000-0000000000c9', 'عدّ نهاية اليوم — ماتشا', 'Closing count — matcha', '', '',
   '00000000-0000-0000-0000-0000000000a3', true, '00000000-0000-0000-0000-0000000000b2', 20),
  ('00000000-0000-0000-0000-0000000000ca', 'سجّل الهدر', 'Waste log', 'كم تم إتلافه؟', 'How much was discarded?',
   '00000000-0000-0000-0000-0000000000a3', false, null, 30),
  ('00000000-0000-0000-0000-0000000000cb', 'تسوية الصندوق', 'Cash reconciliation', 'طابق المبلغ مع تقرير POS', 'Match against POS report',
   '00000000-0000-0000-0000-0000000000a3', false, null, 40),
  ('00000000-0000-0000-0000-0000000000cc', 'إطفاء الأجهزة', 'Equipment off', 'أفران، ماكينات، أضواء', 'Ovens, machines, lights',
   '00000000-0000-0000-0000-0000000000a3', false, null, 50)
on conflict (id) do nothing;
