-- P0 GL correctness fixes.
-- Applied migrations remain immutable; all corrections are defined here.

create or replace function public.gl_post_sales_day(p_date date, p_branch uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
  v_ref text := p_branch::text || ':' || to_char(p_date, 'YYYY-MM-DD');
  v_lo timestamptz := p_date::timestamptz;
  v_hi timestamptz := (p_date + 1)::timestamptz;
  v_subtotal numeric(14, 2);
  v_discount numeric(14, 2);
  v_total numeric(14, 2);
  v_card numeric(14, 2);
  v_presto numeric(14, 2);
  v_cash numeric(14, 2);
  v_refund numeric(14, 2);
  v_cogs numeric(14, 2);
  v_modcogs numeric(14, 2);
  v_line int := 0;
begin
  delete from gl_journal_batches
   where source_type = 'sales_daily'
     and source_ref = v_ref
     and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(p_branch, '00000000-0000-0000-0000-000000000000'::uuid);

  select
    coalesce(sum(subtotal), 0),
    coalesce(sum(discount_amount), 0),
    coalesce(sum(total), 0),
    coalesce(sum(case
      when payment_method = 'card' then total
      when payment_method = 'split' then coalesce(card_amount, 0)
      else 0
    end), 0),
    coalesce(sum(case when payment_method = 'presto' then total else 0 end), 0),
    coalesce(sum(refunded_amount_lyd), 0)
    into v_subtotal, v_discount, v_total, v_card, v_presto, v_refund
    from pos_orders
   where branch_id = p_branch
     and status = 'completed'
     and created_at >= v_lo
     and created_at < v_hi;

  if coalesce(v_total, 0) = 0 and coalesce(v_subtotal, 0) = 0 then
    return null;
  end if;

  v_cash := v_total - v_card - v_presto;

  select coalesce(sum(coalesce(pp.cost_lyd, 0) * oi.quantity), 0)
    into v_cogs
    from pos_orders o
    join pos_order_items oi on oi.order_id = o.id
    left join pos_products pp on pp.id = oi.product_id
   where o.branch_id = p_branch
     and o.status = 'completed'
     and o.created_at >= v_lo
     and o.created_at < v_hi;

  select coalesce(sum(coalesce(m.cost_delta_lyd, 0) * oi.quantity), 0)
    into v_modcogs
    from pos_order_item_modifiers oim
    join pos_modifiers m on m.id = oim.modifier_id
    join pos_order_items oi on oi.id = oim.order_item_id
    join pos_orders o on o.id = oi.order_id
   where o.branch_id = p_branch
     and o.status = 'completed'
     and o.created_at >= v_lo
     and o.created_at < v_hi;

  insert into gl_journal_batches (journal_date, source_type, source_ref, branch_id, memo, status)
  values (p_date, 'sales_daily', v_ref, p_branch, 'Daily sales summary', 'draft')
  returning id into v_batch;

  if v_cash <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('cash'), p_branch, v_line, v_cash, 'Cash & pickup receipts');
  end if;
  if v_card <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('card_clearing'), p_branch, v_line, v_card, 'Card receipts');
  end if;
  if v_presto <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('presto_clearing'), p_branch, v_line, v_presto, 'Presto receivable');
  end if;
  if v_discount <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('sales_discount'), p_branch, v_line, v_discount, 'Discounts');
  end if;

  v_line := v_line + 1;
  insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
  values (v_batch, gl_acct('sales_revenue'), p_branch, v_line, v_subtotal, 'Gross sales');

  if v_refund <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('sales_refund'), p_branch, v_line, v_refund, 'Refunds');
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
    values (v_batch, gl_acct('cash'), p_branch, v_line, v_refund, 'Refunds paid (cash)');
  end if;

  if coalesce(v_cogs, 0) <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('cogs'), p_branch, v_line, v_cogs, 'COGS');
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
    values (v_batch, gl_acct('inventory'), p_branch, v_line, v_cogs, 'Inventory relief (COGS)');
  end if;
  if coalesce(v_modcogs, 0) <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('modifier_cogs'), p_branch, v_line, v_modcogs, 'Modifier COGS');
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
    values (v_batch, gl_acct('inventory'), p_branch, v_line, v_modcogs, 'Inventory relief (modifiers)');
  end if;

  update gl_journal_batches set status = 'posted' where id = v_batch;
  return v_batch;
end;
$$;

grant execute on function public.gl_post_sales_day(date, uuid) to authenticated, service_role;

-- Presto settlement moves the receivable into physical cash exactly once.
create or replace function public.mark_presto_collected(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order pos_orders;
  v_batch uuid;
  v_ref text := 'presto:' || p_order_id::text;
begin
  select * into v_order from pos_orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.payment_method <> 'presto' then
    raise exception 'order is not a Presto order';
  end if;
  if v_order.presto_collected is true then
    return jsonb_build_object('already_collected', true);
  end if;

  update pos_orders set presto_collected = true where id = p_order_id;

  if v_order.shift_id is not null then
    update pos_shifts
       set total_presto_uncollected = greatest(0, coalesce(total_presto_uncollected, 0) - v_order.total)
     where id = v_order.shift_id;
  end if;

  insert into gl_journal_batches (journal_date, source_type, source_ref, branch_id, memo, status)
  values (current_date, 'cash', v_ref, v_order.branch_id, 'Presto settlement', 'draft')
  returning id into v_batch;

  insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
  values (v_batch, gl_acct('cash'), v_order.branch_id, 1, v_order.total, 'Presto collected');
  insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
  values (v_batch, gl_acct('presto_clearing'), v_order.branch_id, 2, v_order.total, 'Presto settlement');

  update gl_journal_batches set status = 'posted' where id = v_batch;

  insert into pos_audit_log (branch_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_order.branch_id, auth.uid(), 'presto_collected', 'pos_orders', p_order_id,
    jsonb_build_object('amount', v_order.total, 'gl_batch_id', v_batch)
  );

  return jsonb_build_object('already_collected', false, 'amount', v_order.total, 'gl_batch_id', v_batch);
end;
$$;

grant execute on function public.mark_presto_collected(uuid) to authenticated;

-- Keep every report's batch and line joins on the same filtered batch set.
create or replace function public.gl_trial_balance(p_as_of date default current_date, p_branch uuid default null)
returns table (
  account_id uuid, code text, name_en text, name_ar text, type text,
  normal_balance text, total_debit numeric, total_credit numeric, balance numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.code, a.name_en, a.name_ar, a.type, a.normal_balance,
         coalesce(sum(l.debit_lyd), 0),
         coalesce(sum(l.credit_lyd), 0),
         case when a.normal_balance = 'debit'
              then coalesce(sum(l.debit_lyd), 0) - coalesce(sum(l.credit_lyd), 0)
              else coalesce(sum(l.credit_lyd), 0) - coalesce(sum(l.debit_lyd), 0)
         end
    from gl_accounts a
    left join gl_journal_batches b
      on b.status = 'posted'
     and b.journal_date <= p_as_of
     and (p_branch is null or b.branch_id = p_branch)
    left join gl_journal_lines l
      on l.batch_id = b.id and l.account_id = a.id
   where a.is_postable
   group by a.id, a.code, a.name_en, a.name_ar, a.type, a.normal_balance
   order by a.code;
$$;

grant execute on function public.gl_trial_balance(date, uuid) to authenticated, service_role;

create or replace function public.gl_balance_sheet(p_as_of date default current_date, p_branch uuid default null)
returns table (section text, code text, name_en text, name_ar text, balance numeric)
language sql
stable
security definer
set search_path = public
as $$
  select a.type, a.code, a.name_en, a.name_ar,
         case when a.normal_balance = 'debit'
              then coalesce(sum(l.debit_lyd), 0) - coalesce(sum(l.credit_lyd), 0)
              else coalesce(sum(l.credit_lyd), 0) - coalesce(sum(l.debit_lyd), 0)
         end
    from gl_accounts a
    left join gl_journal_batches b
      on b.status = 'posted'
     and b.journal_date <= p_as_of
     and (p_branch is null or b.branch_id = p_branch)
    left join gl_journal_lines l
      on l.batch_id = b.id and l.account_id = a.id
   where a.is_postable and a.type in ('asset', 'liability', 'equity')
   group by a.type, a.code, a.name_en, a.name_ar, a.normal_balance
  having coalesce(sum(l.debit_lyd), 0) <> 0 or coalesce(sum(l.credit_lyd), 0) <> 0
   order by a.code;
$$;

grant execute on function public.gl_balance_sheet(date, uuid) to authenticated, service_role;

create or replace function public.gl_income_statement(p_from date, p_to date, p_branch uuid default null)
returns table (section text, code text, name_en text, name_ar text, amount numeric)
language sql
stable
security definer
set search_path = public
as $$
  select a.type, a.code, a.name_en, a.name_ar,
         case when a.type = 'revenue'
              then coalesce(sum(l.credit_lyd), 0) - coalesce(sum(l.debit_lyd), 0)
              else coalesce(sum(l.debit_lyd), 0) - coalesce(sum(l.credit_lyd), 0)
         end
    from gl_accounts a
    left join gl_journal_batches b
      on b.status = 'posted'
     and b.journal_date between p_from and p_to
     and (p_branch is null or b.branch_id = p_branch)
    left join gl_journal_lines l
      on l.batch_id = b.id and l.account_id = a.id
   where a.is_postable and a.type in ('revenue', 'cogs', 'expense')
   group by a.type, a.code, a.name_en, a.name_ar, a.normal_balance
  having coalesce(sum(l.debit_lyd), 0) <> 0 or coalesce(sum(l.credit_lyd), 0) <> 0
   order by a.code;
$$;

grant execute on function public.gl_income_statement(date, date, uuid) to authenticated, service_role;
