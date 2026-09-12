begin;

-- Paid scanned receipts use their system entry date, including when approval is delayed.
create or replace function public.apply_expense_approval(
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
        paid_at = case when v_expense.receipt_url is not null and v_expense.source like 'snap_%' then (coalesce(v_expense.submitted_at,now()) at time zone 'Africa/Tripoli')::date else coalesce(v_expense.expense_date,current_date) end,
        payment_notes = 'Automatically settled as shareholder funding from the submitter payment declaration',
        payment_journal_batch_id = v_payment_batch, updated_at = now()
      where id = p_expense_id;
    else
      perform public.mark_expense_paid(p_expense_id,
        case when v_expense.payment_method_reported = 'card' then 'bank' else 'cash' end,
        case when v_expense.receipt_url is not null and v_expense.source like 'snap_%' then (coalesce(v_expense.submitted_at,now()) at time zone 'Africa/Tripoli')::date else coalesce(v_expense.expense_date,current_date) end, null,
        'Automatically settled from the submitter payment declaration');
    end if;
  end if;
  select * into v_expense from public.expenses where id = p_expense_id;
  return v_expense;
end $$;
commit;
