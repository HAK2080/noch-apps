# Agreed build sequence — 12 September 2026

This checkpoint supersedes earlier proposals where they conflict with the decisions below. It does not mean the whole rebuild is implemented.

## First release: Arabic cashier experience

Arabic by default for the core cashier screens and messages: incoming orders, payment/loyalty capture, PIN sign-in, manager approval, modifier validation, scanner guidance, print confirmations and offline-sync alerts. English remains an explicit language choice; bilingual product tiles use Arabic controls. The customer checkout-claim page starts in Arabic and has an English option. Existing Arabic customer-memory summaries and greetings are used rather than English ones.

This release does **not** change payment/order state transitions, print routing, point balances, reward thresholds, consent rules, or the database. Owner/admin settings and historical catalogue text are not a claim of complete application-wide localisation. No SMS, email or WhatsApp templates or provider configuration are changed in this first release.

## Next: reuse customer menu → cashier review → payment

The actual menu at `apps.noch.cloud/menu/:branchId` already has a basket, customer name/phone, location check and Send to Cashier. Existing pending online orders reach the branch POS. Current Accept starts preparation/printing; it does not open normal payment collection. Add a review/edit and explicit payment step before preparation. Prevent duplicate completion, duplicate tickets, order mixing and repeat point awards. Use synthetic database/payment tests before deployment.

Keep the existing customer menu and GPS checks on customer phones and the second Android tablet if GPS works there. Do not build a new pairing system merely to replace working behaviour. Printer-host settings remain separate and untouched. The second tablet needs a real on-site GPS check, privacy reset between customers, and no staff/private controls. Initially the cashier can handle drink customisations; customer-side customisations can follow.

## Loyalty decisions to implement later, with value-protection gates

- One balance; no membership tiers initially. One point per LYD actually paid, rounded down once per order. Paid extras earn; free rewards and discounted amounts do not.
- Product rewards, chosen by the customer. No automatic conversion. Provisional prices: classic coffee 150 points; flavoured iced coffee 250; premium/matcha 400; Bloom Tumbler 1,200. Verify complete costs before final prices. Tumbler cost supplied by owner: 55 LYD.
- No minimum spend for redemption. Multiple rewards per order allowed if balance is sufficient. Standard drink included; paid extras separate. Unavailable rewards do not deduct points.
- Points expire after 12 months without earning or redemption; activity resets the whole balance's clock. No retrospective expiry at cutover. One reminder 30 days before expiry via available phone/email with applicable consent; avoid duplicates.
- Refunds reverse points earned on the refunded amount; cancelled reward redemptions return points. Calculations must be automatic and tested with partial refunds and rounding.
- Preserve every existing customer account, point balance, earned reward, history and practical reward value. Backup, restore test and account-by-account reconciliation are release gates for any loyalty-data migration. No migration has been performed in this Arabic release.

## Verification for the Arabic slice

- Targeted Node checks cover copy interpolation, language fallback, error safety, existing loyalty preservation contracts and offline-sale behaviour.
- Browser fixtures exercise real React components with all remote requests mocked: Arabic incoming-order actions and errors, payment totals/capture, English opt-in, customer claim language, manager approval and modifier validation. No production test orders, messages or customer accounts.
- Run `npx playwright test --config playwright.pos-arabic.config.js`, targeted ESLint and `npm run build` in `apps/pos`.
- Production verification must distinguish loaded UI/assets from an actual tablet/printer/payment E2E test. This release does not certify the physical tablets or SMS delivery.
