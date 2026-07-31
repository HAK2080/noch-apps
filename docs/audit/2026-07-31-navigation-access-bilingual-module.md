# Module 7 — Navigation, Roles, Permissions, and Bilingual Consistency

## Outcome

NOCH now makes one access decision for both navigation links and direct routes. Owner-only areas, module access, and edit authority use explicit policies; role-name fallbacks were removed. Account login state is independent of employee lifecycle, and privileged role/access/permission changes use audited database functions.

No profile, permission history, or workforce record was deleted. The unsupported `data_entry` role is hidden and cannot be assigned, while its historical rows remain intact.

## Map

| User | Purpose | Primary surface | Authority |
| --- | --- | --- | --- |
| Owner | Control logins and role grants; enter all owner modules | `/staff/roles`, desktop/mobile navigation | Owner profile plus audited RPCs |
| Supervisor | Run granted operational modules | Navigation and direct routes | `role_permissions` access/edit grants |
| Accountant | Use granted reporting/accounting modules | Navigation and direct routes | `role_permissions` access/edit grants |
| Staff | Operate POS and granted daily workflows | Mobile-first navigation | `role_permissions` access/edit grants |
| Limited staff | Enter only explicitly granted workflows | Mobile-first navigation | `role_permissions` access/edit grants |

Sources and dependencies:

- Authentication: Supabase Auth linked through `profiles.id` or `profiles.auth_user_id`.
- Account role: `profiles.role`.
- Account access: `profiles.access_enabled`; independent from workforce `is_active`.
- Module and edit grants: `role_permissions`.
- Navigation and routing: `access-control.js`, `features.js`, `PermissionsContext`, `App.jsx`, and `Layout.jsx`.
- Audit evidence: `access_control_events`.

## Findings and classification

### Essential

- A single policy evaluator for authenticated, owner-only, module-access, and module-edit decisions.
- Explicit fail-closed behavior when permissions cannot be verified.
- Owner controls for linked-login enable/disable and role permissions.
- English/Arabic labels for navigation, access decisions, roles, permission matrix, mobile search, and mobile page discovery.
- Mobile access to every visible/granted page.

### Consolidated

- `OwnerRoute`, `PermissionRoute`, sidebar role fallbacks, and unguarded authenticated routes now converge on `AccessRoute` plus the same policy objects used by navigation.
- Root landing is chosen from actually granted daily workflows rather than a hard-coded role list.
- Role Manager now uses the same active feature catalogue as navigation/routing.
- Profile resolution accepts either supported auth link.

### Archived or hidden

- `data_entry` is not a supported profile role in production and has no assigned profiles. Its permission rows remain preserved but the role is absent from assignment controls.
- Dead Inbox placeholder was removed from the primary navigation.

### Preserved for later consolidation

- Legacy non-active permission keys remain in the database because other historical code or evidence may reference them. They are not shown in the active matrix.
- Individual module RLS policies still remain the final write authority and will be reconciled as a whole in Module 8.

## Data and security decisions

1. Existing owners were backfilled enabled even when they are not employees.
2. Existing active non-owner profiles were enabled only when linked to an Auth account.
3. Former linked employees were disabled without deleting their workforce, payroll, or audit history.
4. New self-created profiles start disabled and as staff; an owner must enable access.
5. Non-owner profile updates are restricted to safe presentation/contact fields. Role, login access, workforce, branch, and payroll fields require owner authority.
6. Permission writes are revoked from direct authenticated table access and must use `update_role_permission_v2`.
7. Edit grants cannot exist without access grants.
8. Owners cannot disable an owner account or assign owner through the normal role workflow.

## Verification evidence

- Targeted Node tests: 6 passed.
- Targeted ESLint: passed for all changed POS sources.
- POS production build: passed.
- Playwright owner access journey: passed in English and Arabic.
- Playwright staff mobile journey: passed, including full “More” navigation and direct finance-route denial.
- Production database checks:
  - 29 profiles preserved.
  - 7 owner profiles enabled.
  - 0 linked former employees enabled.
  - 76/76 supported role/active-feature rows present.
  - 0 edit-without-access grants.
  - migration `20260731235000` recorded.
- Rollback-only production security probe: a staff JWT could neither self-promote to owner nor request the owner/archived role.
- `approve-staff-request` Edge Function deployed with linked-auth owner lookup and explicit account enablement.

## Rollback

The application can be rolled back by reverting the module commit. The database migration is additive and preserves all rows. A database rollback should first restore the previous application, then drop only the new trigger/functions/policies/table and access columns after exporting `access_control_events`; do not delete profiles or legacy role rows.

## Module 8 backlog

1. Reconcile every module's database RLS with the active role/feature catalogue and document intentional differences between UI edit grants and server write authority.
2. Replace broad authenticated reads of the base `profiles` table with purpose-specific safe directory/workforce RPCs so salary/contact columns are never overexposed.
3. Verify every production route across owner, supervisor, accountant, staff, and limited-staff accounts; test both auth-link shapes.
4. Complete the whole-system owner acceptance walkthrough on desktop and mobile, English and Arabic.
5. Review remaining legacy permission keys and approve archive/removal only after dependency evidence is complete.
