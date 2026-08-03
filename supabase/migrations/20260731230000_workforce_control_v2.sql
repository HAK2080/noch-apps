-- Workforce control V2: employee scope, attendance evidence, scheduling,
-- payroll readiness, privacy, and payment evidence.
--
-- Existing profile, attendance, payroll, loan, and GL records are preserved.
-- The existing July payroll draft remains a legacy draft until the owner
-- explicitly regenerates it after resolving its visible configuration gaps.

-- ── Workforce identity ──────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists is_employee boolean not null default false,
  add column if not exists payroll_enabled boolean not null default false,
  add column if not exists employment_end_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_employment_dates_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_employment_dates_check
      check (
        employment_end_date is null
        or start_date is null
        or employment_end_date >= start_date
      );
  end if;
end;
$$;

-- Owner login profiles are not employees by default. Existing non-owner team
-- profiles remain in the workforce and retain their active/former state.
update public.profiles
set is_employee = true
where role in ('staff', 'limited_staff', 'supervisor', 'accountant', 'data_entry');

update public.profiles
set payroll_enabled = true
where is_employee
  and coalesce(is_active, true)
  and (
    coalesce(monthly_salary, monthly_salary_lyd, 0) > 0
    or coalesce(hourly_rate_lyd, hourly_rate, 0) > 0
  );

create index if not exists profiles_workforce_active_idx
  on public.profiles(is_employee, is_active)
  where is_employee;

create or replace function public.workforce_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and (
        profile.role = 'owner'
        or (
          profile.role = 'supervisor'
          and coalesce(profile.is_active, true)
        )
      )
  );
$$;

create or replace function public.workforce_can_view_payroll()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and (
        profile.role = 'owner'
        or (
          profile.role = 'accountant'
          and coalesce(profile.is_active, true)
        )
      )
  );
$$;

grant execute on function public.workforce_can_manage() to authenticated;
grant execute on function public.workforce_can_view_payroll() to authenticated;

create or replace function public.workforce_team_v2()
returns table (
  id uuid,
  full_name text,
  role text,
  phone text,
  email text,
  telegram_chat_id text,
  branch_id uuid,
  department text,
  employment_type text,
  start_date date,
  employment_end_date date,
  is_active boolean,
  is_employee boolean,
  photo_url text,
  monthly_salary numeric,
  monthly_hours numeric,
  hourly_rate_lyd numeric,
  payroll_cost_center_id text,
  payroll_enabled boolean,
  days_off smallint[],
  overtime_exempt boolean,
  role_requested text,
  role_approved boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.full_name,
    profile.role,
    case when public.workforce_can_manage() then profile.phone else null end,
    case when public.workforce_can_manage() then profile.email else null end,
    case when public.workforce_can_manage() then profile.telegram_chat_id else null end,
    profile.branch_id,
    profile.department,
    profile.employment_type,
    profile.start_date,
    profile.employment_end_date,
    profile.is_active,
    profile.is_employee,
    profile.photo_url,
    case when public.workforce_can_view_payroll() then
      coalesce(profile.monthly_salary, profile.monthly_salary_lyd)
    else null end,
    case when public.workforce_can_view_payroll() then profile.monthly_hours else null end,
    case when public.workforce_can_view_payroll() then
      coalesce(profile.hourly_rate_lyd, profile.hourly_rate)
    else null end,
    case when public.workforce_can_view_payroll() then
      profile.payroll_cost_center_id
    else null end,
    case when public.workforce_can_view_payroll() then
      profile.payroll_enabled
    else false end,
    profile.days_off,
    profile.overtime_exempt,
    profile.role_requested,
    profile.role_approved,
    profile.created_at,
    profile.updated_at
  from public.profiles profile
  where profile.is_employee
  order by profile.full_name;
$$;

grant execute on function public.workforce_team_v2() to authenticated;

-- ── Attendance evidence ─────────────────────────────────────────────────────

alter table public.pos_shift_attendees
  add column if not exists recorded_by uuid references public.profiles(id),
  add column if not exists source text not null default 'pos',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists edit_reason text;

alter table public.pos_shift_attendees
  drop constraint if exists pos_shift_attendees_shift_id_user_id_key;

drop index if exists public.pos_shift_attendees_one_open_idx;
create unique index pos_shift_attendees_one_open_idx
  on public.pos_shift_attendees(shift_id, user_id)
  where clocked_out_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_shift_attendees_time_check'
      and conrelid = 'public.pos_shift_attendees'::regclass
  ) then
    alter table public.pos_shift_attendees
      add constraint pos_shift_attendees_time_check
      check (
        clocked_out_at is null
        or (
          clocked_out_at >= clocked_in_at
          and clocked_out_at <= clocked_in_at + interval '24 hours'
        )
      ) not valid;
  end if;
end;
$$;

create table if not exists public.workforce_attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references public.pos_shift_attendees(id),
  before_state jsonb not null,
  after_state jsonb not null,
  reason text not null check (length(trim(reason)) >= 4),
  corrected_by uuid not null references public.profiles(id),
  corrected_at timestamptz not null default now()
);

create index if not exists workforce_attendance_corrections_attendee_idx
  on public.workforce_attendance_corrections(attendee_id, corrected_at desc);

alter table public.workforce_attendance_corrections enable row level security;

drop policy if exists workforce_attendance_corrections_read
  on public.workforce_attendance_corrections;
create policy workforce_attendance_corrections_read
  on public.workforce_attendance_corrections
  for select to authenticated
  using (
    public.workforce_can_manage()
    or attendee_id in (
      select attendee.id
      from public.pos_shift_attendees attendee
      where attendee.user_id = auth.uid()
    )
  );

drop policy if exists "pos_shift_attendees_all"
  on public.pos_shift_attendees;
drop policy if exists workforce_attendance_read
  on public.pos_shift_attendees;
create policy workforce_attendance_read
  on public.pos_shift_attendees
  for select to authenticated
  using (
    public.workforce_can_manage()
    or user_id = auth.uid()
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = auth.uid()
        and viewer.role = 'accountant'
        and coalesce(viewer.is_active, true)
    )
  );

revoke insert, update, delete on public.pos_shift_attendees from authenticated;
grant select on public.pos_shift_attendees to authenticated;
grant select on public.workforce_attendance_corrections to authenticated;

create or replace function public.workforce_clock_in_v2(
  p_shift_id uuid,
  p_user_id uuid,
  p_branch_id uuid,
  p_source text default 'pos'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
  target_shift public.pos_shifts;
  attendee_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.workforce_can_manage() and p_user_id <> auth.uid() then
    raise exception 'staff may only clock themselves in';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = p_user_id;

  if not found
    or not coalesce(target_profile.is_employee, false)
    or not coalesce(target_profile.is_active, false)
  then
    raise exception 'active employee not found';
  end if;

  select *
  into target_shift
  from public.pos_shifts
  where id = p_shift_id
  for update;

  if not found or target_shift.status <> 'open' then
    raise exception 'attendance requires an open POS shift';
  end if;
  if target_shift.branch_id <> p_branch_id then
    raise exception 'attendance branch does not match the open shift';
  end if;

  select id
  into attendee_id
  from public.pos_shift_attendees
  where shift_id = p_shift_id
    and user_id = p_user_id
    and clocked_out_at is null;

  if attendee_id is not null then
    return jsonb_build_object('id', attendee_id, 'status', 'already_open');
  end if;

  insert into public.pos_shift_attendees (
    shift_id,
    user_id,
    branch_id,
    clocked_in_at,
    recorded_by,
    source
  )
  values (
    p_shift_id,
    p_user_id,
    p_branch_id,
    now(),
    auth.uid(),
    coalesce(nullif(trim(p_source), ''), 'pos')
  )
  returning id into attendee_id;

  insert into public.pos_audit_log (
    branch_id,
    actor_user_id,
    served_by,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_branch_id,
    auth.uid(),
    p_user_id,
    'clock_in',
    'pos_shift_attendees',
    attendee_id,
    jsonb_build_object('shift_id', p_shift_id, 'source', p_source)
  );

  return jsonb_build_object('id', attendee_id, 'status', 'clocked_in');
end;
$$;

create or replace function public.workforce_clock_out_v2(
  p_shift_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  attendee public.pos_shift_attendees;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.workforce_can_manage() and p_user_id <> auth.uid() then
    raise exception 'staff may only clock themselves out';
  end if;

  select *
  into attendee
  from public.pos_shift_attendees
  where shift_id = p_shift_id
    and user_id = p_user_id
    and clocked_out_at is null
  order by clocked_in_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_clocked_in');
  end if;

  update public.pos_shift_attendees
  set clocked_out_at = now(),
      updated_at = now()
  where id = attendee.id;

  insert into public.pos_audit_log (
    branch_id,
    actor_user_id,
    served_by,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    attendee.branch_id,
    auth.uid(),
    p_user_id,
    'clock_out',
    'pos_shift_attendees',
    attendee.id,
    jsonb_build_object('shift_id', p_shift_id)
  );

  return jsonb_build_object('ok', true, 'id', attendee.id);
end;
$$;

create or replace function public.workforce_correct_attendance_v2(
  p_attendee_id uuid,
  p_clocked_in_at timestamptz,
  p_clocked_out_at timestamptz,
  p_hourly_rate_override_lyd numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  before_row public.pos_shift_attendees;
  after_row public.pos_shift_attendees;
begin
  if not public.workforce_can_manage() then
    raise exception 'owner or active supervisor required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 4 then
    raise exception 'a correction reason is required';
  end if;
  if p_clocked_in_at is null
    or p_clocked_out_at is null
    or p_clocked_out_at < p_clocked_in_at
    or p_clocked_out_at > p_clocked_in_at + interval '24 hours'
  then
    raise exception 'attendance times must describe a closed interval of 24 hours or less';
  end if;

  select *
  into before_row
  from public.pos_shift_attendees
  where id = p_attendee_id
  for update;

  if not found then
    raise exception 'attendance record not found';
  end if;

  update public.pos_shift_attendees
  set clocked_in_at = p_clocked_in_at,
      clocked_out_at = p_clocked_out_at,
      hourly_rate_override_lyd = p_hourly_rate_override_lyd,
      edit_reason = trim(p_reason),
      updated_at = now()
  where id = p_attendee_id
  returning * into after_row;

  insert into public.workforce_attendance_corrections (
    attendee_id,
    before_state,
    after_state,
    reason,
    corrected_by
  )
  values (
    p_attendee_id,
    to_jsonb(before_row),
    to_jsonb(after_row),
    trim(p_reason),
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'id', p_attendee_id);
end;
$$;

create or replace function public.clock_in_attendee(
  p_shift_id uuid,
  p_user_id uuid,
  p_branch_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.workforce_clock_in_v2(
    p_shift_id,
    p_user_id,
    p_branch_id,
    'pos'
  );
$$;

create or replace function public.clock_out_attendee(
  p_shift_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.workforce_clock_out_v2(p_shift_id, p_user_id);
$$;

grant execute on function public.workforce_clock_in_v2(uuid, uuid, uuid, text)
  to authenticated;
grant execute on function public.workforce_clock_out_v2(uuid, uuid)
  to authenticated;
grant execute on function public.workforce_correct_attendance_v2(
  uuid,
  timestamptz,
  timestamptz,
  numeric,
  text
) to authenticated;
grant execute on function public.clock_in_attendee(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.clock_out_attendee(uuid, uuid)
  to authenticated;

create or replace view public.workforce_attendance_v2
with (security_invoker = true) as
select
  attendee.id as attendee_id,
  attendee.shift_id,
  attendee.user_id as profile_id,
  profile.full_name,
  attendee.branch_id,
  branch.name as branch_name,
  attendee.clocked_in_at,
  attendee.clocked_out_at,
  (
    attendee.clocked_in_at at time zone 'Africa/Tripoli'
    - interval '5 hours'
  )::date as business_day,
  case
    when attendee.clocked_out_at is null then null
    else round(
      greatest(
        0,
        extract(epoch from attendee.clocked_out_at - attendee.clocked_in_at)
          / 3600
      )::numeric,
      2
    )
  end as closed_hours,
  case
    when attendee.clocked_out_at is null
      and attendee.clocked_in_at < now() - interval '16 hours'
      then 'stale_open'
    when attendee.clocked_out_at is null then 'open'
    when attendee.clocked_out_at < attendee.clocked_in_at then 'invalid'
    else 'closed'
  end as attendance_status,
  attendee.source,
  attendee.recorded_by,
  attendee.updated_at,
  attendee.edit_reason,
  exists (
    select 1
    from public.workforce_attendance_corrections correction
    where correction.attendee_id = attendee.id
  ) as corrected
from public.pos_shift_attendees attendee
join public.profiles profile on profile.id = attendee.user_id
join public.pos_branches branch on branch.id = attendee.branch_id;

grant select on public.workforce_attendance_v2 to authenticated;

-- Open attendance is visibly open and contributes no payroll hours or cost.
create or replace view public.shift_labor_cost as
select
  attendee.id as attendee_id,
  attendee.shift_id,
  attendee.user_id,
  attendee.branch_id,
  attendee.clocked_in_at,
  attendee.clocked_out_at,
  coalesce(
    attendee.hourly_rate_override_lyd,
    profile.hourly_rate_lyd,
    profile.hourly_rate,
    0
  ) as hourly_rate_lyd,
  calculation.hours,
  case
    when calculation.hours is null then null
    else (
      (
        calculation.regular_hours
        + calculation.overtime_hours * calculation.overtime_multiplier
      )
      * coalesce(
          attendee.hourly_rate_override_lyd,
          profile.hourly_rate_lyd,
          profile.hourly_rate,
          0
        )
      * calculation.extra_day_multiplier
    )
  end as labor_cost_lyd,
  calculation.regular_hours,
  calculation.overtime_hours,
  calculation.extra_day_multiplier <> 1 as is_extra_day,
  calculation.overtime_multiplier as overtime_multiplier_applied,
  calculation.extra_day_multiplier as extra_day_multiplier_applied,
  case
    when attendee.clocked_out_at is null then 'open'
    when coalesce(
      attendee.hourly_rate_override_lyd,
      profile.hourly_rate_lyd,
      profile.hourly_rate,
      0
    ) <= 0 then 'missing_rate'
    else 'ready'
  end as data_status
from public.pos_shift_attendees attendee
left join public.profiles profile on profile.id = attendee.user_id
left join lateral (
  select *
  from public.finance_settings
  where id = 'default'
) settings on true
cross join lateral (
  select
    base.hours,
    case
      when base.hours is null then null
      when coalesce(settings.overtime_enabled, false)
        and not coalesce(profile.overtime_exempt, false)
        then least(
          base.hours,
          coalesce(settings.overtime_daily_threshold_hours, 8)
        )
      else base.hours
    end as regular_hours,
    case
      when base.hours is null then null
      when coalesce(settings.overtime_enabled, false)
        and not coalesce(profile.overtime_exempt, false)
        then greatest(
          0,
          base.hours - coalesce(settings.overtime_daily_threshold_hours, 8)
        )
      else 0
    end as overtime_hours,
    case
      when coalesce(settings.overtime_enabled, false)
        and not coalesce(profile.overtime_exempt, false)
        then coalesce(settings.overtime_multiplier, 1.5)
      else 1
    end as overtime_multiplier,
    case
      when coalesce(settings.extra_day_enabled, false)
        and (
          extract(
            isodow
            from attendee.clocked_in_at at time zone 'Africa/Tripoli'
          )::smallint = any (
            coalesce(settings.weekend_days, '{}'::smallint[])
          )
          or extract(
            isodow
            from attendee.clocked_in_at at time zone 'Africa/Tripoli'
          )::smallint = any (
            coalesce(profile.days_off, '{}'::smallint[])
          )
        )
        then coalesce(settings.extra_day_multiplier, 2)
      else 1
    end as extra_day_multiplier
  from (
    select
      case
        when attendee.clocked_out_at is null then null
        else greatest(
          0,
          extract(
            epoch from attendee.clocked_out_at - attendee.clocked_in_at
          ) / 3600
        )
      end as hours
  ) base
) calculation;

revoke select on public.shift_labor_cost from authenticated;

-- ── Scheduling ──────────────────────────────────────────────────────────────

create table if not exists public.workforce_schedule_shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  branch_id uuid not null references public.pos_branches(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'cancelled')),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  check (ends_at > starts_at),
  check (ends_at <= starts_at + interval '24 hours')
);

create index if not exists workforce_schedule_week_idx
  on public.workforce_schedule_shifts(starts_at, status);
create index if not exists workforce_schedule_profile_idx
  on public.workforce_schedule_shifts(profile_id, starts_at);

alter table public.workforce_schedule_shifts enable row level security;

drop policy if exists workforce_schedule_read
  on public.workforce_schedule_shifts;
create policy workforce_schedule_read
  on public.workforce_schedule_shifts
  for select to authenticated
  using (
    public.workforce_can_manage()
    or profile_id = auth.uid()
    or status = 'published'
  );

revoke insert, update, delete on public.workforce_schedule_shifts
  from authenticated;
grant select on public.workforce_schedule_shifts to authenticated;

create or replace function public.workforce_upsert_schedule_shift_v2(
  p_id uuid,
  p_profile_id uuid,
  p_branch_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result_id uuid;
begin
  if not public.workforce_can_manage() then
    raise exception 'owner or active supervisor required';
  end if;
  if p_starts_at is null
    or p_ends_at is null
    or p_ends_at <= p_starts_at
    or p_ends_at > p_starts_at + interval '24 hours'
  then
    raise exception 'schedule shift must be between 0 and 24 hours';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_profile_id
      and profile.is_employee
      and coalesce(profile.is_active, false)
  ) then
    raise exception 'active employee not found';
  end if;
  if exists (
    select 1
    from public.workforce_schedule_shifts schedule
    where schedule.profile_id = p_profile_id
      and schedule.status <> 'cancelled'
      and schedule.id is distinct from p_id
      and tstzrange(schedule.starts_at, schedule.ends_at, '[)')
        && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'employee already has an overlapping scheduled shift';
  end if;

  if p_id is null then
    insert into public.workforce_schedule_shifts (
      profile_id,
      branch_id,
      starts_at,
      ends_at,
      note,
      created_by
    )
    values (
      p_profile_id,
      p_branch_id,
      p_starts_at,
      p_ends_at,
      nullif(trim(p_note), ''),
      auth.uid()
    )
    returning id into result_id;
  else
    update public.workforce_schedule_shifts
    set profile_id = p_profile_id,
        branch_id = p_branch_id,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        note = nullif(trim(p_note), ''),
        status = 'draft',
        published_by = null,
        published_at = null,
        updated_at = now()
    where id = p_id
    returning id into result_id;

    if result_id is null then
      raise exception 'scheduled shift not found';
    end if;
  end if;

  return result_id;
end;
$$;

create or replace function public.workforce_publish_schedule_week_v2(
  p_week_start date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  week_start date := p_week_start
    - (extract(isodow from p_week_start)::integer - 1);
  changed integer;
begin
  if not public.workforce_can_manage() then
    raise exception 'owner or active supervisor required';
  end if;

  update public.workforce_schedule_shifts
  set status = 'published',
      published_by = auth.uid(),
      published_at = now(),
      updated_at = now()
  where status = 'draft'
    and (
      starts_at at time zone 'Africa/Tripoli'
    )::date >= week_start
    and (
      starts_at at time zone 'Africa/Tripoli'
    )::date < week_start + 7;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.workforce_cancel_schedule_shift_v2(
  p_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.workforce_can_manage() then
    raise exception 'owner or active supervisor required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 4 then
    raise exception 'a cancellation reason is required';
  end if;

  update public.workforce_schedule_shifts
  set status = 'cancelled',
      note = concat_ws(
        ' | ',
        nullif(note, ''),
        'Cancelled: ' || trim(p_reason)
      ),
      updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'scheduled shift not found';
  end if;
  return p_id;
end;
$$;

grant execute on function public.workforce_upsert_schedule_shift_v2(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text
) to authenticated;
grant execute on function public.workforce_publish_schedule_week_v2(date)
  to authenticated;
grant execute on function public.workforce_cancel_schedule_shift_v2(uuid, text)
  to authenticated;

-- ── Payroll evidence and lifecycle ─────────────────────────────────────────

alter table public.payroll_runs
  add column if not exists evidence_status text not null default 'legacy',
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.profiles(id),
  add column if not exists payment_account_id uuid references public.gl_accounts(id),
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists payment_journal_batch_id uuid
    references public.gl_journal_batches(id);

alter table public.payroll_runs
  drop constraint if exists payroll_runs_status_check;
alter table public.payroll_runs
  add constraint payroll_runs_status_check
  check (status in ('draft', 'completed', 'paid'));

alter table public.payroll_runs
  drop constraint if exists payroll_runs_evidence_status_check;
alter table public.payroll_runs
  add constraint payroll_runs_evidence_status_check
  check (evidence_status in ('legacy', 'blocked', 'warning', 'ready', 'reconciled'));

alter table public.payroll_run_items
  add column if not exists pay_basis text,
  add column if not exists source_hours numeric,
  add column if not exists source_rate_lyd numeric,
  add column if not exists scheduled_hours numeric,
  add column if not exists data_status text not null default 'legacy',
  add column if not exists data_issues jsonb not null default '[]'::jsonb;

alter table public.payroll_run_items
  drop constraint if exists payroll_run_items_pay_basis_check;
alter table public.payroll_run_items
  add constraint payroll_run_items_pay_basis_check
  check (pay_basis is null or pay_basis in ('salary', 'hourly', 'unconfigured'));

alter table public.payroll_run_items
  drop constraint if exists payroll_run_items_data_status_check;
alter table public.payroll_run_items
  add constraint payroll_run_items_data_status_check
  check (data_status in ('legacy', 'blocked', 'warning', 'ready'));

create table if not exists public.payroll_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  run_item_id uuid not null references public.payroll_run_items(id)
    on delete cascade,
  loan_id uuid not null references public.staff_loans(id),
  profile_id uuid not null references public.profiles(id),
  amount_lyd numeric not null check (amount_lyd > 0),
  created_at timestamptz not null default now(),
  unique (run_id, loan_id)
);

create index if not exists payroll_loan_repayments_profile_idx
  on public.payroll_loan_repayments(profile_id, created_at);

alter table public.payroll_loan_repayments enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'payroll_runs',
        'payroll_run_items',
        'staff_loans',
        'labor_adjustments',
        'payroll_loan_repayments'
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end;
$$;

create policy payroll_runs_private_read
  on public.payroll_runs
  for select to authenticated
  using (public.workforce_can_view_payroll());
create policy payroll_runs_owner_write
  on public.payroll_runs
  for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  );

create policy payroll_run_items_private_read
  on public.payroll_run_items
  for select to authenticated
  using (public.workforce_can_view_payroll());
create policy payroll_run_items_owner_write
  on public.payroll_run_items
  for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  );

create policy staff_loans_private_read
  on public.staff_loans
  for select to authenticated
  using (public.workforce_can_view_payroll());
create policy staff_loans_owner_write
  on public.staff_loans
  for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  );

create policy labor_adjustments_private_read
  on public.labor_adjustments
  for select to authenticated
  using (public.workforce_can_view_payroll());
create policy labor_adjustments_owner_write
  on public.labor_adjustments
  for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  );

create policy payroll_loan_repayments_private_read
  on public.payroll_loan_repayments
  for select to authenticated
  using (public.workforce_can_view_payroll());
create policy payroll_loan_repayments_owner_write
  on public.payroll_loan_repayments
  for all to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'owner'
    )
  );

grant select, insert, update, delete on public.payroll_runs to authenticated;
grant select, insert, update, delete on public.payroll_run_items to authenticated;
grant select, insert, update, delete on public.staff_loans to authenticated;
grant select, insert, update, delete on public.labor_adjustments to authenticated;
grant select, insert, update, delete on public.payroll_loan_repayments
  to authenticated;

drop view if exists public.staff_loan_balances;
create view public.staff_loan_balances
with (security_invoker = true) as
select
  loan.id as loan_id,
  loan.profile_id,
  loan.amount_lyd,
  loan.monthly_repayment_lyd,
  loan.start_month,
  loan.status,
  coalesce((
    select sum(repayment.amount_lyd)
    from public.payroll_loan_repayments repayment
    join public.payroll_runs run on run.id = repayment.run_id
    where repayment.loan_id = loan.id
      and run.status in ('completed', 'paid')
  ), 0) as repaid_lyd,
  greatest(
    0,
    loan.amount_lyd - coalesce((
      select sum(repayment.amount_lyd)
      from public.payroll_loan_repayments repayment
      join public.payroll_runs run on run.id = repayment.run_id
      where repayment.loan_id = loan.id
        and run.status in ('completed', 'paid')
    ), 0)
  ) as remaining_lyd
from public.staff_loans loan;

grant select on public.staff_loan_balances to authenticated;

create or replace function public.payroll_generate_run(p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  month_end date := (
    date_trunc('month', p_month)
    + interval '1 month - 1 day'
  )::date;
  v_run_id uuid;
  item_row record;
  issue_list jsonb;
  item_status text;
  pay_basis_value text;
  base_value numeric;
  attendance_hours numeric;
  attendance_pay numeric;
  schedule_hours numeric;
  adjustment_overtime numeric;
  adjustment_bonus numeric;
  adjustment_deduction numeric;
  run_total numeric;
  blocked_count integer;
  warning_count integer;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'owner'
  ) then
    raise exception 'owner only';
  end if;

  select id
  into v_run_id
  from public.payroll_runs
  where period_month = month_start
  for update;

  if v_run_id is not null and exists (
    select 1
    from public.payroll_runs
    where id = v_run_id
      and status in ('completed', 'paid')
  ) then
    raise exception 'payroll run for % is already approved', to_char(month_start, 'YYYY-MM');
  end if;

  if v_run_id is null then
    insert into public.payroll_runs (
      period_month,
      status,
      evidence_status,
      created_by
    )
    values (
      month_start,
      'draft',
      'blocked',
      auth.uid()
    )
    returning id into v_run_id;
  else
    delete from public.payroll_run_items
    where run_id = v_run_id;
  end if;

  for item_row in
    select profile.*
    from public.profiles profile
    where profile.is_employee
      and profile.payroll_enabled
      and (
        coalesce(profile.is_active, false)
        or profile.employment_end_date >= month_start
      )
      and (
        profile.start_date is null
        or profile.start_date <= month_end
      )
    order by profile.full_name
  loop
    issue_list := '[]'::jsonb;
    item_status := 'ready';
    attendance_hours := 0;
    attendance_pay := 0;
    schedule_hours := 0;
    base_value := 0;

    if coalesce(item_row.monthly_salary, item_row.monthly_salary_lyd, 0) > 0 then
      pay_basis_value := 'salary';
    elsif coalesce(item_row.hourly_rate_lyd, item_row.hourly_rate, 0) > 0 then
      pay_basis_value := 'hourly';
    else
      pay_basis_value := 'unconfigured';
      issue_list := issue_list || '["missing_pay_basis"]'::jsonb;
      item_status := 'blocked';
    end if;

    if item_row.start_date is null then
      issue_list := issue_list || '["missing_start_date"]'::jsonb;
      item_status := 'blocked';
    end if;

    if item_row.branch_id is null
      and item_row.payroll_cost_center_id is null
    then
      issue_list := issue_list || '["missing_cost_allocation"]'::jsonb;
      item_status := 'blocked';
    end if;

    select
      coalesce(sum(cost.hours), 0),
      coalesce(sum(cost.labor_cost_lyd), 0)
    into attendance_hours, attendance_pay
    from public.shift_labor_cost cost
    where cost.user_id = item_row.id
      and cost.clocked_in_at >= (
        month_start::timestamp + interval '5 hours'
      ) at time zone 'Africa/Tripoli'
      and cost.clocked_in_at < (
        (month_end + 1)::timestamp + interval '5 hours'
      ) at time zone 'Africa/Tripoli'
      and cost.clocked_out_at is not null;

    select coalesce(
      sum(
        extract(epoch from schedule.ends_at - schedule.starts_at) / 3600
      ),
      0
    )
    into schedule_hours
    from public.workforce_schedule_shifts schedule
    where schedule.profile_id = item_row.id
      and schedule.status = 'published'
      and schedule.starts_at >= month_start::timestamp
        at time zone 'Africa/Tripoli'
      and schedule.starts_at < (month_end + 1)::timestamp
        at time zone 'Africa/Tripoli';

    if pay_basis_value = 'salary' and item_status <> 'blocked' then
      base_value := round(
        coalesce(item_row.monthly_salary, item_row.monthly_salary_lyd, 0)
        * (
          least(month_end, coalesce(item_row.employment_end_date, month_end))
          - greatest(month_start, item_row.start_date)
          + 1
        )::numeric
        / extract(day from month_end),
        2
      );
    elsif pay_basis_value = 'hourly' then
      base_value := round(attendance_pay, 2);
      if attendance_hours = 0 then
        issue_list := issue_list || '["no_closed_attendance"]'::jsonb;
        if item_status = 'ready' then
          item_status := 'warning';
        end if;
      end if;
    end if;

    if schedule_hours = 0 then
      issue_list := issue_list || '["no_published_schedule"]'::jsonb;
      if item_status = 'ready' then
        item_status := 'warning';
      end if;
    end if;

    if exists (
      select 1
      from public.pos_shift_attendees attendee
      where attendee.user_id = item_row.id
        and attendee.clocked_out_at is null
        and attendee.clocked_in_at < (
          (month_end + 1)::timestamp + interval '5 hours'
        ) at time zone 'Africa/Tripoli'
    ) then
      issue_list := issue_list || '["open_attendance"]'::jsonb;
      item_status := 'blocked';
    end if;

    select
      coalesce(sum(amount_lyd) filter (where kind = 'overtime'), 0),
      coalesce(sum(amount_lyd) filter (where kind = 'bonus'), 0),
      coalesce(sum(amount_lyd) filter (where kind = 'deduction'), 0)
    into
      adjustment_overtime,
      adjustment_bonus,
      adjustment_deduction
    from public.labor_adjustments adjustment
    where adjustment.profile_id = item_row.id
      and adjustment.adjustment_date >= month_start
      and adjustment.adjustment_date <= month_end;

    insert into public.payroll_run_items (
      run_id,
      profile_id,
      branch_id,
      base_lyd,
      overtime_lyd,
      bonus_lyd,
      deduction_lyd,
      loan_repayment_lyd,
      pay_basis,
      source_hours,
      source_rate_lyd,
      scheduled_hours,
      data_status,
      data_issues
    )
    values (
      v_run_id,
      item_row.id,
      item_row.branch_id,
      base_value,
      adjustment_overtime,
      adjustment_bonus,
      adjustment_deduction,
      0,
      pay_basis_value,
      attendance_hours,
      coalesce(item_row.hourly_rate_lyd, item_row.hourly_rate),
      schedule_hours,
      item_status,
      issue_list
    )
    returning * into item_row;

    insert into public.payroll_loan_repayments (
      run_id,
      run_item_id,
      loan_id,
      profile_id,
      amount_lyd
    )
    select
      v_run_id,
      item_row.id,
      balance.loan_id,
      item_row.profile_id,
      least(balance.monthly_repayment_lyd, balance.remaining_lyd)
    from public.staff_loan_balances balance
    where balance.profile_id = item_row.profile_id
      and balance.status = 'active'
      and balance.start_month <= month_start
      and balance.remaining_lyd > 0;

    update public.payroll_run_items item
    set loan_repayment_lyd = coalesce((
      select sum(repayment.amount_lyd)
      from public.payroll_loan_repayments repayment
      where repayment.run_item_id = item.id
    ), 0)
    where item.id = item_row.id;
  end loop;

  select
    coalesce(sum(item.net_lyd), 0),
    count(*) filter (where item.data_status = 'blocked'),
    count(*) filter (where item.data_status = 'warning')
  into run_total, blocked_count, warning_count
  from public.payroll_run_items item
  where item.run_id = v_run_id;

  update public.payroll_runs
  set total_lyd = run_total,
      evidence_status = case
        when not exists (
          select 1
          from public.payroll_run_items item
          where item.run_id = v_run_id
        ) then 'blocked'
        when blocked_count > 0 then 'blocked'
        when warning_count > 0 then 'warning'
        else 'ready'
      end,
      source_snapshot = jsonb_build_object(
        'generated_at', now(),
        'timezone', 'Africa/Tripoli',
        'business_day_start', '05:00',
        'employee_count', (
          select count(*)
          from public.payroll_run_items item
          where item.run_id = v_run_id
        ),
        'blocked_items', blocked_count,
        'warning_items', warning_count,
        'closed_attendance_rows', (
          select count(*)
          from public.pos_shift_attendees attendee
          where attendee.clocked_out_at is not null
            and attendee.clocked_in_at >= (
              month_start::timestamp + interval '5 hours'
            ) at time zone 'Africa/Tripoli'
            and attendee.clocked_in_at < (
              (month_end + 1)::timestamp + interval '5 hours'
            ) at time zone 'Africa/Tripoli'
        ),
        'published_schedule_rows', (
          select count(*)
          from public.workforce_schedule_shifts schedule
          where schedule.status = 'published'
            and schedule.starts_at >= month_start::timestamp
              at time zone 'Africa/Tripoli'
            and schedule.starts_at < (month_end + 1)::timestamp
              at time zone 'Africa/Tripoli'
        )
      ),
      created_by = coalesce(created_by, auth.uid())
  where id = v_run_id;

  return v_run_id;
end;
$$;

create or replace function public.payroll_complete_run(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.payroll_runs;
  net_total numeric;
  loan_total numeric;
  gross_total numeric;
  journal_batch uuid;
  wages_expense uuid;
  wages_payable uuid;
  staff_loans_receivable uuid;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'owner'
  ) then
    raise exception 'owner only';
  end if;

  select *
  into run_row
  from public.payroll_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'payroll run not found';
  end if;
  if run_row.status <> 'draft' then
    raise exception 'payroll run is not in draft status';
  end if;
  if run_row.evidence_status not in ('ready', 'warning') then
    raise exception 'payroll evidence is blocked; resolve every blocking issue first';
  end if;
  if exists (
    select 1
    from public.payroll_run_items item
    where item.run_id = p_run_id
      and item.data_status = 'blocked'
  ) then
    raise exception 'payroll contains blocked employee items';
  end if;

  select
    coalesce(sum(item.net_lyd), 0),
    coalesce(sum(item.loan_repayment_lyd), 0)
  into net_total, loan_total
  from public.payroll_run_items item
  where item.run_id = p_run_id;

  if not exists (
    select 1
    from public.payroll_run_items item
    where item.run_id = p_run_id
  ) then
    raise exception 'payroll has no employee items';
  end if;
  if net_total < 0 then
    raise exception 'payroll net total cannot be negative';
  end if;
  if abs(coalesce(run_row.total_lyd, 0) - net_total) > 0.005 then
    raise exception 'payroll total does not reconcile with its employee items';
  end if;

  gross_total := net_total + loan_total;
  wages_expense := coalesce(
    public.gl_acct('payroll_wages'),
    (select id from public.gl_accounts where code = '6600')
  );
  wages_payable := coalesce(
    public.gl_acct('wages_payable'),
    (select id from public.gl_accounts where code = '2100')
  );
  staff_loans_receivable := coalesce(
    public.gl_acct('staff_loans_receivable'),
    (select id from public.gl_accounts where code = '1150')
  );

  if wages_expense is null or wages_payable is null then
    raise exception 'payroll GL accounts are not configured';
  end if;
  if loan_total > 0 and staff_loans_receivable is null then
    raise exception 'staff-loan receivable account is not configured';
  end if;

  update public.payroll_runs
  set status = 'completed',
      total_lyd = net_total,
      evidence_status = 'reconciled',
      completed_at = now(),
      completed_by = auth.uid()
  where id = p_run_id;

  if gross_total = 0 then
    return p_run_id;
  end if;

  insert into public.gl_journal_batches (
    journal_date,
    source_type,
    source_ref,
    branch_id,
    memo,
    status
  )
  values (
    (
      run_row.period_month
      + interval '1 month - 1 day'
    )::date,
    'payroll',
    p_run_id::text,
    null,
    'Payroll ' || to_char(run_row.period_month, 'YYYY-MM'),
    'draft'
  )
  returning id into journal_batch;

  insert into public.gl_journal_lines (
    batch_id,
    account_id,
    branch_id,
    line_no,
    debit_lyd,
    memo
  )
  values (
    journal_batch,
    wages_expense,
    null,
    1,
    gross_total,
    'Payroll earnings ' || to_char(run_row.period_month, 'YYYY-MM')
  );

  if net_total > 0 then
    insert into public.gl_journal_lines (
      batch_id,
      account_id,
      branch_id,
      line_no,
      credit_lyd,
      memo
    )
    values (
      journal_batch,
      wages_payable,
      null,
      2,
      net_total,
      'Payroll payable ' || to_char(run_row.period_month, 'YYYY-MM')
    );
  end if;

  if loan_total > 0 then
    insert into public.gl_journal_lines (
      batch_id,
      account_id,
      branch_id,
      line_no,
      credit_lyd,
      memo
    )
    values (
      journal_batch,
      staff_loans_receivable,
      null,
      3,
      loan_total,
      'Staff loan recovery ' || to_char(run_row.period_month, 'YYYY-MM')
    );
  end if;

  update public.gl_journal_batches
  set status = 'posted'
  where id = journal_batch;

  return p_run_id;
end;
$$;

create or replace function public.payroll_record_payment_v2(
  p_run_id uuid,
  p_payment_account_id uuid,
  p_paid_at timestamptz,
  p_payment_method text,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run_row public.payroll_runs;
  payment_account public.gl_accounts;
  wages_payable uuid;
  journal_batch uuid;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'owner'
  ) then
    raise exception 'owner only';
  end if;
  if p_paid_at is null then
    raise exception 'payment time is required';
  end if;
  if length(trim(coalesce(p_reference, ''))) < 3 then
    raise exception 'payment reference is required';
  end if;

  select *
  into run_row
  from public.payroll_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'payroll run not found';
  end if;
  if run_row.status <> 'completed' then
    raise exception 'only an approved unpaid payroll can be marked paid';
  end if;

  select *
  into payment_account
  from public.gl_accounts
  where id = p_payment_account_id
    and type = 'asset'
    and is_postable
    and is_active;

  if not found then
    raise exception 'select an active cash or bank posting account';
  end if;
  if payment_account.code not in ('1010', '1040') then
    raise exception 'payroll may only be paid from cash on hand or bank';
  end if;

  wages_payable := coalesce(
    public.gl_acct('wages_payable'),
    (select id from public.gl_accounts where code = '2100')
  );
  if wages_payable is null then
    raise exception 'wages payable account is not configured';
  end if;

  if run_row.total_lyd > 0 then
    insert into public.gl_journal_batches (
      journal_date,
      source_type,
      source_ref,
      branch_id,
      memo,
      status
    )
    values (
      (
        coalesce(p_paid_at, now())
        at time zone 'Africa/Tripoli'
      )::date,
      'payroll',
      'payment:' || p_run_id::text,
      null,
      'Payroll payment ' || to_char(run_row.period_month, 'YYYY-MM'),
      'draft'
    )
    returning id into journal_batch;

    insert into public.gl_journal_lines (
      batch_id,
      account_id,
      branch_id,
      line_no,
      debit_lyd,
      memo
    )
    values (
      journal_batch,
      wages_payable,
      null,
      1,
      run_row.total_lyd,
      'Settle payroll payable'
    );

    insert into public.gl_journal_lines (
      batch_id,
      account_id,
      branch_id,
      line_no,
      credit_lyd,
      memo
    )
    values (
      journal_batch,
      payment_account.id,
      null,
      2,
      run_row.total_lyd,
      'Payroll paid from ' || payment_account.name_en
    );

    update public.gl_journal_batches
    set status = 'posted'
    where id = journal_batch;
  end if;

  update public.payroll_runs
  set status = 'paid',
      paid_at = p_paid_at,
      paid_by = auth.uid(),
      payment_account_id = p_payment_account_id,
      payment_method = nullif(trim(p_payment_method), ''),
      payment_reference = trim(p_reference),
      payment_journal_batch_id = journal_batch
  where id = p_run_id;

  return p_run_id;
end;
$$;

grant execute on function public.payroll_generate_run(date) to authenticated;
grant execute on function public.payroll_complete_run(uuid) to authenticated;
grant execute on function public.payroll_record_payment_v2(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) to authenticated;

-- Dedicated balance-sheet evidence for staff loans.
insert into public.gl_accounts (
  code,
  name_en,
  name_ar,
  type,
  parent_id,
  normal_balance,
  is_postable,
  is_active
)
select
  '1150',
  'Staff loans receivable',
  'قروض الموظفين المستحقة',
  'asset',
  parent.id,
  'debit',
  true,
  true
from public.gl_accounts parent
where parent.code = '1000'
on conflict (code) do nothing;

insert into public.gl_account_map (key, account_id, label)
select
  'staff_loans_receivable',
  account.id,
  'Payroll — staff loans receivable'
from public.gl_accounts account
where account.code = '1150'
on conflict (key) do nothing;

-- Draft item edits keep the stored run total synchronized. Legacy drafts are
-- not rewritten merely by applying this migration.
create or replace function public.sync_payroll_run_total_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_run uuid := coalesce(new.run_id, old.run_id);
begin
  update public.payroll_runs run
  set total_lyd = coalesce((
        select sum(item.net_lyd)
        from public.payroll_run_items item
        where item.run_id = affected_run
      ), 0),
      evidence_status = case
        when run.evidence_status = 'legacy' then 'legacy'
        when exists (
          select 1
          from public.payroll_run_items item
          where item.run_id = affected_run
            and item.data_status = 'blocked'
        ) then 'blocked'
        when exists (
          select 1
          from public.payroll_run_items item
          where item.run_id = affected_run
            and item.data_status = 'warning'
        ) then 'warning'
        else 'ready'
      end
  where run.id = affected_run
    and run.status = 'draft';

  return null;
end;
$$;

drop trigger if exists payroll_run_item_sync_v2
  on public.payroll_run_items;
create trigger payroll_run_item_sync_v2
after insert or update or delete
on public.payroll_run_items
for each row
execute function public.sync_payroll_run_total_v2();

-- ── Owner control summary ──────────────────────────────────────────────────

create or replace function public.workforce_control_summary_v2(
  p_from date default (
    (
      now() at time zone 'Africa/Tripoli'
      - interval '5 hours'
    )::date - 6
  ),
  p_to date default (
    now() at time zone 'Africa/Tripoli'
    - interval '5 hours'
  )::date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (
        p_from::timestamp + interval '5 hours'
      ) at time zone 'Africa/Tripoli' as from_utc,
      (
        (p_to + 1)::timestamp + interval '5 hours'
      ) at time zone 'Africa/Tripoli' as to_utc
  ),
  employee_quality as (
    select
      count(*) filter (
        where employee.is_employee
          and coalesce(employee.is_active, false)
      ) as active_employees,
      count(*) filter (
        where employee.is_employee
          and not coalesce(employee.is_active, false)
      ) as former_employees,
      count(*) filter (
        where employee.is_employee
          and coalesce(employee.is_active, false)
          and employee.branch_id is null
          and employee.payroll_cost_center_id is null
      ) as missing_allocation,
      count(*) filter (
        where employee.is_employee
          and coalesce(employee.is_active, false)
          and employee.start_date is null
      ) as missing_start_date,
      count(*) filter (
        where employee.is_employee
          and coalesce(employee.is_active, false)
          and not employee.payroll_enabled
      ) as payroll_disabled,
      count(*) filter (
        where employee.is_employee
          and coalesce(employee.is_active, false)
          and employee.payroll_enabled
          and coalesce(
            employee.monthly_salary,
            employee.monthly_salary_lyd,
            employee.hourly_rate_lyd,
            employee.hourly_rate,
            0
          ) <= 0
      ) as missing_pay_basis
    from public.profiles employee
  ),
  attendance as (
    select
      count(*) as attendance_rows,
      count(*) filter (
        where attendee.clocked_out_at is null
      ) as open_attendance,
      count(*) filter (
        where attendee.clocked_out_at is null
          and attendee.clocked_in_at < now() - interval '16 hours'
      ) as stale_open_attendance,
      coalesce(sum(
        case
          when attendee.clocked_out_at is null then 0
          else extract(
            epoch from attendee.clocked_out_at - attendee.clocked_in_at
          ) / 3600
        end
      ), 0) as closed_hours,
      max(attendee.updated_at) as latest_attendance_at
    from public.pos_shift_attendees attendee
    cross join bounds
    where attendee.clocked_in_at >= bounds.from_utc
      and attendee.clocked_in_at < bounds.to_utc
  ),
  schedule as (
    select
      count(*) filter (
        where scheduled.status = 'published'
      ) as published_shifts,
      count(*) filter (
        where scheduled.status = 'draft'
      ) as draft_shifts,
      coalesce(sum(
        extract(epoch from scheduled.ends_at - scheduled.starts_at) / 3600
      ) filter (
        where scheduled.status = 'published'
      ), 0) as published_hours,
      max(scheduled.updated_at) as latest_schedule_at
    from public.workforce_schedule_shifts scheduled
    cross join bounds
    where scheduled.starts_at >= bounds.from_utc
      and scheduled.starts_at < bounds.to_utc
  ),
  payroll as (
    select
      run.id,
      run.period_month,
      run.status,
      run.evidence_status,
      run.total_lyd,
      coalesce((
        select sum(item.net_lyd)
        from public.payroll_run_items item
        where item.run_id = run.id
      ), 0) as item_total,
      (
        select count(*)
        from public.payroll_run_items item
        where item.run_id = run.id
          and item.data_status = 'blocked'
      ) as blocked_items,
      run.created_at,
      run.completed_at,
      run.paid_at
    from public.payroll_runs run
    order by run.period_month desc
    limit 1
  )
  select jsonb_build_object(
    'generated_at', now(),
    'timezone', 'Africa/Tripoli',
    'business_day_start', '05:00',
    'period_from', p_from,
    'period_to', p_to,
    'team', (select to_jsonb(employee_quality) from employee_quality),
    'attendance', (
      select to_jsonb(attendance)
        || jsonb_build_object(
          'status',
          case
            when attendance.attendance_rows = 0 then 'unavailable'
            when attendance.stale_open_attendance > 0 then 'exception'
            else 'available'
          end
        )
      from attendance
    ),
    'schedule', (
      select to_jsonb(schedule)
        || jsonb_build_object(
          'status',
          case
            when schedule.published_shifts = 0 then 'unavailable'
            when schedule.draft_shifts > 0 then 'draft'
            else 'published'
          end
        )
      from schedule
    ),
    'payroll', case
      when not public.workforce_can_view_payroll()
        then jsonb_build_object('status', 'restricted')
      else (
        select case
          when payroll.id is null
            then jsonb_build_object('status', 'unavailable')
          else to_jsonb(payroll)
            || jsonb_build_object(
              'variance_lyd',
              payroll.total_lyd - payroll.item_total,
              'reconciled',
              abs(payroll.total_lyd - payroll.item_total) <= 0.005
            )
        end
        from payroll
      )
    end
  );
$$;

grant execute on function public.workforce_control_summary_v2(date, date)
  to authenticated;

-- Finance uses approved/paid payroll only. A draft never silently becomes
-- actual labor cost, and a missing approved run falls back to configured
-- employee salary estimates.
do $migration$
declare
  definition text;
  original_definition text;
begin
  select pg_get_functiondef(
    'public.finance_pnl(uuid,date,date,boolean)'::regprocedure
  )
  into definition;
  original_definition := definition;

  definition := replace(
    definition,
    $old$where run.period_month = month.month_start
        order by case run.status when 'completed' then 0 else 1 end, run.created_at desc$old$,
    $new$where run.period_month = month.month_start
          and run.status in ('completed', 'paid')
        order by run.completed_at desc nulls last, run.created_at desc$new$
  );

  definition := replace(
    definition,
    $old$where selected.run_id is null
      and coalesce(profile.monthly_salary, 0) > 0$old$,
    $new$where selected.run_id is null
      and profile.is_employee
      and profile.payroll_enabled
      and coalesce(profile.monthly_salary, profile.monthly_salary_lyd, 0) > 0$new$
  );

  definition := replace(
    definition,
    $old$where run.period_month = date_trunc('month', adjustment.adjustment_date)::date$old$,
    $new$where run.period_month = date_trunc('month', adjustment.adjustment_date)::date
          and run.status in ('completed', 'paid')$new$
  );

  if definition = original_definition
    or position(
      $needle$and run.status in ('completed', 'paid')$needle$
      in definition
    ) = 0
    or position(
      $needle$and profile.payroll_enabled$needle$
      in definition
    ) = 0
  then
    raise exception 'finance_pnl payroll authority replacement did not apply';
  end if;

  execute definition;
end;
$migration$;

comment on function public.workforce_control_summary_v2(date, date) is
  'Owner-first workforce health summary using Tripoli 05:00 business days.';
comment on view public.workforce_attendance_v2 is
  'Authoritative attendance evidence; open intervals never count as paid hours.';
comment on table public.workforce_schedule_shifts is
  'Published or draft employee schedule shifts; not attendance evidence.';
