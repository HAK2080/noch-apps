# Staff, Attendance, Scheduling, and Payroll Module

## Outcome

NOCH now has one workforce control journey at `/staff`. It separates login profiles from employees, plans from attendance, payroll drafts from approvals, and payroll approvals from payments. All workforce periods use the Tripoli 05:00 business-day boundary.

## Users and purpose

- Owner: workforce health, employee records, schedule publication, payroll approval, and payment evidence.
- Supervisor: active team, attendance evidence, and schedule management.
- Accountant: payroll evidence and accounting lifecycle without broad employee administration.
- Staff: their profile and POS attendance; schedules are readable when published.

## Authoritative sources

| State | Authority |
|---|---|
| Workforce membership | `profiles.is_employee` |
| Current/former employment | `profiles.is_active`, start/end dates |
| Attendance | closed segments in `pos_shift_attendees` |
| Planned work | `workforce_schedule_shifts` |
| Payroll proposal | `payroll_runs` and reconciled run items |
| Payroll accounting | completed payroll journal |
| Payroll settlement | paid state and payment journal |

## Classification

- Essential: employee directory, closed attendance evidence, weekly scheduling, payroll reconciliation/approval/payment, data-quality exceptions.
- Consolidate: Team, attendance, schedule, and payroll under `/staff`.
- Archive or hide: Finance Shifts and Payroll tabs as competing normal journeys; their source files remain for rollback.
- Remove: broad authenticated payroll reads and the single-row attendance model that lost break segments.

## Production baseline

The production audit found 10 active operational employees and 12 former employees. Nine active employees lacked start dates. There were no attendance rows and no schedule tables. The July draft contained 10 items; its stored total was 24,900 LYD while item net pay totaled 24,700.02 LYD, a visible 199.98 LYD variance. No completed payroll, loans, adjustments, or payments existed. Historical records were not rewritten.

## Controls delivered

- Employee and payroll eligibility are explicit; owner logins are excluded from workforce backfill.
- Multiple attendance segments preserve breaks; only one segment may remain open per employee and POS shift.
- Open intervals contribute no hours or labor cost. Corrections create before/after audit evidence.
- Draft and published schedules are separate from attendance and reject overlap.
- Payroll generation validates employment dates, branch/cost allocation, pay basis, closed attendance, schedule evidence, and per-loan repayments.
- Approval requires item reconciliation and posts gross wages, net payable, and loan recovery correctly.
- Payment is a separate cash/bank action against wages payable.
- Payroll data is restricted to owners and active accountants.
- Finance actuals use only completed or paid payroll, never a draft.

## Rollback and remaining business work

The migration is additive and preserves existing records. The old UI source remains in Git for rollback. Before approving payroll, enter employee start dates, review the existing July variance by regenerating the draft, record real attendance, and publish the schedule. These are visible business-data tasks rather than hidden zero defaults.

