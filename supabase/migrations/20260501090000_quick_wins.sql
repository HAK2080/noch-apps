-- Three quick wins from the 2026-05-01 architecture audit:
-- 1. Schedule update_nochi_states() daily so the Nochi state machine stops being frozen.
-- 2. Add the apply_coupon RPC so storefront coupon codes don't crash at runtime.
-- 3. (Frontend code change handled separately — getPOSProducts loader.)

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Schedule Nochi state decay daily at 04:00 UTC (07:00 Tripoli),
--    BEFORE the marketing cron at 06:00 UTC so re-engagement triggers see
--    fresh state. Idempotent: replaces existing schedule if any.
-- ──────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'nochi-state-daily') then
    perform cron.unschedule('nochi-state-daily');
  end if;
end $$;

select cron.schedule(
  'nochi-state-daily',
  '0 4 * * *',  -- 04:00 UTC = 07:00 Africa/Tripoli
  $cron$ select public.update_nochi_states(); $cron$
);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. apply_coupon RPC — called by Menu.jsx storefront. Returns:
--    { valid:bool, message:text, discount_amount:numeric, code:text }
--    Schema reference: pos_coupons(code, discount_type, discount_value,
--      branch_id, is_active, expires_at, max_uses, used_count, min_order_value)
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.apply_coupon(
  p_code text,
  p_branch_id uuid,
  p_order_total numeric
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c pos_coupons%rowtype;
  v_discount numeric := 0;
begin
  if p_code is null or trim(p_code) = '' then
    return jsonb_build_object('valid', false, 'message', 'Enter a coupon code');
  end if;

  select * into v_c
    from public.pos_coupons
   where lower(code) = lower(trim(p_code))
     and (branch_id is null or branch_id = p_branch_id)
   limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'message', 'Invalid code');
  end if;
  if v_c.is_active is not true then
    return jsonb_build_object('valid', false, 'message', 'This code is no longer active');
  end if;
  if v_c.expires_at is not null and v_c.expires_at < now() then
    return jsonb_build_object('valid', false, 'message', 'This code has expired');
  end if;
  if v_c.max_uses is not null and coalesce(v_c.used_count, 0) >= v_c.max_uses then
    return jsonb_build_object('valid', false, 'message', 'This code has reached its limit');
  end if;
  if v_c.min_order_value is not null and p_order_total < v_c.min_order_value then
    return jsonb_build_object(
      'valid', false,
      'message', 'Minimum order ' || v_c.min_order_value::text || ' LYD required'
    );
  end if;

  -- Compute discount
  if v_c.discount_type = 'percent' then
    v_discount := round(p_order_total * (v_c.discount_value / 100.0), 3);
  elsif v_c.discount_type = 'amount' then
    v_discount := least(v_c.discount_value, p_order_total);
  else
    return jsonb_build_object('valid', false, 'message', 'Coupon misconfigured');
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', v_c.code,
    'discount_type', v_c.discount_type,
    'discount_value', v_c.discount_value,
    'discount_amount', v_discount,
    'message', 'Coupon applied — ' || v_discount::text || ' LYD off'
  );
end;
$$;
grant execute on function public.apply_coupon(text, uuid, numeric) to anon, authenticated, service_role;
