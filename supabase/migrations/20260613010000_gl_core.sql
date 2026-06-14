-- General Ledger — core schema (chart of accounts, journals, lines, settings, map).
-- Double-entry backbone. Additive + idempotent. Creates only gl_* objects;
-- touches nothing in pos_* / finance_* / expenses.
--
-- Posting is OFF by default (gl_settings.auto_post_enabled = false). This
-- migration only defines structures + seeds a standard, fully-editable
-- F&B chart of accounts. No automatic entries are created.

-- ── 1. CHART OF ACCOUNTS (tree) ─────────────────────────────────────────────
create table if not exists gl_accounts (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name_en        text not null,
  name_ar        text not null,
  type           text not null check (type in ('asset','liability','equity','revenue','cogs','expense')),
  parent_id      uuid references gl_accounts(id) on delete set null,
  normal_balance text not null check (normal_balance in ('debit','credit')),
  is_postable    boolean not null default true,   -- only leaf/postable accounts accept lines
  is_active      boolean not null default true,
  created_at     timestamptz default now()
);
create index if not exists gl_accounts_type_idx on gl_accounts(type);
create index if not exists gl_accounts_parent_idx on gl_accounts(parent_id);

-- ── 2. JOURNAL BATCHES (دفتر اليومية — header) ──────────────────────────────
create table if not exists gl_journal_batches (
  id           uuid primary key default gen_random_uuid(),
  batch_no     text,
  journal_date date not null,
  source_type  text not null default 'manual'
    check (source_type in ('manual','opening','sales_daily','expense','payroll','cash','capex')),
  source_ref   text,                         -- e.g. expense id, or 'branchid:date' for sales_daily
  branch_id    uuid references pos_branches(id),
  memo         text,
  status       text not null default 'draft' check (status in ('draft','posted','void')),
  total_debit  numeric(14,2) not null default 0,
  total_credit numeric(14,2) not null default 0,
  created_by   uuid references profiles(id),
  created_at   timestamptz default now(),
  posted_at    timestamptz
);
-- Idempotency: at most one batch per (source_type, source_ref, branch) when
-- source_ref is set. Auto-posting deletes+reinserts against this key.
create unique index if not exists gl_journal_batches_source_uidx
  on gl_journal_batches(source_type, source_ref, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where source_ref is not null;
create index if not exists gl_journal_batches_date_idx on gl_journal_batches(journal_date);

-- ── 3. JOURNAL LINES ────────────────────────────────────────────────────────
create table if not exists gl_journal_lines (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references gl_journal_batches(id) on delete cascade,
  account_id uuid not null references gl_accounts(id),
  branch_id  uuid references pos_branches(id),
  line_no    int default 0,
  debit_lyd  numeric(14,2) not null default 0 check (debit_lyd >= 0),
  credit_lyd numeric(14,2) not null default 0 check (credit_lyd >= 0),
  memo       text,
  -- exactly one side carries a positive amount
  constraint gl_line_one_side check (
    (debit_lyd > 0 and credit_lyd = 0) or (credit_lyd > 0 and debit_lyd = 0)
  )
);
create index if not exists gl_journal_lines_batch_idx on gl_journal_lines(batch_id);
create index if not exists gl_journal_lines_account_idx on gl_journal_lines(account_id);

-- ── 4. SETTINGS (singleton) ─────────────────────────────────────────────────
create table if not exists gl_settings (
  id                          text primary key default 'default' check (id = 'default'),
  base_currency               text default 'LYD',
  fiscal_year_start_month     int  default 1 check (fiscal_year_start_month between 1 and 12),
  auto_post_enabled           boolean default false,   -- master auto-posting switch (OFF)
  last_synced_date            date,
  retained_earnings_account_id uuid references gl_accounts(id),
  current_year_earnings_account_id uuid references gl_accounts(id),
  updated_at                  timestamptz default now()
);
insert into gl_settings (id) values ('default') on conflict do nothing;

-- ── 5. ACCOUNT MAP (posting key → account) ──────────────────────────────────
-- Lets the owner/accountant control exactly where each event posts without
-- code changes. Seeded below to the standard accounts.
create table if not exists gl_account_map (
  key        text primary key,
  account_id uuid references gl_accounts(id),
  label      text
);

-- ── 6. BALANCE INTEGRITY ────────────────────────────────────────────────────
-- Recompute batch totals whenever lines change.
create or replace function gl_recompute_batch_totals() returns trigger
language plpgsql as $$
declare
  b uuid := coalesce(new.batch_id, old.batch_id);
begin
  update gl_journal_batches j
     set total_debit  = coalesce((select sum(debit_lyd)  from gl_journal_lines where batch_id = b), 0),
         total_credit = coalesce((select sum(credit_lyd) from gl_journal_lines where batch_id = b), 0)
   where j.id = b;
  return null;
end $$;

drop trigger if exists gl_lines_recompute_trg on gl_journal_lines;
create trigger gl_lines_recompute_trg
  after insert or update or delete on gl_journal_lines
  for each row execute function gl_recompute_batch_totals();

-- A batch may only be 'posted' when balanced (debits = credits, both > 0).
create or replace function gl_enforce_balanced_on_post() returns trigger
language plpgsql as $$
begin
  if new.status = 'posted' then
    if round(new.total_debit, 2) <> round(new.total_credit, 2) then
      raise exception 'Journal % is not balanced: debit % <> credit %',
        coalesce(new.batch_no, new.id::text), new.total_debit, new.total_credit;
    end if;
    if new.total_debit = 0 then
      raise exception 'Journal % has no lines', coalesce(new.batch_no, new.id::text);
    end if;
    if new.posted_at is null then new.posted_at := now(); end if;
  end if;
  return new;
end $$;

drop trigger if exists gl_batch_balance_trg on gl_journal_batches;
create trigger gl_batch_balance_trg
  before update on gl_journal_batches
  for each row execute function gl_enforce_balanced_on_post();

-- ── 7. RLS — owner full CRUD (accountant policies added in Migration B) ──────
do $$
declare t text;
begin
  foreach t in array array['gl_accounts','gl_journal_batches','gl_journal_lines','gl_settings','gl_account_map'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%I_owner_all" on %I', t, t);
    execute format($f$create policy "%I_owner_all" on %I
      for all to authenticated
      using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'))
      with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner'))$f$, t, t);
  end loop;
end $$;

-- ── 8. SEED: standard F&B chart of accounts (AR + EN, fully editable) ────────
-- Parent (header) accounts are is_postable = false; leaves accept lines.
insert into gl_accounts (code, name_en, name_ar, type, normal_balance, is_postable) values
  -- Assets (1000)
  ('1000','Assets','الأصول','asset','debit',false),
  ('1010','Cash on hand','النقدية بالصندوق','asset','debit',true),
  ('1020','Card clearing','تحصيلات البطاقات','asset','debit',true),
  ('1025','Presto clearing','تحصيلات بريستو','asset','debit',true),
  ('1040','Bank','البنك','asset','debit',true),
  ('1200','Inventory','المخزون','asset','debit',true),
  ('1500','Fixed assets','الأصول الثابتة','asset','debit',true),
  ('1590','Accumulated depreciation','مجمع الإهلاك','asset','credit',true),
  -- Liabilities (2000)
  ('2000','Liabilities','الالتزامات','liability','credit',false),
  ('2010','Accounts payable','الذمم الدائنة','liability','credit',true),
  ('2100','Wages payable','أجور مستحقة','liability','credit',true),
  ('2200','VAT payable','ضريبة القيمة المضافة المستحقة','liability','credit',true),
  -- Equity (3000)
  ('3000','Owner capital','رأس مال المالك','equity','credit',true),
  ('3100','Retained earnings','الأرباح المحتجزة','equity','credit',true),
  ('3200','Current-year earnings','أرباح السنة الحالية','equity','credit',true),
  -- Revenue (4000)
  ('4000','Revenue','الإيرادات','revenue','credit',false),
  ('4010','Sales — food & drink','مبيعات — مأكولات ومشروبات','revenue','credit',true),
  ('4090','Sales discounts','خصومات المبيعات','revenue','debit',true),
  ('4095','Sales refunds','مرتجعات المبيعات','revenue','debit',true),
  -- COGS (5000)
  ('5000','Cost of goods sold','تكلفة البضاعة المباعة','cogs','debit',false),
  ('5010','COGS','تكلفة المبيعات','cogs','debit',true),
  ('5020','Modifier COGS','تكلفة الإضافات','cogs','debit',true),
  -- Expenses (6000)
  ('6000','Operating expenses','المصروفات التشغيلية','expense','debit',false),
  ('6100','Rent','الإيجار','expense','debit',true),
  ('6200','Utilities','المرافق','expense','debit',true),
  ('6300','Marketing','التسويق','expense','debit',true),
  ('6400','Supplies','المستلزمات','expense','debit',true),
  ('6500','Maintenance','الصيانة','expense','debit',true),
  ('6600','Wages','الأجور','expense','debit',true),
  ('6700','Professional fees','أتعاب مهنية','expense','debit',true),
  ('6800','Licenses','التراخيص','expense','debit',true),
  ('6900','Bank fees','رسوم بنكية','expense','debit',true),
  ('6950','Depreciation expense','مصروف الإهلاك','expense','debit',true),
  ('6990','Other operating expense','مصروفات تشغيلية أخرى','expense','debit',true)
on conflict (code) do nothing;

-- Parent links (by code) — idempotent.
update gl_accounts c set parent_id = p.id
from gl_accounts p
where p.code = left(c.code,1) || '000'
  and c.code <> p.code
  and c.parent_id is distinct from p.id;

-- Retained / current-year earnings pointers.
update gl_settings s set
  retained_earnings_account_id     = (select id from gl_accounts where code='3100'),
  current_year_earnings_account_id = (select id from gl_accounts where code='3200')
where s.id = 'default';

-- ── 9. SEED: account map (posting key → account) ────────────────────────────
insert into gl_account_map (key, account_id, label)
select v.key, a.id, v.label
from (values
  ('cash',            '1010','Cash on hand'),
  ('card_clearing',   '1020','Card clearing'),
  ('presto_clearing', '1025','Presto clearing'),
  ('bank',            '1040','Bank'),
  ('inventory',       '1200','Inventory'),
  ('capex_fixed_assets','1500','Fixed assets'),
  ('accumulated_depreciation','1590','Accumulated depreciation'),
  ('accounts_payable','2010','Accounts payable'),
  ('wages_payable',   '2100','Wages payable'),
  ('sales_revenue',   '4010','Sales — food & drink'),
  ('sales_discount',  '4090','Sales discounts'),
  ('sales_refund',    '4095','Sales refunds'),
  ('cogs',            '5010','COGS'),
  ('modifier_cogs',   '5020','Modifier COGS'),
  -- one key per expense_entries.category enum value
  ('expense_rent',         '6100','Rent'),
  ('expense_utilities',    '6200','Utilities'),
  ('expense_marketing',    '6300','Marketing'),
  ('expense_supplies',     '6400','Supplies'),
  ('expense_maintenance',  '6500','Maintenance'),
  ('expense_wages_one_off','6600','Wages'),
  ('expense_professional_fees','6700','Professional fees'),
  ('expense_licenses',     '6800','Licenses'),
  ('expense_bank_fees',    '6900','Bank fees'),
  ('expense_other_opex',   '6990','Other operating expense'),
  ('depreciation_expense', '6950','Depreciation expense')
) as v(key, code, label)
join gl_accounts a on a.code = v.code
on conflict (key) do nothing;
