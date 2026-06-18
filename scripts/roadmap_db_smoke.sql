select 'finance_expense_documents' as check_name, count(*)::int as row_count
from finance_expense_documents;

select 'procurement_payables_status' as check_name, count(*)::int as row_count
from procurement_payables_status;

select 'inventory_stock_valuation' as check_name, count(*)::int as row_count
from inventory_stock_valuation;

select 'inventory_reorder_suggestions' as check_name, count(*)::int as row_count
from inventory_reorder_suggestions;

select 'gl_ap_aging' as check_name, count(*)::int as row_count
from gl_ap_aging(current_date, null);
