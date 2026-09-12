# POS worker review — September 12, 2026

Deployed after explicit user approval. Implementation commits `9e2ef07` and `d3e2221` are on GitHub main. Website deployment run 34679166124 succeeded. Migration `20260912160000_pos_popularity_completed_sales.sql` was applied successfully to production. No production shift or sale was created during testing.

## Walkthrough findings

The live City Walk branch had no open shift. Inspected the opening form, used the visible owner-skip control on the employee PIN screen, and inspected the Arabic terminal. Selected water into an unsold cart (1 LYD), then cleared it. No checkout was submitted. There are 183 available catalog records in the All view, including drinks, sweets and retail equipment; this makes browsing beyond the leading products lengthy.

The menu already loads cached data before network refresh and sorts products by branch popularity over the last 30 days. Water, cappuccino and classic matcha were near the top during inspection. Several products have no image and fall back to initials. Some stock badges remained English. The print-host banner reported no connected device; physical printing cannot be verified from this session.

## Prepared changes

- **Quicker product taps:** use already-loaded modifier data instead of requesting it for every tap. If options have not loaded, a bounded lookup is used. A failed lookup reports a retryable error instead of silently omitting required options. The modifier dialog receives the groups actually found, and failed link-table reads are no longer mistaken for no modifiers.
- **Opening:** require an explicit counted amount (zero is valid), support form submission, disable controls while opening, and guard duplicate submissions. A failed shift lookup offers retry instead of incorrectly saying there is no open shift. Opening and principal branch controls follow the POS Arabic-first preference.
- **Closing:** retain the distinction between a blank count and a counted zero, label the count input for accessibility, and show a retry option if loading fails instead of presenting a misleading no-shift state. No closing/accounting policy was changed.
- **Menu readability:** two lines for names in single-language mode, with Arabic stock badges and empty-search messages. Small categories keep rows compact instead of stretching them apart.
- **Popularity:** count completed, non-voided orders over the last 30 days, net of returned quantities. Pending/cancelled baskets and future timestamps no longer contribute. Existing branch filtering and stable sorting for equal popularity remain.

## Verification

37 checks passed:

- 22 existing Node checks covering weak internet, cashier messages, cash-close states and sales/cash-control interfaces.
- Three new executable handler/database tests covering cached taps with no request, options fallback/failure, and popularity status/branch/refund/date filtering.
- Three new browser walkthroughs using real opening/closing components with synthetic backend responses: explicit count and single opening submission, failed shift retry, and closing with a physical count after the missing-count warning.
- Seven browser checks covering Arabic checkout, loyalty, manager PIN errors, required modifiers and online order controls.

Two additional menu browser checks at 390px and 1024px passed: product tapping, sold-out state, Arabic empty search, no horizontal overflow, and compact row spacing. Phone and tablet screenshots were visually inspected.

Targeted ESLint and production build passed. Browser write paths use synthetic records. Hardware printing, a real employee PIN session, and an actual business-day cash reconciliation have not been performed. Production verification passed: the Arabic opening dialog and labelled cash field load, cancellation leaves the shift closed, owner terminal navigation works, and Arabic stock badges and leading sellers render. The live popularity query returned Water 1501, Cappuccino 451, Matcha latte 313, nitro hibiscus 308, and Iced Caramel Macchiato 283 units.

## Recommended next improvements

1. A compact “Frequent items” view (roughly 12–20 products), with retail equipment grouped separately. Keep All and search available. Avoid moving buttons during an active order.
2. Fill missing Arabic names and product images, prioritizing the top sellers. This helps staff identify similar drinks faster than initials.
3. Add a one-tap opening action directly to the terminal's no-open-shift warning, with the same cash-count form. The current message points workers to Settings.
4. Connect the branch print host and run a real drink-ticket/receipt check on the shop device. The existing banner correctly reports the disconnected state.
5. Put shift-close readiness in one compact checklist: queued orders synced, pending orders reviewed, cash counted and printer status. Keep manager exceptions explicit.

The software changes are locally verified, deployed and smoke-tested in production. Physical printer readiness requires access to the shop device.
