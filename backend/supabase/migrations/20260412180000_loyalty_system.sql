-- ============================================================
-- NOCHI LOYALTY SYSTEM — V3.01
-- Full gamified loyalty with Nochi bunny mascot
-- ============================================================

-- Settings (one row per cafe)
create table if not exists loyalty_settings (
  id uuid primary key default gen_random_uuid(),
  stamp_goal int not null default 9,
  reward_description text not null default 'Free coffee of your choice',
  tier_silver_at int not null default 30,  -- total lifetime stamps
  tier_gold_at int not null default 75,
  tier_legend_at int not null default 150,
  inactivity_sad_days int not null default 10,
  inactivity_tired_days int not null default 20,
  inactivity_deathbed_days int not null default 30,
  inactivity_dead_days int not null default 40,
  feedback_delay_hours int not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insert default settings
insert into loyalty_settings (id) values (gen_random_uuid())
on conflict do nothing;

-- Customers
create table if not exists loyalty_customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  full_name text not null,
  birthday date,
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'legend')),
  current_stamps int not null default 0,
  total_stamps int not null default 0,    -- lifetime total
  total_visits int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_visit_at timestamptz,
  nochi_state text not null default 'happy' check (nochi_state in ('happy', 'sad', 'tired', 'deathbed', 'dead')),
  registered_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table loyalty_customers enable row level security;

create policy "loyalty_customers_all" on loyalty_customers for all to authenticated
  using (true) with check (true);

-- Stamp history
create table if not exists loyalty_stamps (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references loyalty_customers(id) on delete cascade,
  awarded_by uuid references profiles(id) on delete set null,
  stamp_number int not null,  -- which stamp in current cycle (1-9)
  cycle_number int not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

alter table loyalty_stamps enable row level security;
create policy "loyalty_stamps_all" on loyalty_stamps for all to authenticated
  using (true) with check (true);

-- Rewards (free drinks earned)
create table if not exists loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references loyalty_customers(id) on delete cascade,
  reward_type text not null default 'free_drink',
  description text,
  status text not null default 'pending' check (status in ('pending', 'redeemed', 'expired')),
  redeemed_by uuid references profiles(id) on delete set null,
  redeemed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table loyalty_rewards enable row level security;
create policy "loyalty_rewards_all" on loyalty_rewards for all to authenticated
  using (true) with check (true);

-- Feedback
create table if not exists loyalty_feedback (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references loyalty_customers(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  visit_date date not null default current_date,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  task_id uuid references tasks(id) on delete set null,  -- auto-created task if negative
  actioned boolean not null default false,
  created_at timestamptz not null default now()
);

alter table loyalty_feedback enable row level security;
create policy "loyalty_feedback_all" on loyalty_feedback for all to authenticated
  using (true) with check (true);

-- Challenges (weekly/monthly)
create table if not exists loyalty_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_ar text,
  description text,
  description_ar text,
  challenge_type text not null check (challenge_type in ('visits', 'streak', 'referral', 'time_of_day', 'custom')),
  target_value int not null default 3,  -- e.g. visit 3 times
  bonus_stamps int not null default 2,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table loyalty_challenges enable row level security;
create policy "loyalty_challenges_all" on loyalty_challenges for all to authenticated
  using (true) with check (true);

-- Customer challenge progress
create table if not exists loyalty_challenge_progress (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references loyalty_customers(id) on delete cascade,
  challenge_id uuid not null references loyalty_challenges(id) on delete cascade,
  current_value int not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  bonus_awarded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (customer_id, challenge_id)
);

alter table loyalty_challenge_progress enable row level security;
create policy "loyalty_challenge_progress_all" on loyalty_challenge_progress for all to authenticated
  using (true) with check (true);

-- QR tokens (rotating, for secure stamp awarding)
create table if not exists loyalty_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  expires_at timestamptz not null,
  used_by uuid references loyalty_customers(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table loyalty_qr_tokens enable row level security;
create policy "loyalty_qr_tokens_all" on loyalty_qr_tokens for all to authenticated
  using (true) with check (true);

-- Allow service_role full access to all loyalty tables
create policy "loyalty_settings_service" on loyalty_settings for all to service_role
  using (true) with check (true);
create policy "loyalty_stamps_service" on loyalty_stamps for all to service_role
  using (true) with check (true);
create policy "loyalty_rewards_service" on loyalty_rewards for all to service_role
  using (true) with check (true);
create policy "loyalty_feedback_service" on loyalty_feedback for all to service_role
  using (true) with check (true);
create policy "loyalty_customers_service" on loyalty_customers for all to service_role
  using (true) with check (true);
create policy "loyalty_challenges_service" on loyalty_challenges for all to service_role
  using (true) with check (true);
create policy "loyalty_challenge_progress_service" on loyalty_challenge_progress for all to service_role
  using (true) with check (true);
create policy "loyalty_qr_tokens_service" on loyalty_qr_tokens for all to service_role
  using (true) with check (true);

alter table loyalty_settings enable row level security;
create policy "loyalty_settings_all" on loyalty_settings for all to authenticated
  using (true) with check (true);

-- ============================================================
-- RPC: Award a stamp to a customer
-- ============================================================
create or replace function award_loyalty_stamp(
  p_customer_id uuid,
  p_awarded_by uuid default null
)
returns json as $$
declare
  v_customer loyalty_customers;
  v_settings loyalty_settings;
  v_new_stamps int;
  v_new_total int;
  v_cycle int;
  v_reward_created boolean := false;
  v_tier text;
begin
  select * into v_customer from loyalty_customers where id = p_customer_id;
  select * into v_settings from loyalty_settings limit 1;

  if not found then
    raise exception 'Customer not found';
  end if;

  v_new_stamps := v_customer.current_stamps + 1;
  v_new_total := v_customer.total_stamps + 1;

  -- Insert stamp record
  insert into loyalty_stamps (customer_id, awarded_by, stamp_number, cycle_number)
  values (
    p_customer_id,
    p_awarded_by,
    v_new_stamps,
    ceil(v_new_total::float / v_settings.stamp_goal)
  );

  -- Check if reward earned
  if v_new_stamps >= v_settings.stamp_goal then
    v_new_stamps := 0;
    v_reward_created := true;
    insert into loyalty_rewards (customer_id, reward_type, description, expires_at)
    values (
      p_customer_id,
      'free_drink',
      v_settings.reward_description,
      now() + interval '30 days'
    );
  end if;

  -- Calculate tier from total stamps
  v_tier := case
    when v_new_total >= v_settings.tier_legend_at then 'legend'
    when v_new_total >= v_settings.tier_gold_at then 'gold'
    when v_new_total >= v_settings.tier_silver_at then 'silver'
    else 'bronze'
  end;

  -- Update streak
  declare
    v_streak int := v_customer.current_streak;
    v_longest int := v_customer.longest_streak;
  begin
    if v_customer.last_visit_at is null or
       v_customer.last_visit_at < now() - interval '2 days' then
      v_streak := 1;
    else
      v_streak := v_streak + 1;
    end if;
    if v_streak > v_longest then
      v_longest := v_streak;
    end if;

    -- Update customer
    update loyalty_customers set
      current_stamps = v_new_stamps,
      total_stamps = v_new_total,
      total_visits = total_visits + 1,
      current_streak = v_streak,
      longest_streak = v_longest,
      last_visit_at = now(),
      nochi_state = 'happy',
      tier = v_tier,
      updated_at = now()
    where id = p_customer_id;
  end;

  return json_build_object(
    'success', true,
    'current_stamps', v_new_stamps,
    'total_stamps', v_new_total,
    'reward_earned', v_reward_created,
    'tier', v_tier
  );
end;
$$ language plpgsql security definer;

grant execute on function award_loyalty_stamp(uuid, uuid) to authenticated;
grant execute on function award_loyalty_stamp(uuid, uuid) to service_role;

-- ============================================================
-- RPC: Update Nochi states based on inactivity
-- ============================================================
create or replace function update_nochi_states()
returns int as $$
declare
  v_settings loyalty_settings;
  v_count int;
begin
  select * into v_settings from loyalty_settings limit 1;

  update loyalty_customers set
    nochi_state = case
      when last_visit_at < now() - (v_settings.inactivity_dead_days || ' days')::interval then 'dead'
      when last_visit_at < now() - (v_settings.inactivity_deathbed_days || ' days')::interval then 'deathbed'
      when last_visit_at < now() - (v_settings.inactivity_tired_days || ' days')::interval then 'tired'
      when last_visit_at < now() - (v_settings.inactivity_sad_days || ' days')::interval then 'sad'
      else 'happy'
    end,
    updated_at = now()
  where nochi_state != 'happy'
    or last_visit_at < now() - (v_settings.inactivity_sad_days || ' days')::interval;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;

grant execute on function update_nochi_states() to service_role;

-- ============================================================
-- RPC: Get loyalty dashboard stats
-- ============================================================
create or replace function get_loyalty_stats()
returns json as $$
  select json_build_object(
    'total_customers', (select count(*) from loyalty_customers),
    'active_today', (select count(*) from loyalty_customers where last_visit_at >= current_date),
    'active_week', (select count(*) from loyalty_customers where last_visit_at >= current_date - 7),
    'stamps_today', (select count(*) from loyalty_stamps where created_at >= current_date),
    'rewards_pending', (select count(*) from loyalty_rewards where status = 'pending'),
    'rewards_redeemed_week', (select count(*) from loyalty_rewards where status = 'redeemed' and redeemed_at >= current_date - 7),
    'sad_customers', (select count(*) from loyalty_customers where nochi_state = 'sad'),
    'tired_customers', (select count(*) from loyalty_customers where nochi_state = 'tired'),
    'deathbed_customers', (select count(*) from loyalty_customers where nochi_state = 'deathbed'),
    'dead_customers', (select count(*) from loyalty_customers where nochi_state = 'dead'),
    'avg_rating_week', (select round(avg(rating), 1) from loyalty_feedback where created_at >= current_date - 7),
    'negative_feedback_week', (select count(*) from loyalty_feedback where sentiment = 'negative' and created_at >= current_date - 7),
    'tier_counts', (
      select json_object_agg(tier, cnt) from (
        select tier, count(*) as cnt from loyalty_customers group by tier
      ) t
    )
  );
$$ language sql stable;

grant execute on function get_loyalty_stats() to authenticated;
grant execute on function get_loyalty_stats() to service_role;
