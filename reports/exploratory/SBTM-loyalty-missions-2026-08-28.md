# Exploratory Session: Loyalty Missions — cross-feature seams

**Date:** 2026-08-28
**Duration:** ~35 minutes (pre-flight + one charter)
**Platform:** 3.1061.0 · **Loyalty module:** 3.1006.0-pr-14-1be7 (PR #14, SHA `1be73b4`) · **Store:** B2B-store, Loyalty mode `Mixed Cart`, `Loyalty.Currency=PTS`
**Session type:** [EXP]
**Discovery technique:** Feature-pair matrix / boundary-of-features hunting (`scenario-discovery.md` §2)
**Charter:** Discover scenarios at the seam between missions and other shipped subsystems — uncovered by suites 083c / 075d / 075e (119 cases) and by the 8 mission bugs filed 2026-08-28
**Edge-Case Refs:** ECL-13.3, ECL-1.3, ECL-5.4, ECL-14.7, ECL-14.3 · **BL Refs:** BL-LOY-001, BL-LOY-004, BL-LOY-007, BL-LOY-009

Console clean all session — 0 errors/warnings, no 4xx/5xx, no GraphQL `errors[]`. Every source claim below re-verified against the deployed SHA `1be73b4`.

## Why these seams

All 119 existing mission cases test missions **in isolation**. `075d` proves the numbers move in the API; `083c` proves the page renders numbers it was handed; nothing joins them, and nothing tests missions against another subsystem. Every finding below is at a seam.

## Net-New Scenarios Discovered

| # | Scenario | Why uncovered | What we found | Oracle ref | Fate |
|---|---|---|---|---|---|
| 1 | `OrderValueGoal` accrues `order.Total`, so shipping + tax count toward a spend target and a discount reduces progress | MSN-022 caps the percentage, MSN-023 covers a currency mismatch — neither asserts *which* order figure the goal reads | `LoyaltyMissionLogicService.cs:410` returns `order.Total`; no `SubTotal`/`DiscountTotal`/`ShippingTotal`/`TaxTotal` anywhere in the mission path. A $250 mission completes on ~$200 of merchandise; a coupon pushes a customer *away* from a goal | NONE | PROMOTE → 075d |
| 2 | The mission accrual path has no currency awareness at all, while its sibling in the same module does | No case exercises missions in Mixed Cart mode, though the store runs it | Mission path never reads `order.Items[].Currency` or `order.OrderTotals`. `LoyaltyProgramHandler.cs:169,199` reads both and filters `!x.Currency.EqualsIgnoreCase(loyaltyCurrency)`. Two accrual paths in one PR disagree about whether points-priced spend is spend | BL-LOY-009 (analogy) | PROMOTE → 075d + BL proposal |
| 3 | `PerSkuGoal` counts a target SKU's quantity with **no** currency filter — the cleanest instance of #2 | Modal add-to-cart is tested; the accrual it feeds is not | `:416` iterates `order.Items` and does `item.CurrentQuantity += lineItem.Quantity` unconditionally. A PTS-priced line for a target SKU advances the mission | BL-LOY-009 (analogy) | PROMOTE → 075d |
| 4 | No reversal path exists — a cancelled order's mission progress and granted points are permanent | MSN-019 proves the grant; nothing covers what undoes it | `LoyaltyMissionHandler.cs:22` filters `EntryState.Added` only; operation types are exactly `Earned`/`Redeemed` (`ModuleConstants.cs:31-32`); no cancel/revert/refund/rollback/unearn/deduct identifier exists anywhere in `src/` | ECL-13.3 | PROMOTE → 075d + ECL/BL proposal |
| 5 | No order-status gate — a mission advances on row INSERT at any status | Untested; the condition palette hides the control that would express it | No `Status`/`IsApproved`/`IsCancelled` check in the mission service or handler. `OrderStatusCondition` exists and is populated into the shared context but is **not offered** in the mission tree — `LoyaltyMissionConditionAndRewardTreePrototype` allows only `UserGroupIsCondition`/`AnyUserGroupCondition`. A B2B order pending approval already accrues, and rejection never undoes it | ECL-14.3 | PROMOTE → 075d |
| 6 | PerSku modal row label "Buy at least N" means two different things depending on hidden state | 083c tests the modal's add-to-cart, stock and concurrency — never the row label against `currentQuantity` | On `MSN-PROGRESS-PARTIAL` (API: Xerox `1/2`, Pepsi `2/2`) the modal renders "Buy at least 1" and "Buy at least 2". Cross-checked against `PROGRESS-COMPLETED`: unmet rows render `target − current`, met rows render `target` — same label, two meanings, no indicator. `currentQuantity` is fetched and never rendered. A customer over-buys | NONE | PROMOTE → 083c |
| 7 | `isStarted` means "customer has progress", not "the window has opened" | No case asserts the field's semantics | Missions with a `startDate` a week past return `isStarted: false`; every mission with `currentValue > 0` returns `true`. It is also a *filter argument*, so a store filtering `isStarted: true` for "active missions" hides exactly the missions nobody has engaged with yet | NONE | PROMOTE → 075d |
| 8 | Order-value cards render no target | Information-parity gap across goal types | The query fetches `targetMoneyValue { formattedAmount }`; the card renders only `currentMoneyValue` (`$30.00 spent`) while order-count cards render `1 of 2 orders`. The target is recoverable only by dividing by the percentage | NONE | PROMOTE → 083c (low) |

## Oracle Feedback

| Kind | Entry | Evidence | Route |
|---|---|---|---|
| Candidate new BL invariant (**highest value**) | — | *"A mission `OrderValueGoal` accrues only cash-currency spend; loyalty-currency line items contribute zero"* — the mission analogue of BL-LOY-009. Its absence is why #2/#3 shipped. Business value `high` (money) ⇒ promotes at any demand | `/qa-review-oracles bl` |
| Candidate new BL invariant | — | *"Mission accrual is insert-only and irreversible; a mission may not advance on an order that has not reached an accrual-eligible status."* Declares the #4/#5 exposure | `/qa-review-oracles bl` |
| Candidate new BL invariant | — | *"A mission goal measures merchandise value, not order total"* — settles #1 either way; today nothing declares which is intended | `/qa-review-oracles bl` |
| Strengthen | ECL-13.3 | The section is scoped to the loyalty *program* path. Missions are a second, independent earn path with the same no-reversal property and their own `LoyaltyMissionTransaction` store — extend it to name missions | `/qa-review-oracles ecl` |
| Structural | — | **Zero `BL-*` invariants exist for missions.** The 51 "mission" hits in `business-logic.md` are all the substring in *per*mission. Every mission case cites `BL-GQL-003` or a generic `BL-A11Y-*`. 119 test cases, no correctness oracle — the single largest risk in this domain | `/qa-review-oracles bl` |

## Bugs Found

| # | Sev | Title | Evidence | Net-new? |
|---|---|---|---|---|
| 1 | High | Mission accrual path has no currency guard; `PerSkuGoal` counts PTS-priced lines and `OrderValueGoal` reads a whole-order figure — contradicts the sibling handler in the same PR | source, verified at `1be73b4` | net-new |
| 2 | High | No reversal path: mission progress and granted points survive order cancellation; no handler, no operation type, no status gate | source | net-new |
| 3 | Medium | `OrderValueGoal` measures `order.Total`, so shipping + tax inflate spend progress and discounts deflate it | source | net-new |
| 4 | Medium | PerSku modal row label switches between *remaining* and *target* with no indicator; `currentQuantity` never rendered | `screenshots/EXP-missions-persku-row-label-ambiguous.png` | net-new |
| 5 | Low | `isStarted` semantics collide with the field name and with its own filter argument | source + live | net-new |
| 6 | Low | Order-value card omits the fetched `targetMoneyValue` | live | net-new |
| — | — | Mixed-currency rows in the SKU modal | observed | **already filed** — not re-reported |

No Critical found.

## Risk Areas

- **The two accrual paths in one module disagree.** `LoyaltyProgramHandler` handles mixed currency and per-currency totals; `LoyaltyMissionLogicService` does neither. That divergence inside one PR is the root risk, not any individual symptom.
- **`OrderValueGoal.CurrencyCode` null/empty disables the currency gate entirely** (`:296-297`) — any currency's raw Total then accrues. Whether the Admin UI requires the field was not probed.
- Mission accrual is a Hangfire job (ECL-14.7); nothing on the storefront tells a customer their order has not settled yet.

## Observations & Open Questions

- **Precision on finding #2.** What the source proves is that the mission path has *no* currency-aware handling while its sibling deliberately does. Whether that additionally manifests as PTS spend inflating an `OrderValueGoal` depends on how `order.Total` is composed in Mixed Cart, which needs a live mixed order to settle. Finding #3 (`PerSkuGoal`) has no such indirection and is unambiguous.
- No live demonstration of #1: the only in-window orders were API-seeded at exactly $30 with no shipping or tax, so `$30.00 spent` is consistent with both readings. Source settles it; a checkout-placed order would demonstrate it.
- `AGENT-TEST-MSN-PROBE` (a second $30 order, same day) is credited by no mission. Most likely the insert-only accrual plus per-mission start dates — not confirmed; may instead be a missed accrual. Left open.
- **Seam 4 not reached** — no B2B org-context, impersonation, or two-tab staleness probe. Honest gap, not a null result.

## Charter-from-Gap (next-session candidates)

1. **The full customer loop, end to end** — mission at 0% → buy through the real storefront UI → order confirmed → return to `/account/missions` → progress moved → completion → reward in the balance banner → points history → points spendable as a PTS line. No case in either suite does this; `083c` places zero orders.
2. **Missions × checkout with real shipping/tax/coupon** — measure `currentMoneyValue` against the order's `subTotal`; demonstrates #1 live.
3. **Missions × order cancellation, live** — cancel a mission-completing order in Admin, observe progress, balance and history; makes #4 user-visible.
4. **Missions × B2B org context and impersonation** — whose progress advances? (Seam 4, unreached.)
5. **Missions × Admin authoring boundaries** — can a mission save with an empty `OrderValueGoal.CurrencyCode`, and what does the storefront then render?
