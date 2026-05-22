-- Give data_entry visibility over all submitted expenses.
-- They can view and submit on behalf of the business, but approve/reject/paid
-- actions are guarded by isOwner in ExpensesPage, so they cannot action them.

UPDATE role_permissions
SET can_access = true, can_edit = true, updated_at = now()
WHERE role = 'data_entry' AND feature = 'expenses_approve';
