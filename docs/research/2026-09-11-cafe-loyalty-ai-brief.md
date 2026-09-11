# Noch loyalty: what exists, what leaders do, and where AI helps

Marketing brief · 11 September 2026

## The recommendation in one sentence

Make Noch easy to join, clear to understand and rewarding to return to; then use AI to help the team send more relevant offers, with people approving the decisions.

Noch has a useful points-and-rewards foundation. The biggest gap is that the new loyalty system, customer website and older marketing tools do not yet tell one consistent story. Adding sophisticated AI before connecting them would risk acting on incomplete or outdated information.

Scope: reviewed the implementation in the **Sept version** folder, at source revision `b2ed42d`, and current public brand/vendor sources. “Built” below means present in the inspected implementation, not a fresh end-to-end production certification. Current live settings, message delivery and AI-provider availability were not re-tested for this brief. Recommendations are proposals, not implemented changes.

## 1. What Noch has now

| Feature | What it does in plain English | Readiness note |
|---|---|---|
| Join while paying | A customer scans a checkout QR code and verifies their phone or email with a one-time code. Staff can link a member or record why the sale was not linked. | Built into the new checkout flow. |
| Earn points | Qualifying paid purchases earn points. The default is 1 point per net LYD spent, rounded down per order. | Built; confirm live settings before publishing the earning promise. |
| Earn and use rewards | The default rule turns 200 points into a free-item reward automatically, deducts those points and keeps the remainder. Default reward validity is 45 days. Staff apply eligible rewards at checkout. | Built. Product eligibility and live terms need confirmation before promotion. |
| Bonus challenges, called missions | Encourage repeat purchases, particular products, product categories or visits during quieter hours. Owners set dates, branches, targets and bonus points. | Management tools are built; this does not mean campaigns are currently running. |
| See progress after purchase | The checkout result shows points earned, balance, available rewards and mission progress. | Built; a consistent, easy-to-return-to member page is still needed. |
| Member records and reporting | Owners can see members, masked contact details, purchase history summaries, balances, rewards and consent. Dashboard summaries track purchase linking and reward costs. | Built; reporting periods and old/new data need alignment. |
| Message preferences | Customers choose service messages, promotional offers or no messages. Sending checks verified consent. | Built; a stored phone number or old WhatsApp flag is not permission to market. |
| Reward safeguards | Purchase-linked records, duplicate-award protection, refund adjustments and controlled redemption help keep balances reliable. | Built in the backend. |
| Old-program history | Owners can view the previous stamp program and migration records. | Archive, not a separate current offer. |

### Existing, but not ready to describe as one connected loyalty service

- **The customer website still contains the old stamp-card experience**, while the new checkout uses points. This needs one agreed customer-facing version.
- **Marketing includes birthday, inactive-customer and reward-ready campaign workflows**, with recipient previews and approval. Parts still reference old stamps, tiers and rewards. These must be connected to the new loyalty records and verified consent before relying on them for new-program campaigns.
- **AI writing already exists in Content Studio:** generating drafts and rewriting them in the brand voice. Reuse this capability. It is not evidence that AI currently chooses loyalty offers or predicts who will stop visiting.
- **The loyalty “intelligence” and marketing summaries are rule-based.** I did not find a connected new-program engine that learns which offer works best for each member.

Do not advertise old tiers, spin-to-win or leaderboards as active new-program benefits simply because older files remain in the repository.

## 2. What leading programs teach us

| Example | What is happening | Lesson for Noch |
|---|---|---|
| Starbucks | Its March 2026 refresh introduced Green, Gold and Reserve levels, visible progress and benefits beyond free drinks. Separately, its April 2026 ChatGPT beta suggests drinks from a customer's description or photo. | Show progress clearly. AI can help discovery, but drink discovery and loyalty reward decisions are different capabilities. [Rewards announcement](https://about.starbucks.com/press/2026/reimagined-starbucks-rewards-loyalty-program-launches-with-new-member-benefits/), [AI beta](https://about.starbucks.com/press/2026/a-new-way-to-inspire-your-starbucks-order/). |
| Dutch Bros | Combines points, welcome rewards, collectible digital stickers, challenges, personalized offers and the ability to share a reward with a friend. | Make membership enjoyable and social, not only a discount calculation. Its public rewards page does not establish that those offers use AI. [Program details](https://www.dutchbros.com/rewards/). |
| Panera | Its August 2026 redesign added clear spending-based points, a choice of rewards at different point levels, and a subscription option. | Offer an attainable first reward and let customers choose. Do not copy subscription economics without testing them locally. These features are not themselves proof of AI. [New program](https://www.panerabread.com/en-us/press/press-room/panera-unveils-all-new-points-based-mypanera-rewards-program.html). |
| Kahwa Coffee / Thanx | Thanx presents Kahwa as a small-team loyalty example and offers easy enrolment, automated return-visit campaigns, challenges, AI-assisted audience selection and comparison groups for testing. | A small team can benefit from a marketing assistant and fewer manual steps. Platform capability does not prove Kahwa uses every AI feature; results are vendor-reported, not a forecast for Noch. [Coffee loyalty platform and case example](https://www.thanx.com/coffee-loyalty). |

My synthesis: the strongest direction is **easy participation + visible value + relevant reasons to return + measured results**. AI supports these fundamentals; it does not replace them. These are mainly US examples, so adapt the ideas to Noch's customers, language, payment habits and product margins.

## 3. Improve the existing program first

1. **Give customers one clear loyalty card.** Use the same points, rewards and wording on the website and checkout. Make the card easy to reopen and returning-member identification quick. Finish Arabic/English wording and make expired QR codes easy to refresh.
2. **Make the first benefit feel reachable.** Show “You need X more points.” Test a small, low-cost early benefit, then offer a choice of larger rewards. Check purchase frequency and item costs before changing the 200-point rule; it is not possible to conclude from the threshold alone that it is too high.
3. **Use the missions already built.** Start with one repeat-purchase mission and one quieter-hours mission. Choose targets and bonus points from actual visit patterns and reward costs. Adding a new mission engine is unnecessary.
4. **Connect marketing to the new member records.** Make birthday, return-visit and reward reminders use current points, purchases, eligible rewards and verified message preferences. Do not promise a gift unless an actual redeemable reward supports it.
5. **Give marketing suitable access and useful reporting.** The inspected marketing and loyalty management screens are owner-only. Add limited marketing permissions, without unnecessary contact-data access. Show clear reporting dates, repeat visits, redemptions and campaign costs.

Later experiments: Nochi collectible badges, early access to drinks, tastings and reward sharing. These are proposed additions, not current new-program features. Defer paid subscriptions and complex status levels until the basic program is working consistently.

## 4. Where AI adds a useful edge

| Priority | AI improvement | Simple example | What must support it |
|---|---|---|---|
| Start first | Marketing writing assistant | Draft an Arabic and English message for an approved quiet-hours mission, using Nochi's voice. | Reuse Content Studio; feed it exact offer terms and require approval. |
| Next | Audience-building assistant | “Show members who usually buy in the morning but have not tried our afternoon menu.” | New-program purchase records, permission checks and a preview of who qualifies. Let software enforce the filters. |
| Next | Weekly plain-English summary | Explain which mission brought extra return visits and which cost too much. | Consistent dates and calculated metrics. AI explains numbers; it must not invent them. |
| Later | Better timing and offer selection | Notice that a regular is overdue relative to their own usual visit pattern, then suggest a relevant nudge. | Enough linked purchase history, reliable cost data and comparison tests. Start with simple rules until learned models demonstrably improve results. |
| Later | Menu discovery assistant | Suggest an available drink matching “something cold, less sweet and without coffee.” | Accurate menu, availability and ingredient data. Do not guess allergy suitability or invent products. |

AI should recommend; approved business rules should control eligibility, point balances, expiry, budgets and redemption. Keep personal contact details out of prompts where unnecessary, respect opt-outs, limit message frequency and log approvals.

## 5. A simple first pilot

**First:** align the member experience, fix old/new data connections and verify earning, redemption, refunds and consent end to end.

**Then:** run two existing mission types and use AI only to draft their messages and explain results. Keep an appropriately sized random comparison group that does not receive the extra campaign; everyone keeps their normal loyalty benefits. If membership activity is too low for a meaningful comparison, extend the test and do not declare a winner early.

**Judge success by:** more purchases linked to members, more second visits within 30 days, shorter time to a first reward, additional visits versus the comparison group, and additional profit after rewards, messages and AI costs. Watch opt-outs and checkout time too. More messages or redemptions alone do not prove success.

**Bottom line:** Noch should feel like a café that remembers its regulars. Its first AI investment should help the team use the program it already has—then learn what genuinely brings people back.

## Implementation evidence

Reviewed routes and source in the Sept version checkout:

- `apps/pos/src/App.jsx`: current loyalty/marketing routes, old-route redirects and owner-only access.
- `apps/pos/src/modules/pos/components/PaymentModal.jsx`: member capture and reward use at checkout.
- `apps/pos/src/modules/loyalty/pages/LoyaltyCheckoutClaim.jsx`: verification, post-purchase progress and message preferences.
- `apps/pos/src/modules/loyalty/pages/LoyaltyMissionsV2.jsx`, `LoyaltyV2Dashboard.jsx`, `LoyaltyCustomersV2.jsx`, `LoyaltyV1Archive.jsx`: current management features.
- `supabase/migrations/20260730180000_loyalty_v2.sql`: default earning/reward rules, missions, ledger and redemption.
- `supabase/migrations/20260731233000_loyalty_customer_control.sql`: member controls and reporting.
- `apps/storefront/index.html`: old stamp experience and old member-card call.
- `apps/pos/src/modules/marketing/tabs/CampaignsTab.jsx`, `InsightsTab.jsx` and `lib/marketing-supabase.js`: campaign workflow and legacy dependencies.
- `supabase/functions/_shared/notifications.ts`: verified consent checks.
- `apps/pos/src/modules/contentStudio/ai/generateDrafts.js`, `humanizeDraft.js` and corresponding functions: existing AI writing integrations.
