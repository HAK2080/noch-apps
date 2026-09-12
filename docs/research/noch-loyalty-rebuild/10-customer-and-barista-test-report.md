# Customer + barista journey test

12 September 2026 · Current implementation, not the proposed rebuild

**Follow-up:** the payment/completion permissions and stock-safety findings below were addressed and deployed in `efff7c6`. See [payment safety release](11-payment-safety-fix.md) for updated evidence and limitations. This report preserves the original assessment; duplicate guest submission and the other customer-tablet gaps remain open.

## Read this first

**Not ready for the complete two-tablet experience.** The menu, cashier customizations and basic QR/points components work in isolation. Their connections are incomplete, and database tests reproduced order-completion and stock risks.

**Fix first:** staff-only completion → one payment/completion path → one stock deduction → duplicate-order protection. Then connect the customer tablet and build the profile/prize experience.

**No real customer points, stock, cash, accounts or orders were changed by these tests.** No OTP, Telegram, WhatsApp, printer or display message was sent to a real recipient/device.

## What was actually tested

- **Live, read-only:** current City Walk menu, product detail, one local basket, checkout location barrier; deployed Arabic checkout-claim page. No checkout submission or customer identity entered live. GPS was unavailable in the desktop browser; this does not establish whether the café Android tablet's GPS works.
- **Real components, synthetic server:** browser-driven menu checkout; cashier modifier, incoming-order and payment components; two browser pages for QR/customer verification and points result. Every remote HTTP request intercepted. Decoded the actual generated QR image; this is not a physical camera scan. Payment callback checked, then a synthetic settlement response supplied—this is not a complete sale integration test.
- **Actual SQL in an isolated in-memory database:** guest submission, pickup completion, base-point settlement and its triggers, inventory mirror, latest strict-stock guard. Synthetic schema and balances only. Reward issuance/rebalancing and mission qualification are explicitly stubbed, so these tests do **not** certify prize redemption, active mission awards, all migrations, production policies or payment accounting.
- **Animation components:** six existing Nochi overlays render confetti/prize copy and dismiss automatically in isolation. Their existence is not evidence they run after the current QR checkout. Device sound was not verified.

## Customer journey

| Step | Finding | Verdict |
|---|---|---|
| Browse menu and prices | Live Arabic menu and product details load. Tested a 23 LYD iced vanilla latte in the live basket without submitting. | Works for browsing |
| Add/remove items | Existing basket and quantity controls. Synthetic checkout submits the selected product and quantity. | Component pass |
| Customize a drink | Public menu has no per-drink modifier chooser; payload only includes product and quantity. Collagen displayed as a separate product is not a drink modifier. | Missing customer feature |
| Identify and submit | Name/phone required in UI. In-range synthetic GPS enables Send to Cashier; denied/outside GPS blocks it. | Component pass; on-site check pending |
| Server location gate | Actual guest RPC accepts omitted coordinates without rejecting the order. Frontend gating alone is not server protection. | Gap reproduced locally |
| Order sent | Pickup code and total shown; no loyalty profile link. Feedback URL uses `orderResult.id`, while RPC returns `order_id`, yielding `order=undefined`. | Partial / link defect |
| QR scan | Cashier payment modal creates a decodable one-time claim URL. Customer page supports phone/email code verification. Synthetic email-code journey tested. | Component pass only |
| Wait for payment | Customer page waits while cashier sees the linked customer. Then it displays earned points/balance from the synthetic settled response. | Component pass |
| View profile | Result page displays name and balance, not a persistent complete membership card/profile. `getMyLoyaltyCardV2` has no UI consumer found. | Incomplete |
| Next milestone / prizes | Result shows reward **count** and mission counts. No connected prize gallery, spend-to-next-prize indicator or the agreed 150/250/400/1,200 reward ladder. | Missing requested experience |
| Animation / gamification | Stamp, badge, tier-up, streak, win and birthday overlays work alone. Current claim page uses waiting spinners and a static result; it does not invoke those overlays. | Components exist; connection missing |
| Finish / next customer | Menu's explicit Done button clears name/phone and basket. No verified automatic shared-tablet idle reset, account sign-out or cross-screen session isolation. | Manual reset only |

## Barista journey

| Step | Finding | Verdict |
|---|---|---|
| Receive menu order | Repository has branch-scoped realtime popup, alert and fallback polling. Tested the real popup with a synthetic order, not production realtime delivery. | UI pass; transport unverified |
| Review / edit | Popup displays items and total. No normal cart-edit/payment handoff in this path. | Missing |
| Accept | Calls `approve_online_order`, queues preparation printing and optionally a greeting. Does not open the regular payment modal. | Wrong sequence for agreed flow |
| Collect / complete | Calls `confirm_pickup_order` with pickup code and branch; no cash/card amount is entered in this path. Pending orders can be completed directly. | Payment-control blocker |
| Take a direct order | Cashier modifier component enforces required choices; tested 23 LYD + 3 LYD oat milk = 26 LYD with modifier preserved. Full staff login/shift/cart/receipt integration not run. | Component pass |
| Enter phone | Links synthetic member and completes callback with `phone_fallback`. It cancels the current checkout session and removes its QR image. | Works for attach; incompatible with requested subsequent scan |
| QR on second Android tablet | No customer-display routing or implemented customer-screen role found. QR remains inside the cashier modal. Printer-host selection is separate. | Missing |
| Final payment | Normal payment component passes cash amount, member and checkout-session IDs in its callback. Physical tender, final order RPC and accounting not exercised together. | Not end-to-end certified |
| Arabic messaging | Core cashier flow is Arabic-first and deployed. Public menu can still show raw English backend errors; Telegram new-order text and legacy spin controls remain English. | Not all messages Arabic |

## Highest-priority defects: ranked

1. **Staff-only, payment-controlled completion.** In the repository SQL, `confirm_pickup_order` is security-definer, granted to anonymous callers and has no staff check. Its actual function executed successfully under the anonymous role in the isolated database, completing a pending order without recorded tender. Production permissions were not probed or exploited. Require authenticated, branch-authorized staff and an explicit reviewed payment before completion/preparation.
2. **One inventory deduction.** Strict-stock completion trigger writes a sale movement; the pickup RPC also writes a sale movement. With 10 tracked units, one collection leaves **8**, not 9, in the combined repository SQL test. With only one unit, completion fails and rolls back to pending. Tested default-off behavior leaves 9. Do not enable/change production stock settings as part of this assessment; consolidate and test the completion path first.
3. **One order per submission.** Repeating the guest RPC request creates different orders. Add a stable request key and server-side idempotency; test retries, two staff tablets and concurrent completions. Sequential pickup repeat is rejected, but that does not prove concurrency safety.
4. **Complete server-side location validation.** Keep the existing menu/GPS approach, as agreed; enforce the intended policy in the RPC. Do not build pairing merely to replace GPS. Test actual café tablet accuracy before relying on a small radius.
5. **Connect the customer tablet safely.** Route only customer-safe current-sale information there; keep payment/admin actions on cashier device. Define the phone-fallback versus private QR claim sequence. Clear previous customer details, including abandoned sessions and account authentication.
6. **Deliver one customer card.** Name, balance, earned-this-order, exact points until the next prize, prize images/availability, redeem/save choice. Connect the reusable celebrations only after authoritative settlement; never celebrate points that were not saved.
7. **Finish Arabic and recovery states.** Translate menu server/coupon errors, operational notifications and legacy gamification controls. Expired QR remains displayed in the current payment modal with no automatic replacement; provide a clear Arabic refresh/retry action. Fix the feedback order ID.

## Points and safety results

- Server price wins over a client-supplied fake price: 23.90 LYD remains 23.90.
- Pending order earns 0; completed 23.90 order earns 23 whole points with a synthetic 1 point/LYD setting.
- Repeated settlement and sequential repeat pickup do not add another base-point award.
- Partial refund of 0.95 reduces that order's net-earned points to 22; void returns it to 0. An unrelated synthetic 100-point opening event remains intact.
- Invalid quantity rejects/rolls back the new order. Failed strict-stock completion rolls back its point award and leaves the pending order/stock intact.
- These are bounded synthetic proofs, **not** an account-by-account production reconciliation, restore test, reward-value migration approval or guarantee that all existing balances are correct.

## Test evidence and repeat commands

Results: **16 journey/animation browser tests, 7 Arabic browser regressions and 34 Node checks completed successfully.** Eight of the Node checks execute actual SQL in PGlite. Several successful assertions deliberately reproduce the gaps above; these counts are not a readiness score. Targeted lint and whitespace checks passed. No production-source changes were made in this assessment, so no new production build/deployment was necessary.

Run in `apps/pos` with the isolated fake-Supabase Vite server on port 4193:

```text
npx playwright test --config playwright.loyalty-journey.config.js --output test-results/loyalty-journey
npx playwright test --config playwright.pos-arabic.config.js
node --test tests/loyalty-journey-database.test.mjs tests/pos-arabic-messages.test.mjs tests/loyalty-v2-checkout-ui.test.mjs tests/loyalty-v2-migration.test.mjs tests/loyalty-customer-control.test.mjs tests/pos-weak-internet.test.mjs
```

The test names marked **GAP** intentionally reproduce defects. Green test-run status is **not** a green product/release assessment. Existing older loyalty checks include source-contract tests, not live database tests.

Source anchors: `src/pages/storefront/Menu.jsx`; `src/modules/pos/pages/POSTerminal.jsx`; `src/modules/pos/components/PaymentModal.jsx`; `src/modules/loyalty/pages/LoyaltyCheckoutClaim.jsx`; `src/modules/loyalty/pages/LoyaltySpinWheel.jsx`; `src/modules/loyalty/components/NochiAnimation.jsx`; migrations `20260718190200_guest_order_followups.sql`, `20260730180000_loyalty_v2.sql`, `20260731203000_inventory_control_authority.sql`, `20260912110000_global_stock_sales_guard.sql`.

## What remains before signing off

After fixes, run one isolated full-application two-screen test with real test-environment database/realtime/auth, then an owner-approved café trial covering both Android tablets, GPS, physical QR scan, OTP delivery, printer routing, staff shift, cash/card recording, prize redemption, cancellation/refund, disconnected/reconnected tablets and exact ledger reconciliation. Use designated test identities/orders and a documented cleanup/reversal process. Do not use real customer balances as test fixtures.

**Project goal:** this is the test phase of the existing unfinished loyalty-rebuild goal. A second `/goal` could not be created while that goal exists; it was not falsely marked complete. Neither the complete rebuild nor the physical end-to-end test is complete.

**Release note:** Arabic commit `4fe0be0` is already included in successfully deployed `0a3f518`, run [34678009409](https://github.com/HAK2080/noch-apps/actions/runs/34678009409). No new application/database release was made for this testing work. Concurrent POS/product-ordering edits from another task were preserved; new artifacts are test fixtures, tests and this report.
