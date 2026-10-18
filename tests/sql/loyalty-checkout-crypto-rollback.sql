-- Execute with the crypto migration prepended INSIDE this transaction.
-- All temporary customer/QR rows and any migration dry-run are rolled back.
-- Never place COMMIT anywhere in this verification.
begin isolation level repeatable read;

-- The runner inserts the exact migration text at this marker:
-- __CRYPTO_MIGRATION__

do $verify_checkout_crypto$
declare
  operator_id uuid;
  branch_id uuid;
  customer_id uuid;
  cart_id uuid := gen_random_uuid();
  checkout jsonb;
  claimed jsonb;
  progress jsonb;
  point_count_before bigint;
  point_sum_before numeric;
begin
  select p.id into operator_id
    from public.profiles p join auth.users u on u.id = p.id
    where p.role = 'owner' order by p.id limit 1;
  select id into branch_id from public.pos_branches where is_active order by id limit 1;
  if operator_id is null or branch_id is null then
    raise exception 'A real operator and active branch are required for this rollback test';
  end if;
  select count(*), coalesce(sum(points_delta), 0)
    into point_count_before, point_sum_before from public.loyalty_v2_point_events;

  -- Phone is intentionally null: no real customer identity or notification target.
  insert into public.loyalty_customers (full_name, phone, auth_user_id)
    values ('Rollback-only crypto regression', null, operator_id)
    returning id into customer_id;
  perform set_config('request.jwt.claim.sub', operator_id::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', operator_id, 'role', 'authenticated')::text, true);

  if not has_function_privilege('authenticated',
      'public.create_loyalty_checkout_v2(uuid,uuid)', 'execute')
     or has_function_privilege('anon',
      'public.create_loyalty_checkout_v2(uuid,uuid)', 'execute') then
    raise exception 'QR creation authorization changed unexpectedly';
  end if;

  checkout := public.create_loyalty_checkout_v2(branch_id, cart_id);
  if length(checkout->>'token') <> 48 or checkout->>'session_id' is null then
    raise exception 'Secure checkout token was not created';
  end if;
  if not exists (select 1 from public.loyalty_v2_checkout_sessions
      where id = (checkout->>'session_id')::uuid
        and token_hash = encode(extensions.digest(checkout->>'token', 'sha256'), 'hex')
        and token_hash <> checkout->>'token') then
    raise exception 'QR token was not safely hashed';
  end if;
  claimed := public.claim_loyalty_checkout_v2(checkout->>'token');
  if claimed->>'status' <> 'claimed' then
    raise exception 'QR claim did not complete';
  end if;
  progress := public.get_my_loyalty_checkout_v2(checkout->>'token');
  if progress->>'session_id' <> checkout->>'session_id'
      or progress->>'status' <> 'claimed'
      or (progress->>'points_earned')::numeric <> 0 then
    raise exception 'Customer checkout progress did not match the test QR';
  end if;
  if point_count_before <> (select count(*) from public.loyalty_v2_point_events)
      or point_sum_before <> (select coalesce(sum(points_delta), 0) from public.loyalty_v2_point_events) then
    raise exception 'Customer points changed during QR verification';
  end if;
end;
$verify_checkout_crypto$;

rollback;
select 'PASS: QR creation, hashed token, customer claim and progress; all test changes rolled back; points unchanged' as verification;
