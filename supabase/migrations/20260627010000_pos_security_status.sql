-- Roadmap follow-up: read-only POS security posture summary.
-- This does not tighten live RLS automatically. It exposes the current
-- status so operators can verify override audits and the still-open
-- `pos_all` policy family while branch-scoped RLS remains blocked.

create or replace function public.pos_security_status(p_branch_id uuid)
returns table (
  branch_id uuid,
  open_pos_policy_count integer,
  open_pos_policy_tables text[],
  staff_assignment_count integer,
  manager_assignment_count integer,
  recent_audit_events integer,
  recent_override_events integer,
  recent_shift_close_events integer,
  recent_void_events integer,
  recent_refund_events integer,
  last_audit_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_branch_id is null then
    raise exception 'Branch is required';
  end if;

  if not public.user_has_branch_access(p_branch_id) then
    raise exception 'Branch access denied';
  end if;

  return query
  with open_policies as (
    select
      count(*)::int as open_count,
      coalesce(array_agg(tablename order by tablename), array[]::text[]) as table_names
    from pg_policies
    where schemaname = 'public'
      and policyname = 'pos_all'
  ),
  assignments as (
    select
      count(*)::int as staff_count,
      count(*) filter (where role = 'manager')::int as manager_count
    from staff_branches
    where branch_id = p_branch_id
  ),
  audit as (
    select
      count(*)::int as audit_count,
      count(*) filter (where action = 'manager_override_applied')::int as override_count,
      count(*) filter (where action in ('shift_closed', 'shift_close_operator_recorded'))::int as shift_close_count,
      count(*) filter (where action = 'order_voided')::int as void_count,
      count(*) filter (where action like 'refund%')::int as refund_count,
      max(created_at) as latest_audit_at
    from pos_audit_log
    where branch_id = p_branch_id
      and created_at >= now() - interval '30 days'
  )
  select
    p_branch_id,
    open_policies.open_count,
    open_policies.table_names,
    assignments.staff_count,
    assignments.manager_count,
    audit.audit_count,
    audit.override_count,
    audit.shift_close_count,
    audit.void_count,
    audit.refund_count,
    audit.latest_audit_at
  from open_policies, assignments, audit;
end;
$$;

grant execute on function public.pos_security_status(uuid) to authenticated, service_role;
