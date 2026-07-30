# Café loyalty and content-performance benchmarks

**Research date:** 2026-07-30

**Use:** measurement design and target-setting for Noch; not a legal or accounting opinion.

## Executive conclusion

There is no defensible universal “good loyalty enrollment rate,” “active-member rate,” or social engagement rate. Published figures use different denominators, markets, account sizes, and platform definitions. Noch should therefore use:

1. **External reference points** only to show what mature, well-instrumented programs can reach.
2. **A fixed internal metric dictionary** for weekly management.
3. **Cohorts and randomized holdouts** to determine whether rewards and content cause incremental visits, margin, or product sales.

The immediate priority is measurement integrity. If orders, rewards, posts, products, consent, and redemptions are not linked, personalization and performance scores will be confidently wrong.

## Evidence hierarchy

- **Primary / first-party:** public-company filings, platform documentation, regulators, IFRS materials, and original field experiments.
- **Vendor evidence:** useful for directional context, but commercial incentives, mixed samples, and opaque formulas limit comparability.
- **Noch operating targets:** recommendations below, not claimed industry averages. Recalibrate after 8–12 weeks of clean data.

## 1. Loyalty measurement framework

### 1.1 Funnel and activity metrics

| Metric | Required definition | Management use |
|---|---|---|
| **Prompt coverage** | Eligible non-member transactions where staff/UI presented loyalty ÷ eligible non-member transactions | Separates a weak offer from weak execution |
| **Enrollment conversion** | New member records created ÷ unique eligible non-members prompted | Measures sign-up friction and value proposition |
| **Order link rate** | Completed eligible orders with a valid `loyalty_customer_id` ÷ all completed eligible orders | The data-quality gate for RFM, personalization, and member economics |
| **Activation rate (30d)** | New members with ≥1 subsequent linked completed order within 30 days ÷ members enrolled ≥30 days ago | Distinguishes sign-ups from behavior |
| **90-day active-member rate** | Members with ≥1 linked completed order in the trailing 90 days ÷ members eligible to be active | Use one denominator consistently; show both all enrolled and contactable enrolled if needed |
| **Member transaction share** | Linked member transactions ÷ all eligible completed transactions | Comparable in concept to Dutch Bros' published measure |
| **Member sales share** | Revenue on linked member orders ÷ eligible completed-order revenue | Comparable in concept to Starbucks' tender-dollar share |
| **Second-visit rate (30d)** | First-time customers with a second linked visit within 30 days ÷ first-time customers whose 30-day window has matured | Best early habit-formation metric |
| **Cohort retention** | Members from enrollment month with ≥1 linked order in month +N ÷ members in that enrollment cohort | Shows whether acquisition quality is improving |
| **Visit frequency** | Linked completed orders per active member per 28 days | Report median and distribution, not only mean |
| **Inter-visit interval** | Median days between successive linked orders per member | Detects acceleration near a reward |

**Reference points, not direct targets**

- Dutch Bros reported that **72% of 2025 transactions were attributable to Dutch Rewards members**, up from 68% in 2024. Its filing also states that points and rewards generally expire after six months and that the company is investing in segmentation to drive frequency. This is the closest public café transaction-share comparison, but it is a large app-led U.S. chain, not a small Libyan café. ([Dutch Bros 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1866581/000186658126000006/bros-20251231.htm))
- Starbucks reported **34.6 million U.S. 90-day active members** and **60% of tender dollars from Rewards members** in Q1 FY2025; Q1 FY2026 reached 35.5 million 90-day active members. “90-day active” is a useful activity convention, while absolute scale is irrelevant to Noch. ([Starbucks Q1 FY2025 digital dashboard](https://investor.starbucks.com/files/doc_financials/2025/q1/Q1-FY25-Digital-IR-Dashboard.pdf), [Starbucks Q1 FY2026 release](https://investor.starbucks.com/news/financial-releases/news-details/2026/Starbucks-Unveils-Reimagined-Loyalty-Program-to-Deliver-More-Meaningful-Value-Personalization-and-Engagement-for-Members/default.aspx))

**Commercial vendor evidence — useful but methodology-limited**

- Thanx defines capture as identified loyalty direct revenue ÷ total direct revenue and reports a typical 30–50% range and 70%+ “best in class.” It defines activation more strictly than this note's 30-day measure: ≥3 purchases within 120 days, with a claimed QSR median near 16%, 75th percentile near 28%, and coffee/snack median about 21–27%. These figures come from a loyalty vendor, not an independent peer census. ([Thanx metric guide](https://www.thanx.com/help-center/essential-loyalty-program-metrics-how-to-measure-success))
- Paytronix reports vendor-selected 90-day active rates of 66–72% for several beverage/snack-style concepts and calls >50% strong, but the public page does not fully publish denominator/sample methodology. Its earlier trend release reported that 75th-percentile brands attributed about 30% of sales to loyalty. Do not combine its 90-day activity measure with Thanx's 180-day retention measure. ([Paytronix 2026 comparison guide](https://www.paytronix.com/blog/best-restaurant-loyalty-software-comparison-guide), [Paytronix 2024 vendor report release](https://www.paytronix.com/company/news-press/press-releases/paytronix-loyalty-trends-report-top-operators-drive-up-to-37-of-transactions-via-loyalty-members))

**Recommended staged goals for Noch**

- Treat **<30% order link rate as red**: segmentation and member-sales results are too biased for confident decisions. This is also the warning threshold already documented in Noch's Marketing MVP.
- Reach **50% link rate within 90 days**, then **70% as a 12-month stretch goal**. The 70% level is deliberately framed against Dutch Bros' mature 72% transaction share, not asserted as a small-café industry norm.
- Add a vendor-comparable activation view: mature enrollment-cohort members reaching **≥3 purchases within 120 days**. Use **20% as an initial floor** and 28% as a later stretch reference, while retaining 30-day second-visit and 60-day third-visit leading indicators.
- Make **activation, second-visit rate, 90-day active rate, and visit frequency** the behavior goals. Set the first numeric targets after four clean cohorts, then aim for a **10% relative improvement** through controlled tests rather than assuming a universal benchmark. A 60–70% 90-day active rate can be a later vendor-informed reference only after the denominator and link rate are stable.

### 1.2 Retention and reward design

Research supports visible, reachable progress, but the business outcome still needs a Noch experiment:

- In a café field study, time between purchases accelerated by about **20% from the first to last stamp**, then slowed after reward redemption. This supports showing progress and testing a small post-redemption “head start,” while measuring margin and true incremental visits. ([Chicago Booth summary of the original goal-gradient field experiments](https://www.chicagobooth.edu/review/going-goal))
- A field experiment involving **95,532 loyalty customers** found lasting effects from goal success/failure and concluded that goals should be reachable; high-status customers were particularly affected by failure. This argues against impossible challenges and indiscriminate tier-reset rules. ([Wang, Lewis, Cryder & Sprigg, *Marketing Science*](https://doi.org/10.1287/mksc.2015.0966))

For each reward or challenge, pre-register:

- eligible segment;
- qualifying behavior;
- reward and expiry;
- treatment and holdout;
- primary outcome (for example, 30-day visits per eligible customer);
- guardrails (discount cost, gross margin, unsubscribes, complaints, abuse);
- test window and decision rule.

Do not compare reward recipients with non-recipients as proof of lift: recipients are usually customers who were already more active.

### 1.3 Reward economics and liability

Track both **economic exposure** and **accounting liability**:

| Metric | Formula |
|---|---|
| Issuance rate | Points/stamps issued ÷ eligible sales or transactions |
| Redemption rate | Rewards redeemed ÷ rewards issued whose redemption window has matured |
| Breakage rate | Expired unused rewards ÷ matured rewards issued |
| Outstanding exposure | Unredeemed valid rewards × expected redemption probability × expected reward COGS |
| Reward cost rate | Reward COGS + discount value ÷ linked member sales |
| Incremental reward ROI | (Incremental revenue × contribution-margin %) − reward COGS − campaign/media/message cost |
| Incremental ROAS | Incremental contribution margin ÷ campaign/media/message cost |

The exposure formula above is an operating view; accounting treatment must be confirmed with Noch's accountant. Under the loyalty-program principle now covered by IFRS 15, part of the initial transaction price can be allocated to the award as a separate performance obligation/liability and recognized on redemption or expiry. ([IFRS history and loyalty-program explanation](https://www.ifrs.org/issued-standards/list-of-standards/ifric-13-customer-loyalty-programmes/))

Thanx's commercial guide defines an “effective discount rate” as reward-redemption cost ÷ revenue spent earning rewards and claims a restaurant median near 4.5%, versus 2–2.5% for its customers. Because “cost” can mean face value, menu price, or COGS, Noch should keep **face-value discount rate** and **economic reward burden using COGS** as separate fields. Use 4.5% only as a vendor-informed warning level, not an accounting rule. ([Thanx metric guide](https://www.thanx.com/help-center/essential-loyalty-program-metrics-how-to-measure-success))

Public-company practice shows why a ledger is mandatory:

- Starbucks had a **$1.7517 billion** stored-value-card and loyalty-program balance at FY2025 year-end; it defers the estimated selling price of Stars net of expected non-redemption and recognizes revenue on redemption. ([Starbucks FY2025 Form 10-K, Note 1 and Note 11](https://www.sec.gov/Archives/edgar/data/829224/000082922425000114/sbux-20250928.htm))
- Dutch Bros states that deferred revenue includes unredeemed gift cards and unredeemed loyalty points/rewards, with points and rewards generally expiring after 180 days. ([Dutch Bros 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1866581/000186658126000006/bros-20251231.htm))

**Noch control goal:** 100% of issuance, redemption, reversal, expiry, originating order, reward SKU, and COGS must be reconstructable from an immutable ledger. Reconcile outstanding balances monthly and compare expected with actual redemption by issue cohort.

### 1.4 Personalization and consent

Consent is a **quality and auditability constraint**, not a conversion target. A high opt-in percentage obtained through defaults or bundling is not success.

Track:

- consent coverage = contactable members with `channel + purpose + timestamp + source + notice_version` ÷ contactable members;
- valid opt-in rate by channel and purpose;
- delivery/read rate;
- unsubscribe/opt-out rate per 1,000 delivered;
- complaint rate per 1,000 delivered;
- suppression failures (target: zero);
- personalized-offer incremental lift vs holdout;
- incremental margin per 1,000 eligible recipients.

Libya's official Commercial Registry Authority publishes **Law No. 6 of 2022 on Electronic Transactions**; a Libyan legal review should confirm Noch's exact direct-marketing obligations. ([official law page](https://cca.gov.ly/ar/resolutions/w8ye3jj59s3fw5zaqg19car7)) As a strong design standard, 2026 EDPB guidance requires consent to be freely given, specific, informed, and unambiguous, and withdrawal must be possible without detriment. ([EDPB 2026 consent summary](https://www.edpb.europa.eu/system/files/2026-04/edpb-summary-consent_en.pdf))

**Noch control goals**

- 100% of outbound personalized messages pass a channel/purpose consent and suppression check at send time.
- No pre-ticked or default-true marketing consent for new enrollments.
- Loyalty participation and essential service messages remain usable without marketing consent.
- Sensitive inferences and ad-platform audience uploads require an explicit documented policy and legal review.

## 2. Content-creation and performance framework

### 2.1 Production operations

Instrument immutable timestamps for `brief_created`, `work_started`, `draft_ready`, `submitted`, `approved/rejected`, `scheduled`, and `published`. Report:

| Metric | Formula |
|---|---|
| End-to-end cycle time | `published_at − brief_created_at`; show median and p90 |
| Active production time | Time in drafting/editing states, excluding deliberate queue time |
| Approval latency | `decision_at − submitted_at` |
| First-pass approval rate | Assets approved without revision ÷ assets first submitted |
| Revision count | Number of returned-to-author cycles per published asset |
| Approved-use rate | Approved assets published within 30 days ÷ approved assets whose window matured |
| On-time publish rate | Assets published by planned time ÷ scheduled assets |
| Abandonment rate | Started assets never approved or explicitly cancelled ÷ started assets |
| Reuse rate | Published adaptations using an existing approved source asset ÷ published assets |
| Evidence completeness | Published posts with platform ID, timestamps, product/campaign map, cost, and result snapshot ÷ published posts |

There is no credible café-specific cycle-time benchmark. Recommended **initial operating targets**, to be recalibrated after four weeks:

- median brief-to-publish ≤48 hours for normal social posts;
- p90 ≤5 business days;
- first-pass approval ≥70%;
- approved-use rate ≥80%;
- on-time publish ≥90%;
- published evidence completeness = 100%.

These are control limits, not industry averages. They prevent AI draft volume from masquerading as productive output. Vendor-sponsored 2025 research illustrates that workflow and measurement remain common problems: 33% of surveyed B2B marketers cited workflow/content approvals and 47% cited measuring content results. The population is B2B and therefore only contextual. ([Content Marketing Institute/MarketingProfs 2025 research](https://contentmarketinginstitute.com/b2b-research/b2b-content-marketing-trends-research-2025))

### 2.2 Platform-native performance metrics

Store raw platform metrics and normalized rates; never combine unlike platform “views.”

**Instagram / Facebook**

- views;
- unique accounts reached;
- interactions = likes + comments + saves + shares;
- engagement per reach = interactions ÷ unique reach;
- save rate and share rate = saves or shares ÷ unique reach;
- profile actions, link clicks, follows attributable to the post;
- for Reels: total watch time, average watch time, and completion where available.

Meta defines views as times content was played/displayed, reach as unique accounts that saw it at least once, and interactions as actions such as likes, comments, saves, and shares; it also warns that reach is estimated/in development. ([Instagram Help Center](https://www.facebook.com/help/instagram/788388387972460))

**TikTok**

- 2-second and 6-second view rates;
- average play time per view and per user;
- 25%, 50%, 75%, and 100% completion rates;
- shares, comments, profile visits, and link clicks;
- engagement per view and engagement per reach, if reach is available.

TikTok defines a video view as a play start, while 2-second, 6-second, and completion metrics have stricter definitions. Therefore, a TikTok “view” must not be compared directly with a 6-second view or an Instagram account reached. ([TikTok video-play metrics, updated November 2025](https://ads.tiktok.com/help/article/video-play/))

**Vendor context — do not use as a contractual KPI**

- Hootsuite's 2026 dining/hospitality/tourism dataset reports its highest observed engagement at **3.52% for Instagram and 1.36% for TikTok**, both at two posts per week; its article does not expose enough methodology on the page to make these clean targets. ([Hootsuite 2026 benchmarks](https://blog.hootsuite.com/social-media-benchmarks/))
- Dash Social's commercial benchmark used 3,363 Instagram and 1,361 TikTok global accounts with at least 1,000 followers from July–December 2025, mixing organic, boosted, and promoted posts while excluding ads. It reports a **0.4% Instagram industry average** but also recommends “good” ranges of 2.0–2.5% on Instagram and 3.0–3.5% on TikTok. That internal spread demonstrates why Noch should use its own per-format median after 30 comparable posts. ([Dash Social 2026 food-and-beverage methodology](https://www.dashsocial.com/social-media-benchmarks/food-beverage-industry))

### 2.3 Link content to product sales

Every published post needs:

- canonical `post_id` and external platform/media ID;
- `campaign_id`, platform, format, publish time, paid/organic flag, and media cost;
- one or more promoted `product_id`s;
- unique short link/QR/promo code using consistent `utm_source`, `utm_medium`, `utm_campaign`, and unique `utm_content`;
- attribution window declared before launch;
- order/customer identifiers only inside Noch's controlled data environment;
- contribution margin, not revenue alone.

Google documents that UTM parameters populate campaign and traffic-acquisition reporting and recommends consistent, case-sensitive naming; `utm_content` distinguishes creatives. ([GA4 URL-builder guidance](https://support.google.com/analytics/answer/10917952)) For paid Meta campaigns, Conversions API can accept physical-store/offline outcomes and support lift studies, but it must not be used to bypass privacy rules. ([Meta Conversions API overview](https://www.facebook.com/business/help/AboutConversionsAPI))

Report a ladder, not one blended score:

1. **Delivery:** reach, qualified views, frequency.
2. **Attention:** watch time, completion.
3. **Intent:** saves, shares, profile actions, menu/product views.
4. **Action:** unique link/QR scans, promo uses, add-to-cart.
5. **Business:** attributed orders, product units, revenue, contribution margin.
6. **Incrementality:** difference in visits/units/margin between treatment and randomized holdout.

Recommended coverage targets:

- 100% of product-led posts mapped to at least one product and campaign;
- 100% of clickable or scannable posts use a unique creative identifier;
- ≥90% of published posts receive platform metric snapshots at fixed ages (for example, 24 hours and 7 days);
- do not publish “sales lift” unless the post has a predeclared comparison design.

### 2.4 Experimentation standard

Attribution is not causation. Research using 15 large Facebook experiments found observational methods often failed to reproduce randomized effects despite rich data; in half the studies, estimated purchase lift was off by a factor of three. ([Gordon, Zettelmeyer, Bhargava & Chapsky](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3033144))

Noch should maintain an experiment register with:

- hypothesis and one primary metric;
- unit of randomization;
- treatment/control eligibility;
- sample-size or minimum detectable-effect estimate;
- start/end dates and exclusions;
- guardrails;
- result, uncertainty, and decision;
- link to the winning/losing assets and downstream sales.

Practical designs:

- **Reward/message tests:** randomize eligible customers into treatment and holdout; compare incremental 30-day visits and contribution margin.
- **Creative tests:** hold audience, spend, objective, placement, and run window constant; vary one major creative element.
- **Organic product posts:** rotate comparable products/dayparts or use repeated matched time blocks; label findings associative unless allocation was randomized.
- **Multi-branch paid media:** use randomized matched branches/areas where there are enough independent units. Google describes geo experiments as assigning non-overlapping regions to control/treatment and measuring the difference. ([Google Research, geo experiments](https://research.google/pubs/measuring-ad-effectiveness-using-geo-experiments/))

For a single café and small sample, prefer repeated customer-level or time-block tests over pretending a one-week before/after sales change is causal.

## 3. Recommended goal sequence

### Goal 1 — Make the system trustworthy (0–30 days)

- Freeze the metric dictionary and denominators above.
- Make order-to-member, reward-to-order, and post-to-product/campaign linkage explicit.
- Backfill consent provenance where defensible; suppress records without a valid basis.
- Create weekly exception reports for unlinked orders, uncosted rewards, unmapped posts, missing metric snapshots, and suppression failures.

**Exit criteria:** ≥50% order link rate, 100% reward-ledger reconstructability, 100% send-time consent checks, and ≥90% post evidence completeness.

### Goal 2 — Prove loyalty changes behavior profitably (31–90 days)

- Establish enrollment, activation, second-visit, 90-day activity, frequency, redemption, breakage, and margin baselines by cohort.
- Test one early activation intervention, one near-reward progress nudge, and one post-redemption reset/head-start.
- Preserve at least a 10% randomized holdout where sample size permits.

**Exit criteria:** at least two completed tests with incremental visit and contribution-margin estimates; no rollout based only on recipient/non-recipient correlation.

### Goal 3 — Turn Content Studio into a learning system (31–90 days)

- Instrument workflow timestamps and approval outcomes.
- Require product/campaign mapping before product-led content can be marked publish-ready.
- Capture fixed-age platform snapshots.
- Review performance by comparable platform × format × objective × paid/organic cells; do not benchmark all posts against one global average.

**Exit criteria:** ≥80% approved-use rate, ≥90% on-time publish rate, 100% mapping for product-led posts, and a reusable top/bottom creative pattern report backed by at least 30 comparable posts.

### Goal 4 — Prove content-to-sales incrementality (91–180 days)

- Use unique QR/links/codes for direct response.
- Run matched-time, customer-holdout, or branch/geo tests suited to Noch's scale.
- Optimize toward incremental contribution margin per 1,000 reached, not likes or attributed revenue.

**Exit criteria:** at least three pre-registered tests, a documented winning/losing creative library, and budget decisions based on incremental margin with uncertainty shown.

## 4. Non-negotiable dashboard rules

- Show numerator, denominator, window, and last refresh beside every rate.
- Separate **data health**, **customer behavior**, **reward economics**, **content operations**, **platform performance**, and **business incrementality**.
- Use medians and p90s for cycle times; cohort curves for retention; confidence intervals for experiments.
- Never compare unlike platform views or mix paid and organic posts without a filter.
- Never call attributed sales “incremental sales.”
- Never rank AI drafts by a single composite score without exposing approval, publication, audience, and business-outcome components.
