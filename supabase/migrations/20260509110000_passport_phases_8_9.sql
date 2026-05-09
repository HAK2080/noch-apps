-- ============================================================
-- NOCHI PASS — Phase 8 (memory summaries + insights) +
--              Phase 9 (challenges / gamification, schema only)
--
-- Phase 8:
--   - customer_memory_summaries table: per-customer cached summary
--     used to brief staff at attach time. Bilingual.
--   - regenerate_customer_memory(uuid) — deterministic generator
--     (rules-based, no LLM). Safe to call cheaply on every attach
--     and order completion. The output can later be replaced with
--     an LLM rewrite without changing the call sites.
--   - get_customer_memory(uuid) — owner+staff reader.
--   - owner_insights_*() RPCs for the Insights tab:
--       top returning customers, near-reward, top drinks.
--
-- Phase 9 (schema only — UI for challenges is read-only v1):
--   - nochi_challenges + nochi_challenge_progress tables
--   - list_active_challenges() and get_challenge_progress(uuid)
--   - No auto-progress trigger yet. Existing loyalty routes
--     (leaderboard / spin / gestures / feedback) are untouched
--     pending the rationalization called out in the roadmap.
--
-- Re-runnable.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PHASE 8 — memory summaries
-- ─────────────────────────────────────────────────────────────

create table if not exists customer_memory_summaries (
  customer_id   uuid primary key references loyalty_customers(id) on delete cascade,
  summary_en    text,
  summary_ar    text,
  greeting_en   text,
  greeting_ar   text,
  generated_at  timestamptz not null default now(),
  version       int not null default 1
);

create index if not exists customer_memory_summaries_generated_idx
  on customer_memory_summaries(generated_at desc);

alter table customer_memory_summaries enable row level security;
drop policy if exists "cms_authenticated_read" on customer_memory_summaries;
create policy "cms_authenticated_read" on customer_memory_summaries
  for select to authenticated using (true);
-- writes only via the RPC (security definer)

-- Build a deterministic summary from the customer row + their pending
-- rewards. v1 — pure templating; swap to an LLM rewrite later by
-- replacing only the bodies of summarise_*(). No PII exposed.
create or replace function regenerate_customer_memory(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $cms_regen$
declare
  v_c loyalty_customers%rowtype;
  v_drink text;
  v_milk_en text; v_milk_ar text;
  v_sweet_en text; v_sweet_ar text;
  v_days int;
  v_pending int;
  v_summary_en text; v_summary_ar text;
  v_greeting_en text; v_greeting_ar text;
begin
  select * into v_c from loyalty_customers where id = p_customer_id;
  if not found then return; end if;

  v_drink := coalesce(v_c.favorite_drink, v_c.favorite_drinks[1]);
  v_milk_en := case v_c.milk_preference
    when 'whole' then 'whole milk' when 'skim' then 'skim'
    when 'oat' then 'oat milk'    when 'almond' then 'almond milk'
    when 'soy' then 'soy milk'    when 'lactose_free' then 'lactose-free milk'
    else null end;
  v_milk_ar := case v_c.milk_preference
    when 'whole' then 'حليب كامل الدسم' when 'skim' then 'حليب خالي الدسم'
    when 'oat' then 'حليب شوفان'        when 'almond' then 'حليب لوز'
    when 'soy' then 'حليب صويا'         when 'lactose_free' then 'حليب خالي اللاكتوز'
    else null end;
  v_sweet_en := case v_c.sweetness_preference
    when 'no_sugar' then 'no sugar' when 'less' then 'less sweet'
    when 'normal' then null         when 'extra' then 'extra sweet'
    else null end;
  v_sweet_ar := case v_c.sweetness_preference
    when 'no_sugar' then 'بدون سكر' when 'less' then 'سكر قليل'
    when 'normal' then null         when 'extra' then 'سكر زيادة'
    else null end;

  v_days := case
    when v_c.last_visit_at is null then null
    else extract(day from now() - v_c.last_visit_at)::int
  end;

  select count(*) into v_pending
  from loyalty_rewards
  where customer_id = p_customer_id and status = 'pending';

  -- English
  v_summary_en := coalesce(v_c.full_name, 'Customer')
    || case
         when v_drink is not null then
           ' usually orders ' || v_drink
           || case when v_milk_en is not null or v_sweet_en is not null then ' (' end
           || coalesce(v_milk_en, '')
           || case when v_milk_en is not null and v_sweet_en is not null then ', ' else '' end
           || coalesce(v_sweet_en, '')
           || case when v_milk_en is not null or v_sweet_en is not null then ')' end
           || '.'
         else '.'
       end
    || case
         when v_days is not null then ' Last visit ' || v_days || (case when v_days = 1 then ' day ago.' else ' days ago.' end)
         else ''
       end
    || case when v_pending > 0 then ' Reward ready.' else '' end;

  -- Arabic (Libyan-leaning, kept simple)
  v_summary_ar := coalesce(v_c.full_name, 'الزبون')
    || case
         when v_drink is not null then
           ' عادة يطلب ' || v_drink
           || case when v_milk_ar is not null or v_sweet_ar is not null then ' (' end
           || coalesce(v_milk_ar, '')
           || case when v_milk_ar is not null and v_sweet_ar is not null then '، ' else '' end
           || coalesce(v_sweet_ar, '')
           || case when v_milk_ar is not null or v_sweet_ar is not null then ')' end
           || '.'
         else '.'
       end
    || case
         when v_days is not null then ' آخر زيارة من ' || v_days || ' يوم.'
         else ''
       end
    || case when v_pending > 0 then ' عنده مشروب مجاني جاهز.' else '' end;

  -- Suggested greeting (NEVER auto-sent; staff types it)
  v_greeting_en := 'Welcome back ' || coalesce(split_part(v_c.full_name, ' ', 1), 'friend')
    || case when v_drink is not null then ' — ' || v_drink
              || case when v_sweet_en is not null then ' ' || v_sweet_en else '' end
              || ' today?'
            else ' — good to see you!'
       end;

  v_greeting_ar := 'هلا ' || coalesce(split_part(v_c.full_name, ' ', 1), '')
    || case when v_drink is not null then '! ' || v_drink
              || case when v_sweet_ar is not null then ' (' || v_sweet_ar || ')' else '' end
              || ' اليوم؟'
            else '! نوتشي مبسوط بشوفك.'
       end;

  insert into customer_memory_summaries (customer_id, summary_en, summary_ar, greeting_en, greeting_ar, generated_at, version)
  values (p_customer_id, v_summary_en, v_summary_ar, v_greeting_en, v_greeting_ar, now(), 1)
  on conflict (customer_id) do update set
    summary_en   = excluded.summary_en,
    summary_ar   = excluded.summary_ar,
    greeting_en  = excluded.greeting_en,
    greeting_ar  = excluded.greeting_ar,
    generated_at = excluded.generated_at,
    version      = customer_memory_summaries.version + 1;
end;
$cms_regen$;

grant execute on function regenerate_customer_memory(uuid) to authenticated, service_role;

create or replace function get_customer_memory(p_customer_id uuid)
returns customer_memory_summaries
language sql
security definer
set search_path = public
as $cms_get$
  select * from customer_memory_summaries where customer_id = p_customer_id;
$cms_get$;

grant execute on function get_customer_memory(uuid) to authenticated;

-- Hook: extend record_pos_customer_visit to refresh the memory summary
-- after every attach. Cheap, deterministic, and keeps the drawer fresh.
create or replace function record_pos_customer_visit(
  p_customer_id uuid,
  p_favorite_drink text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $rpcv$
declare
  v_customer loyalty_customers%rowtype;
  v_should_increment boolean;
begin
  select * into v_customer from loyalty_customers where id = p_customer_id limit 1;
  if not found then return; end if;
  v_should_increment := v_customer.last_visit_at is null
                     or v_customer.last_visit_at < now() - interval '2 hours';
  update loyalty_customers
  set last_visit_at = now(),
      total_visits = case when v_should_increment then total_visits + 1 else total_visits end,
      favorite_drink = case
        when favorite_drink is null and p_favorite_drink is not null
        then p_favorite_drink else favorite_drink end,
      updated_at = now()
  where id = p_customer_id;

  -- Phase 8 — refresh the cached summary so the drawer/insights are fresh.
  perform regenerate_customer_memory(p_customer_id);
end;
$rpcv$;

grant execute on function record_pos_customer_visit(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- PHASE 8 — owner insights
-- ─────────────────────────────────────────────────────────────

-- Top returning customers by visits in the last N days
create or replace function owner_insights_top_returning(p_days int default 30, p_limit int default 10)
returns table (
  customer_id uuid, full_name text, tier text,
  visits int, current_stamps int, last_visit_at timestamptz, top_drink text
)
language sql
security definer
set search_path = public
as $oitr$
  with v as (
    select o.loyalty_customer_id as cid, count(*)::int as cnt
    from pos_orders o
    where o.loyalty_customer_id is not null
      and o.status = 'completed'
      and o.created_at >= now() - (p_days || ' days')::interval
    group by 1
  )
  select c.id, c.full_name, c.tier, v.cnt, c.current_stamps, c.last_visit_at,
         coalesce(c.favorite_drink, c.favorite_drinks[1])
  from v
  join loyalty_customers c on c.id = v.cid
  order by v.cnt desc, c.last_visit_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 10), 100))
$oitr$;

grant execute on function owner_insights_top_returning(int, int) to authenticated;

-- Customers within N stamps of the next reward
create or replace function owner_insights_near_reward(p_threshold int default 2, p_limit int default 20)
returns table (
  customer_id uuid, full_name text, tier text,
  current_stamps int, stamps_to_reward int, last_visit_at timestamptz
)
language sql
security definer
set search_path = public
as $oinr$
  select c.id, c.full_name, c.tier, c.current_stamps,
         (9 - c.current_stamps)::int as stamps_to_reward,
         c.last_visit_at
  from loyalty_customers c
  where c.current_stamps between 1 and 8
    and (9 - c.current_stamps) <= greatest(1, p_threshold)
  order by c.current_stamps desc, c.last_visit_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100))
$oinr$;

grant execute on function owner_insights_near_reward(int, int) to authenticated;

-- Most common favourite-drink picks (across favorite_drink + favorite_drinks[])
create or replace function owner_insights_top_drinks(p_limit int default 10)
returns table (drink text, customers int)
language sql
security definer
set search_path = public
as $oitd$
  with picks as (
    select trim(d) as d
    from loyalty_customers c, unnest(coalesce(c.favorite_drinks, '{}'::text[])) as d
    where coalesce(d, '') <> ''
    union all
    select trim(c.favorite_drink) as d
    from loyalty_customers c
    where coalesce(c.favorite_drink, '') <> ''
  )
  select d, count(*)::int as customers
  from picks
  group by d
  order by customers desc
  limit greatest(1, least(coalesce(p_limit, 10), 50))
$oitd$;

grant execute on function owner_insights_top_drinks(int) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- PHASE 9 — challenges (schema + read-only RPCs; auto-progress
-- intentionally deferred per roadmap)
-- ─────────────────────────────────────────────────────────────

create table if not exists nochi_challenges (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name_en         text not null,
  name_ar         text not null,
  description_en  text,
  description_ar  text,
  rule_type       text not null check (rule_type in (
                    'stamps_in_period', 'product_discovery', 'referrals_in_period', 'manual'
                  )),
  target_count    int not null default 1,
  reward_description text,
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  active          boolean not null default true,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists nochi_challenges_active_idx
  on nochi_challenges(active, ends_at);

alter table nochi_challenges enable row level security;
drop policy if exists "challenges_read_all" on nochi_challenges;
create policy "challenges_read_all" on nochi_challenges
  for select to anon, authenticated using (true);
drop policy if exists "challenges_owner_write" on nochi_challenges;
create policy "challenges_owner_write" on nochi_challenges
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'));

create table if not exists nochi_challenge_progress (
  challenge_id  uuid not null references nochi_challenges(id) on delete cascade,
  customer_id   uuid not null references loyalty_customers(id) on delete cascade,
  progress      int not null default 0,
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (challenge_id, customer_id)
);

alter table nochi_challenge_progress enable row level security;
drop policy if exists "ncp_owner_read" on nochi_challenge_progress;
create policy "ncp_owner_read" on nochi_challenge_progress
  for select to authenticated using (true);
-- writes only via security-definer RPC

-- Public — what's running right now
create or replace function list_active_challenges()
returns table (
  id uuid, slug text, name_en text, name_ar text,
  description_en text, description_ar text,
  rule_type text, target_count int,
  reward_description text, starts_at timestamptz, ends_at timestamptz
)
language sql
security definer
set search_path = public
as $lac$
  select id, slug, name_en, name_ar, description_en, description_ar,
         rule_type, target_count, reward_description, starts_at, ends_at
  from nochi_challenges
  where active is true
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >= now())
  order by starts_at asc
$lac$;

grant execute on function list_active_challenges() to anon, authenticated;

-- Anon-safe — a customer's progress, gated by passport_token only
-- (no phone needed; this is a read-only view of their own progress)
create or replace function get_challenge_progress(p_token uuid)
returns table (
  challenge_id uuid, slug text, name_en text, name_ar text,
  rule_type text, target_count int, progress int, completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $gcp$
declare v_id uuid;
begin
  select id into v_id from loyalty_customers where passport_token = p_token limit 1;
  if v_id is null then return; end if;

  return query
    select ch.id, ch.slug, ch.name_en, ch.name_ar,
           ch.rule_type, ch.target_count,
           coalesce(p.progress, 0), p.completed_at
    from nochi_challenges ch
    left join nochi_challenge_progress p
      on p.challenge_id = ch.id and p.customer_id = v_id
    where ch.active is true
      and (ch.starts_at is null or ch.starts_at <= now())
      and (ch.ends_at   is null or ch.ends_at   >= now())
    order by ch.starts_at asc;
end;
$gcp$;

grant execute on function get_challenge_progress(uuid) to anon, authenticated;

-- Owner — bump a customer's progress on a challenge by hand. Used as
-- the redemption UI in v1; auto-progress trigger comes later.
create or replace function bump_challenge_progress(p_challenge_id uuid, p_customer_id uuid, p_delta int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $bcp$
declare
  v_role text; v_target int; v_new int; v_completed timestamptz;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role <> 'owner' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select target_count into v_target from nochi_challenges where id = p_challenge_id;
  if v_target is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  insert into nochi_challenge_progress (challenge_id, customer_id, progress, completed_at)
  values (p_challenge_id, p_customer_id, greatest(0, coalesce(p_delta, 1)),
          case when coalesce(p_delta, 1) >= v_target then now() else null end)
  on conflict (challenge_id, customer_id) do update
    set progress = greatest(0, nochi_challenge_progress.progress + coalesce(p_delta, 1)),
        completed_at = case
          when nochi_challenge_progress.progress + coalesce(p_delta, 1) >= v_target
           and nochi_challenge_progress.completed_at is null
          then now()
          else nochi_challenge_progress.completed_at
        end,
        updated_at = now()
  returning progress, completed_at into v_new, v_completed;

  return jsonb_build_object('ok', true, 'progress', v_new, 'completed_at', v_completed, 'target', v_target);
end;
$bcp$;

grant execute on function bump_challenge_progress(uuid, uuid, int) to authenticated;

notify pgrst, 'reload schema';
