-- Loyalty and customer control V2.
--
-- Preserves every V1/V2 identity, point event, reward, linked order, and
-- opening balance. Duplicate identities remain open exceptions until the
-- owner reviews them; this migration never merges or deletes a customer.

-- ── Roles and authoritative identity helpers ────────────────────────────────

create or replace function public.loyalty_is_owner_v2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where (
      profile.id = auth.uid()
      or profile.auth_user_id = auth.uid()
    )
      and profile.role = 'owner'
  );
$$;

create or replace function public.loyalty_is_operator_v2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where (
      profile.id = auth.uid()
      or profile.auth_user_id = auth.uid()
    )
      and (
        profile.role = 'owner'
        or (
          profile.role in ('supervisor', 'staff', 'limited_staff')
          and coalesce(profile.is_employee, true)
          and coalesce(profile.is_active, false)
        )
      )
  );
$$;

create or replace function public.loyalty_can_campaign_v2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where (
      profile.id = auth.uid()
      or profile.auth_user_id = auth.uid()
    )
      and (
        profile.role = 'owner'
        or (
          profile.role = 'data_entry'
          and coalesce(profile.is_active, false)
        )
      )
  );
$$;

create or replace function public.assert_loyalty_staff_v2()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.loyalty_is_operator_v2() then
    raise exception 'Active POS operator sign-in required';
  end if;
end;
$$;

create or replace function public.assert_loyalty_owner_v2()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.loyalty_is_owner_v2() then
    raise exception 'Owner sign-in required';
  end if;
end;
$$;

revoke all on function public.loyalty_is_owner_v2()
  from public, anon;
revoke all on function public.loyalty_is_operator_v2()
  from public, anon;
revoke all on function public.loyalty_can_campaign_v2()
  from public, anon;
revoke all on function public.assert_loyalty_owner_v2()
  from public, anon, authenticated;
revoke all on function public.assert_loyalty_staff_v2()
  from public, anon, authenticated;

grant execute on function public.loyalty_is_owner_v2() to authenticated;
grant execute on function public.loyalty_is_operator_v2() to authenticated;
grant execute on function public.loyalty_can_campaign_v2() to authenticated;

alter table public.loyalty_customers
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists marketing_consent_source text;

update public.loyalty_customers
set phone_normalised = public.normalize_loyalty_phone_v2(phone)
where phone is not null
  and phone_normalised is distinct from public.normalize_loyalty_phone_v2(phone);

create or replace function public.enforce_loyalty_identity_v2()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_phone text;
begin
  normalized_phone := public.normalize_loyalty_phone_v2(new.phone);
  new.phone_normalised := normalized_phone;

  if normalized_phone is not null
    and exists (
      select 1
      from public.loyalty_customers existing
      where existing.id is distinct from new.id
        and public.normalize_loyalty_phone_v2(existing.phone) = normalized_phone
    )
  then
    raise exception 'Identity exception: this verified phone matches more than one customer record';
  end if;

  return new;
end;
$$;

drop trigger if exists loyalty_identity_guard_v2
  on public.loyalty_customers;
create trigger loyalty_identity_guard_v2
before insert or update of phone on public.loyalty_customers
for each row execute function public.enforce_loyalty_identity_v2();

-- Existing duplicates are evidence, not rows to merge automatically.
create table if not exists public.loyalty_identity_exception_cases (
  id uuid primary key default gen_random_uuid(),
  identity_key_hash text not null unique,
  customer_ids uuid[] not null,
  record_count integer not null check (record_count > 1),
  status text not null default 'open'
    check (status in ('open', 'distinct_people', 'needs_merge')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

with duplicate_groups as (
  select
    encode(
      digest(public.normalize_loyalty_phone_v2(phone), 'sha256'),
      'hex'
    ) as identity_key_hash,
    array_agg(id order by created_at, id) as customer_ids,
    count(*)::integer as record_count
  from public.loyalty_customers
  where public.normalize_loyalty_phone_v2(phone) is not null
  group by public.normalize_loyalty_phone_v2(phone)
  having count(*) > 1
)
insert into public.loyalty_identity_exception_cases (
  identity_key_hash,
  customer_ids,
  record_count
)
select
  identity_key_hash,
  customer_ids,
  record_count
from duplicate_groups
on conflict (identity_key_hash) do update
set customer_ids = excluded.customer_ids,
    record_count = excluded.record_count,
    updated_at = now();

alter table public.loyalty_identity_exception_cases enable row level security;
drop policy if exists loyalty_identity_exception_owner_read
  on public.loyalty_identity_exception_cases;
create policy loyalty_identity_exception_owner_read
  on public.loyalty_identity_exception_cases
  for select to authenticated
  using (public.loyalty_is_owner_v2());

revoke insert, update, delete on public.loyalty_identity_exception_cases
  from authenticated;
grant select on public.loyalty_identity_exception_cases to authenticated;

create or replace function public.review_loyalty_identity_exception_v2(
  p_case_id uuid,
  p_resolution text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.loyalty_identity_exception_cases;
  owner_profile_id uuid;
begin
  perform public.assert_loyalty_owner_v2();
  if p_resolution not in ('distinct_people', 'needs_merge') then
    raise exception 'Resolution must be distinct_people or needs_merge';
  end if;
  if length(trim(coalesce(p_note, ''))) < 4 then
    raise exception 'A review note is required';
  end if;

  select profile.id
  into owner_profile_id
  from public.profiles profile
  where (
    profile.id = auth.uid()
    or profile.auth_user_id = auth.uid()
  )
    and profile.role = 'owner'
  limit 1;

  update public.loyalty_identity_exception_cases
  set status = p_resolution,
      review_note = trim(p_note),
      reviewed_by = owner_profile_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_case_id
  returning * into result;

  if not found then
    raise exception 'Identity exception not found';
  end if;

  return to_jsonb(result);
end;
$$;

grant execute on function public.review_loyalty_identity_exception_v2(
  uuid,
  text,
  text
) to authenticated;

-- ── Consent evidence and universal contact eligibility ──────────────────────

create table if not exists public.loyalty_consent_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null
    references public.loyalty_customers(id) on delete restrict,
  channel text not null check (channel in ('whatsapp', 'email', 'ugc')),
  purpose text not null
    check (purpose in ('loyalty_service', 'marketing', 'ugc')),
  state text not null check (state in ('granted', 'withdrawn', 'unverified')),
  source text not null,
  actor_auth_user_id uuid,
  occurred_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_consent_events_customer_idx
  on public.loyalty_consent_events(customer_id, occurred_at desc);

alter table public.loyalty_consent_events enable row level security;
drop policy if exists loyalty_consent_owner_or_self_read
  on public.loyalty_consent_events;
create policy loyalty_consent_owner_or_self_read
  on public.loyalty_consent_events
  for select to authenticated
  using (
    public.loyalty_is_owner_v2()
    or exists (
      select 1
      from public.loyalty_customers customer
      where customer.id = loyalty_consent_events.customer_id
        and customer.auth_user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.loyalty_consent_events
  from authenticated;
grant select on public.loyalty_consent_events to authenticated;

insert into public.loyalty_consent_events (
  customer_id,
  channel,
  purpose,
  state,
  source,
  occurred_at,
  evidence,
  idempotency_key
)
select
  customer.id,
  'whatsapp',
  'loyalty_service',
  case
    when customer.whatsapp_opt_in
      and customer.whatsapp_opt_in_at is not null
      and nullif(trim(customer.consent_source), '') is not null
      and lower(customer.consent_source) not in (
        'legacy',
        'legacy_default_backfill',
        'default_true',
        'migration',
        'staff_default'
      )
      then 'granted'
    when customer.whatsapp_opt_in then 'unverified'
    else 'withdrawn'
  end,
  coalesce(nullif(trim(customer.consent_source), ''), 'legacy_no_provenance'),
  coalesce(customer.whatsapp_opt_in_at, customer.updated_at, customer.created_at),
  jsonb_build_object('imported_state', customer.whatsapp_opt_in),
  'legacy:whatsapp:' || customer.id::text
from public.loyalty_customers customer
on conflict (idempotency_key) do nothing;

insert into public.loyalty_consent_events (
  customer_id,
  channel,
  purpose,
  state,
  source,
  occurred_at,
  evidence,
  idempotency_key
)
select
  customer.id,
  'whatsapp',
  'marketing',
  case
    when customer.marketing_opt_in
      and customer.marketing_opt_in_at is not null
      and nullif(trim(customer.marketing_consent_source), '') is not null
      then 'granted'
    when customer.marketing_opt_in then 'unverified'
    else 'withdrawn'
  end,
  coalesce(
    nullif(trim(customer.marketing_consent_source), ''),
    'legacy_no_provenance'
  ),
  coalesce(customer.marketing_opt_in_at, customer.updated_at, customer.created_at),
  jsonb_build_object('imported_state', customer.marketing_opt_in),
  'legacy:marketing:' || customer.id::text
from public.loyalty_customers customer
on conflict (idempotency_key) do nothing;

create or replace function public.loyalty_contact_eligibility_v2(
  p_customer_id uuid,
  p_channel text,
  p_purpose text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when p_channel <> 'whatsapp' then
          jsonb_build_object('allowed', false, 'reason', 'unsupported_channel')
        when not coalesce(customer.whatsapp_opt_in, false) then
          jsonb_build_object('allowed', false, 'reason', 'whatsapp_withdrawn')
        when customer.whatsapp_opt_in_at is null
          or nullif(trim(customer.consent_source), '') is null
          or lower(customer.consent_source) in (
            'legacy',
            'legacy_default_backfill',
            'default_true',
            'migration',
            'staff_default'
          )
          then jsonb_build_object(
            'allowed',
            false,
            'reason',
            'whatsapp_consent_unverified'
          )
        when p_purpose = 'marketing'
          and not coalesce(customer.marketing_opt_in, false)
          then jsonb_build_object('allowed', false, 'reason', 'marketing_withdrawn')
        when p_purpose = 'marketing'
          and (
            customer.marketing_opt_in_at is null
            or nullif(trim(customer.marketing_consent_source), '') is null
          )
          then jsonb_build_object(
            'allowed',
            false,
            'reason',
            'marketing_consent_unverified'
          )
        else jsonb_build_object('allowed', true, 'reason', 'verified')
      end
      from public.loyalty_customers customer
      where customer.id = p_customer_id
    ),
    jsonb_build_object('allowed', false, 'reason', 'customer_not_found')
  );
$$;

create or replace function public.loyalty_can_contact_v2(
  p_customer_id uuid,
  p_channel text,
  p_purpose text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      public.loyalty_contact_eligibility_v2(
        p_customer_id,
        p_channel,
        p_purpose
      )->>'allowed'
    )::boolean,
    false
  );
$$;

revoke all on function public.loyalty_contact_eligibility_v2(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.loyalty_can_contact_v2(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.loyalty_contact_eligibility_v2(uuid, text, text)
  to service_role;
grant execute on function public.loyalty_can_contact_v2(uuid, text, text)
  to service_role;

create or replace function public.update_my_loyalty_profile_v2(
  p_full_name text default null,
  p_preferred_language text default null,
  p_whatsapp_opt_in boolean default null,
  p_marketing_opt_in boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer public.loyalty_customers;
  event_time timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Customer sign-in required';
  end if;

  select *
  into customer
  from public.loyalty_customers
  where auth_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Loyalty member not found';
  end if;
  if p_preferred_language is not null
    and p_preferred_language not in ('ar', 'en')
  then
    raise exception 'Preferred language must be ar or en';
  end if;

  update public.loyalty_customers
  set full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
      preferred_language = coalesce(p_preferred_language, preferred_language),
      whatsapp_opt_in = coalesce(p_whatsapp_opt_in, whatsapp_opt_in),
      whatsapp_opt_in_at = case
        when p_whatsapp_opt_in is null then whatsapp_opt_in_at
        else event_time
      end,
      consent_source = case
        when p_whatsapp_opt_in is null then consent_source
        else 'member_self_service'
      end,
      marketing_opt_in = coalesce(p_marketing_opt_in, marketing_opt_in),
      marketing_opt_in_at = case
        when p_marketing_opt_in is null then marketing_opt_in_at
        else event_time
      end,
      marketing_consent_source = case
        when p_marketing_opt_in is null then marketing_consent_source
        else 'member_self_service'
      end,
      updated_at = event_time
  where id = customer.id
  returning * into customer;

  if p_whatsapp_opt_in is not null then
    insert into public.loyalty_consent_events (
      customer_id,
      channel,
      purpose,
      state,
      source,
      actor_auth_user_id,
      occurred_at,
      idempotency_key
    ) values (
      customer.id,
      'whatsapp',
      'loyalty_service',
      case when p_whatsapp_opt_in then 'granted' else 'withdrawn' end,
      'member_self_service',
      auth.uid(),
      event_time,
      'member:whatsapp:' || customer.id::text || ':' || event_time::text
    );
  end if;

  if p_marketing_opt_in is not null then
    insert into public.loyalty_consent_events (
      customer_id,
      channel,
      purpose,
      state,
      source,
      actor_auth_user_id,
      occurred_at,
      idempotency_key
    ) values (
      customer.id,
      'whatsapp',
      'marketing',
      case when p_marketing_opt_in then 'granted' else 'withdrawn' end,
      'member_self_service',
      auth.uid(),
      event_time,
      'member:marketing:' || customer.id::text || ':' || event_time::text
    );
  end if;

  return jsonb_build_object(
    'customer_id', customer.id,
    'full_name', customer.full_name,
    'preferred_language', customer.preferred_language,
    'whatsapp_opt_in', customer.whatsapp_opt_in,
    'whatsapp_consent_status', case
      when public.loyalty_can_contact_v2(
        customer.id,
        'whatsapp',
        'loyalty_service'
      ) then 'verified'
      when customer.whatsapp_opt_in then 'unverified'
      else 'withdrawn'
    end,
    'marketing_opt_in', customer.marketing_opt_in,
    'marketing_consent_status', case
      when public.loyalty_can_contact_v2(
        customer.id,
        'whatsapp',
        'marketing'
      ) then 'verified'
      when customer.marketing_opt_in then 'unverified'
      else 'withdrawn'
    end
  );
end;
$$;

grant execute on function public.update_my_loyalty_profile_v2(
  text,
  text,
  boolean,
  boolean
) to authenticated;

-- ── Capture evidence and checkout resolution ────────────────────────────────

alter table public.loyalty_v2_checkout_sessions
  add column if not exists capture_method text,
  add column if not exists cancel_reason text,
  add column if not exists resolved_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'loyalty_checkout_capture_method_check'
      and conrelid = 'public.loyalty_v2_checkout_sessions'::regclass
  ) then
    alter table public.loyalty_v2_checkout_sessions
      add constraint loyalty_checkout_capture_method_check
      check (
        capture_method is null
        or capture_method in (
          'customer_qr',
          'existing_card',
          'phone_fallback'
        )
      );
  end if;
end;
$$;

create table if not exists public.loyalty_capture_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pos_orders(id) on delete restrict,
  session_id uuid references public.loyalty_v2_checkout_sessions(id)
    on delete set null,
  branch_id uuid not null references public.pos_branches(id) on delete restrict,
  customer_id uuid references public.loyalty_customers(id) on delete restrict,
  outcome text not null check (outcome in ('unknown', 'linked', 'skipped')),
  capture_method text check (
    capture_method is null
    or capture_method in ('customer_qr', 'existing_card', 'phone_fallback')
  ),
  skip_reason text check (
    skip_reason is null
    or skip_reason in (
      'declined',
      'not_member',
      'qr_unavailable',
      'timeout'
    )
  ),
  actor_auth_user_id uuid,
  evidence_source text not null default 'pos',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists loyalty_capture_one_resolution_idx
  on public.loyalty_capture_events(order_id)
  where outcome <> 'unknown';
create unique index if not exists loyalty_capture_one_unknown_idx
  on public.loyalty_capture_events(order_id)
  where outcome = 'unknown';
create index if not exists loyalty_capture_period_idx
  on public.loyalty_capture_events(occurred_at, branch_id);

alter table public.loyalty_capture_events enable row level security;
drop policy if exists loyalty_capture_owner_read
  on public.loyalty_capture_events;
create policy loyalty_capture_owner_read
  on public.loyalty_capture_events
  for select to authenticated
  using (public.loyalty_is_owner_v2());

revoke insert, update, delete on public.loyalty_capture_events
  from authenticated;
grant select on public.loyalty_capture_events to authenticated;

create or replace function public.capture_unknown_loyalty_order_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and not exists (
    select 1
    from public.loyalty_capture_events event
    where event.order_id = new.id
  ) then
    insert into public.loyalty_capture_events (
      order_id,
      branch_id,
      customer_id,
      outcome,
      actor_auth_user_id,
      evidence_source,
      occurred_at
    ) values (
      new.id,
      new.branch_id,
      new.loyalty_customer_id,
      'unknown',
      auth.uid(),
      'order_trigger',
      coalesce(new.created_at, now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists loyalty_capture_unknown_order_v2
  on public.pos_orders;
create trigger loyalty_capture_unknown_order_v2
after insert or update of status on public.pos_orders
for each row execute function public.capture_unknown_loyalty_order_v2();

create or replace function public.record_loyalty_capture_decision_v2(
  p_order_id uuid,
  p_session_id uuid,
  p_outcome text,
  p_capture_method text,
  p_skip_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.pos_orders;
  session_row public.loyalty_v2_checkout_sessions;
  event_row public.loyalty_capture_events;
  prior_resolution public.loyalty_capture_events;
begin
  perform public.assert_loyalty_staff_v2();

  select *
  into order_row
  from public.pos_orders
  where id = p_order_id
  for update;

  if not found or order_row.status <> 'completed' then
    raise exception 'Completed order not found';
  end if;
  if p_outcome not in ('linked', 'skipped') then
    raise exception 'Capture outcome must be linked or skipped';
  end if;

  if p_outcome = 'linked' then
    if order_row.loyalty_customer_id is null then
      raise exception 'Linked capture requires a member on the order';
    end if;
    if p_capture_method not in (
      'customer_qr',
      'existing_card',
      'phone_fallback'
    ) then
      raise exception 'Linked capture method is required';
    end if;
    if p_skip_reason is not null then
      raise exception 'Linked capture cannot have a skip reason';
    end if;
  else
    if order_row.loyalty_customer_id is not null then
      raise exception 'Skipped capture cannot have a member on the order';
    end if;
    if p_capture_method is not null then
      raise exception 'Skipped capture cannot have a capture method';
    end if;
    if p_skip_reason not in (
      'declined',
      'not_member',
      'qr_unavailable',
      'timeout'
    ) then
      raise exception 'A supported skip reason is required';
    end if;
  end if;

  if p_session_id is not null then
    select *
    into session_row
    from public.loyalty_v2_checkout_sessions
    where id = p_session_id
      and created_by = auth.uid()
    for update;

    if not found then
      raise exception 'Checkout session not found';
    end if;
    if session_row.branch_id <> order_row.branch_id then
      raise exception 'Checkout session branch does not match the order';
    end if;
    if p_capture_method = 'customer_qr'
      and session_row.customer_id is distinct from order_row.loyalty_customer_id
    then
      raise exception 'QR claim does not match the linked member';
    end if;

    update public.loyalty_v2_checkout_sessions
    set status = case
          when p_capture_method = 'customer_qr' then 'settled'
          else 'cancelled'
        end,
        capture_method = p_capture_method,
        cancel_reason = case
          when p_outcome = 'skipped' then p_skip_reason
          when p_capture_method <> 'customer_qr' then 'alternate_capture'
          else null
        end,
        resolved_at = now(),
        settled_order_id = p_order_id,
        settled_at = now()
    where id = p_session_id;
  end if;

  select *
  into prior_resolution
  from public.loyalty_capture_events event
  where event.order_id = p_order_id
    and event.outcome <> 'unknown'
  limit 1;

  if found then
    if prior_resolution.outcome = p_outcome
      and prior_resolution.capture_method is not distinct from p_capture_method
      and prior_resolution.skip_reason is not distinct from p_skip_reason
      and prior_resolution.customer_id is not distinct from order_row.loyalty_customer_id
    then
      return to_jsonb(prior_resolution);
    end if;
    raise exception 'Loyalty capture decision is immutable once recorded';
  end if;

  insert into public.loyalty_capture_events (
    order_id,
    session_id,
    branch_id,
    customer_id,
    outcome,
    capture_method,
    skip_reason,
    actor_auth_user_id,
    evidence_source
  ) values (
    order_row.id,
    p_session_id,
    order_row.branch_id,
    order_row.loyalty_customer_id,
    p_outcome,
    p_capture_method,
    p_skip_reason,
    auth.uid(),
    'pos_decision'
  )
  returning * into event_row;

  return to_jsonb(event_row);
end;
$$;

grant execute on function public.record_loyalty_capture_decision_v2(
  uuid,
  uuid,
  text,
  text,
  text
) to authenticated;

-- ── Reward obligation evidence ──────────────────────────────────────────────

alter table public.loyalty_v2_reward_rules
  add column if not exists estimated_cost_lyd numeric(10, 3)
    check (estimated_cost_lyd is null or estimated_cost_lyd >= 0);

alter table public.loyalty_v2_reward_entitlements
  add column if not exists estimated_cost_lyd numeric(10, 3)
    check (estimated_cost_lyd is null or estimated_cost_lyd >= 0),
  add column if not exists expired_at timestamptz;

update public.loyalty_v2_reward_entitlements entitlement
set estimated_cost_lyd = rule.estimated_cost_lyd
from public.loyalty_v2_reward_rules rule
where rule.id = entitlement.reward_rule_id
  and entitlement.estimated_cost_lyd is null
  and rule.estimated_cost_lyd is not null;

create or replace function public.snapshot_loyalty_reward_cost_v2()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estimated_cost_lyd is null and new.reward_rule_id is not null then
    select rule.estimated_cost_lyd
    into new.estimated_cost_lyd
    from public.loyalty_v2_reward_rules rule
    where rule.id = new.reward_rule_id;
  end if;
  return new;
end;
$$;

drop trigger if exists loyalty_reward_cost_snapshot_v2
  on public.loyalty_v2_reward_entitlements;
create trigger loyalty_reward_cost_snapshot_v2
before insert on public.loyalty_v2_reward_entitlements
for each row execute function public.snapshot_loyalty_reward_cost_v2();

create table if not exists public.loyalty_v2_reward_events (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null
    references public.loyalty_v2_reward_entitlements(id) on delete restrict,
  customer_id uuid not null
    references public.loyalty_customers(id) on delete restrict,
  event_type text not null
    check (event_type in ('issued', 'reserved', 'redeemed', 'expired', 'reversed')),
  order_id uuid references public.pos_orders(id) on delete set null,
  actor_auth_user_id uuid,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists loyalty_reward_events_customer_idx
  on public.loyalty_v2_reward_events(customer_id, occurred_at desc);

alter table public.loyalty_v2_reward_events enable row level security;
drop policy if exists loyalty_reward_events_owner_or_self_read
  on public.loyalty_v2_reward_events;
create policy loyalty_reward_events_owner_or_self_read
  on public.loyalty_v2_reward_events
  for select to authenticated
  using (
    public.loyalty_is_owner_v2()
    or exists (
      select 1
      from public.loyalty_customers customer
      where customer.id = loyalty_v2_reward_events.customer_id
        and customer.auth_user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.loyalty_v2_reward_events
  from authenticated;
grant select on public.loyalty_v2_reward_events to authenticated;

insert into public.loyalty_v2_reward_events (
  entitlement_id,
  customer_id,
  event_type,
  order_id,
  occurred_at,
  metadata
)
select
  entitlement.id,
  entitlement.customer_id,
  'issued',
  null,
  entitlement.issued_at,
  jsonb_build_object('backfilled', true)
from public.loyalty_v2_reward_entitlements entitlement
where not exists (
  select 1
  from public.loyalty_v2_reward_events event
  where event.entitlement_id = entitlement.id
    and event.event_type = 'issued'
);

create or replace function public.audit_loyalty_reward_state_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.loyalty_v2_reward_events (
      entitlement_id,
      customer_id,
      event_type,
      occurred_at
    ) values (
      new.id,
      new.customer_id,
      'issued',
      new.issued_at
    );
  elsif old.status is distinct from new.status
    and new.status in ('reserved', 'redeemed', 'expired', 'reversed')
  then
    insert into public.loyalty_v2_reward_events (
      entitlement_id,
      customer_id,
      event_type,
      order_id,
      actor_auth_user_id,
      occurred_at
    ) values (
      new.id,
      new.customer_id,
      new.status,
      new.redeemed_order_id,
      auth.uid(),
      coalesce(
        case new.status
          when 'redeemed' then new.redeemed_at
          when 'expired' then new.expired_at
          when 'reversed' then new.reversed_at
          else now()
        end,
        now()
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists loyalty_reward_state_audit_v2
  on public.loyalty_v2_reward_entitlements;
create trigger loyalty_reward_state_audit_v2
after insert or update of status on public.loyalty_v2_reward_entitlements
for each row execute function public.audit_loyalty_reward_state_v2();

create or replace function public.run_loyalty_housekeeping_v2()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_sessions integer;
  expired_rewards integer;
begin
  update public.loyalty_v2_checkout_sessions
  set status = 'expired',
      cancel_reason = coalesce(cancel_reason, 'timeout'),
      resolved_at = coalesce(resolved_at, now())
  where status in ('open', 'claimed')
    and expires_at <= now();
  get diagnostics expired_sessions = row_count;

  update public.loyalty_v2_reward_entitlements
  set status = 'expired',
      expired_at = now()
  where status = 'pending'
    and expires_at is not null
    and expires_at <= now();
  get diagnostics expired_rewards = row_count;

  return jsonb_build_object(
    'expired_sessions', expired_sessions,
    'expired_rewards', expired_rewards
  );
end;
$$;

revoke all on function public.run_loyalty_housekeeping_v2()
  from public, anon, authenticated;
grant execute on function public.run_loyalty_housekeeping_v2()
  to service_role;

-- Customer access is mediated through purpose-specific functions. Staff can
-- operate checkout without browsing raw contact details.
create table if not exists public.loyalty_customer_access_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.loyalty_customers(id) on delete restrict,
  actor_auth_user_id uuid not null,
  purpose text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.loyalty_customer_access_events enable row level security;
drop policy if exists loyalty_customer_access_owner_read
  on public.loyalty_customer_access_events;
create policy loyalty_customer_access_owner_read
  on public.loyalty_customer_access_events
  for select to authenticated
  using (public.loyalty_is_owner_v2());
revoke insert, update, delete on public.loyalty_customer_access_events
  from authenticated;
grant select on public.loyalty_customer_access_events to authenticated;

create or replace function public.register_loyalty_member_v2(p_full_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user_id uuid := auth.uid();
  verified_phone text := public.normalize_loyalty_phone_v2(auth.jwt() ->> 'phone');
  verified_email text := nullif(lower(trim(auth.jwt() ->> 'email')), '');
  candidate_count integer;
  customer public.loyalty_customers;
  membership public.loyalty_v2_memberships;
begin
  if auth_user_id is null then
    raise exception 'Sign in with OTP before joining loyalty';
  end if;
  if nullif(trim(p_full_name), '') is null then
    raise exception 'Name is required';
  end if;
  if verified_phone is null and verified_email is null then
    raise exception 'A verified phone or email is required';
  end if;

  select count(distinct candidate.id)
  into candidate_count
  from public.loyalty_customers candidate
  where candidate.auth_user_id = auth_user_id
    or (
      verified_phone is not null
      and public.normalize_loyalty_phone_v2(candidate.phone) = verified_phone
    )
    or (
      verified_email is not null
      and lower(candidate.email) = verified_email
    );

  if candidate_count > 1 then
    raise exception 'Identity exception: multiple records match this verified identity';
  end if;

  select *
  into customer
  from public.loyalty_customers candidate
  where candidate.auth_user_id = auth_user_id
    or (
      verified_phone is not null
      and public.normalize_loyalty_phone_v2(candidate.phone) = verified_phone
    )
    or (
      verified_email is not null
      and lower(candidate.email) = verified_email
    )
  order by (candidate.auth_user_id = auth_user_id) desc
  limit 1
  for update;

  if found then
    if customer.auth_user_id is not null
      and customer.auth_user_id <> auth_user_id
    then
      raise exception 'This loyalty identity is already linked';
    end if;
    update public.loyalty_customers
    set auth_user_id = auth_user_id,
        full_name = trim(p_full_name),
        phone = coalesce(phone, verified_phone),
        email = coalesce(email, verified_email),
        updated_at = now()
    where id = customer.id
    returning * into customer;
  else
    insert into public.loyalty_customers (
      phone,
      email,
      auth_user_id,
      full_name,
      whatsapp_opt_in,
      marketing_opt_in,
      consent_source,
      marketing_consent_source
    ) values (
      verified_phone,
      verified_email,
      auth_user_id,
      trim(p_full_name),
      false,
      false,
      'member_self_service_pending',
      'member_self_service_pending'
    )
    returning * into customer;
  end if;

  insert into public.loyalty_v2_memberships (
    customer_id,
    loyalty_number,
    joined_at
  ) values (
    customer.id,
    'N2-' || upper(substr(replace(customer.id::text, '-', ''), 1, 12)),
    now()
  )
  on conflict (customer_id) do update
  set status = 'active',
      updated_at = now()
  returning * into membership;

  return jsonb_build_object(
    'customer_id', customer.id,
    'loyalty_number', membership.loyalty_number,
    'full_name', customer.full_name,
    'points_balance', public.loyalty_v2_balance(customer.id)
  );
end;
$$;

create or replace function public.lookup_or_create_loyalty_member_v2(
  p_phone text,
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text := public.normalize_loyalty_phone_v2(p_phone);
  match_count integer;
  customer public.loyalty_customers;
  membership public.loyalty_v2_memberships;
  operator_profile_id uuid;
begin
  perform public.assert_loyalty_staff_v2();
  if normalized_phone is null then
    raise exception 'Valid phone number required';
  end if;

  select count(*)
  into match_count
  from public.loyalty_customers candidate
  where public.normalize_loyalty_phone_v2(candidate.phone) = normalized_phone;
  if match_count > 1 then
    raise exception 'Identity exception: use owner review before linking this phone';
  end if;

  select profile.id
  into operator_profile_id
  from public.profiles profile
  where profile.id = auth.uid() or profile.auth_user_id = auth.uid()
  limit 1;

  select *
  into customer
  from public.loyalty_customers candidate
  where public.normalize_loyalty_phone_v2(candidate.phone) = normalized_phone
  limit 1
  for update;

  if not found then
    insert into public.loyalty_customers (
      phone,
      full_name,
      registered_by,
      whatsapp_opt_in,
      marketing_opt_in,
      consent_source,
      marketing_consent_source
    ) values (
      normalized_phone,
      coalesce(nullif(trim(p_full_name), ''), 'Noch member'),
      operator_profile_id,
      false,
      false,
      'cashier_fallback_no_consent',
      'cashier_fallback_no_consent'
    )
    returning * into customer;
  end if;

  insert into public.loyalty_v2_memberships (customer_id, loyalty_number)
  values (
    customer.id,
    'N2-' || upper(substr(replace(customer.id::text, '-', ''), 1, 12))
  )
  on conflict (customer_id) do update
  set status = 'active',
      updated_at = now()
  returning * into membership;

  return jsonb_build_object(
    'id', customer.id,
    'customer_id', customer.id,
    'full_name', customer.full_name,
    'masked_phone', '••• ' || right(regexp_replace(normalized_phone, '[^0-9]', '', 'g'), 4),
    'loyalty_number', membership.loyalty_number,
    'points_balance', public.loyalty_v2_balance(customer.id)
  );
end;
$$;

create or replace function public.create_loyalty_checkout_v2(
  p_branch_id uuid,
  p_cart_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_token text := encode(gen_random_bytes(24), 'hex');
  session_row public.loyalty_v2_checkout_sessions;
  expiry_seconds integer;
begin
  perform public.assert_loyalty_staff_v2();
  if p_branch_id is null or p_cart_token is null then
    raise exception 'Branch and cart token are required';
  end if;
  if not exists (
    select 1 from public.pos_branches
    where id = p_branch_id and is_active
  ) then
    raise exception 'Active branch not found';
  end if;

  select checkout_expiry_seconds into expiry_seconds
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
    encode(digest(raw_token, 'sha256'), 'hex'),
    auth.uid(),
    now() + make_interval(secs => coalesce(expiry_seconds, 300))
  )
  on conflict (created_by, cart_token) do update
  set token_hash = excluded.token_hash,
      status = 'open',
      customer_id = null,
      expires_at = excluded.expires_at,
      claimed_at = null,
      settled_at = null,
      settled_order_id = null,
      capture_method = null,
      cancel_reason = null,
      resolved_at = null,
      created_at = now()
  returning * into session_row;

  return jsonb_build_object(
    'session_id', session_row.id,
    'token', raw_token,
    'claim_path', '/loyalty/checkout/' || raw_token,
    'expires_at', session_row.expires_at
  );
end;
$$;

create or replace function public.claim_loyalty_checkout_v2(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer public.loyalty_customers;
  session_row public.loyalty_v2_checkout_sessions;
begin
  if auth.uid() is null then
    raise exception 'Sign in with OTP before claiming a checkout';
  end if;
  select * into customer
  from public.loyalty_customers
  where auth_user_id = auth.uid()
  limit 1;
  if not found then
    raise exception 'Join Loyalty V2 before claiming this checkout';
  end if;

  select * into session_row
  from public.loyalty_v2_checkout_sessions
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;
  if not found then raise exception 'Checkout code not found'; end if;
  if session_row.expires_at <= now() then
    update public.loyalty_v2_checkout_sessions
    set status = 'expired',
        cancel_reason = 'timeout',
        resolved_at = now()
    where id = session_row.id;
    raise exception 'Checkout code expired';
  end if;
  if session_row.status <> 'open' then
    raise exception 'Checkout code already used';
  end if;

  update public.loyalty_v2_checkout_sessions
  set status = 'claimed',
      customer_id = customer.id,
      capture_method = 'customer_qr',
      claimed_at = now()
  where id = session_row.id
  returning * into session_row;

  return jsonb_build_object(
    'session_id', session_row.id,
    'status', session_row.status,
    'full_name', customer.full_name,
    'points_balance', public.loyalty_v2_balance(customer.id)
  );
end;
$$;

create or replace function public.join_and_claim_loyalty_checkout_v2(
  p_token text,
  p_full_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.register_loyalty_member_v2(p_full_name);
  return public.claim_loyalty_checkout_v2(p_token);
end;
$$;

create or replace function public.get_loyalty_checkout_v2(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.loyalty_v2_checkout_sessions;
  customer public.loyalty_customers;
begin
  perform public.assert_loyalty_staff_v2();
  update public.loyalty_v2_checkout_sessions
  set status = 'expired',
      cancel_reason = 'timeout',
      resolved_at = now()
  where id = p_session_id
    and status in ('open', 'claimed')
    and expires_at <= now();

  select * into session_row
  from public.loyalty_v2_checkout_sessions
  where id = p_session_id and created_by = auth.uid();
  if not found then raise exception 'Checkout session not found'; end if;

  if session_row.customer_id is not null then
    select * into customer
    from public.loyalty_customers
    where id = session_row.customer_id;
  end if;

  return jsonb_build_object(
    'session_id', session_row.id,
    'status', session_row.status,
    'expires_at', session_row.expires_at,
    'capture_method', session_row.capture_method,
    'customer_id', session_row.customer_id,
    'full_name', customer.full_name,
    'points_balance', case
      when session_row.customer_id is null then null
      else public.loyalty_v2_balance(session_row.customer_id)
    end,
    'available_rewards', (
      select count(*)
      from public.loyalty_v2_reward_entitlements entitlement
      where entitlement.customer_id = session_row.customer_id
        and entitlement.status = 'pending'
        and (entitlement.expires_at is null or entitlement.expires_at > now())
    )
  );
end;
$$;

create or replace function public.close_loyalty_checkout_v2(
  p_session_id uuid,
  p_order_id uuid default null,
  p_cancel boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_loyalty_staff_v2();
  if not p_cancel then
    raise exception 'Paid checkout resolution uses record_loyalty_capture_decision_v2';
  end if;
  update public.loyalty_v2_checkout_sessions
  set status = 'cancelled',
      cancel_reason = 'abandoned',
      resolved_at = now()
  where id = p_session_id
    and created_by = auth.uid()
    and status in ('open', 'claimed');
  if not found then raise exception 'Checkout session not found'; end if;
  return jsonb_build_object('session_id', p_session_id, 'closed', true);
end;
$$;

create or replace function public.search_loyalty_members_v2(
  p_query text,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_query text := public.normalize_loyalty_phone_v2(p_query);
begin
  perform public.assert_loyalty_staff_v2();
  insert into public.loyalty_customer_access_events (
    actor_auth_user_id,
    purpose,
    metadata
  ) values (
    auth.uid(),
    'pos_member_search',
    jsonb_build_object('query_length', length(coalesce(p_query, '')))
  );
  return coalesce((
    select jsonb_agg(to_jsonb(result))
    from (
      select
        customer.id,
        customer.full_name,
        '••• ' || right(regexp_replace(customer.phone, '[^0-9]', '', 'g'), 4)
          as masked_phone,
        membership.loyalty_number,
        public.loyalty_v2_balance(customer.id) as points_balance
      from public.loyalty_customers customer
      join public.loyalty_v2_memberships membership
        on membership.customer_id = customer.id
       and membership.status = 'active'
      where nullif(trim(p_query), '') is not null
        and (
          customer.full_name ilike '%' || trim(p_query) || '%'
          or (
            normalized_query is not null
            and public.normalize_loyalty_phone_v2(customer.phone) = normalized_query
          )
          or membership.loyalty_number ilike '%' || trim(p_query) || '%'
        )
      order by
        (public.normalize_loyalty_phone_v2(customer.phone) = normalized_query) desc,
        customer.full_name
      limit least(greatest(coalesce(p_limit, 12), 1), 25)
    ) result
  ), '[]'::jsonb);
end;
$$;

create or replace function public.lookup_customer_by_passport_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer public.loyalty_customers;
begin
  perform public.assert_loyalty_staff_v2();
  select * into customer
  from public.loyalty_customers
  where passport_token = p_token
  limit 1;
  if not found then return null; end if;
  insert into public.loyalty_customer_access_events (
    customer_id, actor_auth_user_id, purpose
  ) values (customer.id, auth.uid(), 'pos_passport_scan');
  return jsonb_build_object(
    'id', customer.id,
    'full_name', customer.full_name,
    'masked_phone', '••• ' || right(regexp_replace(customer.phone, '[^0-9]', '', 'g'), 4),
    'points_balance', public.loyalty_v2_balance(customer.id),
    'preferred_language', customer.preferred_language
  );
end;
$$;

create or replace function public.get_my_loyalty_card_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  customer public.loyalty_customers;
  membership public.loyalty_v2_memberships;
begin
  if auth.uid() is null then raise exception 'Customer sign-in required'; end if;
  select * into customer
  from public.loyalty_customers
  where auth_user_id = auth.uid();
  if not found then raise exception 'Loyalty member not found'; end if;
  select * into membership
  from public.loyalty_v2_memberships
  where customer_id = customer.id;

  return jsonb_build_object(
    'customer_id', customer.id,
    'full_name', customer.full_name,
    'loyalty_number', membership.loyalty_number,
    'joined_at', membership.joined_at,
    'points_balance', public.loyalty_v2_balance(customer.id),
    'preferred_language', customer.preferred_language,
    'whatsapp_opt_in', customer.whatsapp_opt_in,
    'whatsapp_consent_status', case
      when customer.whatsapp_opt_in
        and customer.whatsapp_opt_in_at is not null
        and customer.consent_source = 'member_self_service' then 'verified'
      when customer.whatsapp_opt_in then 'unverified'
      else 'withdrawn'
    end,
    'marketing_opt_in', customer.marketing_opt_in,
    'marketing_consent_status', case
      when customer.marketing_opt_in
        and customer.marketing_opt_in_at is not null
        and customer.marketing_consent_source = 'member_self_service'
        then 'verified'
      when customer.marketing_opt_in then 'unverified'
      else 'withdrawn'
    end,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entitlement.id,
        'code', entitlement.code,
        'title', entitlement.title,
        'status', entitlement.status,
        'expires_at', entitlement.expires_at
      ) order by entitlement.issued_at desc)
      from public.loyalty_v2_reward_entitlements entitlement
      where entitlement.customer_id = customer.id
        and entitlement.status = 'pending'
        and (entitlement.expires_at is null or entitlement.expires_at > now())
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_type', event.event_type,
        'points_delta', event.points_delta,
        'created_at', event.created_at
      ) order by event.created_at desc)
      from (
        select * from public.loyalty_v2_point_events
        where customer_id = customer.id
        order by created_at desc
        limit 20
      ) event
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.loyalty_v2_customer_directory(
  p_query text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_loyalty_owner_v2();
  return coalesce((
    select jsonb_agg(to_jsonb(result))
    from (
      select
        customer.id,
        customer.full_name,
        '••• ' || right(regexp_replace(customer.phone, '[^0-9]', '', 'g'), 4)
          as masked_phone,
        membership.loyalty_number,
        membership.joined_at,
        customer.auth_user_id is not null as auth_linked,
        public.loyalty_v2_balance(customer.id) as points_balance,
        count(distinct order_row.id) filter (where order_row.status = 'completed')
          as linked_orders,
        coalesce(sum(greatest(
          coalesce(order_row.total, 0) - coalesce(order_row.refunded_amount_lyd, 0),
          0
        )) filter (where order_row.status = 'completed'), 0) as linked_sales_lyd,
        max(order_row.created_at) filter (where order_row.status = 'completed')
          as last_linked_order_at,
        count(distinct entitlement.id) filter (
          where entitlement.status = 'pending'
            and (entitlement.expires_at is null or entitlement.expires_at > now())
        ) as pending_rewards,
        case
          when customer.whatsapp_opt_in
            and customer.whatsapp_opt_in_at is not null
            and customer.consent_source = 'member_self_service'
            then 'verified'
          when customer.whatsapp_opt_in then 'unverified'
          else 'withdrawn'
        end as consent_status
      from public.loyalty_customers customer
      join public.loyalty_v2_memberships membership
        on membership.customer_id = customer.id
      left join public.pos_orders order_row
        on order_row.loyalty_customer_id = customer.id
      left join public.loyalty_v2_reward_entitlements entitlement
        on entitlement.customer_id = customer.id
      where p_query is null
        or trim(p_query) = ''
        or customer.full_name ilike '%' || trim(p_query) || '%'
        or membership.loyalty_number ilike '%' || trim(p_query) || '%'
      group by customer.id, membership.loyalty_number, membership.joined_at
      order by max(order_row.created_at) desc nulls last, customer.full_name
      limit least(greatest(coalesce(p_limit, 100), 1), 250)
      offset greatest(coalesce(p_offset, 0), 0)
    ) result
  ), '[]'::jsonb);
end;
$$;

create or replace function public.loyalty_v2_owner_summary(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  business_to date := coalesce(
    p_to,
    ((now() at time zone 'Africa/Tripoli') - interval '5 hours')::date
  );
  business_from date := coalesce(p_from, business_to - 29);
  from_utc timestamptz;
  to_utc timestamptz;
  activated_at timestamptz;
  launch_from timestamptz;
  launch_orders bigint;
  launch_linked bigint;
  historical_orders bigint;
  historical_linked bigint;
begin
  perform public.assert_loyalty_owner_v2();
  perform public.run_loyalty_housekeeping_v2();
  if business_from > business_to then raise exception 'Invalid reporting period'; end if;

  from_utc := (business_from::timestamp + interval '5 hours')
    at time zone 'Africa/Tripoli';
  to_utc := ((business_to + 1)::timestamp + interval '5 hours')
    at time zone 'Africa/Tripoli';
  select version.activated_at into activated_at
  from public.loyalty_program_versions version
  where version.code = 'v2';
  launch_from := greatest(coalesce(activated_at, from_utc), from_utc);

  select count(*), count(*) filter (where loyalty_customer_id is not null)
  into historical_orders, historical_linked
  from public.pos_orders
  where status = 'completed'
    and created_at >= from_utc
    and created_at < to_utc;

  select count(*), count(*) filter (where loyalty_customer_id is not null)
  into launch_orders, launch_linked
  from public.pos_orders
  where status = 'completed'
    and created_at >= launch_from
    and created_at < to_utc;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'from', business_from,
      'to', business_to,
      'from_utc', from_utc,
      'to_utc', to_utc,
      'timezone', 'Africa/Tripoli',
      'business_day_start', '05:00'
    ),
    'freshness', jsonb_build_object(
      'generated_at', now(),
      'latest_order_at', (
        select max(created_at) from public.pos_orders where status = 'completed'
      ),
      'latest_capture_at', (
        select max(occurred_at) from public.loyalty_capture_events
      )
    ),
    'launch', jsonb_build_object(
      'activated_at', activated_at,
      'days_live', greatest(0, floor(extract(epoch from now() - activated_at) / 86400)),
      'eligible_orders', launch_orders,
      'linked_orders', launch_linked,
      'link_rate_pct', round(100.0 * launch_linked / nullif(launch_orders, 0), 2),
      'target_day_30_pct', 30,
      'target_day_90_pct', 50,
      'status', case
        when launch_orders = 0 then 'awaiting_first_order'
        when round(100.0 * launch_linked / nullif(launch_orders, 0), 2) >= 50
          then 'day_90_target_met'
        when round(100.0 * launch_linked / nullif(launch_orders, 0), 2) >= 30
          then 'day_30_target_met'
        else 'below_target'
      end
    ),
    'historical', jsonb_build_object(
      'eligible_orders', historical_orders,
      'linked_orders', historical_linked,
      'link_rate_pct', round(
        100.0 * historical_linked / nullif(historical_orders, 0),
        2
      )
    ),
    'capture', jsonb_build_object(
      'resolved', (
        select count(*)
        from public.loyalty_capture_events event
        where event.outcome <> 'unknown'
          and event.occurred_at >= launch_from
          and event.occurred_at < to_utc
      ),
      'unknown', (
        select count(*)
        from public.loyalty_capture_events event
        where event.outcome = 'unknown'
          and event.occurred_at >= launch_from
          and event.occurred_at < to_utc
          and not exists (
            select 1 from public.loyalty_capture_events resolved
            where resolved.order_id = event.order_id
              and resolved.outcome <> 'unknown'
          )
      ),
      'methods', coalesce((
        select jsonb_object_agg(method, total)
        from (
          select capture_method as method, count(*) as total
          from public.loyalty_capture_events
          where outcome = 'linked'
            and occurred_at >= launch_from
            and occurred_at < to_utc
          group by capture_method
        ) methods
      ), '{}'::jsonb),
      'skip_reasons', coalesce((
        select jsonb_object_agg(reason, total)
        from (
          select skip_reason as reason, count(*) as total
          from public.loyalty_capture_events
          where outcome = 'skipped'
            and occurred_at >= launch_from
            and occurred_at < to_utc
          group by skip_reason
        ) reasons
      ), '{}'::jsonb)
    ),
    'members', jsonb_build_object(
      'active', (
        select count(*) from public.loyalty_v2_memberships where status = 'active'
      ),
      'auth_linked', (
        select count(*) from public.loyalty_customers where auth_user_id is not null
      ),
      'identity_exceptions_open', (
        select count(*) from public.loyalty_identity_exception_cases where status = 'open'
      ),
      'points_outstanding', (
        select coalesce(sum(public.loyalty_v2_balance(customer_id)), 0)
        from public.loyalty_v2_memberships where status = 'active'
      )
    ),
    'consent', jsonb_build_object(
      'verified_whatsapp', (
        select count(*) from public.loyalty_customers
        where whatsapp_opt_in
          and whatsapp_opt_in_at is not null
          and consent_source = 'member_self_service'
      ),
      'unverified_whatsapp', (
        select count(*) from public.loyalty_customers
        where whatsapp_opt_in
          and (
            whatsapp_opt_in_at is null
            or consent_source is distinct from 'member_self_service'
          )
      ),
      'verified_marketing', (
        select count(*) from public.loyalty_customers
        where marketing_opt_in
          and marketing_opt_in_at is not null
          and marketing_consent_source = 'member_self_service'
      )
    ),
    'rewards', jsonb_build_object(
      'pending', (
        select count(*) from public.loyalty_v2_reward_entitlements
        where status = 'pending'
          and (expires_at is null or expires_at > now())
      ),
      'estimated_obligation_lyd', (
        select coalesce(sum(estimated_cost_lyd), 0)
        from public.loyalty_v2_reward_entitlements
        where status = 'pending'
          and (expires_at is null or expires_at > now())
      ),
      'missing_cost', (
        select count(*) from public.loyalty_v2_reward_entitlements
        where status = 'pending'
          and estimated_cost_lyd is null
          and (expires_at is null or expires_at > now())
      ),
      'redeemed_in_period', (
        select count(*) from public.loyalty_v2_reward_entitlements
        where status = 'redeemed'
          and redeemed_at >= from_utc
          and redeemed_at < to_utc
      )
    ),
    'missions', jsonb_build_object(
      'active', (
        select count(*) from public.loyalty_v2_missions
        where status = 'active' and now() between starts_at and ends_at
      )
    ),
    'retention', jsonb_build_object(
      'status', case
        when activated_at > now() - interval '30 days' then 'not_matured'
        when launch_orders = 0 then 'insufficient_capture'
        else 'available'
      end,
      'note', 'Second-visit cohorts require 30 completed post-enrolment days'
    ),
    'branches', coalesce((
      select jsonb_agg(to_jsonb(branch_result) order by branch_result.branch_name)
      from (
        select
          branch.id as branch_id,
          branch.name as branch_name,
          count(order_row.id) as eligible_orders,
          count(order_row.id) filter (
            where order_row.loyalty_customer_id is not null
          ) as linked_orders,
          round(
            100.0 * count(order_row.id) filter (
              where order_row.loyalty_customer_id is not null
            ) / nullif(count(order_row.id), 0),
            2
          ) as link_rate_pct
        from public.pos_branches branch
        left join public.pos_orders order_row
          on order_row.branch_id = branch.id
         and order_row.status = 'completed'
         and order_row.created_at >= launch_from
         and order_row.created_at < to_utc
        where branch.is_active
        group by branch.id, branch.name
      ) branch_result
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_loyalty_v2_dashboard()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.loyalty_v2_owner_summary(null, null);
$$;

-- Tighten direct reads. Owners may inspect source evidence; customers may read
-- only their own value records. POS operators use the masked functions above.
drop policy if exists loyalty_v2_customer_staff_read on public.loyalty_customers;
drop policy if exists loyalty_v2_customer_self_read on public.loyalty_customers;
create policy loyalty_v2_customer_owner_or_self_read
  on public.loyalty_customers for select to authenticated
  using (public.loyalty_is_owner_v2() or auth_user_id = auth.uid());

drop policy if exists loyalty_v2_membership_read on public.loyalty_v2_memberships;
create policy loyalty_v2_membership_owner_or_self_read
  on public.loyalty_v2_memberships for select to authenticated
  using (
    public.loyalty_is_owner_v2()
    or exists (
      select 1 from public.loyalty_customers customer
      where customer.id = loyalty_v2_memberships.customer_id
        and customer.auth_user_id = auth.uid()
    )
  );

drop policy if exists loyalty_v2_progress_read on public.loyalty_v2_mission_progress;
create policy loyalty_v2_progress_owner_or_self_read
  on public.loyalty_v2_mission_progress for select to authenticated
  using (
    public.loyalty_is_owner_v2()
    or exists (
      select 1 from public.loyalty_customers customer
      where customer.id = loyalty_v2_mission_progress.customer_id
        and customer.auth_user_id = auth.uid()
    )
  );

drop policy if exists loyalty_v2_entitlements_read
  on public.loyalty_v2_reward_entitlements;
create policy loyalty_v2_entitlements_owner_or_self_read
  on public.loyalty_v2_reward_entitlements for select to authenticated
  using (
    public.loyalty_is_owner_v2()
    or exists (
      select 1 from public.loyalty_customers customer
      where customer.id = loyalty_v2_reward_entitlements.customer_id
        and customer.auth_user_id = auth.uid()
    )
  );

drop policy if exists loyalty_v2_point_events_read
  on public.loyalty_v2_point_events;
create policy loyalty_v2_points_owner_or_self_read
  on public.loyalty_v2_point_events for select to authenticated
  using (
    public.loyalty_is_owner_v2()
    or exists (
      select 1 from public.loyalty_customers customer
      where customer.id = loyalty_v2_point_events.customer_id
        and customer.auth_user_id = auth.uid()
    )
  );

revoke all on function public.lookup_customer_by_passport_token(uuid)
  from public, anon;
revoke all on function public.register_loyalty_member_v2(text)
  from public, anon;
revoke all on function public.join_and_claim_loyalty_checkout_v2(text, text)
  from public, anon;
revoke all on function public.search_loyalty_members_v2(text, integer)
  from public, anon;
revoke all on function public.get_my_loyalty_card_v2()
  from public, anon;
revoke all on function public.loyalty_v2_customer_directory(text, integer, integer)
  from public, anon;
revoke all on function public.loyalty_v2_owner_summary(date, date)
  from public, anon;
revoke all on function public.get_loyalty_v2_dashboard()
  from public, anon;

grant execute on function public.register_loyalty_member_v2(text)
  to authenticated;
grant execute on function public.lookup_or_create_loyalty_member_v2(text, text)
  to authenticated;
grant execute on function public.create_loyalty_checkout_v2(uuid, uuid)
  to authenticated;
grant execute on function public.claim_loyalty_checkout_v2(text)
  to authenticated;
grant execute on function public.join_and_claim_loyalty_checkout_v2(text, text)
  to authenticated;
grant execute on function public.get_loyalty_checkout_v2(uuid)
  to authenticated;
grant execute on function public.close_loyalty_checkout_v2(uuid, uuid, boolean)
  to authenticated;
grant execute on function public.lookup_customer_by_passport_token(uuid)
  to authenticated;
grant execute on function public.search_loyalty_members_v2(text, integer)
  to authenticated;
grant execute on function public.get_my_loyalty_card_v2()
  to authenticated;
grant execute on function public.loyalty_v2_customer_directory(text, integer, integer)
  to authenticated;
grant execute on function public.loyalty_v2_owner_summary(date, date)
  to authenticated;
grant execute on function public.get_loyalty_v2_dashboard()
  to authenticated;

comment on function public.loyalty_v2_owner_summary(date, date) is
  'Authoritative owner loyalty health using Tripoli 05:00 business days and separate post-launch capture.';
comment on table public.loyalty_capture_events is
  'Immutable evidence of each completed order loyalty decision; unknown trigger evidence is retained after resolution.';
comment on table public.loyalty_consent_events is
  'Append-only channel and purpose consent evidence; legacy truthy flags without provenance remain unverified.';

notify pgrst, 'reload schema';

create or replace function public.create_loyalty_mission_version_v3(
  p_mission_id uuid,
  p_title text,
  p_title_ar text,
  p_description text,
  p_description_ar text,
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
as $$
declare
  owner_profile_id uuid;
  previous public.loyalty_v2_missions;
  created public.loyalty_v2_missions;
begin
  perform public.assert_loyalty_owner_v2();
  if nullif(trim(p_title), '') is null
    or nullif(trim(p_title_ar), '') is null
  then
    raise exception 'English and Arabic mission titles are required';
  end if;
  select profile.id into owner_profile_id
  from public.profiles profile
  where profile.id = auth.uid() or profile.auth_user_id = auth.uid()
  limit 1;
  select * into previous
  from public.loyalty_v2_missions
  where id = p_mission_id
  for update;
  if not found then raise exception 'Mission not found'; end if;
  if previous.status = 'active' then
    raise exception 'Suspend an active mission before changing its rules';
  end if;
  update public.loyalty_v2_missions
  set status = 'ended'
  where id = previous.id;
  insert into public.loyalty_v2_missions (
    code, version, title, title_ar, description, description_ar,
    mission_type, target_count, reward_points, starts_at, ends_at,
    max_completions, branch_ids, product_ids, category_ids,
    quiet_start, quiet_end, status, created_by
  ) values (
    previous.code, previous.version + 1, trim(p_title), trim(p_title_ar),
    nullif(trim(p_description), ''), nullif(trim(p_description_ar), ''),
    p_mission_type, p_target_count, p_reward_points, p_starts_at, p_ends_at,
    p_max_completions, coalesce(p_branch_ids, '{}'),
    coalesce(p_product_ids, '{}'), coalesce(p_category_ids, '{}'),
    case when p_mission_type = 'quiet_hours' then p_quiet_start end,
    case when p_mission_type = 'quiet_hours' then p_quiet_end end,
    p_status, owner_profile_id
  )
  returning * into created;
  return created;
end;
$$;

revoke all on function public.create_loyalty_mission_version_v3(
  uuid, text, text, text, text, text, integer, integer, timestamptz,
  timestamptz, integer, uuid[], uuid[], uuid[], time, time, text
) from public, anon;
grant execute on function public.create_loyalty_mission_version_v3(
  uuid, text, text, text, text, text, integer, integer, timestamptz,
  timestamptz, integer, uuid[], uuid[], uuid[], time, time, text
) to authenticated;

notify pgrst, 'reload schema';
