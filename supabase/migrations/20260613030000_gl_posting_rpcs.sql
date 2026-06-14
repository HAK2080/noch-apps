-- GL posting RPCs. All security definer, idempotent (delete+reinsert per
-- source key), and they read the SAME orders/expenses with the SAME period
-- boundaries as finance_pnl (20260523010000) so the ledger reconciles to the
-- existing cash-basis P&L.
--
-- Date boundaries: created_at >= d::timestamptz AND < (d+1) — identical to
-- finance_pnl. Sales post only status='completed'. COGS uses full line
-- quantity (matches finance_pnl). Refunds use orders' refunded_amount_lyd on
-- the order's own day (matches finance_pnl's period netting).

-- Helper: account id for a map key (raises if unmapped → fail loud, not silent).
create or replace function gl_acct(p_key text) returns uuid
language sql stable as $$
  select account_id from gl_account_map where key = p_key
$$;

-- ── SALES: one balanced batch per branch per day ────────────────────────────
create or replace function gl_post_sales_day(p_date date, p_branch uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_batch    uuid;
  v_ref      text := p_branch::text || ':' || to_char(p_date, 'YYYY-MM-DD');
  v_lo       timestamptz := p_date::timestamptz;
  v_hi       timestamptz := (p_date + 1)::timestamptz;
  v_subtotal numeric(14,2);
  v_discount numeric(14,2);
  v_total    numeric(14,2);
  v_card     numeric(14,2);
  v_cash     numeric(14,2);
  v_refund   numeric(14,2);
  v_cogs     numeric(14,2);
  v_modcogs  numeric(14,2);
  v_line     int := 0;
begin
  -- Always clear any prior batch for this (branch, day) first → idempotent.
  delete from gl_journal_batches
   where source_type = 'sales_daily' and source_ref = v_ref
     and coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_branch,'00000000-0000-0000-0000-000000000000'::uuid);

  select
    coalesce(sum(subtotal),0),
    coalesce(sum(discount_amount),0),
    coalesce(sum(total),0),
    coalesce(sum(case when payment_method='card' then total
                      when payment_method='split' then coalesce(card_amount,0)
                      else 0 end),0),
    coalesce(sum(refunded_amount_lyd),0)
  into v_subtotal, v_discount, v_total, v_card, v_refund
  from pos_orders
  where branch_id = p_branch and status = 'completed'
    and created_at >= v_lo and created_at < v_hi;

  -- Nothing sold → leave no batch.
  if coalesce(v_total,0) = 0 and coalesce(v_subtotal,0) = 0 then
    return null;
  end if;

  v_cash := v_total - v_card;   -- cash + pickup + cash-side of split

  -- COGS (full quantity, matches finance_pnl)
  select coalesce(sum(coalesce(pp.cost_lyd,0) * oi.quantity),0)
    into v_cogs
  from pos_orders o
  join pos_order_items oi on oi.order_id = o.id
  left join pos_products pp on pp.id = oi.product_id
  where o.branch_id = p_branch and o.status='completed'
    and o.created_at >= v_lo and o.created_at < v_hi;

  select coalesce(sum(coalesce(m.cost_delta_lyd,0) * oi.quantity),0)
    into v_modcogs
  from pos_order_item_modifiers oim
  join pos_modifiers m on m.id = oim.modifier_id
  join pos_order_items oi on oi.id = oim.order_item_id
  join pos_orders o on o.id = oi.order_id
  where o.branch_id = p_branch and o.status='completed'
    and o.created_at >= v_lo and o.created_at < v_hi;

  insert into gl_journal_batches (journal_date, source_type, source_ref, branch_id, memo, status)
  values (p_date, 'sales_daily', v_ref, p_branch, 'Daily sales summary', 'draft')
  returning id into v_batch;

  -- Receipts (Dr) and revenue (Cr). Revenue is gross (subtotal); discount is a
  -- contra-revenue debit; cash/card receipts sum to net total.
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
  if v_discount <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('sales_discount'), p_branch, v_line, v_discount, 'Discounts');
  end if;
  v_line := v_line + 1;
  insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
  values (v_batch, gl_acct('sales_revenue'), p_branch, v_line, v_subtotal, 'Gross sales');

  -- Refunds: contra-revenue debit, cash credit.
  if v_refund <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('sales_refund'), p_branch, v_line, v_refund, 'Refunds');
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
    values (v_batch, gl_acct('cash'), p_branch, v_line, v_refund, 'Refunds paid (cash)');
  end if;

  -- COGS: debit COGS, credit Inventory.
  if coalesce(v_cogs,0) <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('cogs'), p_branch, v_line, v_cogs, 'COGS');
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
    values (v_batch, gl_acct('inventory'), p_branch, v_line, v_cogs, 'Inventory relief (COGS)');
  end if;
  if coalesce(v_modcogs,0) <> 0 then
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
    values (v_batch, gl_acct('modifier_cogs'), p_branch, v_line, v_modcogs, 'Modifier COGS');
    v_line := v_line + 1;
    insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
    values (v_batch, gl_acct('inventory'), p_branch, v_line, v_modcogs, 'Inventory relief (modifiers)');
  end if;

  update gl_journal_batches set status='posted' where id = v_batch;
  return v_batch;
end $$;
grant execute on function gl_post_sales_day(date, uuid) to authenticated, service_role;

-- ── EXPENSE: one balanced batch per expense document ────────────────────────
-- p_source: 'expense_entries' (text category enum) or 'expenses' (category_id → name).
create or replace function gl_post_expense(p_id uuid, p_source text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_batch   uuid;
  v_ref     text := p_source || ':' || p_id::text;
  v_amount  numeric(14,2);
  v_date    date;
  v_branch  uuid;
  v_acct    uuid;
  v_memo    text;
  v_cat     text;
begin
  delete from gl_journal_batches where source_type='expense' and source_ref=v_ref;

  if p_source = 'expense_entries' then
    select amount_lyd, paid_at, branch_id, category,
           coalesce(vendor, notes, 'Expense')
      into v_amount, v_date, v_branch, v_cat, v_memo
    from expense_entries
    where id = p_id and (status is null or status = 'approved');
    if not found then return null; end if;
    -- category enum → map key 'expense_<category>' (capex handled separately below)
    if v_cat = 'capex' then
      v_acct := gl_acct('capex_fixed_assets');
    else
      v_acct := coalesce(gl_acct('expense_' || v_cat), gl_acct('expense_other_opex'));
    end if;

  elsif p_source = 'expenses' then
    select e.amount_lyd, e.expense_date, null::uuid,
           coalesce(c.name, 'Expense')
      into v_amount, v_date, v_branch, v_cat
    from expenses e
    left join expense_categories c on c.id = e.category_id
    where e.id = p_id and e.status in ('approved','paid');
    if not found then return null; end if;
    v_memo := v_cat;
    -- Free-text category name → account (best-effort; default Other opex).
    v_acct := case
      when v_cat ilike 'rent%'                 then gl_acct('expense_rent')
      when v_cat ilike 'utilit%'               then gl_acct('expense_utilities')
      when v_cat ilike 'marketing%'            then gl_acct('expense_marketing')
      when v_cat ilike 'supplies%' or v_cat ilike '%equipment%' then gl_acct('expense_supplies')
      when v_cat ilike 'maintenance%' or v_cat ilike '%repair%' then gl_acct('expense_maintenance')
      when v_cat ilike 'staff%' or v_cat ilike 'salar%' or v_cat ilike 'wage%' then gl_acct('expense_wages_one_off')
      when v_cat ilike 'training%'             then gl_acct('expense_professional_fees')
      when v_cat ilike 'food%' or v_cat ilike '%beverage%' then gl_acct('expense_supplies')
      else gl_acct('expense_other_opex')
    end;
  else
    raise exception 'unknown expense source %', p_source;
  end if;

  if coalesce(v_amount,0) = 0 then return null; end if;

  insert into gl_journal_batches (journal_date, source_type, source_ref, branch_id, memo, status)
  values (coalesce(v_date, current_date), 'expense', v_ref, v_branch, left(coalesce(v_memo,'Expense'),200), 'draft')
  returning id into v_batch;

  insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, debit_lyd, memo)
  values (v_batch, v_acct, v_branch, 1, v_amount, v_memo);
  insert into gl_journal_lines(batch_id, account_id, branch_id, line_no, credit_lyd, memo)
  values (v_batch, gl_acct('cash'), v_branch, 2, v_amount, 'Paid');

  update gl_journal_batches set status='posted' where id = v_batch;
  return v_batch;
end $$;
grant execute on function gl_post_expense(uuid, text) to authenticated, service_role;

-- ── OPENING BALANCES (migration entry point) ────────────────────────────────
-- p_entries: jsonb array of { "code": "1010", "debit": 1000, "credit": 0 }.
-- Posts one balanced 'opening' batch. Raises if unbalanced.
create or replace function gl_post_opening_balances(p_entries jsonb, p_as_of date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
  v_row   jsonb;
  v_acct  uuid;
  v_d     numeric(14,2);
  v_c     numeric(14,2);
  v_n     int := 0;
  v_td    numeric(14,2) := 0;
  v_tc    numeric(14,2) := 0;
begin
  delete from gl_journal_batches where source_type='opening' and source_ref = to_char(p_as_of,'YYYY-MM-DD');

  insert into gl_journal_batches (journal_date, source_type, source_ref, memo, status)
  values (p_as_of, 'opening', to_char(p_as_of,'YYYY-MM-DD'), 'Opening balances', 'draft')
  returning id into v_batch;

  for v_row in select * from jsonb_array_elements(p_entries) loop
    select id into v_acct from gl_accounts where code = (v_row->>'code');
    if v_acct is null then raise exception 'unknown account code %', v_row->>'code'; end if;
    v_d := coalesce((v_row->>'debit')::numeric, 0);
    v_c := coalesce((v_row->>'credit')::numeric, 0);
    if v_d = 0 and v_c = 0 then continue; end if;
    v_n := v_n + 1; v_td := v_td + v_d; v_tc := v_tc + v_c;
    if v_d > 0 then
      insert into gl_journal_lines(batch_id, account_id, line_no, debit_lyd, memo)
      values (v_batch, v_acct, v_n, v_d, 'Opening balance');
    else
      insert into gl_journal_lines(batch_id, account_id, line_no, credit_lyd, memo)
      values (v_batch, v_acct, v_n, v_c, 'Opening balance');
    end if;
  end loop;

  if round(v_td,2) <> round(v_tc,2) then
    raise exception 'Opening balances not balanced: debit % <> credit %', v_td, v_tc;
  end if;

  update gl_journal_batches set status='posted' where id = v_batch;  -- trigger re-checks balance
  return v_batch;
end $$;
grant execute on function gl_post_opening_balances(jsonb, date) to authenticated, service_role;

-- ── SYNC ORCHESTRATOR ───────────────────────────────────────────────────────
-- Posts sales (per branch/day) + approved expenses across a range.
-- No-op when auto_post_enabled is false UNLESS p_force = true (the manual
-- "Sync range" button passes true; the nightly cron passes false).
create or replace function gl_sync_period(p_from date, p_to date, p_branch uuid default null, p_force boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_auto   boolean;
  v_day    date;
  v_b      record;
  v_sales  int := 0;
  v_exp    int := 0;
  r        record;
begin
  select auto_post_enabled into v_auto from gl_settings where id='default';
  if not coalesce(v_auto,false) and not p_force then
    return jsonb_build_object('skipped','auto_post_disabled');
  end if;

  v_day := p_from;
  while v_day <= p_to loop
    for v_b in select id from pos_branches where is_active = true and (p_branch is null or id = p_branch) loop
      if gl_post_sales_day(v_day, v_b.id) is not null then v_sales := v_sales + 1; end if;
    end loop;
    v_day := v_day + 1;
  end loop;

  -- Approved expenses in range (both sources).
  for r in select id from expense_entries
           where paid_at between p_from and p_to and (status is null or status='approved') loop
    if gl_post_expense(r.id, 'expense_entries') is not null then v_exp := v_exp + 1; end if;
  end loop;
  for r in select id from expenses
           where expense_date between p_from and p_to and status in ('approved','paid') loop
    if gl_post_expense(r.id, 'expenses') is not null then v_exp := v_exp + 1; end if;
  end loop;

  update gl_settings set last_synced_date = greatest(coalesce(last_synced_date, p_to), p_to), updated_at = now()
   where id='default';

  return jsonb_build_object('sales_batches', v_sales, 'expense_batches', v_exp, 'from', p_from, 'to', p_to);
end $$;
grant execute on function gl_sync_period(date, date, uuid, boolean) to authenticated, service_role;
