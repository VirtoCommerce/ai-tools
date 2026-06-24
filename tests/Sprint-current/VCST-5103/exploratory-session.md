# Exploratory Session — VCST-5103 Loyalty Points Balance Validator (Boundary)

**Charter:** CRISP / Risk. Stress the balance-validation boundary `Σ(items WHERE Currency==PTS) ≤ getAvailableBalanceAsync(userId)` — find where the boundary actually sits (`<` vs `≤`).
**Env:** vcst-qa, Platform `BACK_URL=https://vcst-qa.govirto.com`, theme 2.52.0-pr-2335. **Date:** 2026-06-24. **Duration:** ~25 min.
**Method:** Read-only GraphQL cart-validation contract (`cart.validationErrors[LOYALTY_INSUFFICIENT_BALANCE]`) via `scripts/graphql-runner.ts` (auth roles `LOYALTY_NOBAL_USER` / `LOYALTY_VIP_USER`). No UI checkout (Firefox /cart quirk avoided per charter). **BL-LOY-008.**
**Oracle:** Validator emits `LOYALTY_INSUFFICIENT_BALANCE` with `errorParameters {required, available}` when `Σ(PTS) > balance`; cart stays readable.

## Fixture reality (Observation — feeds GAP probes)
- `LOYALTY_NOBAL_USER` (`5a216728…`) actual **loyaltyBalance.currentBalance = 204 PTS** — NOT zero. The `aliases.json` `_notes` and the MCO-GQL-005 precondition both describe it as a "zero-balance" user. (See Observation O-1.)
- Available PTS-priced products (B2B virtual catalog `fc596540…`): 50 items, distinct unit prices **{10, 30, 40, 50, 80, 100, 150, 200}** — all multiples of 10. **No integer cart sum can equal 204**, so a strict `Σ == balance` (exact-equal) cart is **unreachable on this fixture**.

## GAP findings

| Gap | Construction (NOBAL, balance=204) | Result | Verdict |
|-----|-----------------------------------|--------|---------|
| **GAP-1** under | 20 × 10-PTS = **200 PTS** (+1 USD line) | `validationErrors` empty → **ALLOWED** | PASS — boundary is below 210; 200 (4 under) passes |
| **GAP-2** over | 21 × 10-PTS = **210 PTS** (+1 USD line) | `LOYALTY_INSUFFICIENT_BALANCE`, `required="210"`, `available="204.0000"` → **BLOCKED** | PASS |
| **GAP-3** sum | two PTS lines 150 + 100, each < 204, Σ=**250** | `LOYALTY_INSUFFICIENT_BALANCE`, `required="250"`, `available="204.0000"` → fires on the **SUM** | PASS — validator sums PTS lines, not per-line |
| **GAP-4** clear | from 250 (error), **remove** the 100-PTS line → 150 PTS | error **clears**; cart intact (2 items: 150-PTS + USD) | PASS — reducing over-spend clears without emptying cart |

### errorParameters accuracy (charter watch-item)
In every blocked case `required` == the cart's actual Σ(PTS) (210, then 250) and `available` == the user's balance ("204.0000"). **Matches exactly.** No mismatch.

## GAP-1 boundary verdict (the headline)
- **Threshold sits at exactly `available = 204`** (read straight from `errorParameters`).
- **200 PTS (4 under) → ALLOWED; 210 PTS (6 over) → BLOCKED.** The flip is bracketed to `(200, 210]` and the validator reports the cut at 204.
- **The exact-equal `Σ == 204` point is NOT directly executable** — the PTS catalog granularity is 10, so no cart sum can land on 204. The `<` vs `≤` off-by-one therefore **could not be exercised directly**. It is *consistent with* `≤` (no evidence of an off-by-one short of the boundary: 200 passes cleanly, well under), but pinning equality requires a fixture whose balance is a reachable sum (multiple of 10) or a PTS product with a unit price dividing the balance.

## Items (Bug | Question | Observation | Risk)

- **O-1 (Observation, doc-drift):** `LOYALTY_NOBAL_USER` is documented as zero-balance but live balance = **204 PTS**. Not a product bug — the validator still works — but MCO-GQL-005's "balance=0" premise is now false; its OVER assertion still holds because any PTS line ≥ 10 exceeds… no longer trivially (a cart of exactly 200 PTS would now PASS validation for this user, which could silently weaken MCO-GQL-005 if its PTS line is small). Worth re-confirming the fixture balance or re-zeroing it. Update `aliases.json` `LOYALTY_NOBAL_USER._notes` to reflect 204, or reseed to 0.
- **R-1 (Risk / coverage gap):** No existing case covers the **EQUAL** boundary (`Σ == balance`) — and it is **unreachable** with the current PTS catalog (all prices multiples of 10, balance 204). The `<` vs `≤` off-by-one is therefore untested by construction. To close: seed either (a) a PTS product priced to divide the balance (e.g. unit 4/6/12/17/34/51/68/102/204), or (b) set the test user's balance to a multiple of 10 (e.g. 200) so `Σ == balance` is reachable, then assert the EQUAL cart is ALLOWED.
- **O-2 (Observation):** GAP-3 confirms the rule operates on the per-currency **sum** across all PTS lines (`required` = Σ of PTS extendedPrices), independent of line count — consistent with the `Σ(items WHERE Currency==PTS)` charter spec.
- **No defects found.** Validator behaves per BL-LOY-008 across under / over / multi-line-sum / clear-by-reduction; cart remained readable throughout; balance never decremented (no orders placed).

## Notes
- Runner schema-cache quirk (not a product issue): a mid-run "refresh introspection once" re-validates *all* ops in a case together and can false-flag a valid op after `loyaltyBalance`'s `LoyaltyBalanceResult` type is touched; isolating the `products` query into its own case cleared it.
- Evidence JSON: `reports/regression/graphql-evidence/GAP{1,2,3,4}-*.json` (gitignored disposable artifacts).
