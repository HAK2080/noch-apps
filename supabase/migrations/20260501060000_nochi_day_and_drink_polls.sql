-- Two strategic features in one migration:
-- 1. Annual Nochi Day — owner-triggered: every Nochi alive again, free-drink
--    reward for active customers, special badge.
-- 2. Drink polls — Legend-tier customers vote on the next seasonal drink.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. ANNUAL NOCHI DAY
-- ──────────────────────────────────────────────────────────────────────────

-- Track that an event happened so we can rate-limit (one per year)
create table if not exists public.loyalty_nochi_day_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  ran_by uuid references public.profiles(id),
  affected_customers int,
  rewards_issued int,
  notes text
);
alter table public.loyalty_nochi_day_runs enable row level security;
drop policy if exists "ndr_owner_all" on public.loyalty_nochi_day_runs;
create policy "ndr_owner_all" on public.loyalty_nochi_day_runs
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create or replace function public.loyalty_nochi_day_run()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_role text;
  v_already_this_year int;
  v_affected int;
  v_rewards int;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select role into v_role from public.profiles where id = v_caller;
  if v_role <> 'owner' then
    raise exception 'OWNER_ONLY';
  end if;

  -- Rate-limit: one per calendar year
  select count(*) into v_already_this_year
    from public.loyalty_nochi_day_runs
    where date_trunc('year', ran_at) = date_trunc('year', now());
  if v_already_this_year > 0 then
    raise exception 'NOCHI_DAY_ALREADY_RAN_THIS_YEAR';
  end if;

  -- Revive every Nochi
  update public.loyalty_customers
    set nochi_state = 'happy'
    where nochi_state in ('sad','tired','deathbed','dead');
  get diagnostics v_affected = row_count;

  -- Free-drink reward for every customer who's been around (at least 1 stamp)
  with eligible as (
    select id from public.loyalty_customers
    where coalesce(total_stamps, 0) >= 1
  )
  insert into public.loyalty_rewards (customer_id, description, status, expires_at, metadata)
  select id,
         'Nochi Day — free drink, on us 🐇',
         'pending',
         now() + interval '14 days',
         jsonb_build_object('kind', 'nochi_day', 'year', extract(year from now()))
  from eligible;
  get diagnostics v_rewards = row_count;

  -- Nochi Day badge for everyone with a stamp
  insert into public.loyalty_customer_badges (customer_id, badge_key, earned_at)
  select id, 'nochi_day_' || extract(year from now())::text, now()
  from public.loyalty_customers
  where coalesce(total_stamps, 0) >= 1
  on conflict (customer_id, badge_key) do nothing;

  -- Log the run
  insert into public.loyalty_nochi_day_runs (ran_by, affected_customers, rewards_issued)
  values (v_caller, v_affected, v_rewards);

  return jsonb_build_object(
    'ok', true,
    'revived', v_affected,
    'rewards_issued', v_rewards,
    'year', extract(year from now())
  );
end;
$$;
grant execute on function public.loyalty_nochi_day_run() to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. DRINK POLLS — Legend-tier customers vote on the next seasonal drink
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists public.loyalty_drink_polls (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  options jsonb not null,             -- [{id:'A', label:'Pomegranate Match', label_ar:'…'}, ...]
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  winner_option_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.loyalty_drink_polls enable row level security;
drop policy if exists "ldp_legend_read" on public.loyalty_drink_polls;
drop policy if exists "ldp_owner_all"   on public.loyalty_drink_polls;
create policy "ldp_legend_read" on public.loyalty_drink_polls
  for select to authenticated using (is_active = true);
create policy "ldp_owner_all" on public.loyalty_drink_polls
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create table if not exists public.loyalty_drink_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.loyalty_drink_polls(id) on delete cascade,
  customer_id uuid not null references public.loyalty_customers(id) on delete cascade,
  option_id text not null,
  voted_at timestamptz not null default now(),
  unique (poll_id, customer_id)
);
alter table public.loyalty_drink_votes enable row level security;
drop policy if exists "ldv_owner_read"  on public.loyalty_drink_votes;
drop policy if exists "ldv_legend_vote" on public.loyalty_drink_votes;
create policy "ldv_owner_read" on public.loyalty_drink_votes
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));
-- Legends cast their own vote (one row per poll); enforced by RPC below.
grant execute on schema public to authenticated;

-- RPC: cast a vote (gates on Legend tier; one vote per poll)
create or replace function public.cast_drink_vote(
  p_poll_id uuid,
  p_option_id text,
  p_customer_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_poll record;
begin
  select tier into v_tier from public.loyalty_customers where id = p_customer_id;
  if v_tier <> 'legend' then
    raise exception 'LEGEND_ONLY';
  end if;
  select * into v_poll from public.loyalty_drink_polls where id = p_poll_id;
  if not found then raise exception 'POLL_NOT_FOUND'; end if;
  if v_poll.is_active = false or v_poll.closes_at < now() or v_poll.opens_at > now() then
    raise exception 'POLL_NOT_OPEN';
  end if;
  -- Validate option_id is one of the poll's options
  if not exists (
    select 1 from jsonb_array_elements(v_poll.options) opt
    where opt->>'id' = p_option_id
  ) then
    raise exception 'INVALID_OPTION';
  end if;

  insert into public.loyalty_drink_votes (poll_id, customer_id, option_id)
  values (p_poll_id, p_customer_id, p_option_id)
  on conflict (poll_id, customer_id) do update
    set option_id = excluded.option_id, voted_at = now();

  return jsonb_build_object('ok', true, 'option_id', p_option_id);
end;
$$;
grant execute on function public.cast_drink_vote(uuid,text,uuid) to authenticated;

-- View: public-readable poll + tally (for Legends to see results)
create or replace view public.loyalty_drink_poll_tallies as
  select p.id as poll_id,
         p.title,
         opt->>'id' as option_id,
         opt->>'label' as label,
         opt->>'label_ar' as label_ar,
         coalesce(v.votes, 0) as votes
    from public.loyalty_drink_polls p,
         jsonb_array_elements(p.options) opt
    left join lateral (
      select count(*)::int as votes
        from public.loyalty_drink_votes dv
        where dv.poll_id = p.id and dv.option_id = opt->>'id'
    ) v on true;
grant select on public.loyalty_drink_poll_tallies to authenticated;
