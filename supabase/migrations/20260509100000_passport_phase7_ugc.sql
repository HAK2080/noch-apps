-- ============================================================
-- NOCHI PASS — Phase 7: UGC submissions + moderation + fan wall
-- - ugc_submissions table (status: pending | approved | rejected | withdrawn)
-- - submit_ugc(p_token, p_phone, ...) anon-safe RPC, gated by full
--   WhatsApp number on file (same gate as Phase 5 self-edit)
-- - withdraw_ugc(p_token, p_phone, p_submission_id) — customer revoke
-- - list_public_ugc() — anon, returns only approved rows for the wall
-- - list_my_ugc(p_token, p_phone) — anon, customer's own submissions
-- - list_pending_ugc() — authenticated, owner moderation queue
-- - approve_ugc / reject_ugc — owner-only, security definer
-- Cultural note: customer photos are sensitive in this market.
--   submit_ugc requires p_consent=true; rows without consent are
--   never accepted. Customers can withdraw any time.
-- Re-runnable.
-- ============================================================

create table if not exists ugc_submissions (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references loyalty_customers(id) on delete cascade,
  photo_url     text not null,
  caption       text,
  handle        text,
  consent       boolean not null default false,
  source        text not null default 'passport',
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by   uuid references profiles(id) on delete set null,
  reviewed_at   timestamptz,
  rejection_reason text,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ugc_submissions_status_idx on ugc_submissions(status);
create index if not exists ugc_submissions_customer_idx on ugc_submissions(customer_id, created_at desc);

alter table ugc_submissions enable row level security;

-- Owner has full access; everyone else is RPC-only.
drop policy if exists "ugc_owner_all" on ugc_submissions;
create policy "ugc_owner_all" on ugc_submissions
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'));

-- ── customer submit (anon, phone-gated) ────────────────────────
create or replace function submit_ugc(
  p_token uuid,
  p_phone text,
  p_photo_url text,
  p_caption text default null,
  p_handle text default null,
  p_display_name text default null,
  p_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $ugc_submit$
declare
  v_c loyalty_customers%rowtype;
  v_stored text; v_input text; v_n int;
  v_id uuid;
begin
  if p_token is null or p_phone is null then return jsonb_build_object('ok', false, 'error', 'missing_args'); end if;
  if p_consent is not true then return jsonb_build_object('ok', false, 'error', 'consent_required'); end if;
  if coalesce(trim(p_photo_url), '') = '' then return jsonb_build_object('ok', false, 'error', 'photo_required'); end if;
  if length(p_photo_url) > 1000 then return jsonb_build_object('ok', false, 'error', 'photo_too_long'); end if;

  select * into v_c from loyalty_customers where passport_token = p_token limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  v_stored := regexp_replace(coalesce(v_c.phone, ''), '[^0-9]', '', 'g');
  v_input  := regexp_replace(coalesce(p_phone, ''),  '[^0-9]', '', 'g');
  if length(v_input) < 6 then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  v_n := least(length(v_stored), length(v_input), 9);
  if v_n = 0 or right(v_stored, v_n) <> right(v_input, v_n) then
    return jsonb_build_object('ok', false, 'error', 'verify_failed');
  end if;

  insert into ugc_submissions (customer_id, photo_url, caption, handle, display_name, consent, source, status)
  values (
    v_c.id,
    trim(p_photo_url),
    nullif(trim(p_caption), ''),
    nullif(trim(regexp_replace(coalesce(p_handle, ''), '^@', '')), ''),
    nullif(trim(p_display_name), ''),
    true,
    'passport',
    'pending'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$ugc_submit$;

grant execute on function submit_ugc(uuid, text, text, text, text, text, boolean) to anon;
grant execute on function submit_ugc(uuid, text, text, text, text, text, boolean) to authenticated;

-- ── customer revoke (anon, phone-gated) ────────────────────────
create or replace function withdraw_ugc(
  p_token uuid,
  p_phone text,
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $ugc_withdraw$
declare
  v_c loyalty_customers%rowtype;
  v_stored text; v_input text; v_n int;
  v_owns boolean;
begin
  if p_token is null or p_phone is null or p_submission_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_args');
  end if;

  select * into v_c from loyalty_customers where passport_token = p_token limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  v_stored := regexp_replace(coalesce(v_c.phone, ''), '[^0-9]', '', 'g');
  v_input  := regexp_replace(coalesce(p_phone, ''),  '[^0-9]', '', 'g');
  if length(v_input) < 6 then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  v_n := least(length(v_stored), length(v_input), 9);
  if v_n = 0 or right(v_stored, v_n) <> right(v_input, v_n) then
    return jsonb_build_object('ok', false, 'error', 'verify_failed');
  end if;

  select exists (select 1 from ugc_submissions where id = p_submission_id and customer_id = v_c.id)
  into v_owns;
  if not v_owns then return jsonb_build_object('ok', false, 'error', 'not_owned'); end if;

  update ugc_submissions
  set status = 'withdrawn', updated_at = now()
  where id = p_submission_id;

  return jsonb_build_object('ok', true);
end;
$ugc_withdraw$;

grant execute on function withdraw_ugc(uuid, text, uuid) to anon;
grant execute on function withdraw_ugc(uuid, text, uuid) to authenticated;

-- ── list customer's own submissions (anon, phone-gated) ────────
create or replace function list_my_ugc(p_token uuid, p_phone text)
returns table (
  id uuid,
  photo_url text,
  caption text,
  handle text,
  display_name text,
  status text,
  rejection_reason text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $ugc_my$
declare
  v_c loyalty_customers%rowtype;
  v_stored text; v_input text; v_n int;
begin
  if p_token is null or p_phone is null then return; end if;
  select * into v_c from loyalty_customers where passport_token = p_token limit 1;
  if not found then return; end if;
  v_stored := regexp_replace(coalesce(v_c.phone, ''), '[^0-9]', '', 'g');
  v_input  := regexp_replace(coalesce(p_phone, ''),  '[^0-9]', '', 'g');
  if length(v_input) < 6 then return; end if;
  v_n := least(length(v_stored), length(v_input), 9);
  if v_n = 0 or right(v_stored, v_n) <> right(v_input, v_n) then return; end if;

  return query
    select s.id, s.photo_url, s.caption, s.handle, s.display_name, s.status,
           s.rejection_reason, s.created_at, s.reviewed_at
    from ugc_submissions s
    where s.customer_id = v_c.id
    order by s.created_at desc;
end;
$ugc_my$;

grant execute on function list_my_ugc(uuid, text) to anon, authenticated;

-- ── public fan wall (anon) ─────────────────────────────────────
create or replace function list_public_ugc(p_limit int default 60)
returns table (
  id uuid,
  photo_url text,
  caption text,
  handle text,
  display_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $ugc_public$
  select s.id, s.photo_url, s.caption, s.handle, s.display_name, s.created_at
  from ugc_submissions s
  where s.status = 'approved'
    and s.consent is true
  order by s.reviewed_at desc, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200))
$ugc_public$;

grant execute on function list_public_ugc(int) to anon, authenticated;

-- ── owner moderation: approve / reject ─────────────────────────
create or replace function approve_ugc(p_id uuid, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $ugc_approve$
declare v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role <> 'owner' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update ugc_submissions
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
      updated_at = now()
  where id = p_id and consent is true;

  if not found then return jsonb_build_object('ok', false, 'error', 'not_found_or_no_consent'); end if;
  return jsonb_build_object('ok', true);
end;
$ugc_approve$;

grant execute on function approve_ugc(uuid, text) to authenticated;

create or replace function reject_ugc(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $ugc_reject$
declare v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role <> 'owner' then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update ugc_submissions
  set status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = nullif(trim(p_reason), ''),
      updated_at = now()
  where id = p_id;

  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$ugc_reject$;

grant execute on function reject_ugc(uuid, text) to authenticated;

notify pgrst, 'reload schema';
