# Staff Skin Redesign — 2026-07-31

## Source and scope

Implemented from `C:\Users\aeroh\Downloads\apps.noch redesign to Oatly style.zip`, specifically the `design_handoff_noch_staff_skin` README and its two direction files.

The handoff scope is deliberately limited to the authenticated staff experience:

- `/dashboard` owner reporting
- `/pos/:branchId` terminal, product grid, and cart
- shared authenticated shell and login across every staff route

The customer storefront (`/menu/:branchId`) was not changed. Existing routes, permissions, data access, loyalty capture, inventory behavior, and POS handlers remain authoritative.

## Implemented decisions

- Added a scoped `staff-skin` visual seam rather than replacing the application's global design tokens.
- Applied the cream/newsprint palette, ink borders, Anton display type, and Space Mono labels from the handoff.
- Kept existing plain operational copy to avoid changing translations or workflow meaning; the handoff's louder copy is optional.
- Preserved the existing bilingual controls and added a staff-specific EN/عربي toggle presentation on login.
- Removed the dark-mode toggle from the cream-first staff shell so it cannot imply a theme change that the scoped skin does not support. Other authenticated modules retain the existing theme control.
- Kept the existing product, quantity, hold, charge, login, and permission handlers; CSS and marker classes provide the visual handoff without duplicating behavior.

## Verification

- `node --test` across `tests/` and `apps/pos/tests/`: 130 passed
- Targeted ESLint for all changed JSX files: passed with zero warnings/errors
- `npm run build` in `apps/pos`: passed
- `git diff --check`: passed (only normal CRLF conversion notices)
- `apps/pos/tests/staff-skin-handoff.test.mjs`: 3 passed

## Remaining product decision

The handoff leaves dark mode as an open question. This release chooses cream-first for the owner dashboard, POS, and login because that is the supplied visual direction. If a dark staff variant is required later, it should be introduced as a second explicit skin with its own contrast review rather than allowing global theme state to partially recolor this one.
