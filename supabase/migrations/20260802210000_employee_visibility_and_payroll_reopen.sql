-- Restore employee visibility after the explicit workforce boundary and allow
-- owners to reopen an approved, unpaid payroll without erasing accounting
-- history. Paid payroll remains immutable.

-- The workforce V2 rollout classified every non-owner staff role as an
-- employee. Reapply that rule for profiles created after the rollout by the
-- older create-staff Edge Function, which did not populate is_employee.
update public.profiles
set is_employee = true,
    payroll_enabled = case
      when coalesce(
        monthly_salary,
        monthly_salary_lyd,
        hourly_rate_lyd,
        hourly_rate,
        0
      ) > 0 then true
      else payroll_enabled
    end,
    updated_at = now()
where not coalesce(is_employee, false)
  and role in ('staff', 'limited_staff', 'supervisor', 'accountant', 'data_entry');

alter table public.payroll_runs
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references public.profiles(id),
  add column if not exists reopen_count integer not null default 0;

create or replace function public.payroll_reopen_run_v2(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid;
  run_row public.payroll_runs;
  approval_batch public.gl_journal_batches;
  reversal_batch_id uuid;
  reopen_token text := gen_random_uuid()::text;
  next_evidence_status text;
begin
  select profile.id
  into actor_profile_id
  from public.profiles profile
  where (profile.id = auth.uid() or profile.auth_user_id = auth.uid())
    and profile.role = 'owner'
  limit 1;

  if actor_profile_id is null then
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
  if run_row.status = 'paid' then
    raise exception 'paid payroll cannot be reopened; record a separate correction';
  end if;
  if run_row.status = 'draft' then
    return p_run_id;
  end if;
  if run_row.status <> 'completed' then
    raise exception 'only completed unpaid payroll can be reopened';
  end if;

  select *
  into approval_batch
  from public.gl_journal_batches batch
  where batch.source_type = 'payroll'
    and batch.source_ref = p_run_id::text
    and batch.branch_id is null
  for update;

  if found then
    -- Preserve the original posting and release the canonical source_ref so a
    -- later re-completion can post a new authoritative payroll journal.
    update public.gl_journal_batches
    set source_ref = 'approval:' || p_run_id::text || ':' || reopen_token
    where id = approval_batch.id;

    insert into public.gl_journal_batches (
      journal_date,
      source_type,
      source_ref,
      branch_id,
      memo,
      status,
      created_by
    ) values (
      approval_batch.journal_date,
      'payroll',
      'reversal:' || p_run_id::text || ':' || reopen_token,
      null,
      'Reopen payroll ' || to_char(run_row.period_month, 'YYYY-MM'),
      'draft',
      actor_profile_id
    )
    returning id into reversal_batch_id;

    insert into public.gl_journal_lines (
      batch_id,
      account_id,
      branch_id,
      line_no,
      debit_lyd,
      credit_lyd,
      memo
    )
    select
      reversal_batch_id,
      line.account_id,
      line.branch_id,
      line.line_no,
      line.credit_lyd,
      line.debit_lyd,
      'Reversal: ' || coalesce(line.memo, approval_batch.memo)
    from public.gl_journal_lines line
    where line.batch_id = approval_batch.id
    order by line.line_no, line.id;

    update public.gl_journal_batches
    set status = 'posted'
    where id = reversal_batch_id;
  end if;

  select case
    when exists (
      select 1 from public.payroll_run_items item
      where item.run_id = p_run_id and item.data_status = 'blocked'
    ) then 'blocked'
    when exists (
      select 1 from public.payroll_run_items item
      where item.run_id = p_run_id and item.data_status = 'warning'
    ) then 'warning'
    else 'ready'
  end
  into next_evidence_status;

  update public.payroll_runs
  set status = 'draft',
      evidence_status = next_evidence_status,
      completed_at = null,
      completed_by = null,
      reopened_at = now(),
      reopened_by = actor_profile_id,
      reopen_count = reopen_count + 1,
      source_snapshot = jsonb_set(
        coalesce(source_snapshot, '{}'::jsonb),
        '{last_reopen}',
        jsonb_build_object(
          'at', now(),
          'by', actor_profile_id,
          'approval_batch_id', approval_batch.id,
          'reversal_batch_id', reversal_batch_id
        ),
        true
      )
  where id = p_run_id;

  return p_run_id;
end;
$$;

revoke all on function public.payroll_reopen_run_v2(uuid) from public, anon;
grant execute on function public.payroll_reopen_run_v2(uuid) to authenticated;
