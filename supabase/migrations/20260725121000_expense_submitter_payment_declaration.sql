-- Let the expense submitter report whether the expense is already paid.
-- Approval remains an owner action. When an owner approves a reported-paid
-- expense, the existing accounting payment function posts it automatically.

alter table public.expenses
  add column if not exists payment_status_reported text not null default 'not_reported',
  add column if not exists payment_method_reported text,
  add column if not exists payment_reported_by uuid references public.profiles(id),
  add column if not exists payment_reported_at timestamptz;

alter table public.expenses
  drop constraint if exists expenses_payment_status_reported_check,
  drop constraint if exists expenses_payment_method_reported_check,
  drop constraint if exists expenses_payment_declaration_consistent_check;

alter table public.expenses
  add constraint expenses_payment_status_reported_check
    check (payment_status_reported in ('not_reported', 'unpaid', 'paid')),
  add constraint expenses_payment_method_reported_check
    check (payment_method_reported is null or payment_method_reported in ('cash', 'card')),
  add constraint expenses_payment_declaration_consistent_check
    check (
      (payment_status_reported = 'paid' and payment_method_reported in ('cash', 'card'))
      or
      (payment_status_reported in ('not_reported', 'unpaid') and payment_method_reported is null)
    );

create index if not exists expenses_payment_status_reported_idx
  on public.expenses(payment_status_reported, status);

alter table public.expense_snaps
  drop constraint if exists expense_snaps_status_check;

alter table public.expense_snaps
  add constraint expense_snaps_status_check
    check (status in (
      'awaiting_amount',
      'awaiting_payment',
      'awaiting_branch',
      'awaiting_custom',
      'completed',
      'failed',
      'cancelled'
    ));

create or replace function public.approve_expense_with_reported_payment(
  p_expense_id uuid,
  p_notes text default null
) returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses;
  v_actor_role text;
  v_decision text;
  v_payment_batch uuid;
begin
  select role into v_actor_role
  from public.profiles
  where id = auth.uid();

  if v_actor_role <> 'owner' then
    raise exception 'Only an owner can approve expenses';
  end if;

  select * into v_expense
  from public.expenses
  where id = p_expense_id
  for update;

  if not found then
    raise exception 'Expense not found';
  end if;

  if v_expense.status in ('rejected', 'denied') then
    raise exception 'Rejected expenses cannot be approved';
  end if;

  if v_expense.status = 'pending' then
    update public.expenses
    set status = 'approved',
        updated_at = now()
    where id = p_expense_id
    returning * into v_expense;

    v_decision := case
      when p_notes = 'Auto-approved by owner' then 'auto_approved'
      else 'approved'
    end;

    insert into public.expense_approvals(expense_id, acted_by, decision, notes)
    values (p_expense_id, auth.uid(), v_decision, nullif(p_notes, ''));
  end if;

  if v_expense.status <> 'paid'
     and v_expense.payment_status_reported = 'paid' then
    if coalesce(nullif(trim(v_expense.paid_by), ''), 'Business') <> 'Business'
       or v_expense.funding_type in ('shareholder_loan', 'capital_injection') then
      v_payment_batch := public.gl_post_expense(p_expense_id, 'expenses');
      update public.expenses
      set status = 'paid',
          paid_at = coalesce(v_expense.expense_date, current_date),
          payment_notes = 'Automatically settled as shareholder funding from the submitter payment declaration',
          payment_journal_batch_id = v_payment_batch,
          updated_at = now()
      where id = p_expense_id;
    else
      perform public.mark_expense_paid(
        p_expense_id,
        case when v_expense.payment_method_reported = 'card' then 'bank' else 'cash' end,
        coalesce(v_expense.expense_date, current_date),
        null,
        'Automatically settled from the submitter payment declaration'
      );
    end if;
  end if;

  select * into v_expense
  from public.expenses
  where id = p_expense_id;

  return v_expense;
end;
$$;

revoke all on function public.approve_expense_with_reported_payment(uuid, text) from public;
grant execute on function public.approve_expense_with_reported_payment(uuid, text)
  to authenticated, service_role;
