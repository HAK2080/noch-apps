-- Barista loyalty redemption — customer-initiated 4-letter one-time codes
-- Replaces the old QR-scan barista flow. Customer with a pending reward taps
-- "Redeem" in their card → server generates a 4-letter code with 5-min expiry →
-- customer reads it to barista → barista enters it on POS → server validates
-- and (on order finalization) consumes the reward atomically.

-- 1) Extend loyalty_rewards with code + expiry. Reuses the existing reward
--    lifecycle (pending → redeemed) instead of introducing a parallel table.
alter table loyalty_rewards
  add column if not exists code text,
  add column if not exists code_expires_at timestamptz,
  add column if not exists redeemed_in_order_id uuid references pos_orders(id);

-- Fast lookup by code while a reward is pending. Partial unique so we don't
-- collide on rotated/expired codes from past redemptions.
create unique index if not exists loyalty_rewards_pending_code_idx
  on loyalty_rewards (code)
  where status = 'pending' and code is not null;

-- 2) Helpers ────────────────────────────────────────────────────────────────

-- Generate a 4-letter code from an unambiguous alphabet (no I/O/0/1).
create or replace function _loyalty_random_code() returns text
language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..4 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end;
$$;

-- 3) RPC: generate_loyalty_code ─────────────────────────────────────────────
-- Customer calls this from MyCard when they want to redeem the next pending
-- reward. Picks the oldest pending reward, assigns a fresh 4-letter code and
-- 5-min expiry. Idempotent if called repeatedly: re-rolls the code.
create or replace function generate_loyalty_code(p_customer_id uuid)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_reward_id uuid;
  v_code text;
  v_attempts int := 0;
begin
  if p_customer_id is null then
    return jsonb_build_object('error', 'customer_id required');
  end if;

  select id into v_reward_id
    from loyalty_rewards
   where customer_id = p_customer_id
     and status = 'pending'
   order by created_at asc
   limit 1
   for update;

  if v_reward_id is null then
    return jsonb_build_object('error', 'no_pending_reward');
  end if;

  -- Try up to 5 times in case we collide with another active code.
  loop
    v_attempts := v_attempts + 1;
    v_code := _loyalty_random_code();
    begin
      update loyalty_rewards
         set code = v_code,
             code_expires_at = now() + interval '5 minutes'
       where id = v_reward_id;
      exit;
    exception when unique_violation then
      if v_attempts >= 5 then
        return jsonb_build_object('error', 'code_collision_retry');
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'code', v_code,
    'expires_at', (now() + interval '5 minutes'),
    'reward_id', v_reward_id
  );
end;
$$;

grant execute on function generate_loyalty_code(uuid) to authenticated;

-- 4) RPC: validate_loyalty_code (read-only check at "Apply Loyalty" time) ──
create or replace function validate_loyalty_code(p_code text)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_row record;
begin
  if p_code is null or length(p_code) <> 4 then
    return jsonb_build_object('valid', false, 'error', 'bad_format');
  end if;

  select r.id as reward_id,
         r.customer_id,
         c.full_name,
         c.phone,
         r.code_expires_at
    into v_row
    from loyalty_rewards r
    join loyalty_customers c on c.id = r.customer_id
   where r.code = upper(p_code)
     and r.status = 'pending'
   limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'error', 'invalid_or_consumed');
  end if;

  if v_row.code_expires_at is null or v_row.code_expires_at < now() then
    return jsonb_build_object('valid', false, 'error', 'expired');
  end if;

  return jsonb_build_object(
    'valid', true,
    'reward_id', v_row.reward_id,
    'customer_id', v_row.customer_id,
    'customer_name', v_row.full_name,
    'customer_phone', v_row.phone
  );
end;
$$;

grant execute on function validate_loyalty_code(text) to authenticated;

-- 5) RPC: consume_loyalty_code (called on order finalization) ──────────────
-- Atomic conditional update — fails cleanly if someone else already redeemed
-- between validate and finalize. Caller passes the order_id once the order
-- row exists so we can audit which order ate the reward.
create or replace function consume_loyalty_code(p_reward_id uuid, p_order_id uuid)
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_rows int;
begin
  update loyalty_rewards
     set status = 'redeemed',
         redeemed_at = now(),
         redeemed_by = auth.uid(),
         redeemed_in_order_id = p_order_id
   where id = p_reward_id
     and status = 'pending'
     and (code_expires_at is null or code_expires_at >= now());

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('success', false, 'error', 'already_consumed_or_expired');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function consume_loyalty_code(uuid, uuid) to authenticated;
