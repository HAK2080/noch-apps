## 2026-07-31 — Payroll No-Scroll Employee Cards

- **Agent**: Codex
- **Status**: Verified locally; deployment pending
- **Files**:
  - `apps/pos/src/modules/finance/tabs/PayrollTab.jsx`
  - `apps/pos/src/modules/workforce/pages/WorkforceHub.jsx`
  - `apps/pos/tests/workforce-control.test.mjs`
- **Description**: Replaced the 15-column payroll table and bottom-only horizontal scrollbar with one responsive card per employee. Identity, branch, evidence, and net pay stay visible above a labeled grid containing hours/day, days, scheduled hours, overtime hours, all six manual pay adjustments, and note. The grid uses all available payroll width and wraps inside the card on narrower screens.
- **Behavior preserved**: Manual hours and adjustments still save on blur, draft net pay recalculates immediately, evidence remains visible, and completed payroll remains read-only.
- **Verification**: Payroll regression test passed after first reproducing the old overflow failure; classic-skin tests, targeted ESLint, POS production build, and `git diff --check` passed.
- **Migration**: None.
- **Commit / deployment**: Pending.

---

## 2026-07-31 — Payroll Readiness Guidance

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/src/modules/finance/tabs/PayrollTab.jsx`
  - `apps/pos/src/modules/finance/lib/finance-supabase.js`
  - `apps/pos/tests/workforce-control.test.mjs`
  - `supabase/migrations/20260801090000_payroll_manual_hours.sql`
- **Description**: Reproduced the disabled July payroll approval state. The draft is correctly blocked by nine employee records missing employment start dates; attendance is also unavailable, but it is not silently converted into paid hours. Payroll now shows each blocking/warning issue, counts, evidence status per employee, and direct links to the team directory and attendance/schedule controls.
- **Verification**: Workforce control tests passed, targeted PayrollTab ESLint passed, and the POS production build passed.
- **Deployment**: POS release and migration verification recorded with the commit below.
- **Follow-up**: Warning-only payroll drafts no longer use the stale client variance gate. Attendance and schedules remain optional evidence; owners can enter hours/day, worked days, scheduled hours, overtime, deductions, and loan repayments manually. Hourly pay is calculated by the owner-only draft RPC.
- **Commit**: `83c51c9` (`feat(payroll): support manual hours and adjustments`)
- **Deployment**: GitHub Actions run `30638444999` deployed the POS bundle successfully; migration `20260801090000_payroll_manual_hours.sql` was applied in the production SQL editor. Live Payroll smoke check shows optional evidence guidance, hours fields, and an enabled Complete payroll action for warning-only data.

---

## 2026-07-31 — Whole-System Reconciliation and Owner Acceptance

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `README.md`
  - `apps/pos/src/lib/profiles.js`
  - `apps/pos/src/lib/tasks.js`
  - `apps/pos/src/modules/pos/components/ShiftAttendees.jsx`
  - `apps/pos/src/modules/pos/lib/pos-supabase.js`
  - `apps/pos/src/modules/pos/pages/POSPinLogin.jsx`
  - `apps/pos/src/modules/pos/pages/POSStockCheck.jsx`
  - `apps/pos/src/pages/TaskDetail.jsx`
  - `apps/pos/tests/staff-audit.spec.js`
  - `apps/pos/tests/system-acceptance-privacy.test.mjs`
  - `docs/audit/2026-07-31-whole-system-owner-acceptance.md`
  - `supabase/migrations/20260731235500_system_acceptance_privacy.sql`
  - `supabase/migrations/20260731235600_auth_identity_alignment.sql`
  - `supabase/migrations/20260731235700_workforce_directory_boundary.sql`
- **Description**: Completed the eight-module owner acceptance pass and preserved each module's authoritative source instead of adding another dashboard. Replaced broad full-profile reads with owner-or-self access and safe daily directories, preserved task assignee names without exposing contact/payroll data, constrained Auth/profile identity alignment, and restricted the workforce administration directory to workforce managers.
- **Reconciliation**: The 30-day Finance and Sales controls both report 176,336.75 LYD net sales with 0.00 LYD payment, tender-event, timing, and untracked-order variance. All 29 profiles, 60 loyalty members, 1,130 opening points, 79 ingredients, and historical operational records remain preserved. Missing counts, recipes, attendance, schedules, settlement evidence, publication evidence, and the 199.98 LYD payroll variance remain visible owner actions rather than zeroes.
- **Verification**: Full Node suite 126/126 passed; targeted ESLint, production build, and diff checks passed. Local owner route audit passed 32/32. A real production staff JWT sees 1 full self profile, 0 owner-workforce rows, and 29 safe directory rows. The final authenticated production suite passed 17/17 setup and journey checks, including `/my-tasks`, bilingual owner access, mobile navigation, and direct-route denial.
- **Commits**: `d386f85` (`fix(system): close owner acceptance privacy gaps`), `43284ad` (`fix(tasks): preserve staff task rendering`)
- **Pull Request**: Draft PR `#6`
- **Deployment**: Migrations `20260731235500`, `20260731235600`, and `20260731235700` are applied and recorded on Noch Production. GitHub Actions run `30634460804` deployed commit `43284ad` successfully to `apps.noch.cloud`; authenticated production checks passed afterward.
- **Required owner work**: Follow the daily/weekly/monthly cadence in the acceptance audit to complete physical counts and recipes, supply attendance/schedule/payroll evidence, connect processor settlement evidence, and begin measured loyalty/content operation.

---

## 2026-07-31 — Staff Newsprint Skin Redesign

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/index.html`
  - `apps/pos/src/components/Layout.jsx`
  - `apps/pos/src/components/dashboard/StatsBar.jsx`
  - `apps/pos/src/components/shared/LanguageToggle.jsx`
  - `apps/pos/src/index.css`
  - `apps/pos/src/modules/pos/components/CartPanel.jsx`
  - `apps/pos/src/modules/pos/components/ProductGrid.jsx`
  - `apps/pos/src/modules/pos/pages/POSTerminal.jsx`
  - `apps/pos/src/pages/Dashboard.jsx`
  - `apps/pos/src/pages/Login.jsx`
  - `apps/pos/tests/staff-skin-handoff.test.mjs`
  - `docs/audit/2026-07-31-staff-skin-redesign.md`
- **Description**: Applied the supplied Oatly/newsprint handoff as a scoped cream/ink staff skin for the owner dashboard, POS, shared shell, and login. Storefront routes and operational behavior remain unchanged. The staff theme toggle is hidden because this release selects cream-first until a deliberate dark variant is designed.
- **Verification**: 129 repository tests passed, targeted ESLint passed, POS production build passed, and staged diff validation passed.
- **Commit**: `57c837b` (`feat(ui): apply staff newsprint skin`)
- **Deployment**: GitHub Actions run `30636296458` deployed commit `76a45a3` successfully to `apps.noch.cloud`; the live bundle and CSS were checked for the staff-skin token, cream palette, and Anton font.

---

## 2026-07-31 — Staff Skin Dark and Bright Modes

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/src/components/Layout.jsx`
  - `apps/pos/src/components/shared/ThemeToggle.jsx`
  - `apps/pos/src/index.css`
  - `apps/pos/src/modules/pos/pages/POSTerminal.jsx`
  - `apps/pos/src/pages/Login.jsx`
  - `apps/pos/tests/staff-skin-handoff.test.mjs`
- **Description**: Restored the saved dark/bright preference without removing the newsprint redesign. Added accessible bilingual theme controls to the desktop shell, mobile header, login, and full-screen POS terminal. The bright mode retains the cream/ink palette; the dark mode uses an ink/cream palette with theme-aware surfaces, fields, borders, product cards, alerts, and login contrast.
- **Verification**: Focused theme regression tests, targeted ESLint, production build, and `git diff --check` passed. Local browser checks confirmed exact dark and bright computed colors, persistent control labels, login contrast, and a 390×844 mobile viewport without horizontal overflow.
- **Commit**: `752d21a` (`feat(ui): restore dark and bright staff themes`)
- **Deployment**: GitHub Actions run `30639407570` deployed commit `752d21a` successfully to `apps.noch.cloud`. An authenticated production dashboard check confirmed the dark and bright palettes, the sidebar palette, and preference persistence after reload.

---

## 2026-07-31 — Classic NOCH Skin Restoration

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/index.html`
  - `apps/pos/src/components/Layout.jsx`
  - `apps/pos/src/components/dashboard/StatsBar.jsx`
  - `apps/pos/src/components/shared/LanguageToggle.jsx`
  - `apps/pos/src/components/shared/ThemeToggle.jsx`
  - `apps/pos/src/index.css`
  - `apps/pos/src/modules/pos/components/CartPanel.jsx`
  - `apps/pos/src/modules/pos/components/ProductGrid.jsx`
  - `apps/pos/src/modules/pos/pages/POSTerminal.jsx`
  - `apps/pos/src/pages/Dashboard.jsx`
  - `apps/pos/src/pages/Login.jsx`
  - `apps/pos/tests/classic-skin-restoration.test.mjs`
- **Description**: Removed the Oatly/newsprint presentation from every production entry surface and restored the original NOCH dark/light shell, navigation, dashboard cards, login, and POS presentation. Later payroll, loyalty, inventory, privacy, and POS behavior remains intact. The redesign audit remains as archived historical evidence only.
- **Verification**: Classic-skin regression tests, targeted ESLint, production build, and `git diff --check` passed. Local browser inspection confirmed the original centered `noch.apps` login card and classic green/dark styling.
- **Commit**: `fd3dfbf` (`revert(ui): restore classic NOCH skin`)
- **Deployment**: GitHub Actions run `30640596805` deployed commit `fd3dfbf` successfully to `apps.noch.cloud`. Authenticated production checks confirmed the original `n`/`noch.apps` sidebar, rounded dark cards, classic dashboard and workforce views, the dark/light control, and zero active redesign skin hooks.

---

## 2026-07-31 — Navigation, Roles, Permissions, and Bilingual Consistency

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `CONTEXT.md`
  - `apps/pos/src/App.jsx`
  - `apps/pos/src/components/Layout.jsx`
  - `apps/pos/src/components/shared/LanguageToggle.jsx`
  - `apps/pos/src/contexts/PermissionsContext.jsx`
  - `apps/pos/src/lib/access-control.js`
  - `apps/pos/src/lib/features.js`
  - `apps/pos/src/lib/profiles.js`
  - `apps/pos/src/pages/staff/RoleManager.jsx`
  - `apps/pos/playwright.config.js`
  - `apps/pos/tests/access-control-navigation.test.mjs`
  - `apps/pos/tests/access-control-owner.spec.js`
  - `apps/pos/tests/access-control-staff.spec.js`
  - `docs/PAGES.md`
  - `docs/audit/2026-07-31-navigation-access-bilingual-module.md`
  - `supabase/migrations/20260731235000_access_control_navigation.sql`
  - `supabase/functions/approve-staff-request/index.ts`
- **Description**: Replaced sidebar role fallbacks, competing route guards, and hard-coded landing redirects with one policy evaluator used by both navigation and direct routes. Added explicit fail-closed access states, full mobile page discovery, consistent English/Arabic owner controls, audited account/role/permission RPCs, and a separate login-access state that does not misuse employee activity. The unsupported `data_entry` role is archived and hidden while its records remain preserved.
- **Data reconciliation**: All 29 profiles remain preserved. Seven owner accounts are enabled; no linked former employee remains enabled. The supported permission matrix contains all 76 role/feature rows and has zero edit-without-access grants.
- **Verification**: Full Node suite 121/121 passed; targeted ESLint, production build, and diff checks passed. Local Playwright owner and staff journeys passed. Rollback-only production JWT probes proved that staff cannot self-promote or request owner/archived roles, and that owner permission changes write audit evidence. Production Playwright passed 4/4 login, English/Arabic Role Manager, mobile full-navigation, and direct-route denial checks.
- **Commit**: `065238d` (`feat(access): unify navigation and role controls`)
- **Pull Request**: Draft PR `#6`
- **Deployment**: Migration `20260731235000` is applied and recorded on Noch Production. `approve-staff-request` was redeployed. GitHub Actions run `30631580065` deployed commit `065238d` successfully to `apps.noch.cloud`; authenticated production smoke checks passed afterward.
- **Module 8 backlog**: Reconcile every module's RLS against the active grants, replace broad base-profile reads with purpose-specific safe RPCs, test both auth-link shapes and all supported roles, and complete the whole-system owner acceptance walkthrough.

---

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

## 2026-07-31 — Loyalty and Customer Management

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `CONTEXT.md`
  - `README.md`
  - `apps/pos/src/App.jsx`
  - `apps/pos/src/lib/uiAutoTranslate.js`
  - `apps/pos/src/modules/loyalty/`
  - `apps/pos/src/modules/pos/components/PaymentModal.jsx`
  - `apps/pos/src/modules/pos/pages/POSTerminal.jsx`
  - `apps/pos/tests/bilingual-auto-translate.test.mjs`
  - `apps/pos/tests/loyalty-customer-control.test.mjs`
  - `apps/pos/tests/loyalty-v2-checkout-ui.test.mjs`
  - `docs/audit/2026-07-31-loyalty-customer-management-module.md`
  - `supabase/migrations/20260731233000_loyalty_customer_control.sql`
  - `supabase/functions/_shared/notifications.ts`
  - `supabase/functions/loyalty-notify/index.ts`
- **Description**: Made customer-scanned transaction QR the primary private
  capture path while retaining existing-card and masked cashier phone
  alternatives. Every online paid order now records an immutable linked or
  skipped decision; synced offline orders remain visibly unknown. Added
  verified channel/purpose consent, fail-closed notifications, owner-only
  masked customer management, audited searches, preserved identity exceptions,
  reward-cost obligations, bilingual mission versioning, and one Tripoli
  business-day owner summary.
- **Data reconciliation**: All 60 member names and 1,130 opening points remain
  preserved. Three ambiguous identity groups remain unmerged. The V2 launch
  cohort is awaiting its first eligible order; the separate historical baseline
  is 1 linked order of 3,664 (0.03%). Sixty legacy WhatsApp flags remain
  classified as unverified and suppressed.
- **Verification**: The migration compiled and reconciled against production in
  an explicit rollback transaction before application. The final repository
  suite passed 84/84 Node tests, targeted ESLint passed, the production build
  passed, and `git diff --check` passed. Authenticated production checks passed
  in English/LTR and Arabic/RTL with no document overflow at the tested browser
  width. The public QR route renders the privacy promise without requiring a
  staff-visible phone number.
- **Commits**: `e98ad0b` (`feat(loyalty): enforce private capture and customer control`), `9c8586e` (`fix(i18n): preserve explicit bilingual component text`)
- **Pull Request**: Draft PR `#6`
- **Deployment**: Migration `20260731233000` is applied and recorded on Noch
  Production. `loyalty-notify`, `send-notification`, and
  `process-notification-outbox` were redeployed from committed source. GitHub
  Actions run `30622166304` deployed commit `9c8586e` successfully to
  `apps.noch.cloud`.
- **Required owner work**: Review checkout capture and skip reasons daily
  against the 30% day-30 and 50% day-90 goals, resolve the three identity cases
  only with sufficient evidence, and ask members to verify consent
  self-service.

---

## 2026-07-31 — Content Studio and Marketing Measurement

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `CONTEXT.md`
  - `README.md`
  - `apps/pos/src/lib/uiAutoTranslate.js`
  - `apps/pos/src/modules/contentStudio/`
  - `apps/pos/tests/bilingual-auto-translate.test.mjs`
  - `apps/pos/tests/content-measurement-control.test.mjs`
  - `apps/pos/tests/post-performance-evaluator.test.mjs`
  - `docs/audit/2026-07-31-content-studio-marketing-measurement-module.md`
  - `supabase/migrations/20260731234000_content_measurement_control.sql`
  - `supabase/functions/cs-generate-drafts/index.ts`
  - `supabase/functions/cs-humanize-draft/index.ts`
- **Description**: Consolidated publishing and measurement under
  `/content-studio/performance`. Approved assets now become explicit
  publication records with platform, objective, campaign, product, spend,
  attribution window, experiment reference, planned time, and external
  evidence. Scheduled records can be marked published, the same asset can be
  used on multiple platforms, and comparable 24-hour, 7-day, and final
  snapshots replace the duplicate inline Content Bank editor. Associated
  orders/revenue are explicitly observational, never causal lift without a
  recorded experiment and control. Humanization now has Anthropic-to-Gemini
  fallback, and draft generation uses both good and bad training examples.
- **Production baseline**: 122 inspirations, 122 concepts, 1 brief, 60 drafts,
  and 23 approved assets are preserved. The new publication authority starts
  with zero scheduled/published records, so approved-use is 0%; evidence
  completeness remains unavailable rather than a misleading zero.
- **Verification**: The migration exposed and corrected a live-schema
  inheritance mismatch during the rollback gate, then compiled successfully.
  Owner summaries, two owner-only Content Studio policies, and both migration
  ledger entries were verified after deployment. Production passed
  English/LTR and Arabic/RTL switching, source baselines, causal-warning, and
  no-overflow checks at the tested browser width. The final 84-test suite,
  targeted ESLint, build, and diff checks pass.
- **Commits**: `36f017b` (`feat(content-studio): unify publishing and measurement`), `9c8586e` (`fix(i18n): preserve explicit bilingual component text`)
- **Pull Request**: Draft PR `#6`
- **Deployment**: Migration `20260731234000` is applied and recorded on Noch
  Production. `cs-generate-drafts` and `cs-humanize-draft` were redeployed.
  GitHub Actions run `30622166304` deployed commit `9c8586e` successfully to
  `apps.noch.cloud`.
- **Required owner work**: Begin using publication plans and capture both
  24-hour and 7-day snapshots. Do not use the 80% approved-use or 90% evidence
  targets as trend evidence until the workflow has a mature observation window.

---

## 2026-07-30 - Loyalty and Content Studio Business Audit

- **Agent**: Codex
- **Status**: Complete
- **Files**:
  - `CONTEXT.md`
  - `docs/audit/2026-07-30-loyalty-content-audit.md`
  - `docs/research/loyalty-content-benchmarks-2026-07-30.md`
- **Description**: Mapped the current loyalty and Content Studio systems from customer/business intent through UX, database contracts, operating workflow, measurement, and production behavior. Documented the good, bad, and ugly; defined a contribution-margin north star; set operational KPIs; and proposed a phased 180-day recovery roadmap.
- **Production findings**: Loyalty had 60 customer records but only 1 of 3,771 completed orders linked in the trailing 30 days (about 0.03%). The tokenized counter QR did not open the public loyalty dialog. Content Studio had 122 inspirations, 122 concepts, 60 drafts, and 23 approved bank items, but the deployed Performance route was blank and absent from navigation. No private customer data was copied into the audit.
- **Verification**: Read current code, migrations, recent Git history, and work logs; inspected the signed-in production loyalty, marketing, and Content Studio surfaces plus the public storefront; verified external KPI guidance against primary sources; and ran the two focused Content Studio suites (8 tests passed). `git diff --check` passed. No focused loyalty accounting/redemption test suite was found.
- **Commit**: `a2c1b44`
- **Deployment**: Documentation-only; no application, database, Edge Function, or production-data changes.

---

## 2026-07-26 — Expense Payment Drill-Down and Excel Export

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/src/pages/expenses/DashboardTab.jsx`
  - `apps/pos/src/pages/expenses/ExpenseDrilldown.jsx`
  - `apps/pos/src/pages/expenses/lib/expenseDashboard.js`
  - `apps/pos/src/lib/exportCsv.jsx`
  - `apps/pos/tests/expense-dashboard.test.mjs`
- **Description**: Added an auditable expense drill-down scoped to the selected date range. Summary cards filter by status; cost-center and category rows narrow the same payment list; the ten largest matching payments appear first; and each row expands to show the submitter, original currency, payment account/date/reference/notes, and receipt link.
- **Export**: Added an Excel-compatible UTF-8 CSV export containing every matching record, not only the top ten. The default view and export are Paid Out; owners can switch to all submitted, approved, or pending expenses.
- **Commit**: `c51fc6b`
- **Deployment**: Live on `apps.noch.cloud`; GitHub Actions run `30207601305` succeeded on retry after a transient SSH connection timeout.
- **Verification**: Five focused tests, targeted ESLint, and the POS production build passed. Live verification confirmed the July Paid Out total of 164,380.72 LYD across 108 records, top-ten ordering, row expansion, City Walk and Food & Beverages filtering, and CSV download initiation.

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

## 2026-07-25 — Post Performance Evaluator Production Hardening

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/src/modules/contentStudio/services/contentBank.js`
  - `apps/pos/tests/evaluation-json-retry.test.mjs`
  - `apps/pos/tests/post-performance-evaluator.test.mjs`
  - `supabase/functions/_shared/evaluationJson.ts`
  - `supabase/functions/cs-evaluate-draft/index.ts`
- **Description**: Repaired malformed AI JSON, retried unrepairable responses, added provider fallbacks, classified provider/format errors, and normalized 0–100 evaluator scores to whole numbers for the database while retaining the precise score in the report JSON.
- **Root Cause**: Gemini occasionally omitted JSON commas; Anthropic credits and Gemini's primary daily quota were exhausted; the OpenAI key had no billing quota; and decimal effectiveness scores could not be written to the database's `smallint` columns.
- **Commits**: `01a2f4d`, `07d0c52`, `bab257d`, `ab3342d`, `1440a86`, `3f29713`, `af60b2b`
- **Deployment**: `cs-evaluate-draft` deployed with JWT verification; apps.noch.cloud deployed by GitHub Actions run `30158869825`.
- **Verification**: Nine focused tests, targeted ESLint, Edge Function bundle, and POS production build passed. The exact Arabic Facebook post from the reported failure evaluated live at `96.7/100`, persisted as `97/100`, and remained visible after page reload.

---
## 2026-07-26 — Expense Dashboard Reconciliation and Date Range

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/src/pages/expenses/DashboardTab.jsx`
  - `apps/pos/src/pages/expenses/lib/expenseDashboard.js`
  - `apps/pos/src/pages/expenses/lib/expensesData.js`
  - `apps/pos/tests/expense-dashboard.test.mjs`
- **Description**: Added inclusive month, quarter, year, and custom From/To date ranges to the expense dashboard. Centralized LYD conversion and dashboard aggregation so summary, status, cost-center, and category figures reconcile from the same records.
- **Root Cause**: Preset periods filtered only from their start date, which made future-dated records eligible for the July dashboard. The flagged 120 LYD Food & Beverages expense was also dated 2026-12-17 by mistake; its July submission timestamp confirmed the intended expense date was 2026-07-17.
- **Data Correction**: Corrected the single “48 Malfee” expense from 2026-12-17 to 2026-07-17 in production. No amount, category, cost center, payment status, or other record data changed.
- **Verified July Figures**: Total 166,760.39 LYD; Paid 164,380.72 LYD; Approved 2,379.67 LYD; Pending 0.00 LYD. Cost centers and categories reconcile to the same total, subject only to display rounding.
- **Commit**: `2326d7f`
- **Deployment**: Live on `apps.noch.cloud`; GitHub Actions run `30206941288` succeeded.
- **Verification**: Production records independently aggregated from the linked database; three focused tests, targeted ESLint, and the POS production build passed. The deployed dashboard and date selector were verified in the signed-in production UI.

---

## 2026-07-26 — Product Catalog Relationship Error Recovery

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `apps/pos/src/main.jsx`
  - `apps/pos/src/lib/service-worker-update.js`
  - `apps/pos/tests/service-worker-update.test.mjs`
- **Description**: Added deployment-update detection for long-lived Products tabs. When a new service worker takes control, the Products catalog reloads once to replace an outdated in-memory bundle. Active POS and unrelated pages are never auto-reloaded.
- **Root Cause**: Supabase now exposes both the legacy direct branch relation and the central-inventory product/branch relation. The catalog query had already been disambiguated, but an already-open browser tab could continue executing the old ambiguous query after deployment because the app did not react to a service-worker controller change.
- **Commit**: `79944f4`
- **Deployment**: Live on `apps.noch.cloud`; GitHub Actions run `30208523991` succeeded.
- **Verification**: The exact ambiguous query reproduced HTTP 300 / `PGRST201`, while the deployed branch-free query returned HTTP 200. Five focused tests, targeted ESLint, and the POS production build passed. A fresh signed-in production page displayed all 216 products with no relationship error.

---

## 2026-07-31 — Enterprise Sales and Inventory Reporting Accuracy

- **Agent**: Codex
- **Status**: Complete and live
- **Files**:
  - `apps/pos/src/modules/pos/lib/business-time.js`
  - `apps/pos/src/modules/pos/lib/pos-supabase.js`
  - `apps/pos/src/pages/Sales.jsx`
  - `apps/pos/src/pages/sales/salesReporting.js`
  - `apps/pos/src/pages/inventory/InventoryIntelligence.jsx`
  - `apps/pos/src/pages/inventory/lib/inventoryIntelligence.js`
  - `apps/pos/tests/sales-reporting-accuracy.test.mjs`
  - `apps/pos/tests/inventory-intelligence-report.test.mjs`
- **Description**: Replaced the misleading inventory “runout prediction” and arbitrary fixed-deduction health score with an auditable control report built from the last physical count, completed-order recipe usage, theoretical on-hand quantity, minimum thresholds, and count freshness. Added explicit data provenance, threshold coverage, risk-sorted evidence, accurate Arabic labels, error/empty/loading states, and a complete CSV export. Reworked Sales to report completed sales, refunds, net sales, average order, and a payment reconciliation covering cash, card, split, Presto, and unmapped tenders.
- **Accuracy and privacy**: Sales screen and CSV now use the same 5 AM–5 AM Africa/Tripoli business-day window independent of the viewer device timezone. CSV exports include completed orders only, label Tripoli dates/hours explicitly, and expose only the last four customer-phone digits.
- **Verification**: 26 focused reporting, finance, expense, inventory, and loyalty tests passed; targeted ESLint passed with zero errors; POS production build passed; `git diff --check` passed.
- **Commit**: `6e39df6` (`feat(reporting): make sales and inventory evidence auditable`)
- **Deployment**: GitHub Actions run `30606772561` succeeded for `apps.noch.cloud`. The production index serves `index-Ds1TGSLy.js`, which links `Sales-5M4eoXvq.js` and `InventoryIntelligence-Rv7vyjuk.js`; independent no-cache HTTP checks confirmed the new payment reconciliation, privacy-safe export, inventory control report, and inventory evidence UI are live.

---

## 2026-07-31 — Loyalty V2, Owner Finance Labels, Expenses, and POS Inventory Repair

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `CONTEXT.md`
  - `docs/adr/0001-loyalty-v2-ledger-and-v1-archive.md`
  - `docs/loyalty/2026-07-30-loyalty-v2-proposal-review.md`
  - `apps/pos/src/App.jsx`
  - `apps/pos/src/modules/loyalty/lib/loyalty-supabase.js`
  - `apps/pos/src/modules/loyalty/lib/loyalty-v2.js`
  - `apps/pos/src/modules/loyalty/pages/LoyaltyCheckoutClaim.jsx`
  - `apps/pos/src/modules/loyalty/pages/LoyaltyMissionsV2.jsx`
  - `apps/pos/src/modules/loyalty/pages/LoyaltyV1Archive.jsx`
  - `apps/pos/src/modules/loyalty/pages/LoyaltyV2Dashboard.jsx`
  - `apps/pos/src/modules/pos/components/PaymentModal.jsx`
  - `apps/pos/src/modules/pos/lib/pos-supabase.js`
  - `apps/pos/src/modules/pos/pages/POSInventory.jsx`
  - `apps/pos/src/modules/pos/pages/POSProducts.jsx`
  - `apps/pos/src/modules/pos/pages/POSTerminal.jsx`
  - `apps/pos/tests/loyalty-v2-checkout-ui.test.mjs`
  - `apps/pos/tests/loyalty-v2-migration.test.mjs`
  - `apps/pos/tests/pos-product-inventory-update.test.mjs`
  - `supabase/migrations/20260730170000_atomic_pos_product_updates.sql`
  - `supabase/migrations/20260730180000_loyalty_v2.sql`
- **Description**: Added Loyalty V2 with a reconciled, read-only V1 snapshot; transferred member IDs, names, existing points, proportional incomplete-stamp value, and pending rewards; froze V1 stamp award paths; added an immutable/idempotent points ledger, paid-order earning, partial-refund and void reversal, guaranteed rewards, validated POS redemption, four mission types, and owner mission controls. Replaced phone-first checkout with a one-time customer-scanned transaction QR as the primary path while retaining a collapsed, masked phone fallback. Added a public phone/email OTP claim page and post-payment confirmation. Repaired POS product/inventory updates by loading hidden products in management, making manual stock adjustment atomic/audited, and refreshing shared-branch terminal state plus offline cache. Added submitter-declared expense payment status across web, Receipt Snap, and Telegram, and simplified finance labels for owners.
- **Commit**: `0cf5bed`
- **Pull Request**: Draft PR `#6`
- **Deployment**: Migrations `20260725121000`, `20260730170000`, and `20260730180000` applied and recorded on Noch Production. `expense-snap` and `telegram-webhook` redeployed from the committed source. `apps.noch.cloud` deployed by GitHub Actions run `30596862145`.
- **Verification**: 21 focused Node tests passed; targeted ESLint completed with zero errors and seven warnings; both changed Edge Functions bundled successfully; POS production build passed; `git diff --check` passed. All three new migrations first succeeded against the production schema inside an explicit transaction and were rolled back before the live application. Production serves the new lazy-loaded loyalty, finance, inventory, and expense bundles; the public QR checkout route renders correctly; and unauthenticated `expense-snap` calls return HTTP 401.
- **Data Reconciliation**: Archived and transferred 60 customer identities and 42 stamp records. Expected opening value was 1,130 points, recorded opening value was 1,130 points, and 0 members were unreconciled.
- **Notes**: Generated Supabase state files and stale/destructive Bloom deployment helpers were reviewed and intentionally excluded from the release. Production already records Bloom migrations `20260725100000`, `20260725101000`, `20260725102000`, and `20260725110000`; they were not replayed.

---

## 2026-07-31 — Enterprise Finance Reporting Controls

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `CONTEXT.md`
  - `apps/pos/src/modules/reports/lib/reporting-periods.js`
  - `apps/pos/src/modules/reports/lib/management-report-model.js`
  - `apps/pos/src/modules/reports/lib/management-report.js`
  - `apps/pos/src/modules/finance/lib/finance-reporting.js`
  - `apps/pos/src/modules/finance/lib/finance-supabase.js`
  - `apps/pos/src/modules/finance/tabs/ExecutiveSummaryTab.jsx`
  - `apps/pos/src/modules/finance/tabs/DailyPnLTab.jsx`
  - `apps/pos/src/pages/Report.jsx`
  - `apps/pos/tests/enterprise-reporting-model.test.mjs`
  - `apps/pos/tests/finance-owner-labels.test.mjs`
  - `docs/audit/2026-07-31-owner-reporting-module.md`
  - `supabase/migrations/20260731100000_enterprise_finance_reporting.sql`
- **Description**: Established one authoritative management-reporting model built on Finance P&L rather than independently recalculated sales. Standardized the 05:00 Africa/Tripoli business day, net sales, direct operating profit, shared operating costs, and fully loaded operating profit. Added exact cash, card, split-tender, Presto, and other-payment reconciliation; data-source provenance; freshness; completeness controls; unavailable-state handling; product-cost and expense-allocation warnings; branch-to-consolidated reconciliation; a visible corporate/unallocated balancing row; and auditable inventory scope. The primary owner view has explicit English/Arabic terminology and a responsive mobile layout.
- **Database correction**: Restored shared-cost fields that a later payroll migration had dropped from `finance_pnl`, preserved consolidated costs exactly once, allocated shared payroll and operating costs under explicit policies, and returned structured data-quality evidence.
- **Verification**: 32 focused reporting, inventory, POS, loyalty, expense, and finance tests passed; targeted ESLint passed; POS production build passed; `git diff --check` passed. The final migration compiled and passed P&L, payment, field, and timezone assertions against Noch Production inside an explicit transaction that was rolled back before live application. Authenticated production smoke tests passed for the Management Report and Finance Owner Overview in English, Arabic RTL, desktop, and 390×844 mobile layouts.
- **Data reconciliation**: For 2026-07-25 through 2026-07-31, payment net sales and Finance P&L net sales both equal 43,333.75 LYD, with 0.00 LYD payment variance. Sales, COGS, labor, and shared-cost branch deltas are 0.00 LYD. One unallocated expense produces a visible 2,333.33 LYD corporate balancing row; seven sold products without cost remain prominently flagged because COGS and profit are understated until their costs are supplied.
- **Commits**: `4e4f302` (`feat(reporting): unify owner finance controls`), `f703d50` (`fix(reporting): balance consolidated branch costs`)
- **Deployment**: Migration `20260731100000` applied and recorded on Noch Production. `apps.noch.cloud` deployed successfully by GitHub Actions run `30609745944`; production serves `Report--reEIe5F.js` with the payment, completeness, bilingual, and corporate-adjustment controls.

---

## 2026-07-31 — Sales, Payments, and Cash Control

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `CONTEXT.md`
  - `README.md`
  - `apps/pos/src/App.jsx`
  - `apps/pos/src/modules/pos/lib/pos-supabase.js`
  - `apps/pos/src/modules/pos/lib/sales-control.js`
  - `apps/pos/src/modules/pos/pages/POSEndOfDay.jsx`
  - `apps/pos/src/modules/pos/pages/POSOrders.jsx`
  - `apps/pos/src/modules/pos/pages/POSSessions.jsx`
  - `apps/pos/src/modules/pos/pages/POSSettings.jsx`
  - `apps/pos/src/pages/Sales.jsx`
  - `apps/pos/tests/sales-cash-control.test.mjs`
  - `docs/audit/2026-07-31-sales-payments-cash-control-module.md`
  - `supabase/migrations/20260731170000_sales_cash_control.sql`
- **Description**: Established an immutable tender-event ledger and one authoritative sales/cash-control model. Refunds now record the actual return tender and processing shift; cash refunds require an open drawer and only their cash leg affects expected cash. Voids and payment corrections operate on remaining unrefunded value and cannot mutate closed shifts. Shift close derives expected cash from tender events and cash movements, preserves missing physical counts as missing, and exposes reconstructed history and stored-counter differences. `/sales` is the consolidated owner control view; the legacy branch report route redirects there.
- **Data reconciliation**: The live ledger contains 10,591 tender events, including 169 reconstructed historical legs and 11 in the tested 30-day period. The 30-day owner control has 0 untracked orders, 0.000 LYD order-payment variance, 0.000 LYD event variance, and 0.000 LYD timing variance. Two open shifts were archived before compatibility-counter repair. Seventeen closed historical expected-cash differences were preserved and remain visible rather than rewritten.
- **Verification**: Seven focused tests passed; targeted ESLint, POS production build, and `git diff --check` passed. The migration first compiled and reconciled inside a production transaction that was rolled back, then was applied and recorded as `20260731170000`. Authenticated production checks passed for monthly sales/payment reconciliation, order and shift evidence, English/Arabic RTL, and a 390×844 mobile viewport with no horizontal overflow.
- **Commits**: `148f5df` (`feat(pos): unify sales and cash control`) through `ae39cf7` (`fix(pos): keep shift scope status deterministic`)
- **Pull Request**: Draft PR `#6`
- **Deployment**: `apps.noch.cloud` deployed from commit `ae39cf7` by GitHub Actions run `30614197039`; production serves the deterministic Arabic shift scope, localized duration labels, tender-specific controls, and settlement warnings.
- **Known limitation**: Card and Presto settlement cannot be proven until external processor/statement feeds are connected. POS tender is deliberately labeled as payment evidence, not settlement.

---

## 2026-07-31 — Inventory, Purchasing, Stock Movement, and Waste

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `CONTEXT.md`
  - `README.md`
  - `apps/pos/src/modules/pos/lib/pos-supabase.js`
  - `apps/pos/src/modules/pos/pages/POSInventory.jsx`
  - `apps/pos/src/modules/pos/pages/POSTerminal.jsx`
  - `apps/pos/src/modules/pos/pages/POSWaste.jsx`
  - `apps/pos/src/modules/reports/lib/management-report-model.js`
  - `apps/pos/src/modules/reports/lib/management-report.js`
  - `apps/pos/src/pages/inventory/`
  - `apps/pos/tests/inventory-control-authority.test.mjs`
  - `apps/pos/tests/inventory-intelligence-report.test.mjs`
  - `apps/pos/tests/pos-product-inventory-update.test.mjs`
  - `docs/audit/2026-07-31-inventory-purchasing-stock-waste-module.md`
  - `supabase/migrations/20260731203000_inventory_control_authority.sql`
  - `supabase/migrations/20260731213000_inventory_owner_access.sql`
- **Description**: Established one operational authority per inventory state, created the missing ingredient-location balance and immutable movement evidence, and added authorized atomic location counts. POS receiving and adjustments now use the currently open branch. Warehouse receipts, transfer legs, waste, and future tracked-product sale/refund/void movements converge on location evidence. The unsupported generic recipe fallback was removed: theoretical usage is unavailable until an explicit recipe exists. `/inventory` is now the bilingual control hub, `/inventory/intelligence` is the owner evidence report, and physical counting is a focused workflow; the former mixed Stock Manager is archived without deleting records.
- **Data reconciliation**: The live control report has 79 active ingredient rows, all visibly stale and missing location counts; all 79 correctly report recipe usage as unavailable instead of the former false 3,409,320-unit deduction. Five existing negative product-location balances remain visible as missing-receipt exceptions. There are no open procurement orders or transfers, no historical balances were rewritten, and the rollout left zero count or location-movement rows behind after its permission test rollback.
- **Verification**: Both migrations compiled against production inside explicit rollback transactions. The final live owner permission test passed and rolled back. All 102 Node tests passed; targeted ESLint passed with zero warnings/errors; the POS production build and `git diff --check` passed. Supabase database lint reported only six pre-existing unrelated function findings.
- **Commits**: `7670a80` (`feat(inventory): unify stock control and movement evidence`), `1a87813` (`fix(inventory): preserve owner stock authority`)
- **Pull Request**: Draft PR `#6`
- **Deployment**: Migrations `20260731203000` and `20260731213000` are applied and recorded on Noch Production. GitHub Actions run `30616535996` deployed commit `1a87813`; server verification and a fresh no-cache HTTP check confirmed `index-CtlR5RmQ.js` live at `apps.noch.cloud`.
- **Remaining business work**: Complete physical location counts, build explicit recipes, deliberately opt products into inventory tracking, reconcile business-wide ingredient balances to locations, and begin recording real procurement evidence.

---

## 2026-07-31 — Staff, Attendance, Scheduling, and Payroll

- **Agent**: Codex
- **Status**: Complete & Live
- **Files**:
  - `CONTEXT.md`
  - `README.md`
  - `apps/pos/src/App.jsx`
  - `apps/pos/src/lib/profiles.js`
  - `apps/pos/src/modules/finance/FinanceDashboard.jsx`
  - `apps/pos/src/modules/finance/tabs/PayrollTab.jsx`
  - `apps/pos/src/modules/workforce/`
  - `apps/pos/tests/workforce-control.test.mjs`
  - `docs/audit/2026-07-31-staff-attendance-scheduling-payroll-module.md`
  - `supabase/migrations/20260731230000_workforce_control_v2.sql`
- **Description**: Established an explicit workforce boundary so owner login profiles are not silently treated as employees. Consolidated employee health, closed attendance evidence, weekly schedule planning/publication, payroll drafts, approval, loans, and payment evidence under `/staff`; `/staff/team` preserves the detailed directory. Finance no longer presents competing Shifts or Payroll normal journeys. Multiple closed attendance segments preserve breaks, open intervals never accrue payroll cost, corrections are audited, and schedule plans never substitute for attendance.
- **Payroll controls**: Draft generation validates employee eligibility, start date, allocation, pay basis, closed attendance, schedule evidence, and per-loan repayments. Drafts have no Finance actuals. Approval posts gross wages, net wages payable, and loan recovery; payment is a separate cash/bank settlement. Payroll reads are restricted to owners and active accountants. The loan picker uses the employee-only source, and unreconciled legacy drafts cannot be approved.
- **Production baseline**: 10 active employees, 12 former employees, nine active employees missing start dates, no attendance evidence, and no published schedule. The existing July draft remains preserved with stored total 24,900 LYD, item total 24,700.02 LYD, and visible 199.98 LYD variance. No historical employee, attendance, schedule, payroll, loan, or journal record was rewritten.
- **Verification**: The migration compiled and produced the workforce summary against production in an explicit rolled-back transaction before application. All 76 Node tests passed, targeted ESLint passed, the POS production build passed, and `git diff --check` passed. Authenticated production checks passed in Arabic for the workforce overview and payroll drill-down; the legacy approval control is disabled, its evidence warning is visible, and owner/login profiles are absent from the loan picker.
- **Commits**: `ad5b3ab` (`feat(workforce): unify staff attendance scheduling and payroll`), `bb75cdb` (`fix(workforce): restrict payroll to employees`)
- **Pull Request**: Draft PR `#6`
- **Deployment**: Migration `20260731230000` is applied and recorded on Noch Production. GitHub Actions run `30618536171` deployed commit `bb75cdb` successfully to `apps.noch.cloud`.
- **Required owner data work**: Enter the nine missing employment start dates, record real attendance, publish the schedule, then regenerate and review the July payroll draft before approval.

---
