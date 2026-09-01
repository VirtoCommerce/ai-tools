# BA Report: Loyalty Missions — Design Gaps & Recommendations

**Scope:** `vc-module-loyalty` mission subsystem (`LoyaltyMissionLogicService`, `LoyaltyMissionHandler`, mission GraphQL surface, storefront `/account/missions`) · **Env:** vcst-qa, Platform `3.1061.0`, `VirtoCommerce.Loyalty_3.1006.0-pr-14-1be7` (SHA `1be73b4`), `B2B-store` in Mixed Cart mode, `Loyalty.Currency=PTS`. Source: `reports/exploratory/SBTM-loyalty-missions-2026-08-28.md`, re-verified against the deployed SHA.

## Executive Summary

Missions carry 119 test cases across three suites and **zero mission-specific `BL-*` invariants** — the 51 "mission" hits in `business-logic.md` are the substring inside *per*mission, not a mission entry. That absence is the root cause, not a footnote: nothing declares whether a goal should measure merchandise value or order total, whether points-priced spend should count, or what should happen when an order is cancelled — so a goal that reads the wrong figure, in an unguarded currency, with no way to reverse it, passes all 119 cases clean. These are therefore **design gaps, not defects**: each finding below is a place where the platform made an implementation choice that nothing wrote down as intended. Four themes structure the gaps — what a goal measures, when it accrues, what the customer is told, and a divergence between two accrual implementations in one module that is the underlying risk the other three symptoms share. Three candidate `BL-*` invariants and one `ECL-13.3` strengthening are proposed at the end to close the declaration gap.

## Theme A — What a goal measures

`OrderValueGoal` reads `order.Total` (`LoyaltyMissionLogicService.cs:410`) — no reference to `SubTotal`, `DiscountTotal`, `ShippingTotal`, or `TaxTotal` exists anywhere in the mission path. A $250 spend mission can complete on ~$200 of actual merchandise once shipping and tax are folded in, and a coupon applied at checkout *reduces* progress toward a mission the customer is trying to earn. Nothing in the module, the Admin mission-authoring UI, or the docs states which order figure a goal is meant to track — `order.Total` reads as an implementation default, not a decision. **Evidence strength:** proven from source; not demonstrated live — the only in-window orders were API-seeded at exactly $30 with no shipping or tax, so `$30.00 spent` is consistent with either reading.

**Recommendation:** Admin's mission-authoring flow should let a merchant pick the accrual basis (merchandise subtotal vs. order total) explicitly, and the platform should declare a default. Until declared, treat every deployed `OrderValueGoal` mission as ambiguous rather than assume `order.Total` is intended.

## Theme B — When a goal accrues

Two properties compound into an unbounded liability. First, currency: the mission path never reads `order.Items[].Currency` or `order.OrderTotals`, while its sibling `LoyaltyProgramHandler` (same module, same PR) explicitly filters `!x.Currency.EqualsIgnoreCase(loyaltyCurrency)` at `:169,199`. `PerSkuGoal` (`:416`) increments `CurrentQuantity` on every matching line with no currency check at all — a PTS-priced line for a target SKU advances the mission unambiguously. `OrderValueGoal`'s currency gate (`:296-297`) additionally disables itself entirely whenever the mission's own `CurrencyCode` is null/empty. Second, reversal: `LoyaltyMissionHandler.cs:22` processes only `EntryState.Added`; operation types are exactly `Earned`/`Redeemed` (`ModuleConstants.cs:31-32`) with no cancel/revert/refund/rollback/unearn/deduct identifier anywhere in `src/`, and no order-status gate exists — `OrderStatusCondition` is populated into the shared mission context but is not offered in `LoyaltyMissionConditionAndRewardTreePrototype`, which allows only `UserGroupIsCondition`/`AnyUserGroupCondition`. A mission can accrue on an order pending B2B approval and never reverses if that order is rejected or cancelled. **Evidence strength:** `PerSkuGoal`'s currency gap is proven and unambiguous. `OrderValueGoal`'s currency gap is proven from source but its practical impact turns on how `order.Total` is composed in Mixed Cart — unresolved without a live mixed order.

**Recommendation:** Declare accrual eligibility explicitly — a currency filter matching the sibling handler, and a status gate restricting accrual to a defined "eligible" order state, with a defined reversal path when that state is later left (cancel/reject/refund). Until declared, mission point grants should be treated as a live, unbounded liability with no compensating control.

## Theme C — What the customer is told

Three storefront-surface gaps, lower severity but real UX cost: the PerSku modal's "Buy at least N" row label reads `target − current` when a goal is unmet and `target` once it is met — same label, two meanings, with `currentQuantity` fetched but never rendered, so a customer can over-buy a completed line. `isStarted` returns `false` for a mission whose `startDate` has passed until the customer has *any* progress, then `true` — it means "has progress," not "the window is open," and it doubles as a filter argument, so a store filtering `isStarted: true` for "active missions" hides the missions nobody has engaged with yet. Order-value mission cards fetch `targetMoneyValue` but render only `currentMoneyValue`, so the target is recoverable only by dividing by the displayed percentage. None of these has a declared intended behavior to violate — they are unresolved contract/copy decisions.

**Recommendation:** Specify the modal row label per state (remaining vs. target, with an explicit "complete" indicator), rename or redocument `isStarted` to match its actual semantics, and render `targetMoneyValue` on every goal-type card for parity with order-count cards.

## Theme D — Accrual-path divergence (the root risk)

Themes A–C are symptoms of one underlying fact: this module ships **two independent accrual implementations that disagree**. `LoyaltyProgramHandler` (the points-earning path) is currency-aware and per-currency-total-aware; `LoyaltyMissionLogicService`/`LoyaltyMissionHandler` (the mission path) is neither, and adds insert-only, no-reversal, no-status-gate behavior on top. Both shipped in the same PR (#14). This divergence — not any single symptom — is the structural risk: it means the module's own author teams built two different mental models of "does this order count," and nothing forces them to converge.

**Recommendation:** Treat mission accrual as a variant of the existing points-earning contract, not a separate implementation — either route missions through the same currency/status-aware primitives `LoyaltyProgramHandler` already uses, or explicitly document why missions are exempt.

## Findings Table

| Issue | Severity | Recommendation |
|---|---|---|
| Zero `BL-*` invariants declared for the mission subsystem (119 cases, 0 correctness oracles) | High | Adopt the three proposed `BL-*` invariants below before treating any mission behavior as pass/fail |
| `OrderValueGoal` reads `order.Total`, not merchandise subtotal — undeclared accrual basis | Medium | Admin should let merchants choose the basis explicitly; declare a platform default |
| Mission accrual has no currency filter (`PerSkuGoal` proven; `OrderValueGoal` proven from source, live impact unconfirmed) while the sibling earn-points handler does | High | Apply the same currency filter used in `LoyaltyProgramHandler` to the mission path |
| Mission accrual is insert-only with no order-status gate and no reversal path | High | Declare an eligible-status gate and a reversal operation type before order cancellation/rejection is treated as safe |
| PerSku modal row label ambiguous between remaining/target; `isStarted` semantics mismatch its name and filter use; order-value cards omit `targetMoneyValue` | Low–Medium | Specify per-state modal copy, rename/redocument `isStarted`, render the fetched target on every card type |

## Evidence Strength — where this report is more cautious than the session

- **Currency effect on `OrderValueGoal`:** the *absence* of currency-aware code is proven from source. Whether that absence actually inflates a live spend goal depends on how `order.Total` is composed in Mixed Cart mode, which was not exercised with a live mixed-currency order. `PerSkuGoal` carries no such indirection — its currency gap is direct and unambiguous.
- **Shipping/tax inflating `OrderValueGoal`:** proven from source (`order.Total` is the only value read), never demonstrated live — the only in-window test orders were API-seeded at exactly $30 with no shipping or tax, so the live evidence is consistent with either reading.
- **`AGENT-TEST-MSN-PROBE` (a second $30 order credited by no mission):** genuinely unresolved. Insert-only accrual plus per-mission start dates is the likely explanation, but it is not confirmed — recorded as an open question, not reasoned to a conclusion.

## Open Questions

1. Does the Admin mission-authoring UI require `OrderValueGoal.CurrencyCode`, or can a mission be saved with it empty (which disables the currency gate entirely at `:296-297`)? Not probed this session.
2. What should happen to mission progress and granted points when the accruing order is later cancelled, rejected, or refunded? No handler exists today in either direction.
3. Why was `AGENT-TEST-MSN-PROBE` not credited? (see Evidence Strength above)
4. B2B org-context / impersonation seam (whose mission progress advances under impersonation) — not reached this session; an honest gap, not a null result.

Eight mission defects were filed separately and are out of scope here. **Four survived human triage** and remain at `reports/bugs/open/`: currency-price mismatch, date-severity ladder, mobile truncation, touch target, design drift. **Four were rejected as low quality** and now sit in `reports/bugs/rejected/`: mixed-currency subtotal, CLS 0.2195, pagination-in-URL, German-locale sidebar casing. The mixed-currency rejection is the instructive one — it was an artefact of an unconstrained live-discovered fixture (a EUR row seeded beside a USD row), not a product defect, and it is now the worked example in `.claude/rules/test-data.md` §SECOND RULE.

## Proposed `BL-*` / `ECL-*` Additions (route via `/qa-review-oracles`)

Declaring intent is the precondition for calling any of the above a bug rather than an undeclared default. Three candidate invariants plus one strengthening, for a future `/qa-review-oracles` triangulation pass:

1. **`PROPOSED-BL-LOY-0xx`** — *"A mission `OrderValueGoal` accrues only cash-currency spend; loyalty-currency line items contribute zero."* Mission analogue of `BL-LOY-009` (`[P1-data]`), but scoped `[P0-revenue]` here — a mission miscounting PTS-priced spend grants real, redeemable points, a direct money liability rather than a display mismatch. **Business value `high` ⇒ promotes at any demand** under the growth rule. Source: `LoyaltyMissionLogicService.cs:410,416` vs. `LoyaltyProgramHandler.cs:169,199`.
2. **`PROPOSED-BL-LOY-0xx`** — *"Mission accrual is insert-only and irreversible; a mission may not advance on an order that has not reached an accrual-eligible status."* Source: `LoyaltyMissionHandler.cs:22`, `ModuleConstants.cs:31-32`, absent `OrderStatusCondition` wiring in `LoyaltyMissionConditionAndRewardTreePrototype`.
3. **`PROPOSED-BL-LOY-0xx`** — *"A mission goal measures merchandise value, not order total."* Deliberately phrased to settle Theme A either way once ratified — today nothing declares which is intended. Source: `LoyaltyMissionLogicService.cs:410`.
4. **Strengthen `ECL-13.3`** (Loyalty & Points Edge Cases) — currently scoped to the loyalty *program* earn/redeem path only. Extend to name missions explicitly: a second, independent earn path with the same no-reversal property and its own `LoyaltyMissionTransaction` store.
