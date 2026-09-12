begin;

-- Posting is append-safe: a posted source batch is evidence and must never be
-- deleted by a routine period sync. Corrections use the existing void/replace
-- workflow after review.
create or replace function public.gl_post_sales_day(p_date date, p_branch uuid)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_batch uuid;
  v_ref text := p_branch::text || ':' || to_char(p_date,'YYYY-MM-DD');
  v_lo timestamptz := p_date::timestamp at time zone 'Africa/Tripoli';
  v_hi timestamptz := (p_date+1)::timestamp at time zone 'Africa/Tripoli';
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_refunds numeric(14,2) := 0;
  v_cogs numeric(14,2) := 0;
  v_tender record;
  v_line int := 0;
  v_account uuid;
begin
  select id into v_batch from public.gl_journal_batches
  where source_type='sales_daily' and source_ref=v_ref
    and coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)
      =coalesce(p_branch,'00000000-0000-0000-0000-000000000000'::uuid)
    and status='posted';
  if found then return v_batch; end if;

  -- Revenue belongs to the sale event date. Including subsequently voided
  -- orders preserves the original sale; the dated void event reverses cash.
  select coalesce(sum(o.subtotal),0),coalesce(sum(o.discount_amount),0)
    into v_subtotal,v_discount
  from public.pos_orders o
  where o.branch_id=p_branch
    and exists(select 1 from public.pos_tender_events e where e.order_id=o.id
      and e.event_type='sale' and e.occurred_at>=v_lo and e.occurred_at<v_hi);

  select coalesce(sum(coalesce(p.cost_lyd,0)*i.quantity),0)
    into v_cogs
  from public.pos_order_items i
  join public.pos_orders o on o.id=i.order_id
  left join public.pos_products p on p.id=i.product_id
  where o.branch_id=p_branch
    and exists(select 1 from public.pos_tender_events e where e.order_id=o.id
      and e.event_type='sale' and e.occurred_at>=v_lo and e.occurred_at<v_hi);

  select coalesce(-sum(e.signed_amount_lyd),0) into v_refunds
  from public.pos_tender_events e
  where e.branch_id=p_branch and e.event_type in ('refund','void')
    and e.occurred_at>=v_lo and e.occurred_at<v_hi;

  if v_subtotal=0 and v_refunds=0 and not exists(
    select 1 from public.pos_tender_events e where e.branch_id=p_branch
      and e.occurred_at>=v_lo and e.occurred_at<v_hi
  ) then return null; end if;

  insert into public.gl_journal_batches(journal_date,source_type,source_ref,branch_id,memo,status)
  values(p_date,'sales_daily',v_ref,p_branch,'Daily sales and dated tender activity','draft')
  returning id into v_batch;

  for v_tender in
    select tender_type,round(sum(signed_amount_lyd),2) amount
    from public.pos_tender_events
    where branch_id=p_branch and occurred_at>=v_lo and occurred_at<v_hi
    group by tender_type having round(sum(signed_amount_lyd),2)<>0
  loop
    v_account := case v_tender.tender_type
      when 'card' then public.gl_acct('card_clearing')
      when 'presto' then public.gl_acct('presto_clearing')
      else public.gl_acct('cash') end;
    v_line:=v_line+1;
    if v_tender.amount>0 then
      insert into public.gl_journal_lines(batch_id,account_id,branch_id,line_no,debit_lyd,memo)
      values(v_batch,v_account,p_branch,v_line,v_tender.amount,initcap(v_tender.tender_type)||' receipts');
    else
      insert into public.gl_journal_lines(batch_id,account_id,branch_id,line_no,credit_lyd,memo)
      values(v_batch,v_account,p_branch,v_line,-v_tender.amount,initcap(v_tender.tender_type)||' refunds');
    end if;
  end loop;
  if v_discount<>0 then
    v_line:=v_line+1;
    insert into public.gl_journal_lines(batch_id,account_id,branch_id,line_no,debit_lyd,memo)
    values(v_batch,public.gl_acct('sales_discount'),p_branch,v_line,v_discount,'Discounts');
  end if;
  if v_refunds<>0 then
    v_line:=v_line+1;
    insert into public.gl_journal_lines(batch_id,account_id,branch_id,line_no,debit_lyd,memo)
    values(v_batch,public.gl_acct('sales_refund'),p_branch,v_line,v_refunds,'Refunds and voids on this date');
  end if;
  if v_subtotal<>0 then
    v_line:=v_line+1;
    insert into public.gl_journal_lines(batch_id,account_id,branch_id,line_no,credit_lyd,memo)
    values(v_batch,public.gl_acct('sales_revenue'),p_branch,v_line,v_subtotal,'Gross sales');
  end if;
  if v_cogs<>0 then
    v_line:=v_line+1;
    insert into public.gl_journal_lines(batch_id,account_id,branch_id,line_no,debit_lyd,memo)
    values(v_batch,public.gl_acct('cogs'),p_branch,v_line,v_cogs,'COGS at sale');
    v_line:=v_line+1;
    insert into public.gl_journal_lines(batch_id,account_id,branch_id,line_no,credit_lyd,memo)
    values(v_batch,public.gl_acct('inventory'),p_branch,v_line,v_cogs,'Inventory relief at sale');
  end if;
  update public.gl_journal_batches set status='posted' where id=v_batch;
  return v_batch;
end $$;

create or replace function public.gl_post_expense(p_id uuid,p_source text)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_batch uuid; v_ref text:=p_source||':'||p_id::text;
  v_amount numeric(14,2); v_date date; v_branch uuid; v_acct uuid;
  v_pay_acct uuid; v_memo text; v_cat text; v_funding text; v_status text;
begin
  select id into v_batch from public.gl_journal_batches
  where source_type='expense' and source_ref=v_ref and status='posted';
  if found then return v_batch; end if;
  if p_source='expense_entries' then
    select amount_lyd,paid_at,branch_id,category,coalesce(vendor,notes,'Expense'),status
      into v_amount,v_date,v_branch,v_cat,v_memo,v_status
    from public.expense_entries where id=p_id;
    if not found or coalesce(v_status,'approved')<>'approved' then return null; end if;
    v_acct:=case when v_cat='capex' then public.gl_acct('capex_fixed_assets')
      else coalesce(public.gl_acct('expense_'||v_cat),public.gl_acct('expense_other_opex')) end;
    v_pay_acct:=public.gl_acct('cash');
  elsif p_source='expenses' then
    select coalesce(e.amount_lyd,e.amount*coalesce(e.exchange_rate_to_lyd,1)),
      coalesce(e.paid_at,case when e.receipt_url is not null and e.source like 'snap_%'
        then (coalesce(e.submitted_at,now()) at time zone 'Africa/Tripoli')::date else e.expense_date end),
      null::uuid,coalesce(c.name,'Expense'),coalesce(e.vendor,e.description,c.name,'Expense'),
      e.status,e.funding_type
      into v_amount,v_date,v_branch,v_cat,v_memo,v_status,v_funding
    from public.expenses e left join public.expense_categories c on c.id=e.category_id where e.id=p_id;
    if not found or (v_status<>'paid' and not exists(select 1 from public.expenses e
      where e.id=p_id and e.payment_status_reported='paid' and e.funding_type in ('shareholder_loan','capital_injection'))) then return null; end if;
    v_acct:=public.gl_account_for_expense_name(v_cat);
    select case when e.funding_type='shareholder_loan' then coalesce(public.gl_acct('shareholder_loan'),(select id from public.gl_accounts where code='2300'))
      when e.funding_type='capital_injection' then coalesce(public.gl_acct('owner_capital'),(select id from public.gl_accounts where code='3000'))
      when e.payment_account_key='bank' then public.gl_acct('bank') else public.gl_acct('cash') end
      into v_pay_acct from public.expenses e where e.id=p_id;
  else raise exception 'unknown expense source %',p_source; end if;
  if coalesce(v_amount,0)<=0 or v_date is null or v_acct is null or v_pay_acct is null then
    raise exception 'expense posting evidence or account mapping is incomplete'; end if;
  insert into public.gl_journal_batches(journal_date,source_type,source_ref,branch_id,memo,status)
  values(v_date,'expense',v_ref,v_branch,left(v_memo,200),'draft') returning id into v_batch;
  insert into public.gl_journal_lines(batch_id,account_id,branch_id,line_no,debit_lyd,memo)
  values(v_batch,v_acct,v_branch,1,v_amount,v_memo);
  insert into public.gl_journal_lines(batch_id,account_id,branch_id,line_no,credit_lyd,memo)
  values(v_batch,v_pay_acct,v_branch,2,v_amount,'Paid');
  update public.gl_journal_batches set status='posted' where id=v_batch;
  return v_batch;
end $$;

create or replace function public.gl_sync_period(p_from date,p_to date,p_branch uuid default null,p_force boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_auto boolean; v_day date; v_end date; v_b record; v_sales int:=0; v_exp int:=0; r record;
begin
  if p_from is null or p_to is null or p_from>p_to then raise exception 'invalid posting period'; end if;
  select auto_post_enabled into v_auto from public.gl_settings where id='default';
  if not coalesce(v_auto,false) and not p_force then return jsonb_build_object('skipped','auto_post_disabled'); end if;
  v_end:=least(p_to,(now() at time zone 'Africa/Tripoli')::date-1);
  v_day:=p_from;
  while v_day<=v_end loop
    for v_b in select id from public.pos_branches where is_active=true and (p_branch is null or id=p_branch) loop
      if public.gl_post_sales_day(v_day,v_b.id) is not null then v_sales:=v_sales+1; end if;
    end loop; v_day:=v_day+1;
  end loop;
  for r in select id from public.expense_entries where paid_at between p_from and p_to and (status is null or status='approved') loop
    if public.gl_post_expense(r.id,'expense_entries') is not null then v_exp:=v_exp+1; end if;
  end loop;
  for r in select id from public.expenses where paid_at between p_from and p_to and status='paid' loop
    if public.gl_post_expense(r.id,'expenses') is not null then v_exp:=v_exp+1; end if;
  end loop;
  update public.gl_settings set last_synced_date=greatest(coalesce(last_synced_date,v_end),v_end),updated_at=now()
  where id='default' and v_end>=p_from;
  return jsonb_build_object('sales_batches',v_sales,'expense_batches',v_exp,'from',p_from,'through',v_end,'requested_to',p_to);
end $$;

-- Match PostgREST's column conflict target and treat two blank descriptions as
-- the same statement row.
drop index if exists public.bank_transactions_dedupe_uidx;
create unique index bank_transactions_dedupe_uidx on public.bank_transactions
  (account_label,posted_at,amount_lyd,description) nulls not distinct;

grant execute on function public.gl_post_sales_day(date,uuid) to authenticated,service_role;
grant execute on function public.gl_post_expense(uuid,text) to authenticated,service_role;
grant execute on function public.gl_sync_period(date,date,uuid,boolean) to authenticated,service_role;

commit;
