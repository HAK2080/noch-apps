# Noch loyalty rebuild: executive summary

## Decision

Rebuild the customer experience and simplify the operating model. Preserve the existing customer-value records and reuse the reliable transaction controls unless testing proves they need replacement. A clearer program does not require resetting customers or throwing away the ledger.

The intended experience is: **join once, identify quickly, earn automatically, see your progress, use a reward easily.** Purchasing must remain possible without joining or agreeing to marketing.

## What the assessment found

- The new system has purchase points, automatic reward issuance, checkout QR identification, missions, refund adjustments, consent controls and owner reporting.
- The website and receipt-linked passport still contain old stamp experiences. Some richer passport features exist in a separate source entry that is not the current standalone homepage entry.
- Marketing has old stamp-based summaries and a second challenge engine. These overlap with, but are not the same as, the current missions.
- The public feedback flow has an old points/reward writer. Any value it created after the earlier migration must be reconciled before retiring it.
- Content Studio already has AI writing capabilities. AI-based loyalty offer selection and reliable campaign profit measurement are not established by the inspected integration.

These are implementation findings, not fresh production measurements. Sixteen focused local tests passed; most are source-contract checks, not transaction-level proof. Current customer totals and commercial impact remain unverified.

## Recommendations, ranked

| Rank | Action | Why it comes here |
|---|---|---|
| 1 | Protect and reconcile all customer points and rewards | Zero migration-caused loss is a launch condition. |
| 2 | Agree one plain-English/Arabic program and one balance authority | Removes the central confusion. |
| 3 | Create one reusable member card and repair every entry link | Makes the program accessible on the next visit. |
| 4 | Make checkout non-blocking; add missed-purchase and offline recovery | Cuts friction without sacrificing earned value. |
| 5 | Prove earning, redemption, refunds and identity recovery end to end | A quick but unreliable program is not frictionless. |
| 6 | Test a reachable first benefit and a small choice of rewards | Improves perceived value without blindly increasing discounts. |
| 7 | Connect marketing, consent and the existing missions to current records | Turns existing features into a coherent operating system. |
| 8 | Fix reporting and run a controlled repeat-visit/profit pilot | Establishes whether the program changes behavior. |
| 9 | Reuse AI for approved messages, audience drafts and weekly explanations | Saves staff effort with limited risk. |
| 10 | Add predictive timing, social extras and optional wallet support selectively | Only after the basics and economics work. |

Do not introduce a new points currency, compulsory app download, forced marketing consent, subscription or complex tiers in the first release. Do not activate additional automatic reward rules merely to create choice: the current engine spends points on cheaper active rules first.

## Research conclusion

Leading programs combine visible progress, convenient recognition, relevant rewards and reasons to return. Actual AI examples include Panera's audience decisioning during its 2024 menu change, Starbucks' staff assistance and drink-discovery beta, and Thanx's conversational audience-building tools. These are different uses of AI, not proof that an autonomous discount engine is appropriate for Noch. Sources and qualifications are in the research report.

## Customer protection

No customer data was changed in this preparation phase. No migration backup or production reconciliation is being claimed as completed. Before implementation goes live, require a consistent backup, restore rehearsal, per-customer value comparison, catch-up of in-flight purchases and a tested rollback. Preserve outstanding rewards separately from points: previously spent points may already exist as an earned free drink.

## Project status

The project goal is active. Preparation is complete; design approval, implementation, production validation and the business pilot remain ahead. The goal explicitly prohibits implementation or migration without approval.

## Supporting documents

- [Research and ranked recommendations](</C:/Users/hak/Documents/Ai Apps/Sept version/docs/research/noch-loyalty-rebuild/02-research-and-recommendations.md>)
- [Current-system feature map and ratings](</C:/Users/hak/Documents/Ai Apps/Sept version/docs/research/noch-loyalty-rebuild/03-current-system-map.md>)
- [Customer-value protection and launch gates](</C:/Users/hak/Documents/Ai Apps/Sept version/docs/research/noch-loyalty-rebuild/04-points-protection-and-project-goal.md>)
