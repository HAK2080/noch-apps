# Noch Accounting & Finance Module — Plan

**Author:** Opus 4.7 · **Date:** 2026-05-07 · **Status:** Design only — no code.

This is the planning document the user asked for at the end of the POS audit-fix work: a finance/accounting module for `apps.noch.cloud` covering full reporting of sales, costs, lease, salaries, projections, and the kind of ledger view that purpose-built F&B accounting software provides. It's intentionally written as a sequenced plan, not a single mega-spec.

---

## 1. Goals (what "good" looks like)

1. **One screen that answers: "did we make money this month?"** P&L by branch + consolidated, current month + last 12 months, with a clear cash-vs-accrual flag.
2. **One screen that answers: "where is my cash?"** Cash on hand, in safe, in bank(s), in Presto-receivable, in supplier-payable. Reconcilable to within 0.01 LYD against POS shifts.
3. **One screen that answers: "is each branch carrying its weight?"** Per-branch contribution: revenue, COGS, labour, rent, overhead, EBITDA, margin trend.
4. **One screen that answers: "what does the next 90 days look like?"** Forward cash projection: confirmed inflows + scheduled outflows + scenario sliders.
5. **An ops surface that makes the bookkeeping data entry low-effort:** receipts photographed at the till are categorised, recurring rent/salary entries auto-post, supplier invoices have a single template per supplier.

The system is not an audited accounting platform. It's an operator's finance dashboard with the discipline of double-entry under the hood, so it will reconcile cleanly when the year-end accountant pulls a trial balance.

---

## 2. Non-goals

- Replacing a chartered accountant or tax filing.
- Multi-currency. LYD only for v1; foreign-currency supplier invoices in v2.
- Inventory valuation at cost (FIFO/weighted-average) — POS already tracks stock movement, but valuation needs a costed-recipe layer; that's its own project.
- Payroll calculation (overtime rules, leave accrual). Salaries are recorded as flat monthly entries for now.
- VAT compliance. Libya has no VAT today; the schema is VAT-ready but no logic ships.

---

## 3. Architecture in one paragraph

A new schema namespace `acc_*` running alongside the existing `pos_*` schema in the same Supabase database. The POS posts every completed sale to a journal entry automatically (via trigger or RPC). Manual entries (rent, salaries, supplier invoices, owner draws) come from a dedicated UI. Reports are built on materialised views refreshed nightly + a few real-time views for "what's in the drawer right now." All numbers go through the same money helper [`src/modules/pos/lib/money.js`](src/modules/pos/lib/money.js) so 2-dp rounding is consistent with the POS.

---

## 4. Schema (proposed)

```
acc_accounts                   chart of accounts
  id                          uuid pk
  code                        text  -- '4000', '5100', etc.
  name                        text
  type                        text  -- 'asset'|'liability'|'equity'|'income'|'expense'
  parent_id                   uuid  -- for tree (Cash > Cash on Hand > Hay Alandlous)
  branch_scoped               bool  -- true = one row per branch
  is_active                   bool

acc_journal_entries            header
  id                          uuid pk
  posted_at                   timestamptz
  source                      text  -- 'pos_sale'|'manual'|'recurring'|'supplier_invoice'|'payroll'|'transfer'
  source_id                   uuid  -- FK to pos_orders.id, supplier_invoice.id, etc.
  branch_id                   uuid  -- nullable (corporate-level entries)
  description                 text
  created_by                  uuid
  reversed_by                 uuid
  audit_log                   jsonb

acc_journal_lines              double-entry detail
  id                          uuid pk
  entry_id                    uuid fk
  account_id                  uuid fk
  branch_id                   uuid  -- denormalised for fast per-branch reporting
  debit                       numeric(12,2)
  credit                      numeric(12,2)
  memo                        text
  -- CHECK (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)

acc_suppliers                  vendor master
  id, name, tax_id, default_account_id, contact, payment_terms_days

acc_supplier_invoices          AP
  id, supplier_id, branch_id, invoice_no, issued_at, due_at,
  total, status ('open'|'paid'|'partial'|'void'),
  attachment_url, posted_journal_entry_id

acc_supplier_payments          AP payments
  id, invoice_id, paid_at, amount, method ('cash'|'bank'|'card'|'crypto'),
  reference, posted_journal_entry_id

acc_recurring                  rent, salaries, subscriptions
  id, name, frequency ('monthly'|'weekly'|'yearly'),
  next_due, amount, account_id, branch_id, is_active

acc_employees                  staff master (links profiles)
  id, profile_id, branch_id, role,
  base_salary_monthly, salary_currency,
  start_date, end_date, bank_account, notes

acc_payroll_runs               monthly run header
  id, period_month (date), branch_id, status ('draft'|'posted'),
  total_gross, total_deductions, total_net,
  posted_journal_entry_id

acc_payroll_lines              per-employee
  id, run_id, employee_id, gross, deductions, bonuses, net,
  paid_at, paid_journal_entry_id

acc_bank_accounts              cash + bank reconciliation
  id, name, account_id (FK to acc_accounts), opening_balance, currency, is_active

acc_bank_transactions          bank reconciliation
  id, bank_account_id, dated, amount, memo,
  matched_journal_line_id  -- nullable until reconciled

acc_budgets                    forecast scaffolding
  id, period_month, branch_id, account_id, budgeted_amount

acc_projections                cashflow projection inputs
  id, label, kind ('one_off'|'recurring'),
  amount, probability_pct, scheduled_for, account_id, branch_id
```

**Why double-entry?** Every transaction has both a source and a destination. A sale is `Cash +X / Sales Revenue +X`. A rent payment is `Bank −X / Rent Expense +X`. Buying a coffee grinder is `Equipment +X / Bank −X`. Without this, you can't separate "we have money" from "we made money." Single-entry shortcuts always come back as bugs at year-end.

---

## 5. Auto-posting from POS

A new trigger or RPC `acc_post_pos_order(p_order_id)` runs after `create_pos_order` succeeds. For a typical sale:

```
Cash on Hand (branch)              +cash_amt
Card Receivable (Verifone)         +card_amt
Presto Receivable                  +presto_amt    -- 'owed by Presto'
Sales — Drinks                     -subtotal
Discount Given                     +discount_amount  (contra-revenue)
```

Voids reverse the same lines (already audited via `pos_audit_log`). Refunds post to a `Refunds Given` contra-revenue account so the gross revenue line stays unchanged for the period. Cash movements post to `Petty Cash`, `Tip Out`, `Safe Drop` accounts.

Cash drawer reconciliation at end of shift becomes a posted entry automatically: shortage → `Cash Variance Expense`; surplus → `Other Income`.

This is the load-bearing piece. Once POS auto-posts, every sale, void, refund, and shift close shows up in the P&L without any manual data entry.

---

## 6. UI surfaces (in priority order)

### v1 — read-only reporting (no manual entry)

1. **Dashboard** (`/acc`) — KPIs: revenue MTD, COGS MTD (placeholder until recipe-cost lands), gross profit, cash on hand, expected cash today, presto receivable, owner net.
2. **P&L** (`/acc/pnl`) — month picker, by-branch columns + consolidated. Grouped by income / COGS / labour / rent / overhead / other. Click a row to drill to journal lines.
3. **Cash position** (`/acc/cash`) — list of cash + bank accounts with current balance, reconciled-as-of date, presto-receivable aging.
4. **Daily ledger** (`/acc/journal`) — list of journal entries with filters; export to CSV for the accountant.
5. **Sales report** (already shipped in `/pos/:branchId/reports`) — link from the accounting dashboard.

### v2 — manual entry surfaces

6. **Suppliers / AP** (`/acc/suppliers`) — supplier master, invoice entry, photo of invoice, mark paid → posts the journal entry.
7. **Recurring** (`/acc/recurring`) — set up rent and monthly subscriptions; cron creates draft entries on the due date that the operator approves.
8. **Salaries** (`/acc/payroll`) — monthly payroll run. Pulls active employees, lets owner adjust per-line, posts.
9. **Bank reconciliation** (`/acc/banks/:id/reconcile`) — paste the bank statement (CSV or pasted lines), tool matches to journal lines and surfaces unmatched.
10. **Manual journal** (`/acc/journal/new`) — for the rare entry that doesn't fit elsewhere. Owner-only.

### v3 — projections and budgeting

11. **Projection** (`/acc/projection`) — 90-day cashflow chart with scenarios (best/expected/worst) plus a projection-input list.
12. **Budgets** (`/acc/budget`) — month-over-month variance vs budget, by account, by branch.

---

## 7. Reporting design

- **P&L generator** is a single SQL query against `acc_journal_lines` joined to `acc_accounts`, grouped by `account.type` and a configurable `account.report_group` field. Output is materialised nightly per (branch, month).
- **Cash flow statement** is derived from journal lines tagged `acc_accounts.is_cash = true`; in/out per period.
- **Balance sheet** is the period-end snapshot of asset/liability/equity accounts.
- **Per-branch contribution margin** is revenue minus directly-attributable COGS + labour + rent. Overhead allocation rule lives in `acc_settings.overhead_alloc` (split by revenue or by headcount).
- **Forecasting** is naive-linear by default (last-3-month average of each line) plus user-entered `acc_projections` rows for known one-offs. Better forecasting (seasonality, growth-rate input) can be added later — the data structure supports it.

---

## 8. Sequencing (proposed, with effort estimates)

| Phase | Scope | Effort |
|---|---|---|
| **Phase 0** | Chart of accounts seed (LYD, café-shaped: Cash, Bank, Card Receivable, Presto Receivable, Sales — Drinks, Sales — Food, COGS — Drinks, COGS — Food, Wages, Rent, Utilities, Marketing, Owner Draw, Equipment, etc.). 30–50 accounts. | S |
| **Phase 1** | `acc_*` tables + auto-posting RPC for POS sales/voids/refunds + cash movements. Backfill for existing data. | M |
| **Phase 2** | Read-only Dashboard + P&L + Cash + Daily Ledger pages. Materialised views for nightly aggregation. | M |
| **Phase 3** | Manual journal + Suppliers / AP + Recurring entries. | M |
| **Phase 4** | Salaries / payroll (simplified flat-monthly model). | M |
| **Phase 5** | Bank reconciliation tool. | M |
| **Phase 6** | Projection + budget UI. | M |
| **Phase 7** | Per-branch contribution margin + cost-of-goods integration via the recipes module (separate effort, blocks on costed-recipe data). | L |

**Total v1+v2 (Phases 0–4): ~3 weeks of focused build.** v3 (Phases 5–7): another 2–3 weeks.

---

## 9. Ten questions to answer before Phase 1

1. **Cash vs accrual.** Default the books to cash basis (simpler, matches sole-operator reality) and add an accrual toggle later? Recommend yes.
2. **Tax position.** Confirmed Libya has no VAT today. Is there any sales tax / income-tax withholding owner needs to surface? If yes, schema needs `tax_amount` + tax accounts now.
3. **Card settlement timing.** Verifone settles to which bank account, on what day? Need this to model `Card Receivable → Bank` aging.
4. **Presto reconciliation cadence.** Daily? Weekly? Determines the dunning view.
5. **Rent frequency and schedule.** Monthly fixed? Annual lump-sum amortised? Determines `acc_recurring` setup.
6. **Salary payment day.** Determines monthly payroll run timing.
7. **Owner draws vs salary.** Is the owner's compensation a salary (expense) or a draw (equity)? Tax treatment differs even informally.
8. **Multiple legal entities** — are the branches under the same trade licence or separate legal entities? Affects whether consolidation needs an inter-company line.
9. **Bookkeeper handoff format.** What does the year-end accountant want — Excel trial balance? Specific file from QuickBooks/Sage Libya? Dictates export format.
10. **Branch P&L allocation.** Should overhead (corporate marketing spend, owner salary, head-office rent if any) be allocated to branches by revenue share, headcount, or kept at "corporate" level?

These don't all have to be answered before starting Phase 0, but they shape Phase 2 and beyond.

---

## 10. Risks

- **Backfilling historical data** is a large one-off effort. Either start clean (period-start opening balances) or commit a week to back-importing prior months' POS sales and known expenses.
- **Recipe-cost integration** for true gross margin is contingent on the recipes module having ingredient costs and yields. That data isn't reliable today (per the existing Recipes module audit). Phase 7 should be planned only after the recipes data is solid.
- **Trust of auto-posting.** A bug in `acc_post_pos_order` posts wrong journal entries silently. Mitigation: every auto-post writes a `posted_journal_entry_id` back to the source row, and a nightly job verifies `sum(journal_lines for source) = source.total` for every POS order.
- **Permissions.** Owner-only by default. Manager role can read but not post manual entries. RLS policies need careful design — accidentally exposing finance data to baristas is the worst-case leak.

---

## 11. What to do next

The user has asked to "execute all" of the POS feature list. The accounting module is bigger than the rest combined and shouldn't be sequenced into the same session. Recommend:

1. Land all POS feature work and verify on the actual hardware first.
2. Spend a 30-minute call on the 10 questions in §9.
3. Start with **Phase 0 + Phase 1** as the first accounting commit (chart of accounts + auto-posting). After that lands, the system will be silently capturing every sale into the right ledger with no extra effort, and the first usable reports come online in Phase 2.

This document is the contract for that work. Update it as decisions come in.
