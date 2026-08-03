-- NOCH LOYALTY V2
-- Privacy-first checkout identification, immutable points, guaranteed rewards,
-- simple missions, and a reconciled V1 archive.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Program versions and immutable V1 archive
-- ---------------------------------------------------------------------------

create table if not exists public.loyalty_program_versions (
  code text primary key,
  name text not null,
  status text not null check (status in ('draft', 'active', 'archived')),
  rules jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.loyalty_program_versions (
  code, name, status, rules, archived_at
) values (
  'v1',
  'Nochi Loyalty V1',
  'archived',
  jsonb_build_object('currency', 'stamps', 'source', 'legacy'),
  now()
)
on conflict (code) do update
set status = 'archived',
    archived_at = coalesce(loyalty_program_versions.archived_at, excluded.archived_at);

insert into public.loyalty_program_versions (
  code, name, status, rules, activated_at
) values (
  'v2',
  'Nochi Loyalty V2',
  'active',
  jsonb_build_object(
    'points_per_lyd', 1,
    'reward_points', 200,
    'max_visible_missions', 2
  ),
  now()
)
on conflict (code) do update
set status = 'active',
    activated_at = coalesce(loyalty_program_versions.activated_at, excluded.activated_at);

create table if not exists public.loyalty_v1_customer_archive (
  customer_id uuid primary key,
  full_name text not null,
  current_stamps integer not null,
  total_stamps integer not null,
  points integer not null,
  tier text,
  total_visits integer not null,
  nochi_state text,
  archived_at timestamptz not null default now()
);

insert into public.loyalty_v1_customer_archive (
  customer_id,
  full_name,
  current_stamps,
  total_stamps,
  points,
  tier,
  total_visits,
  nochi_state
)
select
  c.id,
  c.full_name,
  greatest(coalesce(c.current_stamps, 0), 0),
  greatest(coalesce(c.total_stamps, 0), 0),
  greatest(coalesce(c.points, 0), 0),
  c.tier,
  greatest(coalesce(c.total_visits, 0), 0),
  c.nochi_state
from public.loyalty_customers c
on conflict (customer_id) do nothing;

create table if not exists public.loyalty_v1_reward_archive (
  reward_id uuid primary key,
  customer_id uuid not null,
  reward_type text not null,
  description text,
  status text not null,
  expires_at timestamptz,
  redeemed_at timestamptz,
  archived_at timestamptz not null default now()
);

insert into public.loyalty_v1_reward_archive (
  reward_id,
  customer_id,
  reward_type,
  description,
  status,
  expires_at,
  redeemed_at
)
select
  r.id,
  r.customer_id,
  r.reward_type,
  r.description,
  r.status,
  r.expires_at,
  r.redeemed_at
from public.loyalty_rewards r
on conflict (reward_id) do nothing;

create table if not exists public.loyalty_v1_stamp_archive (
  stamp_id uuid primary key,
  customer_id uuid not null,
  awarded_by uuid,
  stamp_number integer not null,
  cycle_number integer not null,
  notes text,
  earned_at timestamptz not null,
  archived_at timestamptz not null default now()
);

insert into public.loyalty_v1_stamp_archive (
  stamp_id,
  customer_id,
  awarded_by,
  stamp_number,
  cycle_number,
  notes,
  earned_at
)
select
  s.id,
  s.customer_id,
  s.awarded_by,
  s.stamp_number,
  s.cycle_number,
  s.notes,
  s.created_at
from public.loyalty_stamps s
on conflict (stamp_id) do nothing;

alter table public.loyalty_customers
  alter column phone drop not null,
  add column if not exists email text,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists loyalty_customers_auth_user_unique
  on public.loyalty_customers(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists loyalty_customers_email_unique
  on public.loyalty_customers(lower(email))
  where email is not null;

-- ---------------------------------------------------------------------------
-- V2 memberships, missions, rewards, point events, and checkout sessions
-- ---------------------------------------------------------------------------

create table if not exists public.loyalty_v2_settings (
  program_code text primary key references public.loyalty_program_versions(code),
  points_per_lyd numeric(10,3) not null default 1 check (points_per_lyd > 0),
  reward_points integer not null default 200 check (reward_points > 0),
  reward_description text not null default 'Guaranteed Noch reward',
  reward_expiry_days integer not null default 45 check (reward_expiry_days > 0),
  checkout_expiry_seconds integer not null default 300
    check (checkout_expiry_seconds between 60 and 600),
  updated_at timestamptz not null default now()
);

insert into public.loyalty_v2_settings (program_code)
values ('v2')
on conflict (program_code) do nothing;

create table if not exists public.loyalty_v2_memberships (
  customer_id uuid primary key references public.loyalty_customers(id) on delete restrict,
  loyalty_number text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  legacy_points integer not null default 0,
  converted_stamp_points integer not null default 0,
  opening_points integer not null default 0,
  joined_at timestamptz not null default now(),
  migrated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_v2_missions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version integer not null default 1,
  title text not null,
  title_ar text,
  description text,
  description_ar text,
  mission_type text not null check (
    mission_type in ('repeat_visit', 'selected_product', 'selected_category', 'quiet_hours')
  ),
  target_count integer not null default 1 check (target_count > 0),
  reward_points integer not null check (reward_points > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_completions integer not null default 1 check (max_completions > 0),
  branch_ids uuid[] not null default '{}',
  product_ids uuid[] not null default '{}',
  category_ids uuid[] not null default '{}',
  quiet_start time,
  quiet_end time,
  status text not null default 'draft' check (status in ('draft', 'active', 'suspended', 'ended')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (code, version),
  check (ends_at > starts_at)
);

create table if not exists public.loyalty_v2_mission_progress (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.loyalty_v2_missions(id) on delete restrict,
  customer_id uuid not null references public.loyalty_customers(id) on delete restrict,
  progress_count integer not null default 0 check (progress_count >= 0),
  completions integer not null default 0 check (completions >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'expired')),
  last_qualified_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (mission_id, customer_id)
);

create table if not exists public.loyalty_v2_mission_order_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.loyalty_v2_missions(id) on delete restrict,
  customer_id uuid not null references public.loyalty_customers(id) on delete restrict,
  order_id uuid not null references public.pos_orders(id) on delete restrict,
  completion_awarded boolean not null default false,
  qualified_at timestamptz not null default now(),
  reversed_at timestamptz,
  unique (mission_id, customer_id, order_id)
);

create table if not exists public.loyalty_v2_reward_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  title_ar text,
  description text,
  points_required integer not null check (points_required > 0),
  reward_type text not null default 'free_item'
    check (reward_type in ('free_item', 'fixed_discount')),
  reward_value_lyd numeric(10,3),
  product_ids uuid[] not null default '{}',
  category_ids uuid[] not null default '{}',
  branch_ids uuid[] not null default '{}',
  expiry_days integer not null default 45 check (expiry_days > 0),
  status text not null default 'active' check (status in ('draft', 'active', 'suspended', 'ended')),
  created_at timestamptz not null default now()
);

insert into public.loyalty_v2_reward_rules (
  code,
  title,
  title_ar,
  description,
  points_required,
  reward_type,
  expiry_days
) values (
  'v2-guaranteed-200',
  'Guaranteed Noch reward',
  'مكافأة نوتش المضمونة',
  'Unlocked automatically at 200 points',
  200,
  'free_item',
  45
)
on conflict (code) do nothing;

create table if not exists public.loyalty_v2_reward_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.loyalty_customers(id) on delete restrict,
  reward_rule_id uuid references public.loyalty_v2_reward_rules(id) on delete restrict,
  legacy_reward_id uuid unique,
  code text not null unique default (
    'N2-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'reserved', 'redeemed', 'expired', 'reversed')),
  branch_ids uuid[] not null default '{}',
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_order_id uuid references public.pos_orders(id) on delete set null,
  redeemed_by uuid references public.profiles(id) on delete set null,
  reversed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_v2_point_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.loyalty_customers(id) on delete restrict,
  event_type text not null check (
    event_type in (
      'opening_balance',
      'order_earn',
      'mission_bonus',
      'mission_bonus_reversal',
      'reward_unlock',
      'reward_reversal',
      'refund_reversal',
      'void_reversal',
      'manual_adjustment'
    )
  ),
  points_delta integer not null check (points_delta <> 0),
  order_id uuid references public.pos_orders(id) on delete restrict,
  mission_id uuid references public.loyalty_v2_missions(id) on delete restrict,
  reward_entitlement_id uuid references public.loyalty_v2_reward_entitlements(id) on delete restrict,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_v2_point_events_customer_created_idx
  on public.loyalty_v2_point_events(customer_id, created_at desc);

create table if not exists public.loyalty_v2_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  cart_token uuid not null,
  branch_id uuid not null references public.pos_branches(id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'open'
    check (status in ('open', 'claimed', 'settled', 'expired', 'cancelled')),
  customer_id uuid references public.loyalty_customers(id) on delete restrict,
  created_by uuid not null,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  claimed_at timestamptz,
  settled_at timestamptz,
  settled_order_id uuid references public.pos_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (created_by, cart_token)
);

-- Direct ledger and checkout-session mutation stays closed. Callers use the
-- SECURITY DEFINER functions below.
alter table public.loyalty_program_versions enable row level security;
alter table public.loyalty_v1_customer_archive enable row level security;
alter table public.loyalty_v1_reward_archive enable row level security;
alter table public.loyalty_v1_stamp_archive enable row level security;
alter table public.loyalty_v2_settings enable row level security;
alter table public.loyalty_v2_memberships enable row level security;
alter table public.loyalty_v2_missions enable row level security;
alter table public.loyalty_v2_mission_progress enable row level security;
alter table public.loyalty_v2_mission_order_events enable row level security;
alter table public.loyalty_v2_reward_rules enable row level security;
alter table public.loyalty_v2_reward_entitlements enable row level security;
alter table public.loyalty_v2_point_events enable row level security;
alter table public.loyalty_v2_checkout_sessions enable row level security;

create policy loyalty_v2_program_read on public.loyalty_program_versions
  for select to authenticated using (true);
create policy loyalty_v2_settings_read on public.loyalty_v2_settings
  for select to authenticated using (true);
create policy loyalty_v2_membership_read on public.loyalty_v2_memberships
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() or p.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.loyalty_customers c
      where c.id = loyalty_v2_memberships.customer_id and c.auth_user_id = auth.uid()
    )
  );
create policy loyalty_v2_missions_read on public.loyalty_v2_missions
  for select to authenticated using (true);
create policy loyalty_v2_missions_owner_insert on public.loyalty_v2_missions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'owner'
    )
  );
create policy loyalty_v2_missions_owner_update on public.loyalty_v2_missions
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'owner'
    )
  );

create or replace function public.enforce_loyalty_v2_active_mission_limit()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.status = 'active' and (
    select count(*)
    from public.loyalty_v2_missions m
    where m.status = 'active'
      and m.id <> new.id
      and tstzrange(m.starts_at, m.ends_at, '[)')
        && tstzrange(new.starts_at, new.ends_at, '[)')
  ) >= 2 then
    raise exception 'Only two Loyalty V2 missions may overlap';
  end if;
  return new;
end;
$function$;

drop trigger if exists loyalty_v2_active_mission_limit on public.loyalty_v2_missions;
create trigger loyalty_v2_active_mission_limit
before insert or update of status, starts_at, ends_at on public.loyalty_v2_missions
for each row execute function public.enforce_loyalty_v2_active_mission_limit();

create or replace function public.enforce_loyalty_mission_immutable_rules_v2()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if row(
    old.code, old.version, old.title, old.title_ar, old.description,
    old.description_ar, old.mission_type, old.target_count, old.reward_points,
    old.starts_at, old.ends_at, old.max_completions, old.branch_ids,
    old.product_ids, old.category_ids, old.quiet_start, old.quiet_end,
    old.created_by, old.created_at
  ) is distinct from row(
    new.code, new.version, new.title, new.title_ar, new.description,
    new.description_ar, new.mission_type, new.target_count, new.reward_points,
    new.starts_at, new.ends_at, new.max_completions, new.branch_ids,
    new.product_ids, new.category_ids, new.quiet_start, new.quiet_end,
    new.created_by, new.created_at
  ) then
    raise exception 'Mission rules are immutable; create a new mission version';
  end if;
  return new;
end;
$function$;

drop trigger if exists loyalty_v2_mission_rules_immutable on public.loyalty_v2_missions;
create trigger loyalty_v2_mission_rules_immutable
before update on public.loyalty_v2_missions
for each row execute function public.enforce_loyalty_mission_immutable_rules_v2();

create or replace function public.create_loyalty_mission_version_v2(
  p_mission_id uuid,
  p_title text,
  p_description text,
  p_mission_type text,
  p_target_count integer,
  p_reward_points integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_completions integer,
  p_branch_ids uuid[],
  p_product_ids uuid[],
  p_category_ids uuid[],
  p_quiet_start time,
  p_quiet_end time,
  p_status text default 'draft'
)
returns public.loyalty_v2_missions
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner_id uuid;
  v_previous public.loyalty_v2_missions;
  v_created public.loyalty_v2_missions;
begin
  select p.id
    into v_owner_id
    from public.profiles p
   where (p.id = auth.uid() or p.auth_user_id = auth.uid())
     and p.role = 'owner'
     and coalesce(p.is_active, true)
   limit 1;
  if v_owner_id is null then
    raise exception 'Only an active owner can version missions';
  end if;

  select *
    into v_previous
    from public.loyalty_v2_missions
   where id = p_mission_id
   for update;
  if not found then
    raise exception 'Mission not found';
  end if;
  if v_previous.status = 'active' then
    raise exception 'Suspend an active mission before changing its rules';
  end if;

  update public.loyalty_v2_missions
     set status = 'ended'
   where id = v_previous.id;

  insert into public.loyalty_v2_missions (
    code,
    version,
    title,
    description,
    mission_type,
    target_count,
    reward_points,
    starts_at,
    ends_at,
    max_completions,
    branch_ids,
    product_ids,
    category_ids,
    quiet_start,
    quiet_end,
    status,
    created_by
  ) values (
    v_previous.code,
    v_previous.version + 1,
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    p_mission_type,
    p_target_count,
    p_reward_points,
    p_starts_at,
    p_ends_at,
    p_max_completions,
    coalesce(p_branch_ids, '{}'),
    coalesce(p_product_ids, '{}'),
    coalesce(p_category_ids, '{}'),
    case when p_mission_type = 'quiet_hours' then p_quiet_start else null end,
    case when p_mission_type = 'quiet_hours' then p_quiet_end else null end,
    p_status,
    v_owner_id
  )
  returning * into v_created;

  return v_created;
end;
$function$;

create policy loyalty_v2_progress_read on public.loyalty_v2_mission_progress
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() or p.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.loyalty_customers c
      where c.id = loyalty_v2_mission_progress.customer_id and c.auth_user_id = auth.uid()
    )
  );
create policy loyalty_v2_reward_rules_read on public.loyalty_v2_reward_rules
  for select to authenticated using (true);
create policy loyalty_v2_entitlements_read on public.loyalty_v2_reward_entitlements
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() or p.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.loyalty_customers c
      where c.id = loyalty_v2_reward_entitlements.customer_id and c.auth_user_id = auth.uid()
    )
  );
create policy loyalty_v2_point_events_read on public.loyalty_v2_point_events
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() or p.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from public.loyalty_customers c
      where c.id = loyalty_v2_point_events.customer_id and c.auth_user_id = auth.uid()
    )
  );

create policy loyalty_v1_archive_owner_read on public.loyalty_v1_customer_archive
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'owner'
    )
  );

create policy loyalty_v1_reward_archive_owner_read on public.loyalty_v1_reward_archive
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'owner'
    )
  );

create policy loyalty_v1_stamp_archive_owner_read on public.loyalty_v1_stamp_archive
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and p.role = 'owner'
    )
  );

-- ---------------------------------------------------------------------------
-- V1 transfer
-- ---------------------------------------------------------------------------

insert into public.loyalty_v2_memberships (
  customer_id,
  loyalty_number,
  legacy_points,
  converted_stamp_points,
  opening_points,
  joined_at,
  migrated_at
)
select
  c.id,
  'N2-' || upper(substr(replace(c.id::text, '-', ''), 1, 12)),
  greatest(coalesce(c.points, 0), 0),
  ceil(
    least(greatest(coalesce(c.current_stamps, 0), 0), greatest(s.stamp_goal, 1))
      / greatest(s.stamp_goal, 1)::numeric
      * 200
  )::integer,
  greatest(coalesce(c.points, 0), 0)
    + ceil(
      least(greatest(coalesce(c.current_stamps, 0), 0), greatest(s.stamp_goal, 1))
        / greatest(s.stamp_goal, 1)::numeric
        * 200
    )::integer,
  c.created_at,
  now()
from public.loyalty_customers c
cross join lateral (
  select greatest(coalesce(ls.stamp_goal, 9), 1) as stamp_goal
  from public.loyalty_settings ls
  limit 1
) s
on conflict (customer_id) do nothing;

insert into public.loyalty_v2_point_events (
  customer_id,
  event_type,
  points_delta,
  idempotency_key,
  metadata
)
select
  m.customer_id,
  'opening_balance',
  m.opening_points,
  'migration:v1:' || m.customer_id::text,
  jsonb_build_object(
    'legacy_points', m.legacy_points,
    'converted_stamp_points', m.converted_stamp_points,
    'conversion', 'ceil(current_stamps / stamp_goal * 200)'
  )
from public.loyalty_v2_memberships m
where m.opening_points > 0
on conflict (idempotency_key) do nothing;

insert into public.loyalty_v2_reward_entitlements (
  customer_id,
  reward_rule_id,
  legacy_reward_id,
  title,
  description,
  status,
  expires_at,
  issued_at
)
select
  r.customer_id,
  rr.id,
  r.id,
  coalesce(nullif(r.description, ''), rr.title),
  r.description,
  'pending',
  r.expires_at,
  r.created_at
from public.loyalty_rewards r
join public.loyalty_v2_reward_rules rr on rr.code = 'v2-guaranteed-200'
where r.status = 'pending'
  and (r.expires_at is null or r.expires_at > now())
on conflict (legacy_reward_id) do nothing;

-- ---------------------------------------------------------------------------
-- Read models and customer/staff identity
-- ---------------------------------------------------------------------------

create or replace function public.loyalty_v2_balance(p_customer_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_balance integer;
begin
  if auth.uid() is not null
     and not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() or p.auth_user_id = auth.uid()
     )
     and not exists (
       select 1 from public.loyalty_customers c
       where c.id = p_customer_id and c.auth_user_id = auth.uid()
     ) then
    raise exception 'Not allowed to view this loyalty balance';
  end if;
  select coalesce(sum(e.points_delta), 0)::integer
    into v_balance
  from public.loyalty_v2_point_events e
  where e.customer_id = p_customer_id;
  return v_balance;
end;
$function$;

create or replace view public.loyalty_v2_member_balances
with (security_invoker = true) as
select
  m.customer_id,
  m.loyalty_number,
  m.status,
  c.full_name,
  m.legacy_points,
  m.converted_stamp_points,
  m.opening_points,
  public.loyalty_v2_balance(m.customer_id) as points_balance,
  m.joined_at,
  m.migrated_at
from public.loyalty_v2_memberships m
join public.loyalty_customers c on c.id = m.customer_id;

create or replace view public.loyalty_v2_migration_reconciliation
with (security_invoker = true) as
select
  a.customer_id,
  a.full_name as archived_name,
  c.full_name as current_name,
  m.legacy_points,
  m.converted_stamp_points,
  m.opening_points as expected_opening_points,
  coalesce(sum(e.points_delta) filter (where e.event_type = 'opening_balance'), 0)::integer
    as recorded_opening_points,
  (
    a.full_name = c.full_name
    and m.opening_points = coalesce(
      sum(e.points_delta) filter (where e.event_type = 'opening_balance'),
      0
    )
  ) as reconciled
from public.loyalty_v1_customer_archive a
join public.loyalty_customers c on c.id = a.customer_id
join public.loyalty_v2_memberships m on m.customer_id = a.customer_id
left join public.loyalty_v2_point_events e on e.customer_id = a.customer_id
group by
  a.customer_id,
  a.full_name,
  c.full_name,
  m.legacy_points,
  m.converted_stamp_points,
  m.opening_points;

-- Freeze V1 after its snapshot. New POS orders must not continue changing the
-- stamp counters that the archive and opening-balance conversion were based on.
drop trigger if exists trg_award_checkout_loyalty_stamps on public.pos_orders;

create or replace function public.freeze_loyalty_v1_order_stamps()
returns trigger
language plpgsql
as $function$
begin
  new.loyalty_stamps_awarded := 0;
  return new;
end;
$function$;

drop trigger if exists loyalty_v1_freeze_order_stamps on public.pos_orders;
create trigger loyalty_v1_freeze_order_stamps
before insert on public.pos_orders
for each row execute function public.freeze_loyalty_v1_order_stamps();

create or replace function public.award_loyalty_stamps(
  p_customer_id uuid,
  p_count integer
)
returns jsonb
language sql
stable
as $function$
  select jsonb_build_object(
    'success', false,
    'archived', true,
    'stamps_awarded', 0,
    'customer_id', p_customer_id,
    'requested_stamps', greatest(coalesce(p_count, 0), 0)
  )
$function$;

create or replace function public.award_loyalty_stamp(
  p_customer_id uuid,
  p_awarded_by uuid default null,
  p_reason text default null
)
returns json
language sql
stable
as $function$
  select json_build_object(
    'success', false,
    'archived', true,
    'customer_id', p_customer_id,
    'awarded_by', p_awarded_by,
    'reason', p_reason
  )
$function$;

revoke all on function public.award_loyalty_stamps(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.award_loyalty_stamp(uuid, uuid, text)
  from public, anon, authenticated;

-- Remove the legacy broad client policies. Customer identities remain readable
-- by staff and by their verified owner, but all V1 value tables become
-- service-role-only after the archive snapshot.
drop policy if exists "loyalty_customers_all" on public.loyalty_customers;
drop policy if exists "loyalty_owner_all" on public.loyalty_customers;
drop policy if exists "loyalty_staff_read" on public.loyalty_customers;
drop policy if exists "lc_anon_self_register" on public.loyalty_customers;
drop policy if exists "loyalty_v2_customer_staff_read" on public.loyalty_customers;
drop policy if exists "loyalty_v2_customer_self_read" on public.loyalty_customers;

create policy loyalty_v2_customer_staff_read on public.loyalty_customers
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where (p.id = auth.uid() or p.auth_user_id = auth.uid())
        and coalesce(p.is_active, true)
    )
  );
create policy loyalty_v2_customer_self_read on public.loyalty_customers
  for select to authenticated
  using (auth_user_id = auth.uid());

do $function$
declare
  v_table text;
begin
  foreach v_table in array array[
    'loyalty_settings',
    'loyalty_stamps',
    'loyalty_rewards',
    'loyalty_feedback',
    'loyalty_challenges',
    'loyalty_challenge_progress',
    'loyalty_qr_tokens'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', v_table || '_all', v_table);
    execute format('drop policy if exists %I on public.%I', 'loyalty_owner_all', v_table);
    execute format('drop policy if exists %I on public.%I', 'loyalty_staff_read', v_table);
  end loop;
end;
$function$;

create or replace function public.normalize_loyalty_phone_v2(p_phone text)
returns text
language sql
immutable
as $function$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) = 10
      and regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') like '09%'
      then '+218' || substr(regexp_replace(p_phone, '[^0-9]', '', 'g'), 2)
    when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) = 12
      and regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') like '218%'
      then '+' || regexp_replace(p_phone, '[^0-9]', '', 'g')
    else nullif(trim(p_phone), '')
  end
$function$;

create or replace function public.assert_loyalty_staff_v2()
returns void
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where (p.id = auth.uid() or p.auth_user_id = auth.uid())
      and coalesce(p.is_active, true)
  ) then
    raise exception 'Active staff sign-in required';
  end if;
end;
$function$;

create or replace function public.register_loyalty_member_v2(p_full_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_phone text := public.normalize_loyalty_phone_v2(auth.jwt() ->> 'phone');
  v_email text := nullif(lower(trim(auth.jwt() ->> 'email')), '');
  v_customer public.loyalty_customers;
  v_membership public.loyalty_v2_memberships;
begin
  if v_auth_user_id is null then
    raise exception 'Sign in with OTP before joining loyalty';
  end if;
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Name is required';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'A verified phone or email is required';
  end if;

  select *
    into v_customer
    from public.loyalty_customers c
   where c.auth_user_id = v_auth_user_id
      or (v_phone is not null and public.normalize_loyalty_phone_v2(c.phone) = v_phone)
      or (v_email is not null and lower(c.email) = v_email)
   order by (c.auth_user_id = v_auth_user_id) desc
   limit 1
   for update;

  if found then
    if v_customer.auth_user_id is not null and v_customer.auth_user_id <> v_auth_user_id then
      raise exception 'This loyalty identity is already linked';
    end if;
    update public.loyalty_customers
       set auth_user_id = v_auth_user_id,
           full_name = trim(p_full_name),
           phone = coalesce(phone, v_phone),
           email = coalesce(email, v_email),
           updated_at = now()
     where id = v_customer.id
     returning * into v_customer;
  else
    insert into public.loyalty_customers (
      phone,
      email,
      auth_user_id,
      full_name
    ) values (
      v_phone,
      v_email,
      v_auth_user_id,
      trim(p_full_name)
    )
    returning * into v_customer;
  end if;

  insert into public.loyalty_v2_memberships (
    customer_id,
    loyalty_number,
    joined_at
  ) values (
    v_customer.id,
    'N2-' || upper(substr(replace(v_customer.id::text, '-', ''), 1, 12)),
    now()
  )
  on conflict (customer_id) do update
  set status = 'active',
      updated_at = now()
  returning * into v_membership;

  return jsonb_build_object(
    'customer_id', v_customer.id,
    'loyalty_number', v_membership.loyalty_number,
    'full_name', v_customer.full_name,
    'points_balance', public.loyalty_v2_balance(v_customer.id)
  );
end;
$function$;

create or replace function public.lookup_or_create_loyalty_member_v2(
  p_phone text,
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_phone text := public.normalize_loyalty_phone_v2(p_phone);
  v_customer public.loyalty_customers;
  v_membership public.loyalty_v2_memberships;
  v_staff_id uuid;
begin
  perform public.assert_loyalty_staff_v2();
  select p.id into v_staff_id
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and coalesce(p.is_active, true)
  limit 1;
  if v_phone is null then
    raise exception 'Valid phone number required';
  end if;

  select *
    into v_customer
    from public.loyalty_customers c
   where public.normalize_loyalty_phone_v2(c.phone) = v_phone
   limit 1
   for update;

  if not found then
    insert into public.loyalty_customers (phone, full_name, registered_by)
    values (
      v_phone,
      coalesce(nullif(trim(p_full_name), ''), 'Nochi Member'),
      v_staff_id
    )
    returning * into v_customer;
  end if;

  insert into public.loyalty_v2_memberships (
    customer_id,
    loyalty_number
  ) values (
    v_customer.id,
    'N2-' || upper(substr(replace(v_customer.id::text, '-', ''), 1, 12))
  )
  on conflict (customer_id) do update
  set status = 'active',
      updated_at = now()
  returning * into v_membership;

  return jsonb_build_object(
    'id', v_customer.id,
    'customer_id', v_customer.id,
    'full_name', v_customer.full_name,
    'masked_phone', '***' || right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 4),
    'loyalty_number', v_membership.loyalty_number,
    'points_balance', public.loyalty_v2_balance(v_customer.id)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Transaction-bound QR flow
-- ---------------------------------------------------------------------------

create or replace function public.create_loyalty_checkout_v2(
  p_branch_id uuid,
  p_cart_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_raw_token text := encode(gen_random_bytes(24), 'hex');
  v_session public.loyalty_v2_checkout_sessions;
  v_expiry_seconds integer;
begin
  perform public.assert_loyalty_staff_v2();
  if p_branch_id is null or p_cart_token is null then
    raise exception 'Branch and cart token are required';
  end if;
  if not exists (select 1 from public.pos_branches where id = p_branch_id and is_active is true) then
    raise exception 'Active branch not found';
  end if;

  select checkout_expiry_seconds
    into v_expiry_seconds
    from public.loyalty_v2_settings
   where program_code = 'v2';

  insert into public.loyalty_v2_checkout_sessions (
    cart_token,
    branch_id,
    token_hash,
    created_by,
    expires_at
  ) values (
    p_cart_token,
    p_branch_id,
    encode(digest(v_raw_token, 'sha256'), 'hex'),
    auth.uid(),
    now() + make_interval(secs => coalesce(v_expiry_seconds, 300))
  )
  on conflict (created_by, cart_token) do update
  set token_hash = excluded.token_hash,
      status = 'open',
      customer_id = null,
      expires_at = excluded.expires_at,
      claimed_at = null,
      settled_at = null,
      settled_order_id = null,
      created_at = now()
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'token', v_raw_token,
    'claim_path', '/loyalty/checkout/' || v_raw_token,
    'expires_at', v_session.expires_at
  );
end;
$function$;

create or replace function public.claim_loyalty_checkout_v2(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_customer public.loyalty_customers;
  v_session public.loyalty_v2_checkout_sessions;
begin
  if auth.uid() is null then
    raise exception 'Sign in with OTP before claiming a checkout';
  end if;

  select *
    into v_customer
    from public.loyalty_customers
   where auth_user_id = auth.uid()
   limit 1;
  if not found then
    raise exception 'Join Loyalty V2 before claiming this checkout';
  end if;

  select *
    into v_session
    from public.loyalty_v2_checkout_sessions
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
   for update;

  if not found then
    raise exception 'Checkout code not found';
  end if;
  if v_session.expires_at <= now() then
    update public.loyalty_v2_checkout_sessions
       set status = 'expired'
     where id = v_session.id;
    raise exception 'Checkout code expired';
  end if;
  if v_session.status <> 'open' then
    raise exception 'Checkout code already used';
  end if;

  update public.loyalty_v2_checkout_sessions
     set status = 'claimed',
         customer_id = v_customer.id,
         claimed_at = now()
   where id = v_session.id
   returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'full_name', v_customer.full_name,
    'points_balance', public.loyalty_v2_balance(v_customer.id)
  );
end;
$function$;

create or replace function public.get_loyalty_checkout_v2(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_session public.loyalty_v2_checkout_sessions;
  v_customer public.loyalty_customers;
begin
  perform public.assert_loyalty_staff_v2();

  update public.loyalty_v2_checkout_sessions
     set status = 'expired'
   where id = p_session_id
     and status in ('open', 'claimed')
     and expires_at <= now();

  select *
    into v_session
    from public.loyalty_v2_checkout_sessions
   where id = p_session_id
     and created_by = auth.uid();
  if not found then
    raise exception 'Checkout session not found';
  end if;

  if v_session.customer_id is not null then
    select * into v_customer
    from public.loyalty_customers
    where id = v_session.customer_id;
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'expires_at', v_session.expires_at,
    'customer_id', v_session.customer_id,
    'full_name', v_customer.full_name,
    'points_balance', case
      when v_session.customer_id is null then null
      else public.loyalty_v2_balance(v_session.customer_id)
    end,
    'available_rewards', case
      when v_session.customer_id is null then 0
      else (
        select count(*)
        from public.loyalty_v2_reward_entitlements r
        where r.customer_id = v_session.customer_id
          and r.status = 'pending'
          and (r.expires_at is null or r.expires_at > now())
      )
    end
  );
end;
$function$;

create or replace function public.close_loyalty_checkout_v2(
  p_session_id uuid,
  p_order_id uuid default null,
  p_cancel boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_session public.loyalty_v2_checkout_sessions;
begin
  perform public.assert_loyalty_staff_v2();

  select *
    into v_session
    from public.loyalty_v2_checkout_sessions
   where id = p_session_id
     and created_by = auth.uid()
   for update;
  if not found then
    raise exception 'Checkout session not found';
  end if;

  if p_cancel then
    update public.loyalty_v2_checkout_sessions
       set status = 'cancelled'
     where id = v_session.id
       and status in ('open', 'claimed');
  else
    if p_order_id is null then
      raise exception 'Paid order is required';
    end if;
    if not exists (
      select 1
      from public.pos_orders o
      where o.id = p_order_id
        and o.branch_id = v_session.branch_id
        and o.loyalty_customer_id = v_session.customer_id
        and o.status = 'completed'
    ) then
      raise exception 'Paid order does not match this checkout claim';
    end if;
    update public.loyalty_v2_checkout_sessions
       set status = 'settled',
           settled_order_id = p_order_id,
           settled_at = now()
     where id = v_session.id
       and status = 'claimed';
  end if;

  return jsonb_build_object('session_id', v_session.id, 'closed', true);
end;
$function$;

create or replace function public.get_my_loyalty_checkout_v2(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_customer public.loyalty_customers;
  v_session public.loyalty_v2_checkout_sessions;
begin
  if auth.uid() is null then
    raise exception 'Customer sign-in required';
  end if;
  select * into v_customer
  from public.loyalty_customers
  where auth_user_id = auth.uid()
  limit 1;
  if not found then
    raise exception 'Loyalty member not found';
  end if;

  select * into v_session
  from public.loyalty_v2_checkout_sessions
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and customer_id = v_customer.id;
  if not found then
    raise exception 'Checkout claim not found';
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'full_name', v_customer.full_name,
    'points_earned', case
      when v_session.settled_order_id is null then 0
      else (
        select coalesce(sum(e.points_delta), 0)
        from public.loyalty_v2_point_events e
        where e.order_id = v_session.settled_order_id
          and e.event_type in ('order_earn', 'refund_reversal', 'void_reversal')
      )
    end,
    'points_balance', public.loyalty_v2_balance(v_customer.id),
    'available_rewards', (
      select count(*)
      from public.loyalty_v2_reward_entitlements r
      where r.customer_id = v_customer.id
        and r.status = 'pending'
        and (r.expires_at is null or r.expires_at > now())
    ),
    'missions', (
      select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      from public.get_active_loyalty_missions_v2(v_customer.id) m
    )
  );
end;
$function$;

create or replace function public.get_available_loyalty_rewards_v2(
  p_customer_id uuid,
  p_branch_id uuid
)
returns table (
  entitlement_id uuid,
  title text,
  description text,
  reward_type text,
  reward_value_lyd numeric,
  product_ids uuid[],
  category_ids uuid[],
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  perform public.assert_loyalty_staff_v2();
  return query
  select
    e.id,
    e.title,
    e.description,
    coalesce(r.reward_type, 'free_item'),
    r.reward_value_lyd,
    coalesce(r.product_ids, '{}'::uuid[]),
    coalesce(r.category_ids, '{}'::uuid[]),
    e.expires_at
  from public.loyalty_v2_reward_entitlements e
  left join public.loyalty_v2_reward_rules r on r.id = e.reward_rule_id
  where e.customer_id = p_customer_id
    and e.status = 'pending'
    and (e.expires_at is null or e.expires_at > now())
    and (
      cardinality(e.branch_ids) = 0
      or p_branch_id = any(e.branch_ids)
    )
  order by e.expires_at nulls last, e.issued_at;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Missions, settlement, reward issuance, and reversal
-- ---------------------------------------------------------------------------

create or replace function public.get_active_loyalty_missions_v2(p_customer_id uuid)
returns table (
  mission_id uuid,
  title text,
  title_ar text,
  description text,
  description_ar text,
  mission_type text,
  progress_count integer,
  target_count integer,
  reward_points integer,
  ends_at timestamptz,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is not null
     and not exists (
       select 1 from public.profiles staff
       where staff.id = auth.uid() or staff.auth_user_id = auth.uid()
     )
     and not exists (
       select 1 from public.loyalty_customers customer
       where customer.id = p_customer_id
         and customer.auth_user_id = auth.uid()
     ) then
    raise exception 'Not allowed to view these missions';
  end if;
  return query
  select
    m.id,
    m.title,
    m.title_ar,
    m.description,
    m.description_ar,
    m.mission_type,
    coalesce(p.progress_count, 0),
    m.target_count,
    m.reward_points,
    m.ends_at,
    coalesce(p.status, 'active')
  from public.loyalty_v2_missions m
  left join public.loyalty_v2_mission_progress p
    on p.mission_id = m.id
   and p.customer_id = p_customer_id
  where m.status = 'active'
    and now() between m.starts_at and m.ends_at
    and coalesce(p.completions, 0) < m.max_completions
  order by m.ends_at, m.created_at
  limit 2;
end;
$function$;

create or replace function public.issue_loyalty_rewards_v2(p_customer_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rule public.loyalty_v2_reward_rules;
  v_entitlement_id uuid;
  v_issued integer := 0;
begin
  for v_rule in
    select *
    from public.loyalty_v2_reward_rules
    where status = 'active'
    order by points_required
  loop
    while public.loyalty_v2_balance(p_customer_id) >= v_rule.points_required loop
      insert into public.loyalty_v2_reward_entitlements (
        customer_id,
        reward_rule_id,
        title,
        description,
        branch_ids,
        expires_at
      ) values (
        p_customer_id,
        v_rule.id,
        v_rule.title,
        v_rule.description,
        v_rule.branch_ids,
        now() + make_interval(days => v_rule.expiry_days)
      )
      returning id into v_entitlement_id;

      insert into public.loyalty_v2_point_events (
        customer_id,
        event_type,
        points_delta,
        reward_entitlement_id,
        idempotency_key,
        metadata
      ) values (
        p_customer_id,
        'reward_unlock',
        -v_rule.points_required,
        v_entitlement_id,
        'reward_unlock:' || v_entitlement_id::text,
        jsonb_build_object('reward_rule_id', v_rule.id)
      );

      v_issued := v_issued + 1;
    end loop;
  end loop;
  return v_issued;
end;
$function$;

create or replace function public.rebalance_loyalty_rewards_v2(p_customer_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_reward record;
  v_reversed integer := 0;
begin
  while public.loyalty_v2_balance(p_customer_id) < 0 loop
    select
      e.id,
      r.points_required
    into v_reward
    from public.loyalty_v2_reward_entitlements e
    join public.loyalty_v2_reward_rules r on r.id = e.reward_rule_id
    where e.customer_id = p_customer_id
      and e.status = 'pending'
      and e.legacy_reward_id is null
    order by e.issued_at desc
    limit 1
    for update of e;

    exit when not found;

    update public.loyalty_v2_reward_entitlements
       set status = 'reversed',
           reversed_at = now()
     where id = v_reward.id;

    insert into public.loyalty_v2_point_events (
      customer_id,
      event_type,
      points_delta,
      reward_entitlement_id,
      idempotency_key
    ) values (
      p_customer_id,
      'reward_reversal',
      v_reward.points_required,
      v_reward.id,
      'reward_reversal:' || v_reward.id::text
    )
    on conflict (idempotency_key) do nothing;

    v_reversed := v_reversed + 1;
  end loop;

  return v_reversed;
end;
$function$;

create or replace function public.loyalty_mission_order_qualifies_v2(
  p_mission_id uuid,
  p_order_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_mission public.loyalty_v2_missions;
  v_order public.pos_orders;
begin
  select * into v_mission
  from public.loyalty_v2_missions
  where id = p_mission_id;
  select * into v_order
  from public.pos_orders
  where id = p_order_id;

  if v_mission.id is null or v_order.id is null or v_order.status <> 'completed' then
    return false;
  end if;
  if not (v_order.created_at between v_mission.starts_at and v_mission.ends_at) then
    return false;
  end if;
  if cardinality(v_mission.branch_ids) > 0
     and not (v_order.branch_id = any(v_mission.branch_ids)) then
    return false;
  end if;

  if v_mission.mission_type = 'repeat_visit' then
    return greatest(coalesce(v_order.total, 0) - coalesce(v_order.refunded_amount_lyd, 0), 0) > 0;
  elsif v_mission.mission_type = 'quiet_hours' then
    return (
      v_mission.quiet_start is not null
      and v_mission.quiet_end is not null
      and (v_order.created_at at time zone 'Africa/Tripoli')::time
        between v_mission.quiet_start and v_mission.quiet_end
      and greatest(coalesce(v_order.total, 0) - coalesce(v_order.refunded_amount_lyd, 0), 0) > 0
    );
  elsif v_mission.mission_type = 'selected_product' then
    return exists (
      select 1
      from public.pos_order_items oi
      where oi.order_id = v_order.id
        and oi.product_id = any(v_mission.product_ids)
        and oi.quantity > coalesce(oi.refunded_qty, 0)
    );
  elsif v_mission.mission_type = 'selected_category' then
    return exists (
      select 1
      from public.pos_order_items oi
      join public.pos_products product on product.id = oi.product_id
      where oi.order_id = v_order.id
        and product.category_id = any(v_mission.category_ids)
        and oi.quantity > coalesce(oi.refunded_qty, 0)
    );
  end if;
  return false;
end;
$function$;

create or replace function public.settle_loyalty_order_v2(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order public.pos_orders;
  v_points_per_lyd numeric;
  v_net_total numeric;
  v_desired_points integer;
  v_recorded_points integer;
  v_delta integer;
  v_event_type text;
  v_mission public.loyalty_v2_missions;
  v_progress public.loyalty_v2_mission_progress;
  v_mission_event_id uuid;
  v_existing_mission_event public.loyalty_v2_mission_order_events;
  v_new_progress integer;
  v_completion_number integer;
  v_rewards_issued integer := 0;
begin
  select *
    into v_order
    from public.pos_orders
   where id = p_order_id
   for update;
  if not found or v_order.loyalty_customer_id is null then
    return jsonb_build_object('settled', false, 'reason', 'no_loyalty_member');
  end if;

  insert into public.loyalty_v2_memberships (customer_id, loyalty_number)
  values (
    v_order.loyalty_customer_id,
    'N2-' || upper(substr(replace(v_order.loyalty_customer_id::text, '-', ''), 1, 12))
  )
  on conflict (customer_id) do nothing;

  select points_per_lyd
    into v_points_per_lyd
    from public.loyalty_v2_settings
   where program_code = 'v2';

  v_net_total := case
    when v_order.status = 'completed'
      then greatest(
        coalesce(v_order.total, 0) - coalesce(v_order.refunded_amount_lyd, 0),
        0
      )
    else 0
  end;
  v_desired_points := floor(v_net_total * coalesce(v_points_per_lyd, 1))::integer;

  select coalesce(sum(points_delta), 0)::integer
    into v_recorded_points
    from public.loyalty_v2_point_events
   where order_id = v_order.id
     and event_type in ('order_earn', 'refund_reversal', 'void_reversal');

  v_delta := v_desired_points - v_recorded_points;
  if v_delta <> 0 then
    v_event_type := case
      when v_order.status <> 'completed' then 'void_reversal'
      when v_delta < 0 then 'refund_reversal'
      else 'order_earn'
    end;
    insert into public.loyalty_v2_point_events (
      customer_id,
      event_type,
      points_delta,
      order_id,
      idempotency_key,
      metadata
    ) values (
      v_order.loyalty_customer_id,
      v_event_type,
      v_delta,
      v_order.id,
      'order:' || v_order.id::text || ':net_points:' || v_desired_points::text,
      jsonb_build_object(
        'gross_total', v_order.total,
        'refunded_amount', v_order.refunded_amount_lyd,
        'net_total', v_net_total
      )
    )
    on conflict (idempotency_key) do nothing;
  end if;

  -- Reconcile previously-counted mission events first. A void or a refund of
  -- the qualifying item removes progress and reverses a bonus completed by
  -- that order.
  for v_existing_mission_event in
    select *
    from public.loyalty_v2_mission_order_events e
    where e.order_id = v_order.id
      and e.customer_id = v_order.loyalty_customer_id
      and e.reversed_at is null
  loop
    if not public.loyalty_mission_order_qualifies_v2(
      v_existing_mission_event.mission_id,
      v_order.id
    ) then
      update public.loyalty_v2_mission_order_events
         set reversed_at = now()
       where id = v_existing_mission_event.id;

      update public.loyalty_v2_mission_progress
         set progress_count = greatest(progress_count - 1, 0),
             completions = greatest(
               completions - case when v_existing_mission_event.completion_awarded then 1 else 0 end,
               0
             ),
             status = 'active',
             completed_at = null,
             updated_at = now()
       where mission_id = v_existing_mission_event.mission_id
         and customer_id = v_order.loyalty_customer_id;

      if v_existing_mission_event.completion_awarded then
        select * into v_mission
        from public.loyalty_v2_missions
        where id = v_existing_mission_event.mission_id;
        insert into public.loyalty_v2_point_events (
          customer_id,
          event_type,
          points_delta,
          order_id,
          mission_id,
          idempotency_key
        ) values (
          v_order.loyalty_customer_id,
          'mission_bonus_reversal',
          -v_mission.reward_points,
          v_order.id,
          v_mission.id,
          'mission_reversal:' || v_existing_mission_event.id::text
        )
        on conflict (idempotency_key) do nothing;
      end if;
    end if;
  end loop;

  if v_order.status = 'completed' and v_net_total > 0 then
    for v_mission in
      select *
      from public.loyalty_v2_missions m
      where m.status = 'active'
        and v_order.created_at between m.starts_at and m.ends_at
      order by m.created_at
    loop
      if public.loyalty_mission_order_qualifies_v2(v_mission.id, v_order.id) then
        v_mission_event_id := null;
        insert into public.loyalty_v2_mission_order_events (
          mission_id,
          customer_id,
          order_id
        ) values (
          v_mission.id,
          v_order.loyalty_customer_id,
          v_order.id
        )
        on conflict (mission_id, customer_id, order_id) do nothing
        returning id into v_mission_event_id;

        if v_mission_event_id is not null then
          insert into public.loyalty_v2_mission_progress (
            mission_id,
            customer_id,
            progress_count,
            last_qualified_at
          ) values (
            v_mission.id,
            v_order.loyalty_customer_id,
            1,
            v_order.created_at
          )
          on conflict (mission_id, customer_id) do update
          set progress_count = loyalty_v2_mission_progress.progress_count + 1,
              last_qualified_at = excluded.last_qualified_at,
              updated_at = now()
          returning * into v_progress;

          v_new_progress := v_progress.progress_count;
          if v_new_progress >= v_mission.target_count
             and v_progress.completions < v_mission.max_completions then
            v_completion_number := v_progress.completions + 1;
            update public.loyalty_v2_mission_progress
               set progress_count = case
                     when v_completion_number < v_mission.max_completions then 0
                     else v_new_progress
                   end,
                   completions = v_completion_number,
                   status = case
                     when v_completion_number >= v_mission.max_completions then 'completed'
                     else 'active'
                   end,
                   completed_at = now(),
                   updated_at = now()
             where id = v_progress.id;

            update public.loyalty_v2_mission_order_events
               set completion_awarded = true
             where id = v_mission_event_id;

            insert into public.loyalty_v2_point_events (
              customer_id,
              event_type,
              points_delta,
              order_id,
              mission_id,
              idempotency_key,
              metadata
            ) values (
              v_order.loyalty_customer_id,
              'mission_bonus',
              v_mission.reward_points,
              v_order.id,
              v_mission.id,
              'mission:' || v_mission.id::text
                || ':customer:' || v_order.loyalty_customer_id::text
                || ':completion:' || v_completion_number::text,
              jsonb_build_object('mission_code', v_mission.code)
            )
            on conflict (idempotency_key) do nothing;
          end if;
        end if;
      end if;
    end loop;
  end if;

  perform public.rebalance_loyalty_rewards_v2(v_order.loyalty_customer_id);
  v_rewards_issued := public.issue_loyalty_rewards_v2(v_order.loyalty_customer_id);

  return jsonb_build_object(
    'settled', true,
    'customer_id', v_order.loyalty_customer_id,
    'net_total', v_net_total,
    'order_points', v_desired_points,
    'points_balance', public.loyalty_v2_balance(v_order.loyalty_customer_id),
    'rewards_issued', v_rewards_issued
  );
end;
$function$;

create or replace function public.loyalty_v2_settle_order_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.settle_loyalty_order_v2(new.order_id);
  return new;
end;
$function$;

drop trigger if exists loyalty_v2_order_item_settlement on public.pos_order_items;
create trigger loyalty_v2_order_item_settlement
after insert or update of refunded_qty on public.pos_order_items
for each row execute function public.loyalty_v2_settle_order_item_trigger();

create or replace function public.loyalty_v2_settle_order_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.settle_loyalty_order_v2(new.id);
  return new;
end;
$function$;

drop trigger if exists loyalty_v2_order_settlement on public.pos_orders;
create trigger loyalty_v2_order_settlement
after update of status, refunded_amount_lyd on public.pos_orders
for each row
when (
  old.status is distinct from new.status
  or old.refunded_amount_lyd is distinct from new.refunded_amount_lyd
)
execute function public.loyalty_v2_settle_order_trigger();

create or replace function public.redeem_loyalty_reward_v2(
  p_entitlement_id uuid,
  p_order_id uuid,
  p_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_reward public.loyalty_v2_reward_entitlements;
  v_rule public.loyalty_v2_reward_rules;
  v_staff_id uuid;
  v_expected_discount numeric;
  v_order_discount numeric;
begin
  perform public.assert_loyalty_staff_v2();
  select p.id into v_staff_id
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and coalesce(p.is_active, true)
  limit 1;
  select *
    into v_reward
    from public.loyalty_v2_reward_entitlements
   where id = p_entitlement_id
   for update;
  if not found then
    raise exception 'Reward not found';
  end if;
  if v_reward.status = 'redeemed'
     and v_reward.redeemed_order_id = p_order_id then
    return jsonb_build_object(
      'redeemed', true,
      'entitlement_id', v_reward.id,
      'order_id', p_order_id,
      'idempotent_replay', true
    );
  end if;
  if v_reward.status <> 'pending' then
    raise exception 'Reward is not available';
  end if;
  if v_reward.expires_at is not null and v_reward.expires_at <= now() then
    update public.loyalty_v2_reward_entitlements
       set status = 'expired'
     where id = v_reward.id;
    raise exception 'Reward expired';
  end if;
  if cardinality(v_reward.branch_ids) > 0
     and not (p_branch_id = any(v_reward.branch_ids)) then
    raise exception 'Reward is not valid at this branch';
  end if;
  if not exists (
    select 1
    from public.pos_orders o
    where o.id = p_order_id
      and o.branch_id = p_branch_id
      and o.loyalty_customer_id = v_reward.customer_id
      and o.status = 'completed'
  ) then
    raise exception 'Reward order does not match the member';
  end if;

  if v_reward.reward_rule_id is not null then
    select * into v_rule
    from public.loyalty_v2_reward_rules
    where id = v_reward.reward_rule_id;

    if cardinality(v_rule.product_ids) > 0
       or cardinality(v_rule.category_ids) > 0 then
      if not exists (
        select 1
        from public.pos_order_items oi
        left join public.pos_products p on p.id = oi.product_id
        where oi.order_id = p_order_id
          and coalesce(oi.quantity, 0) > coalesce(oi.refunded_qty, 0)
          and (
            oi.product_id = any(v_rule.product_ids)
            or p.category_id = any(v_rule.category_ids)
          )
      ) then
        raise exception 'Order does not contain an eligible reward item';
      end if;
    end if;

    if v_rule.reward_type = 'fixed_discount' then
      v_expected_discount := greatest(coalesce(v_rule.reward_value_lyd, 0), 0);
    else
      select min(oi.unit_price)
        into v_expected_discount
        from public.pos_order_items oi
        left join public.pos_products p on p.id = oi.product_id
       where oi.order_id = p_order_id
         and coalesce(oi.quantity, 0) > coalesce(oi.refunded_qty, 0)
         and (
           (
             cardinality(v_rule.product_ids) = 0
             and cardinality(v_rule.category_ids) = 0
           )
           or oi.product_id = any(v_rule.product_ids)
           or p.category_id = any(v_rule.category_ids)
         );
    end if;

    select coalesce(o.discount_amount, 0)
      into v_order_discount
      from public.pos_orders o
     where o.id = p_order_id;
    if coalesce(v_expected_discount, 0) <= 0
       or v_order_discount + 0.001 < v_expected_discount then
      raise exception 'Order does not include the configured reward discount';
    end if;
  end if;

  update public.loyalty_v2_reward_entitlements
     set status = 'redeemed',
         redeemed_at = now(),
         redeemed_order_id = p_order_id,
         redeemed_by = v_staff_id
   where id = v_reward.id;

  return jsonb_build_object(
    'redeemed', true,
    'entitlement_id', v_reward.id,
    'order_id', p_order_id
  );
end;
$function$;

-- The discounted order and entitlement redemption must commit or roll back
-- together. This wrapper keeps the established create_pos_order contract for
-- non-reward sales while giving reward sales one atomic database boundary.
create or replace function public.create_pos_order_with_loyalty_reward_v2(
  p_idempotency_key uuid,
  p_branch_id uuid,
  p_shift_id uuid,
  p_served_by uuid,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_discount_pct numeric,
  p_total numeric,
  p_payment_method text,
  p_cash_tendered numeric,
  p_change_due numeric,
  p_card_amount numeric,
  p_loyalty_customer_id uuid,
  p_client_created_at timestamptz,
  p_offline_order_number text,
  p_items jsonb,
  p_loyalty_reward_entitlement_id uuid,
  p_customer_name text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_result jsonb;
  v_order_id uuid;
  v_redemption jsonb;
begin
  if p_loyalty_reward_entitlement_id is null then
    raise exception 'Reward entitlement is required';
  end if;
  if p_loyalty_customer_id is null then
    raise exception 'Loyalty member is required for reward redemption';
  end if;

  v_result := public.create_pos_order(
    p_idempotency_key,
    p_branch_id,
    p_shift_id,
    p_served_by,
    p_subtotal,
    p_discount_amount,
    p_discount_pct,
    p_total,
    p_payment_method,
    p_cash_tendered,
    p_change_due,
    p_card_amount,
    p_loyalty_customer_id,
    p_client_created_at,
    p_offline_order_number,
    p_items,
    p_customer_name,
    p_customer_phone
  );

  v_order_id := nullif(v_result->'order'->>'id', '')::uuid;
  if v_order_id is null then
    raise exception 'Order creation did not return an order id';
  end if;

  v_redemption := public.redeem_loyalty_reward_v2(
    p_loyalty_reward_entitlement_id,
    v_order_id,
    p_branch_id
  );

  return v_result || jsonb_build_object('loyalty_reward', v_redemption);
end;
$function$;

create or replace function public.get_loyalty_v2_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  perform public.assert_loyalty_staff_v2();
  return (
    select jsonb_build_object(
    'members', (select count(*) from public.loyalty_v2_memberships where status = 'active'),
    'points_outstanding', (
      select coalesce(sum(public.loyalty_v2_balance(m.customer_id)), 0)
      from public.loyalty_v2_memberships m
      where m.status = 'active'
    ),
    'pending_rewards', (
      select count(*)
      from public.loyalty_v2_reward_entitlements
      where status = 'pending'
        and (expires_at is null or expires_at > now())
    ),
    'active_missions', (
      select count(*)
      from public.loyalty_v2_missions
      where status = 'active'
        and now() between starts_at and ends_at
    ),
    'mission_participants_30d', (
      select count(distinct customer_id)
      from public.loyalty_v2_mission_order_events
      where qualified_at >= now() - interval '30 days'
        and reversed_at is null
    ),
    'mission_completions_30d', (
      select count(*)
      from public.loyalty_v2_mission_order_events
      where qualified_at >= now() - interval '30 days'
        and completion_awarded
        and reversed_at is null
    ),
    'rewards_redeemed_30d', (
      select count(*)
      from public.loyalty_v2_reward_entitlements
      where status = 'redeemed'
        and redeemed_at >= now() - interval '30 days'
    ),
    'member_revenue_30d', (
      select coalesce(sum(greatest(
        coalesce(total, 0) - coalesce(refunded_amount_lyd, 0),
        0
      )), 0)
      from public.pos_orders
      where status = 'completed'
        and loyalty_customer_id is not null
        and created_at >= now() - interval '30 days'
    ),
    'qr_claims_30d', (
      select count(*)
      from public.loyalty_v2_checkout_sessions
      where claimed_at >= now() - interval '30 days'
    ),
    'qr_expired_or_cancelled_30d', (
      select count(*)
      from public.loyalty_v2_checkout_sessions
      where created_at >= now() - interval '30 days'
        and (
          status in ('expired', 'cancelled')
          or (status = 'open' and expires_at <= now())
        )
    ),
    'reversed_points_30d', (
      select coalesce(abs(sum(points_delta)), 0)
      from public.loyalty_v2_point_events
      where event_type in (
        'mission_bonus_reversal',
        'reward_reversal',
        'refund_reversal',
        'void_reversal'
      )
        and created_at >= now() - interval '30 days'
    ),
    'eligible_orders_30d', (
      select count(*)
      from public.pos_orders
      where status = 'completed'
        and created_at >= now() - interval '30 days'
    ),
    'linked_orders_30d', (
      select count(*)
      from public.pos_orders
      where status = 'completed'
        and loyalty_customer_id is not null
        and created_at >= now() - interval '30 days'
    ),
    'attach_rate_30d', (
      select round(
        100.0 * count(*) filter (where loyalty_customer_id is not null)
        / nullif(count(*), 0),
        1
      )
      from public.pos_orders
      where status = 'completed'
        and created_at >= now() - interval '30 days'
    ),
    'attach_rate_90d', (
      select round(
        100.0 * count(*) filter (where loyalty_customer_id is not null)
        / nullif(count(*), 0),
        1
      )
      from public.pos_orders
      where status = 'completed'
        and created_at >= now() - interval '90 days'
    ),
    'migration_total', (select count(*) from public.loyalty_v1_customer_archive),
    'migration_reconciled', (
      select count(*)
      from public.loyalty_v2_migration_reconciliation
      where reconciled
    )
    )
  );
end;
$function$;

-- Function grants. Table writes remain closed to normal clients.
revoke all on function public.assert_loyalty_staff_v2() from public, anon, authenticated;
revoke all on function public.freeze_loyalty_v1_order_stamps() from public, anon, authenticated;
revoke all on function public.enforce_loyalty_v2_active_mission_limit() from public, anon, authenticated;
revoke all on function public.enforce_loyalty_mission_immutable_rules_v2() from public, anon, authenticated;
revoke all on function public.create_loyalty_mission_version_v2(
  uuid, text, text, text, integer, integer, timestamptz, timestamptz, integer,
  uuid[], uuid[], uuid[], time, time, text
) from public, anon;
revoke all on function public.loyalty_v2_balance(uuid) from public, anon;
revoke all on function public.register_loyalty_member_v2(text) from public, anon;
revoke all on function public.lookup_or_create_loyalty_member_v2(text, text) from public, anon;
revoke all on function public.create_loyalty_checkout_v2(uuid, uuid) from public, anon;
revoke all on function public.claim_loyalty_checkout_v2(text) from public, anon;
revoke all on function public.get_loyalty_checkout_v2(uuid) from public, anon;
revoke all on function public.close_loyalty_checkout_v2(uuid, uuid, boolean) from public, anon;
revoke all on function public.get_my_loyalty_checkout_v2(text) from public, anon;
revoke all on function public.get_available_loyalty_rewards_v2(uuid, uuid) from public, anon;
revoke all on function public.redeem_loyalty_reward_v2(uuid, uuid, uuid) from public, anon;
revoke all on function public.create_pos_order_with_loyalty_reward_v2(
  uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, numeric,
  numeric, numeric, uuid, timestamptz, text, jsonb, uuid, text, text
) from public, anon;
revoke all on function public.issue_loyalty_rewards_v2(uuid) from public, anon, authenticated;
revoke all on function public.rebalance_loyalty_rewards_v2(uuid) from public, anon, authenticated;
revoke all on function public.loyalty_mission_order_qualifies_v2(uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_loyalty_order_v2(uuid) from public, anon, authenticated;
revoke all on function public.loyalty_v2_settle_order_item_trigger() from public, anon, authenticated;
revoke all on function public.loyalty_v2_settle_order_trigger() from public, anon, authenticated;

grant execute on function public.register_loyalty_member_v2(text) to authenticated;
grant execute on function public.lookup_or_create_loyalty_member_v2(text, text) to authenticated;
grant execute on function public.create_loyalty_checkout_v2(uuid, uuid) to authenticated;
grant execute on function public.claim_loyalty_checkout_v2(text) to authenticated;
grant execute on function public.get_loyalty_checkout_v2(uuid) to authenticated;
grant execute on function public.close_loyalty_checkout_v2(uuid, uuid, boolean) to authenticated;
grant execute on function public.get_my_loyalty_checkout_v2(text) to authenticated;
grant execute on function public.get_available_loyalty_rewards_v2(uuid, uuid) to authenticated;
grant execute on function public.redeem_loyalty_reward_v2(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_pos_order_with_loyalty_reward_v2(
  uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, numeric,
  numeric, numeric, uuid, timestamptz, text, jsonb, uuid, text, text
) to authenticated;
grant execute on function public.get_active_loyalty_missions_v2(uuid) to authenticated;
grant execute on function public.create_loyalty_mission_version_v2(
  uuid, text, text, text, integer, integer, timestamptz, timestamptz, integer,
  uuid[], uuid[], uuid[], time, time, text
) to authenticated;
grant execute on function public.get_loyalty_v2_dashboard() to authenticated;
grant execute on function public.loyalty_v2_balance(uuid) to authenticated, service_role;
grant select on public.loyalty_v2_member_balances to authenticated;
grant select on public.loyalty_v2_migration_reconciliation to authenticated;
