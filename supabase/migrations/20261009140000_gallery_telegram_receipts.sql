-- Allow Gallery Mall expense receipts without opening the branch for POS sales.
alter table public.cost_centers
  add column if not exists allow_telegram_receipts boolean not null default false;

update public.cost_centers
set allow_telegram_receipts = true
where id = 'CC02'
  and pos_branch_id = '1332e9b6-8137-40fb-ad3e-074521c32ffb';
