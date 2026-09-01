# A mission `PerSkuGoal` counts a line priced in the loyalty currency — 1 point spent returns 150 points of mission reward — **P0 / Critical**

## Status: REJECTED — CLOSED BY DESIGN (see Resolution)
**Tracker:** not filed
**Found by:** REG-2026-09-01-2316 · suite `075d-loyalty-missions` · case `MSN-029` (FAIL) — order line currency and the reward ledger row re-read read-only afterwards
**Archetype:** `MONEY`
**Oracle:** `BL-LOY-017` (`[P0-revenue]`, Status VIOLATED) — precedent `BL-LOY-009` (same rule, already settled for the loyalty-program earn path); no reversal path exists (`BL-LOY-019`)

**Env:** vcst-qa @ Platform `3.1061.0`, `VirtoCommerce.Loyalty 3.1006.0-pr-14-da8a` (`da8abc6`), store `B2B-store`, fixture generation `20260901211005-4474`.

## Summary
`LoyaltyMissionLogicService.ApplyContribution` advances a `PerSkuGoal` for **any** order line matching the target product, including a line bought in the loyalty currency (points). A points-priced line is a redemption, not a purchase, so counting it lets a customer convert already-earned points into fresh mission progress and a fresh reward — a self-feeding loop, measured here at **1 point spent → 150 points granted**. The sibling `LoyaltyProgramHandler`, shipped in the same module and running against the same order, filters that line correctly — so the module currently accrues on two different bases for one line item.

## STR
Read-only reproduction of a defect already reproduced by `MSN-029`; steps 3–6 mutate state, so run them on a disposable account.

1. Seed the loyalty-missions E2E fixtures (`node scripts/seed-data/loyalty/seed-loyalty-missions.mjs`) — this creates mission `@td(MSN_E2E_PERSKU_PTS)`: `PerSkuGoal`, `all=false`, one target (`@td(MSN_E2E_PRODUCT_PTS)`, list price 1, priced in the loyalty currency), `targetQuantity 1`, reward **150**.
2. Sign in as `@td(MSN_E2E_USER_PTSSPEND)` — a funded account (a points line is refused at place-order with `LOYALTY_INSUFFICIENT_BALANCE` on a zero balance). Read `loyaltyMissionProgress` and record the baseline for that mission.
3. Add 1 × `@td(MSN_E2E_PRODUCT_UNIT)` to the cart in the store currency (`BL-LOY-010`: a points-only cart is rejected, so the order needs a cash line).
4. Add 1 × `@td(MSN_E2E_PRODUCT_PTS)` with `itemCurrencyCode` = the loyalty currency (`PTS`).
5. Set any shipment + `DefaultManualPaymentMethod`, then `createOrderFromCart`.
6. Wait for the mission accrual to settle (`isStarted = true` on that mission), then re-read `loyaltyMissionProgress` and the account's loyalty operation log.

## Expected vs Actual

| # | Observable | Expected (`BL-LOY-017`, by analogy with `BL-LOY-009`) | Actual (`MSN-029`, REG-2026-09-01-2316) |
|---|---|---|---|
| 1 | `items[?productId=9d5f6ce6-…].currentQuantity` on mission `e939406e-a543-46c8-a9f2-24c7369dbf21` | `0` — the loyalty-currency line contributes nothing | **`1`** of `targetQuantity 1` |
| 2 | that mission's `status` | not `Completed` — its only target was bought with points | **`Completed`** |
| 3 | reward granted for that mission | none | **`Earned 150`** on `LoyaltyMissionProgress`, 21:20:20.532Z |
| 4 | same order, loyalty-**program** earn path | excludes the points line | `Earned 5` — the cash line's points only, i.e. **correctly filtered** |

Baseline is in the same evidence file: the pre-order read of that mission is `status InProgress`, `isStarted false`, `currentQuantity 0 / 1`. Order `CO260901-00069` (`040784eb-0d8f-482e-9ab6-6375d6debfa9`), account `MSN_E2E_USER_PTSSPEND` (`5a1c091d-…`).

**The one confound the run report named is closed.** REG-2026-09-01-2316's own report held `MSN-029` as a *candidate* because the observation could have been a fixture artefact — `itemCurrencyCode` silently ignored, making the line an ordinary cash line that is *supposed* to count. A read-only re-read of the persisted order shows the line stored as `{"sku":"AGENT-TEST-MSN-E2E-PERSKU-PTS","currency":"PTS","price":1}` beside `{"sku":"AGENT-TEST-MSN-E2E-UNIT","currency":"USD","price":5}`, and the ledger carries `Redeemed 1` against that order id — the points really were spent. The line is loyalty-currency and it still advanced the goal.

## Impact
Unbounded, self-funding point inflation on any mission whose `PerSkuGoal` target is purchasable in the loyalty currency. On this fixture one cycle costs **1 point** and returns **150** (plus the 5 the cash line earns) — net **+154** — and nothing caps repetition. `BL-LOY-019` records that no reversal exists at any layer, so the grant cannot be withdrawn even by cancelling the order; the only recovery is a manual balance correction the module exposes no API for. Points are a liability settled against real merchandise, so this is revenue loss, not a display defect.

**Severity: Critical / P0-revenue** — not inherited from the oracle tag: it is P0 because the exploit is *self-feeding* (its output is its own input) and *irreversible* (`BL-LOY-019`), so a single customer's exposure is bounded only by how many times they repeat it.

## Root cause
`LoyaltyMissionLogicService.ApplyContribution`, `case PerSkuGoal:` — the branch iterates `order.Items` and does `item.CurrentQuantity += lineItem.Quantity` with **no currency predicate**. On the deployed `da8abc6` (line numbers re-verified against that ref 2026-09-01): `case PerSkuGoal:` at **`:420`**, the increment at **`:427`**, `return added;` at **`:431`**.

The same-module contrast is the argument: `LoyaltyProgramHandler` filters the identical collection with `!x.Currency.EqualsIgnoreCase(loyaltyCurrency)` (**`:199`**, inside the `:197-199` block — this file is byte-identical between `dev` and `da8abc6`, so it is unaffected by the PR), which is why the same order earned 5 and not more on the program path. One module, two accrual paths over one order, only one of them currency-aware.

Wider than the reported symptom: `OrderCountGoal` carries no `CurrencyCode` field at all, and the only currency gate matches `goal is OrderValueGoal`, self-disabling when `CurrencyCode` is empty. **That gate is at `:302-304` and lives in `ApplyMissionInternalAsync` — not in `ApplyContribution`.** An earlier revision of this report cited it at `:294`/`:296-297`, copied from `BL-LOY-017`, whose anchor was never re-pointed when the rest of that entry moved from `1be73b4` to the deployed ref; those numbers match nothing on `da8abc6`. Corrected here 2026-09-01 from a direct read of the deployed ref, and being corrected in the oracle separately.

A fix should add the predicate at the `order.Items` iteration (mirroring `LoyaltyProgramHandler`) rather than per-goal-type.

## Evidence
- `reports/regression/REG-2026-09-01-2316/graphql-evidence/MSN-029-1788297623402.json` — full operation log, both assertion failures with expected/actual, and the pre-order baseline read.
- `reports/regression/REG-2026-09-01-2316/regression-2026-09-01.md` §C — the run's own triage of `MSN-029`.
- Order + ledger figures above: re-read read-only on 2026-09-01 via `GET /api/order/customerOrders/{id}` and `POST /api/loyalty-program-operation-log/search` (`userId`, singular — the plural `userIds` is accepted and silently ignored, per `BL-LOY-019`).

**Attribution caveat.** On the **customer-facing GraphQL** surface the `Earned 150` row carries `objectType: LoyaltyMissionProgress` and a progress id, not a mission id, and reads `object: null` — so within that surface the row is identified as this mission's grant only by its **reward amount** (150, the fixture's declared reward; the other grants in the same second are 300/500/503/505/506/508).

Corrected 2026-09-01, after this report was first written: per-mission attribution **is** obtainable, just not there. `POST /api/loyalty-program-operation-log/search {userId}` (**admin token only** — a customer token gets HTTP 403) returns each row with `sourceType: "LoyaltyMission"` and `sourceId: <missionId>`; a paired measurement joined 9 of 9 mission grants to their granting mission exactly. So the earlier claim here that attribution "is not obtainable through any reachable API" was wrong, and `BL-LOY-015` is being corrected to match — the gap is confined to the customer-facing GraphQL surface, not the platform.

This does not weaken the finding: the PTS line advanced the goal regardless of how the grant is attributed. It does mean **amount is the wrong discriminator to build on** — the same paired measurement saw one order produce three separate `500` rows, so amount is non-discriminating in the general case even though it happens to be unique for this fixture's 150. One order advances every applicable mission on this account, so the co-completed grants are expected and are not part of this finding.

**Superseded measurement.** `BL-LOY-017`'s `Live:` line cites order `CO260901-00007` on fixture generation `20260901153647-7b25`. Those fixtures were torn down and re-seeded on 2026-09-01, so that reading can no longer be re-derived; it is not relied on here. Everything above is on generation `20260901211005-4474`.

## Resolution — REJECTED 2026-09-02

**Closed by product decision, not by new evidence.** A `PerSkuGoal` target that is purchasable in the
loyalty currency is **not a supported configuration**. The exploit this report describes requires exactly
that setup, so its premise is an unsupported product state rather than a defect in shipped behaviour.

What that does and does not change:

- **The observations stand.** Everything measured here was real and is re-derivable on generation
  `20260901211005-4474`: the line was stored `currency:PTS,price:1`, the ledger carried a matching
  `Redeemed 1`, the goal advanced to `currentQuantity 1` / `Completed`, and the same order shows
  `Earned 5` (program path, correctly filtered) beside `Earned 150` (mission path). None of that is
  withdrawn — it is reclassified as behaviour under a configuration the product does not support.
- **The source asymmetry is still real** and is the part worth keeping: `ApplyContribution`’s
  `case PerSkuGoal:` applies no currency predicate (`:420`/`:427`/`:431` on `da8abc6`) while the sibling
  `LoyaltyProgramHandler` does (`:199`). That asymmetry is now latent rather than exploitable — it becomes
  live again the moment a points-purchasable PerSku target is ever supported.
- **Both covering cases are deprecated** (EX-201, excluded from both lanes, landing as SKIPPED with their
  reason): `075d` `MSN-029` (asserted the correct contract) and `083d` `MSN-E2E-007` (asserted the defect
  as expected behaviour — an inverted assertion that would have gone red the day the bug was fixed).
- **`BL-LOY-017` needs re-examination and is NOT settled by this rejection.** Its `Status: VIOLATED` rests
  on this same PerSku path. Its rule also covers `OrderValueGoal` and the general principle, so it is not
  automatically wrong — but it can no longer cite this scenario as its live proof. Routed to the pending
  `/qa-review-oracles bl` apply as a proposal, not an auto-applied edit, because like `BL-LOY-016` this is
  a product-intent call rather than an evidence call.
- **Coverage consequence — and it is a false-coverage signal, not a gap.** Deprecating `MSN-029` was
  expected to return `BL-LOY-017` to `BLC-004` uncovered. It did **not**: `bl:lint` counts a citation in the
  `Business_Rule` column regardless of `Automation_Status`, so the deprecated case still reads as coverage.
  `BLC-004` stays at 20 and `BL-LOY-017` is not flagged — while its only citing case (`MSN-029`, remapped to
  it on 2026-09-01) is EX-201 and runs nowhere. The invariant is now recorded as covered by a case that can
  never execute, which is worse than being visibly uncovered. Worth raising against `lint-bl.ts`: BLC-004
  should discount `Deprecated` (and arguably `Manual`) citations, or report them as a separate class.
