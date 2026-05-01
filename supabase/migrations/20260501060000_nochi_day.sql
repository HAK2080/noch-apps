-- Annual Nochi Day — owner-triggered: every Nochi alive again, free-drink
-- reward for active customers, special badge.

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
