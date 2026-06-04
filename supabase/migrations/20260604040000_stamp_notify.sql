-- Stamp-grant WhatsApp notification (2026-06-04).
-- Optional thank-you WhatsApp when staff manually grant a stamp for an activity
-- (UGC, Google/Facebook review). OFF by default; needs an approved WhatsApp
-- template + Twilio creds before it actually delivers.

-- 1. Settings (single global row) -------------------------------------------------
alter table loyalty_settings
  add column if not exists stamp_notify_enabled    boolean default false,
  add column if not exists stamp_notify_ugc        boolean default true,
  add column if not exists stamp_notify_review      boolean default true,
  add column if not exists stamp_notify_message_ar text default 'شكراً على ${activity}! نوتشي منحك طابع 🎁',
  add column if not exists stamp_notify_message_en text default 'Thanks for your ${activity}! Nochi gave you a stamp 🎁';

-- 2. Record the activity on the stamp --------------------------------------------
-- Add p_reason → loyalty_stamps.notes. Drop the 2-arg version first so the new
-- 3-arg (with default) doesn't create an ambiguous overload.
drop function if exists public.award_loyalty_stamp(uuid, uuid);

create or replace function award_loyalty_stamp(
  p_customer_id uuid,
  p_awarded_by  uuid default null,
  p_reason      text default null
)
returns json as $$
declare
  v_customer loyalty_customers;
  v_settings loyalty_settings;
  v_new_stamps int;
  v_new_total int;
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

  insert into loyalty_stamps (customer_id, awarded_by, stamp_number, cycle_number, notes)
  values (
    p_customer_id, p_awarded_by, v_new_stamps,
    ceil(v_new_total::float / v_settings.stamp_goal),
    nullif(trim(coalesce(p_reason, '')), '')
  );

  if v_new_stamps >= v_settings.stamp_goal then
    v_new_stamps := 0;
    v_reward_created := true;
    insert into loyalty_rewards (customer_id, reward_type, description, expires_at)
    values (p_customer_id, 'free_drink', v_settings.reward_description, now() + interval '30 days');
  end if;

  v_tier := case
    when v_new_total >= v_settings.tier_legend_at then 'legend'
    when v_new_total >= v_settings.tier_gold_at then 'gold'
    when v_new_total >= v_settings.tier_silver_at then 'silver'
    else 'bronze'
  end;

  declare
    v_streak int := v_customer.current_streak;
    v_longest int := v_customer.longest_streak;
  begin
    if v_customer.last_visit_at is null or v_customer.last_visit_at < now() - interval '2 days' then
      v_streak := 1;
    else
      v_streak := v_streak + 1;
    end if;
    if v_streak > v_longest then v_longest := v_streak; end if;

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

grant execute on function public.award_loyalty_stamp(uuid, uuid, text) to authenticated, service_role;
