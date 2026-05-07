-- POS Batch 1 (2026-05-07):
--   * pos_settings (per-branch feature flags)
--   * Per-user PIN salt + verify RPC (server-side verification, no plain hashes leak)
--   * pin_attempts table for rate-limiting brute force
--   * pos_cash_movements + record_cash_movement RPC (paid-in / paid-out / safe-drop / tip-out)
--
-- Manager-override flow, per-barista shift attendees, reporting, modifiers,
-- partial refunds, loyalty stamping are deferred to a later migration.

-- ──────────────────────────────────────────────────────────────────────
-- pgcrypto for digest(); already used in a few places but be explicit.
-- ──────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ──────────────────────────────────────────────────────────────────────
-- pos_settings — per-branch feature flags. Defaults match the user's
-- choices in chat: out-of-stock blocking OFF, manager-override OFF,
-- per-barista-shift OFF, but require_pin ON (PIN now mandatory for POS).
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pos_settings (
  branch_id uuid primary key references pos_branches(id) on delete cascade,
  block_out_of_stock      boolean default false,
  manager_override_enabled boolean default false,
  per_barista_shift       boolean default false,
  require_pin             boolean default true,
  updated_at timestamptz default now()
);

alter table pos_settings enable row level security;
create policy "pos_settings_all" on pos_settings
  for all to authenticated using (true) with check (true);

-- Backfill a row for every existing branch so the client doesn't have to
-- handle the "no settings row" case.
insert into pos_settings (branch_id)
  select id from pos_branches
  on conflict (branch_id) do nothing;

-- ──────────────────────────────────────────────────────────────────────
-- Per-user PIN salt. Existing PINs (hashed with the static client salt
-- 'noch_salt_2026') still work via verify_pos_pin's legacy fallback;
-- when an owner re-sets a staff PIN, the new path with a per-user salt
-- is used.
-- ──────────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists pin_salt text,
  add column if not exists pin_updated_at timestamptz;

-- ──────────────────────────────────────────────────────────────────────
-- pin_attempts — rate-limit brute force. We can't reliably get the
-- client IP from PostgREST, so we identify by auth.uid() when present
-- and 'anon' otherwise. 10 failed attempts in 5 minutes blocks for
-- 15 minutes.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pin_attempts (
  id bigserial primary key,
  identifier text not null,    -- auth.uid() text or 'anon'
  branch_id uuid references pos_branches(id),
  succeeded boolean default false,
  attempted_at timestamptz default now()
);
create index if not exists pin_attempts_recent_idx on pin_attempts (identifier, attempted_at desc);

alter table pin_attempts enable row level security;
-- Only the function reads/writes this; deny direct access by clients.
revoke all on pin_attempts from authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- verify_pos_pin — server-side PIN verification.
-- Returns { matched, profile?, locked, retry_in_seconds? }.
--
-- Verification strategy:
--   * If the row has pin_salt set, compute SHA-256(pin || pin_salt).
--   * Else legacy: SHA-256(pin || 'noch_salt_2026').
-- Both produce hex strings matching profiles.pin_code.
--
-- Rate limit: 10 failures in last 5 minutes from same identifier →
-- locked for 15 minutes (returns matched=false, locked=true).
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.verify_pos_pin(
  p_pin text,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identifier text;
  v_recent_failures int;
  v_oldest_recent timestamptz;
  v_profile profiles;
  v_matched_id uuid := null;
  v_test_hash text;
  v_lock_window interval := interval '15 minutes';
  v_window      interval := interval '5 minutes';
  v_threshold   int := 10;
begin
  if p_pin is null or length(p_pin) < 4 then
    return jsonb_build_object('matched', false);
  end if;

  v_identifier := coalesce(auth.uid()::text, 'anon');

  -- Lockout check.
  select count(*) filter (where not succeeded), min(attempted_at)
    into v_recent_failures, v_oldest_recent
    from pin_attempts
    where identifier = v_identifier
      and attempted_at > now() - v_lock_window;

  if v_recent_failures >= v_threshold then
    return jsonb_build_object(
      'matched', false,
      'locked', true,
      'retry_in_seconds', extract(epoch from (v_oldest_recent + v_lock_window - now()))::int
    );
  end if;

  -- Walk active profiles. Match either the per-user salt or the legacy
  -- static salt. Note: PINs are 4–6 digits so the keyspace is small;
  -- the rate limit is the actual defence here.
  for v_profile in
    select * from profiles
    where pin_code is not null and is_active = true
  loop
    if v_profile.pin_salt is not null then
      v_test_hash := encode(digest(p_pin || v_profile.pin_salt, 'sha256'), 'hex');
    else
      v_test_hash := encode(digest(p_pin || 'noch_salt_2026',     'sha256'), 'hex');
    end if;
    if v_test_hash = v_profile.pin_code then
      v_matched_id := v_profile.id;
      exit;
    end if;
  end loop;

  insert into pin_attempts (identifier, branch_id, succeeded)
    values (v_identifier, p_branch_id, v_matched_id is not null);

  if v_matched_id is null then
    return jsonb_build_object('matched', false);
  end if;

  return jsonb_build_object(
    'matched', true,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'full_name', v_profile.full_name,
      'role', v_profile.role,
      'photo_url', v_profile.photo_url,
      'department', v_profile.department
    )
  );
end;
$$;

grant execute on function public.verify_pos_pin(text, uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- set_pos_pin — owner-only. Re-hashes with a fresh per-user salt.
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.set_pos_pin(
  p_user_id uuid,
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_salt text;
  v_hash text;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role <> 'owner' then
    raise exception 'only owners can set staff PINs';
  end if;
  if p_new_pin !~ '^\d{4,6}$' then
    raise exception 'PIN must be 4–6 digits';
  end if;
  v_salt := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(p_new_pin || v_salt, 'sha256'), 'hex');
  update profiles
    set pin_code = v_hash, pin_salt = v_salt, pin_updated_at = now()
    where id = p_user_id;

  insert into pos_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'pin_changed', 'profiles', p_user_id, jsonb_build_object('by', auth.uid()));

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_pos_pin(uuid, text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- pos_cash_movements — paid-in, paid-out, safe-drop, tip-out, drawer-pop
-- ──────────────────────────────────────────────────────────────────────
create table if not exists pos_cash_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references pos_branches(id),
  shift_id  uuid references pos_shifts(id),
  movement_type text not null,                 -- 'paid_in'|'paid_out'|'safe_drop'|'tip_out'|'drawer_no_sale'
  amount numeric(10,2) default 0,              -- positive amount; sign comes from type
  reason text,
  actor_user_id uuid references profiles(id),  -- supabase auth user
  served_by uuid references profiles(id),      -- PIN-verified barista
  created_at timestamptz default now()
);
create index if not exists pos_cash_movements_shift_idx
  on pos_cash_movements (shift_id, created_at desc);

alter table pos_cash_movements enable row level security;
create policy "pos_cash_movements_all" on pos_cash_movements
  for all to authenticated using (true) with check (true);

-- Add running cash-in / cash-out totals on the shift so the EOD report
-- doesn't need to re-aggregate.
alter table pos_shifts
  add column if not exists total_paid_in   numeric(10,2) default 0,
  add column if not exists total_paid_out  numeric(10,2) default 0,
  add column if not exists total_tip_out   numeric(10,2) default 0,
  add column if not exists total_safe_drop numeric(10,2) default 0;

-- ──────────────────────────────────────────────────────────────────────
-- record_cash_movement — single RPC; updates expected_cash atomically.
-- Sign convention:
--   paid_in   → expected_cash + amount
--   paid_out  → expected_cash - amount
--   safe_drop → expected_cash - amount   (cash moved to safe)
--   tip_out   → expected_cash - amount   (cash given to staff)
--   drawer_no_sale → no cash change, just an audit row + drawer pop count
-- ──────────────────────────────────────────────────────────────────────
create or replace function public.record_cash_movement(
  p_branch_id uuid,
  p_shift_id  uuid,
  p_movement_type text,
  p_amount numeric,
  p_reason text,
  p_served_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_signed numeric := 0;
begin
  if p_movement_type not in ('paid_in','paid_out','safe_drop','tip_out','drawer_no_sale') then
    raise exception 'invalid movement_type %', p_movement_type;
  end if;
  if p_movement_type <> 'drawer_no_sale' and (p_amount is null or p_amount <= 0) then
    raise exception 'amount must be positive';
  end if;

  insert into pos_cash_movements
    (branch_id, shift_id, movement_type, amount, reason, actor_user_id, served_by)
    values (p_branch_id, p_shift_id, p_movement_type,
            coalesce(p_amount, 0), p_reason, auth.uid(), p_served_by)
    returning id into v_id;

  if p_movement_type = 'paid_in' then v_signed := p_amount;
  elsif p_movement_type in ('paid_out', 'safe_drop', 'tip_out') then v_signed := -p_amount;
  else v_signed := 0;
  end if;

  if p_shift_id is not null and v_signed <> 0 then
    update pos_shifts
      set expected_cash = expected_cash + v_signed,
          total_paid_in   = total_paid_in   + case when p_movement_type='paid_in'   then p_amount else 0 end,
          total_paid_out  = total_paid_out  + case when p_movement_type='paid_out'  then p_amount else 0 end,
          total_safe_drop = total_safe_drop + case when p_movement_type='safe_drop' then p_amount else 0 end,
          total_tip_out   = total_tip_out   + case when p_movement_type='tip_out'   then p_amount else 0 end
      where id = p_shift_id and status = 'open';
  end if;

  insert into pos_audit_log (branch_id, actor_user_id, served_by, action, entity_type, entity_id, metadata)
  values (
    p_branch_id, auth.uid(), p_served_by, 'cash_movement', 'pos_cash_movements', v_id,
    jsonb_build_object(
      'type', p_movement_type,
      'amount', p_amount,
      'reason', p_reason,
      'shift_id', p_shift_id
    )
  );

  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function public.record_cash_movement(uuid, uuid, text, numeric, text, uuid) to authenticated;
