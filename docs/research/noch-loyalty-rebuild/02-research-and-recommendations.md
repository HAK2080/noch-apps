# Preparing the Noch loyalty rebuild

## Executive assessment

The recommended rebuild is a simpler customer journey over a protected, auditable record of customer value. It should remove repeated identification, contradictory reward promises and unnecessary cashier decisions. It should not replace those problems with mandatory app installation, more personal-data collection or AI that autonomously gives away discounts.

The first release should let someone understand the program in one sentence, reopen one member card, identify once per purchase and see the result. Existing points and rewards must survive unchanged. AI should first reduce the team's work: prepare messages, translate campaign intent into a reviewable audience and explain verified results.

The full feature inventory and source evidence are in the companion system map. This report addresses the design decision, market evidence, AI opportunities and priorities.

## 1. What the evidence supports

### Convenience is a system property

Square documents enrolment during checkout, post-sale invitations, a reusable status page and supported digital-wallet check-in. Its example demonstrates that joining, returning and recovering missed value need separate journeys. Its documented wallet feature is iOS-specific; it is not proof of availability on Noch's terminals or in Libya. [1](https://squareup.com/help/us/en/article/5347-how-customers-redeem-their-rewards)

Thanx distinguishes payment-card-linked loyalty from register check-in. Its documentation states that its card-linked product is US-only because of network agreements, while check-in uses phone, email or QR and supports international integrations. This is an important limit: a US zero-action payment example cannot simply be specified as a ready-made local feature. [2](https://docs.thanx.com/overview/loyalty-models)

**Recommendation:** make a lightweight web member card the baseline. Keep cash and card purchases equally eligible under the agreed rules. Add wallet passes or payment-linked recognition only after device, geography, scanner, processor and account-recovery checks. A barcode identifies a member; it does not by itself prove authority to spend that member's rewards.

### Visible progress can encourage return visits

Kivetz, Urminsky and Zheng's 2006 research included a real café program and found purchases accelerated as members approached a reward. It also tested a head-start framing. This supports clear progress and an attainable goal, not a promise of a particular sales lift for Noch. The evidence is old and context-specific; it is a behavioral design input, not a contemporary local forecast. [3](https://drupalgsb-dev.cc.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf)

**Recommendation:** show actual progress and the next available benefit. If introducing a welcome bonus, award it honestly and explain it. Avoid invented progress, guilt-based mascots or countdowns that are not tied to a real expiry rule.

### Membership statistics do not establish causality

Leenheer and colleagues' research on supermarket loyalty explains why already-loyal shoppers may be more likely to enrol. Member spending can therefore exceed non-member spending without the program causing the whole difference. This is a different sector and an older study, but the measurement warning is directly useful. [4](https://www.researchgate.net/publication/232906169_Do_loyalty_programs_really_enhance_behavioral_loyalty_An_empirical_analysis_accounting_for_self-selected_members_International_Journal_of_Research_in_Marketing_24_31-47)

**Recommendation:** compare an extra campaign with an eligible, randomized no-extra-campaign group. Both groups keep their normal rewards and existing balances. Measure extra return visits and contribution after reward costs, not only enrolment, message opens or redemptions.

## 2. Leading programs and transferable lessons

| Program / geography | Verified example | Lesson and limitation |
|---|---|---|
| Starbucks / US example | The March 2026 Rewards refresh has Green, Gold and Reserve levels, visible progress and differentiated benefits. | Recognition and understandable progress matter. Three status levels are not automatically appropriate for a smaller program. [5](https://about.starbucks.com/press/2026/reimagined-starbucks-rewards-loyalty-program-launches-with-new-member-benefits/) |
| Dutch Bros / US | Points, welcome rewards, digital stickers, challenges, personalized offers and reward sharing. | Nochi can add identity and delight later without another points currency. The rewards page does not establish that personalized offers use AI. [6](https://www.dutchbros.com/rewards/) |
| Costa Club / Great Britain example | One Bean per eligible drink, ten for a free drink, extra Beans for reusable cups and two-Bean add-on Swaps. The FAQ also describes receipt-based recovery when scanning is unavailable. | Small reward options and a recovery route can coexist with the main reward. Do not copy the threshold, expiry or terms across markets without testing. [7](https://www.costa.co.uk/faqs) |
| Panera / US | The August 2026 redesign introduced spend-based points, rewards at different levels and a subscription-linked tier. | Transparency and choice are useful. The old pre-August program and expired launch offers are not the current baseline. Subscription economics are a separate project. [8](https://www.panerabread.com/en-us/press/press-room/panera-unveils-all-new-points-based-mypanera-rewards-program.html) |
| Kahwa / Thanx platform example | Thanx presents Kahwa as a small-team operating example and describes enrolment, automated lifecycle campaigns and testing tools. | Reduce manual campaign work. Vendor testimonials and aggregate performance claims are not independent evidence or a forecast of Noch's return. [9](https://www.thanx.com/coffee-loyalty) |

The pattern is not “copy the biggest brand.” It is “make participation easy, make the value understandable and test the reason to return.” A complex program may be viable for a large brand with dedicated teams but unnecessary for Noch's first rebuild.

### Comparison of program structures

| Structure | Benefit | Trade-off | Recommendation |
|---|---|---|---|
| Drink stamps | Easy to explain for a narrow menu. | Rules for multiple drinks, low/high-priced products and food become exceptions. A change from points also creates conversion risk. | Do not switch currencies in the first release. A visual progress display can simplify points without creating stamps. |
| Spend-based points | Fits the current model and different basket sizes. | Customers need a clear explanation of reward value and exclusions. | Retain the currency initially; simplify its presentation and audit the economics. |
| Automatic reward issuance | No need to decide when to convert points. | Starts reward expiry and removes points automatically; limits saving for a different reward. | Preserve issued rewards. Explicitly choose whether future earning uses automatic issuance or customer choice. |
| Customer-selected reward catalogue | Supports smaller benefits and personal preferences. | More choices can slow redemption; requires different issuance logic. | Pilot a very small catalogue, with one suggested choice and a clear alternative. |
| Status tiers | Recognizes regulars. | Adds another progress system and qualification rules. | Defer unless research shows a clear unmet recognition need. |
| Paid subscription | Potentially supports habitual use. | Redemption frequency, cannibalization, capacity and cancellation economics need separate validation. | Outside the first release. |

## 3. Where AI is real, and where it is not

**Panera: decisioning and targeted communication.** Braze's case study describes AI identifying guests at risk of lapsing during Panera's April 2024 menu transformation, with tailored content and follow-up journeys. It reports a 5% retention lift and other improvements. These are vendor/customer-reported campaign outcomes without enough public experimental detail to independently reproduce them. They are not results from the August 2026 points redesign. [10](https://www.braze.com/customers/panera-case-study)

**Starbucks: staff assistance and discovery.** Its June-updated 2026 account describes Green Dot Assist answering operational questions and intelligent order sequencing; forecasting and equipment extensions are described as future-facing. Its April drink-discovery launch is explicitly a beta that uses descriptions or photos. Neither example demonstrates that every loyalty reward is selected by generative AI. [11](https://about.starbucks.com/press/2026/supporting-the-moments-that-matter-with-artificial-intelligence/), [12](https://about.starbucks.com/press/2026/a-new-way-to-inspire-your-starbucks-order/)

**Thanx: natural-language audience building.** The March 2026 update describes SegmentAI audiences based on modifier purchase behavior. This is useful evidence for an operator assistant that turns marketing intent into audience logic. It does not prove that an autonomous real-time offer system is deployed across all customers. [13](https://www.thanx.com/releases/march-2026-product-updates)

**Noch: AI writing exists; loyalty decisioning is not established.** Content Studio has connected draft-generation and rewriting code. Marketing's Insights screen describes deterministic summaries and still displays stamp-based progress. Naming a screen “intelligence” does not make its customer grouping a learned prediction model. See system-map evidence C11 and C15.

### Ranked AI opportunities

| Order | Capability | Input and output | Approval / success test |
|---|---|---|---|
| 1 | Campaign-writing assistant | Approved mission, exact benefit, dates and language → bilingual draft. | Human approves; zero invented terms; less editing time than writing manually. Reuse Content Studio. |
| 2 | Weekly results explanation | Calculated, dated aggregates → short explanation and questions. | Every number links to its source metric; missing data stays missing; no causal claims without a comparison. |
| 3 | Audience-building assistant | “Morning regulars who have not bought food” → allowlisted filters and preview. | Software validates permissions and filters; staff approves; no arbitrary SQL execution. |
| 4 | Feedback triage | Actual comments → themes and suggested staff response. | Escalate serious complaints; no automatic compensation or suppression of negative reviews. |
| 5 | Visit-pattern timing | Sufficient member purchase history → suggested overdue-member group. | Beat a simple rule on held-out data; exclude incomplete histories and respect frequency limits. |
| 6 | Incremental offer selection | Test results, item contribution and eligibility → suggested offer or no offer. | Optimize additional profit, not redemption; keep a comparison group and a hard budget. |
| 7 | Drink discovery | Current menu, availability and explicit preferences → suggestions. | Optional, never required to order or redeem; no guessed allergy suitability. |

The learning stage has no universal minimum member count. It needs enough correctly linked, repeated purchases and enough experimental outcomes for the particular decision. Start with explicit rules, measure them and only add a predictive model when its additional benefit can be demonstrated.

NIST's generative-AI profile describes risks including confidently incorrect output and privacy harms. For Noch, the practical boundary is that AI may explain or propose; deterministic services control balances, eligibility, expiration, identity, consent and redemption. Customer messages must be grounded in the actual offer. Minimize personal data sent to models and treat customer comments as untrusted content. [14](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)

## 4. The proposed low-friction experience

### First visit

Show the benefit before asking for information. Let the customer join on their own device or use an assisted alternative. Ask only for the information needed to create and recover the account; gather birthday and drink preferences later. Verification should protect account ownership but must not delay payment. The current checkout claim requires an open transaction, so a secure post-payment claim is a new capability, not a copy change.

If verification is delayed, finish the sale and provide a bounded, single-use claim opportunity tied to that actual purchase. Require proof of account ownership before attaching historical value or spending rewards. Avoid phone-only access to a private balance.

### Returning visit

Open the same web card, scan once and earn from the paid order. A recognized customer should not need to type their name again. A remembered, protected session can avoid repeated login; account recovery and risky actions may still require verification. Never silently merge identities that happen to share a phone number.

### Reward use

Show what is eligible for the current basket and explain exceptions before payment. Let the customer approve using a reward; complete the discount and reward use together. Failed or duplicate payment attempts must not consume the reward twice. Refunds need explicit rules for restoring a redeemed reward as well as reversing newly earned points.

### Missed scan or poor connection

Offer a clear recovery path. A transaction that is safely queued offline should produce recoverable evidence, not a promise that points have already posted. Sync with the same transaction identifier and award once. High-risk offline reward redemption should remain disabled until an anti-double-spend design is approved. A service delay must not become an untraceable loss of a customer's benefit.

### After the visit

The member page should show balance, separate earned rewards, next benefit, recent history and message preferences. Messages are optional. Use a few useful service updates and only approved promotional journeys; avoid frequent reminders that turn the program into noise.

Google documents loyalty passes with points and barcode fields and distribution through web links. This supports wallet passes as an optional access layer, not a substitute for the account ledger. Local availability and hardware still need testing. [15](https://developers.google.com/wallet/retail/loyalty-cards?authuser=19&hl=en), [16](https://developers.google.com/wallet/retail/loyalty-cards/resources/template)

WhatsApp's current business policy requires permission for subsequent contact and approved templates for business-initiated conversations. Preserve Noch's verified consent evidence and validate current provider/template requirements at launch. Loyalty membership must not be treated as blanket promotional permission. This is a product safeguard, not a legal-compliance determination for Libya. [17](https://whatsappbusiness.com/policy/)

## 5. Overall recommendations, ranked top to bottom

Rank is based on customer-value risk first, then frequency of friction, dependency, expected benefit and implementation effort. It is an analytical priority order, not a measured ROI score.

| Rank | Recommendation | Expected benefit | Dependency / completion evidence |
|---|---|---|---|
| 1 | Reconcile and protect all value, including old feedback awards | Prevents losing or duplicating customer property and promises. | Verified backup/restore, account-level comparisons, legacy delta review and rollback plan. |
| 2 | Write one program contract and name one authority for value | Makes the system explainable and stops conflicting rules. | Approved earning, exclusions, rewards, expiry, refund and recovery rules in Arabic/English. |
| 3 | Replace split member surfaces with one persistent card | Removes confusion on repeat visits. | Homepage, receipt, old passport links and checkout resolve to the same authorized member view. |
| 4 | Remove loyalty as a payment prerequisite and build claim recovery | Reduces checkout delays and missed earning. | Paid-order capture remains auditable; secure post-sale/offline claim tests pass. |
| 5 | Strengthen transaction and identity tests | Prevents fast but incorrect balance changes. | Concurrent redemption, retries, partial refunds, voids, lost-phone recovery and cross-member access tests. |
| 6 | Simplify rewards and test the first-benefit distance | Makes value visible without blanket discounting. | Actual basket/margin analysis; customer-choice logic if adopted; legacy rewards unchanged. |
| 7 | Consolidate missions, marketing audiences and consent | Makes current tools usable and consistent. | Retire duplicate challenge paths only after outstanding promises and history are reconciled. |
| 8 | Repair measurement and enable controlled campaigns | Establishes real outcomes. | Date-consistent reports, correct aggregation, delivery/consent states and experiment assignments. |
| 9 | Give marketing a limited operating role | Reduces owner bottlenecks without exposing unnecessary data. | Preview/approval workflow, role tests and audit trail. |
| 10 | Reuse AI writing and add verified summaries | Saves preparation time safely. | Approved terms, privacy minimization, manual fallback and measured time saving. |
| 11 | Pilot one return-visit and one quiet-hours mission | Tests a business reason for loyalty. | Correct eligible-purchase definitions; protect comparison group; measure extra profit and visits. |
| 12 | Add learned timing and offer suggestions only after reliable evidence | Improves relevance beyond rules. | Sufficient history, held-out evaluation and controlled incrementality tests. |
| 13 | Selectively add delight and optional access channels | Supports recognition and convenience. | Customer demand and cost evidence for badges, gifting, tastings, wallet or payment linking. |

**Retire from the first-release experience:** separate stamp counters, duplicate challenge administration, inactive staff spin/leaderboard pages, legacy direct point-edit helpers and duplicated campaign calendars. “Retire” means remove the redundant operating path after replacement; it never means delete customer records or outstanding rewards.

## 6. Economics and measurement

Do not set a new threshold from another brand's program. First calculate time to reward by real purchase patterns, item cost, existing discounts, basket mix and expected redemption. For a simple illustration only: if eligible net spend were 20 LYD per visit and earning stayed at one point per LYD, a 200-point reward would take about ten such visits before bonuses. At 10 LYD it would take about twenty. Neither basket size is asserted as Noch's actual average.

Separate the menu price of a free drink from its cost to provide and from the paid sale it may replace. Compare campaign contribution after product costs, discounts, incremental staffing where relevant, messaging and AI costs. Avoid subtracting the same discount twice if revenue is already net of it. Include a “no additional offer” option in tests.

| Metric | Definition / use |
|---|---|
| Participation | Linked eligible paid orders / all eligible paid orders, with one published definition and reporting window. |
| Returning-member friction | Time and actions from presenting identification to confirmed recognition; report median and 95th percentile. |
| Join completion | Verified join completions / join starts; break down code-delivery and claim failures. |
| Recovery | Eligible missed/offline claims resolved correctly; measure delay and unresolved cases. |
| Repeat visits | Second paid visit within 30 days among members with a full 30-day observation window. |
| Reward experience | Time to first reward, eligible redemption completion and disputed/missing rewards. |
| Incremental campaign value | Difference in visits and contribution per assigned eligible member versus the comparison group. |
| Trust guardrails | Opt-outs, complaints, unauthorized access, duplicate issuance and unexplained balance differences. |

There is an existing experiments register and content measurement infrastructure, but a register of hypotheses is not an automated loyalty experiment. Use persistent randomized assignments and record campaign exposure; keep normal customer entitlements available in both groups. Specify test duration and sample-size needs before declaring a winner. Low activity means an inconclusive result, not evidence of zero effect or permission to manufacture a forecast.

## 7. Proposed acceptance targets and unresolved choices

Suggested usability targets are **design targets, not market benchmarks**: an already-authenticated returning member is recognized with one scan and no retyped profile fields; a representative normal-network test aims for 95% of such identifications within five seconds; a new join avoids blocking checkout; at least nine of ten representative usability participants can explain how to earn and redeem after one short view. Confirm feasibility with actual devices and connectivity before freezing service targets.

Non-negotiable launch targets are zero unexplained migration differences, no duplicated reward spend in concurrency/retry tests, no lost post-cutover events during rollback rehearsal and no marketing sends without the required permission. Current production baselines must be established before setting numeric capture or profit targets.

Remaining owner choices: future automatic issuance versus small customer-choice catalogue; exact eligible products and thresholds; expiry and grace rules; identity-recovery policy; message frequency and campaign budget; pilot branch and approval owner. These decisions do not change the requirement to preserve existing earned value.

## Evidence scope

The implementation assessment uses the Sept version source at `b2ed42d` and its migration definitions, checked on 11 September 2026. It is not certification of deployed database definitions, live balances, message providers or production UI behavior. Historical audit figures are not treated as current baselines. No production records were changed or exported. Sixteen focused local tests passed; two exercise conversion logic and the remainder chiefly assert source contracts. The current-system map records uncertain or disconnected outcomes explicitly.

The research covers official brand examples, provider documentation and original academic research, with US/Great Britain limits called out. It does not claim exhaustive global market coverage, a vendor purchase recommendation, legal clearance or guaranteed business improvement.

## Sources

1. Square. [Enroll in a Square seller's loyalty program](https://squareup.com/help/us/en/article/5347-how-customers-redeem-their-rewards). Undated current US support page; checked 11 September 2026. Enrolment, status and wallet journeys.
2. Thanx. [Loyalty Models](https://docs.thanx.com/overview/loyalty-models). Current documentation; checked 11 September 2026. US-only card linking versus check-in.
3. Kivetz, R.; Urminsky, O.; Zheng, Y. [The Goal-Gradient Hypothesis Resurrected: Purchase Acceleration, Illusionary Goal Progress, and Customer Retention](https://drupalgsb-dev.cc.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf). Journal of Marketing Research 43(1), February 2006, pp. 39–58; author/university-hosted paper.
4. Leenheer, J.; van Heerde, H.; Bijmolt, T.; Smidts, A. [Do loyalty programs really enhance behavioral loyalty? An empirical analysis accounting for self-selected members](https://www.researchgate.net/publication/232906169_Do_loyalty_programs_really_enhance_behavioral_loyalty_An_empirical_analysis_accounting_for_self-selected_members_International_Journal_of_Research_in_Marketing_24_31-47). International Journal of Research in Marketing 24(1), 2007, pp. 31–47; author-associated research copy; DOI 10.1016/j.ijresmar.2006.10.005.
5. Starbucks. [Reimagined Starbucks Rewards loyalty program launches with new member benefits](https://about.starbucks.com/press/2026/reimagined-starbucks-rewards-loyalty-program-launches-with-new-member-benefits/). 10 March 2026.
6. Dutch Bros. [Rewards](https://www.dutchbros.com/rewards/). Current US program page; checked 11 September 2026.
7. Costa Coffee. [FAQs: Costa Club](https://www.costa.co.uk/faqs). Current Great Britain program details; checked 11 September 2026.
8. Panera Bread. [Panera unveils all-new points-based MyPanera rewards program](https://www.panerabread.com/en-us/press/press-room/panera-unveils-all-new-points-based-mypanera-rewards-program.html). 19 August 2026.
9. Thanx. [Coffee & Treat Restaurant Software](https://www.thanx.com/coffee-loyalty). Undated vendor page and Kahwa example; checked 11 September 2026.
10. Braze. [Panera Bread Leverages Braze to Drive Retention and Growth During Historic Menu Transformation](https://www.braze.com/customers/panera-case-study). Undated case study concerning April 2024; checked 11 September 2026. Vendor/customer evidence, not independently audited.
11. Starbucks. [Supporting the moments that matter with artificial intelligence](https://about.starbucks.com/press/2026/supporting-the-moments-that-matter-with-artificial-intelligence/). 29 January 2026; updated June 2026.
12. Riedel, P., Starbucks. [A new way to inspire your Starbucks order](https://about.starbucks.com/press/2026/a-new-way-to-inspire-your-starbucks-order/). 15 April 2026; beta announcement.
13. Thanx. [March 2026 Product Updates](https://www.thanx.com/releases/march-2026-product-updates). March 2026. SegmentAI and modifier-based audiences.
14. Autio, C. et al., NIST. [Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf). NIST AI 600-1, July 2024.
15. Google. [Loyalty card overview](https://developers.google.com/wallet/retail/loyalty-cards?authuser=19&hl=en). Current developer documentation; checked 11 September 2026.
16. Google. [Loyalty Template](https://developers.google.com/wallet/retail/loyalty-cards/resources/template). Current developer documentation; checked 11 September 2026.
17. WhatsApp. [Business Messaging Policy](https://whatsappbusiness.com/policy/). Current policy; checked 11 September 2026. Recheck at implementation.
