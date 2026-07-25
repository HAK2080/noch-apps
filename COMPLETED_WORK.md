## 2026-07-25 — Submitter-Reported Expense Payment

- **Agent**: Codex
- **Status**: Complete locally
- **Files**:
  - `apps/pos/src/pages/expenses/SubmitTab.jsx`
  - `apps/pos/src/pages/expenses/ApproveTab.jsx`
  - `apps/pos/src/pages/expenses/MyExpensesTab.jsx`
  - `apps/pos/src/pages/expenses/PaymentDeclarationBadge.jsx`
  - `apps/pos/src/pages/snap/SnapReceipt.jsx`
  - `apps/pos/src/lib/i18n.js`
  - `supabase/functions/expense-snap/index.ts`
  - `supabase/functions/telegram-webhook/index.ts`
  - `supabase/migrations/20260725121000_expense_submitter_payment_declaration.sql`
  - `apps/pos/tests/expense-payment-declaration.test.mjs`
- **Description**: Expense submitters now declare unpaid, paid cash, or paid card in the system, Receipt Snap PWA, and Telegram. The declaration is automatically flagged on submitter and owner expense cards. Approval remains separate; when the owner approves a declared-paid expense, the system automatically settles it without asking the owner to classify the payment again.
- **Accounting**: Business cash/card payments post to cash/bank respectively. Personal payments by a shareholder use the existing shareholder loan/capital funding path instead of reducing company cash or bank.
- **Localization**: Added Arabic translations for the new system labels; Telegram and Receipt Snap choices are bilingual Arabic/English.
- **Commit**: Not committed
- **Deployment**: None; requires the migration plus both Edge Functions and POS app to be deployed together.
- **Verification**: 4 regression tests passed, targeted ESLint has no errors (2 pre-existing hook dependency warnings), both Edge Functions parse successfully with esbuild, and the POS production build passed.

---

## 2026-07-25 — Shared Bloom/Noch End-of-Day Closeout

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/src/modules/pos/pages/POSEndOfDay.jsx`
  - `apps/pos/src/modules/pos/lib/end-of-day-close.js`
  - `apps/pos/src/modules/pos/lib/pos-supabase.js`
  - `apps/pos/src/lib/i18n.js`
  - `apps/pos/src/lib/uiAutoTranslate.js`
  - `apps/pos/tests/pos-end-of-day-closeout.test.mjs`
- **Description**: Confirmed Bloom and Noch share one closeout screen. Added visually distinct closeout metrics, full Arabic/English coverage for the complete End-of-Day and cash-movement workflow, Arabic branch/product names when available, and a blank-cash warning that asks the employee to count the register while still allowing an audited close without a count and with an optional note.
- **Localization**: Connected the global legacy UI auto-translator to the main English/Arabic dictionary so existing translations now cover hardcoded legacy labels system-wide.
- **Root Cause**: Blank cash was coerced to numeric zero with no confirmation, and the screen bypassed the language context. The prior one-line button fix only made zero closable.
- **Commit**: `631c4df` (`feat(pos): improve bilingual end-of-day closeout`)
- **Deployment**: Live on `apps.noch.cloud`; GitHub Actions run `30148049040` succeeded and production serves `index-BMY3K_nn.js`.
- **Verification**: 5 closeout/localization regression tests passed, targeted ESLint passed, the POS production build passed, and the public production endpoint returned HTTP 200 with the expected asset.

---

## 2026-07-25 — POS Employee Stock Receiving Fix

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `supabase/migrations/20260725102000_allow_all_pos_employees_receive_stock.sql`
  - `apps/pos/tests/stock-receiving-permissions.test.js`
- **Description**: Fixed the product long-press Receive Stock authorization contract. Any signed-in employee who can open the POS can now record received stock at that terminal, even when their profile has a stale or missing branch assignment. Telegram stock updates remain branch-scoped.
- **Root Cause**: The existing “allow all employees” RPC still required the signed-in profile and selected POS employee to be assigned to the product branch. The relevant July stock migrations are also absent from the linked database migration history.
- **Commit**: Not committed — shared workspace contains active Kimi3/Claude work
- **Deployment**: Applied directly to Noch Production (`kxqjasdvoohiexedtfqw`) through the Supabase SQL editor; migration ledger repaired for `20260725102000`.
- **Verification**: 3 focused stock/long-press tests passed; POS production build passed; live function checks returned `pos_requires_login=true`, `pos_all_employees=true`, and `telegram_branch_scoped=true`.

---

## 2026-07-25 — Content Studio Voice Benchmark Restored

- **Agent**: Codex
- **Status**: ✅ Complete locally
- **Files**:
  - `apps/pos/src/modules/contentStudio/components/ContentBenchmark.jsx`
  - `apps/pos/src/modules/contentStudio/lib/contentBenchmark.js`
  - `apps/pos/src/modules/contentStudio/pages/VoiceLab.jsx`
  - `apps/pos/src/modules/contentStudio/ai/evaluateDraft.js`
  - `supabase/functions/cs-evaluate-draft/index.ts`
  - `apps/pos/tests/content-benchmark-wiring.test.mjs`
- **Description**: Restored the legacy brand-content verifier inside the current Voice Lab. Owners can benchmark pasted or saved social captions against the selected voice profile, view six scoring dimensions, and save content as an approved or rejected training example.
- **Commit**: Not committed — shared workspace contains active Kimi3/Claude work
- **Deployment**: None
- **Verification**: Targeted ESLint passed, 3 regression tests passed, and the POS production build passed.

---

## 2026-07-25 — Bloom POS Close Fix + Schema Repair

- **Agent**: Claude
- **Status**: ⚠️ Migrations Created (Supabase CLI sync issue blocking deployment)
- **Files**: 
  - `supabase/migrations/20260725100000_fix_bloom_activation.sql`
  - `supabase/migrations/20260725101000_repair_role_permissions_schema.sql` (NEW)
- **Description**: 
  1. **Schema Repair** (20260725101000): The database has a broken role_permissions table (old TEXT-based schema). This migration:
     - Drops the old role_permissions table
     - Creates the new UUID-based schema with app_roles and app_permissions
     - Seeds all core roles and permissions
     - Sets correct permissions for all staff levels (staff, supervisor, owner, accountant, limited_staff, data_entry)
  2. **Bloom Fix** (20260725100000): Fixed three blocking issues:
     - Staff role now has `pos.end_of_day` permission
     - Products/categories re-shared to Bloom with corrected branch names
     - Cost center CC03 linked to Bloom branch
- **Root Cause**: 
  - Schema issue: Migration 20260417_big_build.sql tried to create UUID-based role_permissions but the old TEXT-based version wasn't dropped
  - Bloom: Staff lacked end_of_day permission; branch activation used outdated name patterns
- **Deployment**: **BLOCKER** — Supabase CLI has sync issues. Workaround:
  - Connect directly to the database and apply both migrations manually, OR
  - Use Supabase dashboard SQL editor to paste migration contents, OR
  - Run: `supabase db pull` then `supabase db push --linked` (may need to retry)
- **Critical**: Apply 20260725101000 BEFORE 20260725100000 (schema must exist first)
- **Verification**: After deployment:
  - Test: Bloom staff can access end-of-day and close shifts
  - Test: All role permissions are correctly assigned
  - Test: Products/categories visible at Bloom branch

---

## 2026-07-25 — Close Shift Button Disabled for Zero Cash

- **Agent**: Claude
- **Status**: ✅ Fixed & Built
- **Files**:
  - `apps/pos/src/modules/pos/pages/POSEndOfDay.jsx`
- **Description**: Fixed "Close Shift" button that was disabled when actual cash = 0. The button had logic `disabled={closing || !actualCash}` which prevented closing shifts with $0 cash in drawer (valid scenario). Changed to `disabled={closing || actualCash === null || actualCash === undefined}` to only disable when cash amount hasn't been entered.
- **Root Cause**: Falsy check (`!actualCash`) treats 0 as false, disabling the button when cash count is legitimately zero
- **Impact**: Bloom staff (and all staff) can now close shifts regardless of actual cash balance
- **Commit**: Not committed — shared workspace contains active work
- **Deployment**: Build passed successfully; ready to deploy on next release
- **Verification**: Build completed without errors; logic allows 0 as valid cash amount

---

# Completed Work Log

**Status**: Active  
**Last Updated**: 2026-07-25  
**Workspace**: `Jul 26 release`

---

## 2026-07-21 — Central Warehouse & Transfers

- **Agent**: Codex
- **Status**: ✅ Complete & Live
- **Files**:
  - `supabase/migrations/20260719180000_warehouse_locations.sql`
  - `supabase/migrations/20260719190000_transfers_waste_tracking.sql`
- **Description**: Product-level warehouse stock, transfer flow with in-transit visibility, discrepancy capture
- **Commit**: (part of live deploy)
- **Notes**: New tables: `location_product_stock`, transfer request→ship→receive flow

---

## 2026-07-19 — Finance Drill-Downs Deployed

- **Agent**: Codex
- **Status**: ✅ Complete & Live
- **Files**:
  - `apps/pos/src/modules/finance/components/FinanceBreakdownModal.jsx`
- **Description**: Clicking revenue/COGS/net contribution/prime cost opens period- and branch-scoped breakdown with per-product tables and waterfall charts
- **Commit**: `0e2b29a`
- **Bundle**: `index-Cygfrlq_.js`
- **Deployed To**: apps.noch.cloud

---

## 2026-07-18 — Enhancements Merged

- **Agent**: Codex
- **Status**: ✅ Complete & Live
- **Branch**: `codex/enhancements-delivery` (14 commits)
- **Description**: Finance branch-expense allocation + pre-opening status, storefront precompile, POS product popularity sort, Bloom branch activation
- **Files**:
  - Multiple finance modules
  - Storefront components
  - ~20 database migrations
  - New edge functions: `twilio-status-callback`, `vestaboard-cron`
- **Conflict Resolution**: `telegram-webhook` — kept both webhook-secret verification and Receipt Snap callbacks
- **Notes**: Verified audit P0 security hardening applied

---

## 2026-07-18 — P0 Security Hardening

- **Agent**: Codex
- **Status**: ✅ Complete & Live
- **Description**: 
  - `create_pos_order` RLS restricted (no anon access)
  - Guest order pre-validation (no orphan rows)
  - Qty enforcement (1–50)
  - Unique pickup codes
  - Sequence constraints
- **Audit Reference**: Full evidence in `docs/audit/2026-07-18-full-app-audit.md`
- **Commit**: `9778766`

---

## Template for New Entries

When completing work, add an entry like this:

```markdown
## YYYY-MM-DD — [Brief Description]

- **Agent**: [Claude / Codex / Other]
- **Status**: ✅ Complete / ⚠️ In Progress / ❌ Blocked
- **Files**: 
  - `path/to/file.js`
  - `path/to/migration.sql`
- **Description**: [What was changed and why]
- **Commit**: [Git hash]
- **Branch**: [If applicable]
- **Deployed To**: [If applicable: staging/live/none]
- **Notes**: [Any caveats, known issues, or follow-up needed]
```

---

## Search Tips

To find if something's been done:
- `grep -i "keyword" COMPLETED_WORK.md`
- Check the **Files** section for the module you're touching
- Review **Notes** for partial completions or known issues
- Look for the date to understand recency

## 2026-07-25 — Content Studio Brief Draft Generation Fix

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/src/modules/contentStudio/ai/generateDrafts.js`
  - `apps/pos/src/modules/contentStudio/pages/BriefDetail.jsx`
  - `supabase/functions/cs-generate-drafts/index.ts`
  - `supabase/migrations/20260725130000_allow_brief_generated_drafts.sql`
- **Description**: Restored draft generation from standalone briefs. The AI function now falls back to the configured Gemini provider when Anthropic credits are unavailable, returns schema-constrained JSON, and keeps backward-compatible caption output. Brief drafts now save through the actual `cs_draft_variants` columns and normalize brief formats such as `reel` to `reel_hook`.
- **Root Cause**: Anthropic API credits were exhausted; Gemini output could be truncated; the brief screen used obsolete draft column/status names; `concept_id` remained `NOT NULL` despite briefs being valid standalone draft origins; and `reel` violated the draft-format constraint.
- **Commit**: Not committed — shared workspace contains unrelated active work
- **Deployment**: `cs-generate-drafts` deployed to Supabase; targeted migration applied to Noch Production; isolated POS build deployed to `apps.noch.cloud` as `index-DmzmR3dr.js`.
- **Verification**: Direct API returned HTTP 200 with three non-empty Gemini drafts. The exact Nitro Hibiscus brief generated and saved a live draft, displayed `Generated 1 draft`, and moved to `used`. Targeted ESLint had no errors (one pre-existing hook warning), and the production build passed.

---

## 2026-07-25 — Unified Social Post Performance Evaluator

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/src/modules/contentStudio/pages/PostPerformance.jsx`
  - `apps/pos/src/modules/contentStudio/lib/postPerformance.js`
  - `apps/pos/src/modules/contentStudio/services/contentBank.js`
  - `apps/pos/src/modules/contentStudio/ai/evaluateDraft.js`
  - `apps/pos/src/modules/contentStudio/pages/ContentBank.jsx`
  - `apps/pos/src/modules/contentStudio/pages/Overview.jsx`
  - `apps/pos/src/modules/contentStudio/index.jsx`
  - `apps/pos/src/modules/contentStudio/lib/constants.js`
  - `apps/pos/tests/post-performance-evaluator.test.mjs`
  - `supabase/functions/cs-evaluate-draft/index.ts`
  - `supabase/migrations/20260725141000_content_performance_evaluator.sql`
- **Description**: Restored the legacy social-post assessment as a first-class Content Studio Performance workspace. It captures platform results and business impact, benchmarks each post against comparable Noch posts, evaluates manifesto/voice fit, produces a transparent 65% performance + 35% brand-fit effectiveness score, persists the evidence, and feeds strong/weak captions back into the selected voice profile.
- **Reliability**: The evaluator now falls back from Anthropic to Gemini and returns readable provider errors. Existing Content Bank learning-signal payloads were corrected to match the current learning-signal schema.
- **Verification**: Eight focused evaluator/benchmark tests passed; targeted ESLint passed; Edge Function bundled successfully; POS production build passed.
- **Commit**: `3dd2a66`
- **Deployment**: Live on `apps.noch.cloud` in `contentStudio-B7GmY1P3.js`. Migration `20260725141000` is applied and recorded; `cs-evaluate-draft` is active as version 15 with JWT verification. GitHub Actions run `30157280674` succeeded.

---
