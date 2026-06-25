select 'finance_expense_documents_exists' as check_name,
       case when to_regclass('public.finance_expense_documents') is not null then 'ok' else 'missing' end as result;

select 'procurement_payables_status_exists' as check_name,
       case when to_regclass('public.procurement_payables_status') is not null then 'ok' else 'missing' end as result;

select 'inventory_stock_valuation_exists' as check_name,
       case when to_regclass('public.inventory_stock_valuation') is not null then 'ok' else 'missing' end as result;

select 'inventory_reorder_suggestions_exists' as check_name,
       case when to_regclass('public.inventory_reorder_suggestions') is not null then 'ok' else 'missing' end as result;

select 'create_pos_order_rpc_exists' as check_name,
       case when to_regprocedure('public.create_pos_order(uuid,uuid,uuid,uuid,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric,uuid,timestamp with time zone,text,jsonb,text,text)') is not null then 'ok' else 'missing' end as result;

select 'receive_procurement_order_v2_rpc_exists' as check_name,
       case when to_regprocedure('public.receive_procurement_order_v2(uuid,numeric,timestamp with time zone,boolean,text,uuid)') is not null then 'ok' else 'missing' end as result;

select 'return_procurement_order_rpc_exists' as check_name,
       case when to_regprocedure('public.return_procurement_order(uuid,numeric,timestamp with time zone,text,uuid)') is not null then 'ok' else 'missing' end as result;

select 'pay_procurement_order_rpc_exists' as check_name,
       case when to_regprocedure('public.pay_procurement_order(uuid,text,date,text)') is not null then 'ok' else 'missing' end as result;

select 'annotate_pos_sale_override_rpc_exists' as check_name,
       case when to_regprocedure('public.annotate_pos_sale_override(uuid,uuid,text)') is not null then 'ok' else 'missing' end as result;

select 'annotate_shift_close_operator_rpc_exists' as check_name,
       case when to_regprocedure('public.annotate_shift_close_operator(uuid,uuid)') is not null then 'ok' else 'missing' end as result;

select 'gl_ap_aging_rpc_exists' as check_name,
       case when to_regprocedure('public.gl_ap_aging(date,uuid)') is not null then 'ok' else 'missing' end as result;

select 'gl_supplier_statement_rpc_exists' as check_name,
       case when to_regprocedure('public.gl_supplier_statement(text,date,uuid)') is not null then 'ok' else 'missing' end as result;

select 'gl_cash_flow_statement_rpc_exists' as check_name,
       case when to_regprocedure('public.gl_cash_flow_statement(date,date,uuid)') is not null then 'ok' else 'missing' end as result;

select 'gl_statement_lines_rpc_exists' as check_name,
       case when to_regprocedure('public.gl_statement_lines(date,date,uuid)') is not null then 'ok' else 'missing' end as result;

select 'pos_orders_manager_override_column' as check_name,
       case when exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'pos_orders'
           and column_name = 'manager_override_by'
       ) then 'ok' else 'missing' end as result;

select 'pos_shifts_closed_by_column' as check_name,
       case when exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'pos_shifts'
           and column_name = 'closed_by'
       ) then 'ok' else 'missing' end as result;

select 'procurement_orders_return_columns' as check_name,
       case when (
         select count(*)
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'procurement_orders'
           and column_name in ('quantity_received', 'quantity_returned', 'payment_status')
       ) = 3 then 'ok' else 'missing' end as result;

select 'finance_expense_documents_rows' as check_name, count(*)::text as result
from finance_expense_documents;

select 'finance_expense_documents_canonical_rows' as check_name, count(*)::text as result
from finance_expense_documents
where source_table = 'expenses';

select 'procurement_payables_status_rows' as check_name, count(*)::text as result
from procurement_payables_status;

select 'inventory_stock_valuation_rows' as check_name, count(*)::text as result
from inventory_stock_valuation;

select 'inventory_reorder_suggestions_rows' as check_name, count(*)::text as result
from inventory_reorder_suggestions;

select 'gl_ap_aging_rows' as check_name, count(*)::text as result
from gl_ap_aging(current_date, null);

with supplier_seed as (
  select supplier_name
  from procurement_payables_status
  where supplier_name is not null
  order by supplier_name
  limit 1
)
select 'gl_supplier_statement_rows' as check_name, count(*)::text as result
from supplier_seed s
cross join lateral gl_supplier_statement(s.supplier_name, current_date, null);

select 'gl_cash_flow_statement_rows' as check_name, count(*)::text as result
from gl_cash_flow_statement(current_date - 30, current_date, null);

select 'gl_statement_lines_rows' as check_name, count(*)::text as result
from gl_statement_lines(current_date - 30, current_date, null);
