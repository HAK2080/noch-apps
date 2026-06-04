-- Feedback rewards (2026-06-04): customers earn Nochi points for completing the
-- survey (any rating), once per day; at a points threshold they get a free-drink
-- voucher. Reward is for PARTICIPATION only — never for a positive/public review
-- (keeps us within Google/Facebook incentive rules). Phone links/creates the
-- customer's loyalty card; no phone = anonymous, no reward (unchanged).

-- 1. Settings (single global row) -------------------------------------------------
alter table loyalty_settings
  add column if not exists feedback_reward_enabled boolean default true,
  add column if not exists points_for_feedback     int     default 10,
  add column if not exists free_drink_points_goal   int     default 50;

-- 2. Replace submit_feedback with the rewarded version ---------------------------
-- Adding a parameter changes the signature; drop the old one to avoid overloads.
drop function if exists public.submit_feedback(uuid, int, text, text, uuid, text, text, text[]);

create or replace function public.submit_feedback(
  p_branch_id    uuid,
  p_rating       int,
  p_comment      text   default null,
  p_table_number text   default null,
  p_order_id     uuid   default null,
  p_source       text   default 'qr',
  p_emoji        text   default null,
  p_reason_tags  text[] default '{}',
  p_phone        text   default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rating    int;
  v_comment   text;
  v_sentiment text;
  v_id        uuid;
  v_task_id   uuid;
  v_branch    text;
  -- rewards
  v_norm          text;
  v_cust_id       uuid;
  v_enabled       boolean;
  v_pts           int;
  v_goal          int;
  v_points_added  int := 0;
  v_total_points  int := null;
  v_reward_code   text := null;
begin
  v_rating := p_rating;
  if v_rating is null or v_rating < 1 or v_rating > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;

  v_comment := nullif(left(trim(coalesce(p_comment, '')), 1000), '');

  if p_order_id is not null then
    if exists (select 1 from loyalty_feedback where order_id = p_order_id) then
      return jsonb_build_object('ok', true, 'duplicate', true);
    end if;
  end if;

  v_sentiment := case
    when v_rating >= 4 then 'positive'
    when v_rating = 3  then 'neutral'
    else 'negative'
  end;

  -- Resolve customer by phone (optional). Normalise to digits only.
  v_norm := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  if v_norm is not null and length(v_norm) >= 7 then
    select id into v_cust_id
      from loyalty_customers
      where regexp_replace(coalesce(phone_normalised, phone, ''), '\D', '', 'g') = v_norm
      limit 1;
    if v_cust_id is null then
      insert into loyalty_customers (phone, phone_normalised, full_name, consent_source, marketing_opt_in)
        values (p_phone, v_norm, 'ضيف نوتشي', 'feedback', false)
        returning id into v_cust_id;
    end if;
  end if;

  insert into loyalty_feedback (
    customer_id, rating, comment, sentiment, actioned,
    branch_id, order_id, table_number, source, emoji, reason_tags
  ) values (
    v_cust_id, v_rating, v_comment, v_sentiment, false,
    p_branch_id, p_order_id, nullif(trim(coalesce(p_table_number,'')),''),
    coalesce(nullif(trim(p_source),''),'qr'), nullif(trim(coalesce(p_emoji,'')),''),
    coalesce(p_reason_tags, '{}')
  )
  returning id into v_id;

  -- Negative → owner task (unchanged).
  if v_sentiment = 'negative' then
    select name into v_branch from pos_branches where id = p_branch_id;
    insert into tasks (title, description, status, priority)
    values (
      '⚠️ Negative feedback (' || v_rating || '★)',
      concat_ws(E'\n',
        'A customer left ' || v_rating || '★ feedback.',
        case when v_branch is not null then 'Branch: ' || v_branch end,
        case when nullif(trim(coalesce(p_table_number,'')),'') is not null then 'Table: ' || p_table_number end,
        case when array_length(coalesce(p_reason_tags,'{}'),1) is not null
             then 'Areas: ' || array_to_string(p_reason_tags, ', ') end,
        case when v_comment is not null then 'Comment: "' || v_comment || '"' end
      ),
      'pending', 'high'
    )
    returning id into v_task_id;
    update loyalty_feedback set task_id = v_task_id where id = v_id;
  end if;

  -- Rewards: points for participation (daily cap), free-drink voucher at threshold.
  if v_cust_id is not null then
    select feedback_reward_enabled, points_for_feedback, free_drink_points_goal
      into v_enabled, v_pts, v_goal
      from loyalty_settings limit 1;

    if coalesce(v_enabled, true) then
      -- Daily cap: award only if this customer left no other feedback today.
      if not exists (
        select 1 from loyalty_feedback
        where customer_id = v_cust_id and id <> v_id and created_at::date = current_date
      ) then
        v_points_added := greatest(coalesce(v_pts, 10), 0);
        update loyalty_customers
          set points = coalesce(points, 0) + v_points_added, updated_at = now()
          where id = v_cust_id
          returning points into v_total_points;

        -- Threshold → issue a free-drink voucher and spend the points.
        if v_total_points >= coalesce(v_goal, 50) and coalesce(v_goal, 50) > 0 then
          v_reward_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
          insert into loyalty_rewards (customer_id, reward_type, description, status, code, expires_at)
            values (v_cust_id, 'free_drink', 'Free drink — Nochi points', 'pending',
                    v_reward_code, now() + interval '30 days');
          update loyalty_customers set points = points - coalesce(v_goal, 50)
            where id = v_cust_id returning points into v_total_points;
        end if;
      else
        select points into v_total_points from loyalty_customers where id = v_cust_id;
      end if;
    else
      select points into v_total_points from loyalty_customers where id = v_cust_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'sentiment', v_sentiment,
    'points_awarded', v_points_added,
    'total_points', v_total_points,
    'reward_code', v_reward_code
  );
end;
$$;

grant execute on function public.submit_feedback(uuid, int, text, text, uuid, text, text, text[], text)
  to anon, authenticated, service_role;
