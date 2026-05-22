-- Add "paid_by" (source of payment) to expenses
alter table expenses add column if not exists paid_by text default 'Business';
