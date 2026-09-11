begin;

-- One business-wide policy; no row means disabled. Only the owner RPC can
-- change it. Keep the authorizing owner for automatic approval attribution.
create table public.expense_approval_settings (
  id boolean primary key default true check (id),
  auto_approve boolean not null default false,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.expense_approval_settings enable row level security;
revoke all on public.expense_approval_settings from anon, authenticated;
grant select on public.expense_approval_settings to authenticated;
create policy expense_approval_settings_read on public.expense_approval_settings
  for select to authenticated using (true);

create function public.set_expense_auto_approval(p_enabled boolean)
returns public.expense_approval_settings
language plpgsql security definer set search_path = public as $$
declare v_setting public.expense_approval_settings;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
    raise exception 'Only an owner can change expense auto-approval' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'Enabled must be true or false'; end if;
  insert into public.expense_approval_settings(id, auto_approve, updated_by, updated_at)
  values (true, p_enabled, auth.uid(), now())
  on conflict (id) do update set auto_approve = excluded.auto_approve,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v_setting;
  return v_setting;
end $$;
revoke all on function public.set_expense_auto_approval(boolean) from public, anon;
grant execute on function public.set_expense_auto_approval(boolean) to authenticated;

-- Shared transaction for manual and policy approvals. Not callable by API
-- roles: they must use the owner-checked wrapper or insert a new expense.
create function public.apply_expense_approval(
  p_expense_id uuid, p_actor uuid, p_decision text, p_notes text
) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare
  v_expense public.expenses;
  v_payment_batch uuid;
begin
  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_expense.status in ('rejected', 'denied') then
    raise exception 'Rejected expenses cannot be approved';
  end if;
  if v_expense.status = 'pending' then
    update public.expenses set status = 'approved', updated_at = now()
    where id = p_expense_id returning * into v_expense;
    insert into public.expense_approvals(expense_id, acted_by, decision, notes)
    values (p_expense_id, p_actor, p_decision, nullif(p_notes, ''));
  end if;
  if v_expense.status <> 'paid' and v_expense.payment_status_reported = 'paid' then
    if coalesce(nullif(trim(v_expense.paid_by), ''), 'Business') <> 'Business'
       or v_expense.funding_type in ('shareholder_loan', 'capital_injection') then
      v_payment_batch := public.gl_post_expense(p_expense_id, 'expenses');
      update public.expenses set status = 'paid',
        paid_at = coalesce(v_expense.expense_date, current_date),
        payment_notes = 'Automatically settled as shareholder funding from the submitter payment declaration',
        payment_journal_batch_id = v_payment_batch, updated_at = now()
      where id = p_expense_id;
    else
      perform public.mark_expense_paid(p_expense_id,
        case when v_expense.payment_method_reported = 'card' then 'bank' else 'cash' end,
        coalesce(v_expense.expense_date, current_date), null,
        'Automatically settled from the submitter payment declaration');
    end if;
  end if;
  select * into v_expense from public.expenses where id = p_expense_id;
  return v_expense;
end $$;
revoke all on function public.apply_expense_approval(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.approve_expense_with_reported_payment(
  p_expense_id uuid, p_notes text default null
) returns public.expenses
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
    raise exception 'Only an owner can approve expenses' using errcode = '42501';
  end if;
  return public.apply_expense_approval(p_expense_id, auth.uid(),
    case when p_notes = 'Auto-approved by owner' then 'auto_approved' else 'approved' end,
    p_notes);
end $$;
revoke all on function public.approve_expense_with_reported_payment(uuid, text) from public, anon;
grant execute on function public.approve_expense_with_reported_payment(uuid, text) to authenticated, service_role;

create function public.auto_approve_new_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if new.status is distinct from 'pending' then return new; end if;
  select s.updated_by into v_owner
    from public.expense_approval_settings s
    join public.profiles p on p.id = s.updated_by and p.role = 'owner'
    where s.id = true and s.auto_approve = true;
  if v_owner is not null then
    perform public.apply_expense_approval(new.id, v_owner, 'auto_approved',
      'Automatically approved by the owner-enabled all-expenses policy');
  end if;
  return new;
end $$;
revoke all on function public.auto_approve_new_expense() from public, anon, authenticated, service_role;
create trigger auto_approve_new_expense after insert on public.expenses
  for each row execute function public.auto_approve_new_expense();

alter table public.pos_settings
  add column block_duplicate_tabs boolean not null default false;

-- Existing branch settings allow staff writes. Protect this owner switch
-- specifically, including deletion or moving a row to bypass the switch.
create function public.protect_pos_instance_setting()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_changed := new.block_duplicate_tabs;
  elsif tg_op = 'DELETE' then
    v_changed := old.block_duplicate_tabs;
  else
    v_changed := new.block_duplicate_tabs is distinct from old.block_duplicate_tabs
      or (new.branch_id is distinct from old.branch_id and (old.block_duplicate_tabs or new.block_duplicate_tabs));
  end if;
  if v_changed and coalesce(auth.role(), '') <> 'service_role'
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
    raise exception 'Only an owner can change the duplicate POS tab restriction' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_pos_instance_setting() from public, anon, authenticated, service_role;
create trigger protect_pos_instance_setting before insert or update or delete on public.pos_settings
  for each row execute function public.protect_pos_instance_setting();

commit;
