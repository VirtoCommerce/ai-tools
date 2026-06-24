# VCST-5103 — Loyalty Points Balance Validator (mixed cart) — Backend/GraphQL Execution

**Env:** vcst-qa @ Platform 3.1039.0, Loyalty 3.1004.0-pr-10 (LoyaltyCartValidator), XCart 3.1022.0-pr-125 (ICartValidator wiring)
**Layer:** GraphQL xAPI (canonical runner `scripts/graphql-runner.ts`) · 2026-06-24

## Verdict per case

| Case | AC | Verdict | Notes |
|------|----|---------|-------|
| MCO-GQL-005 — LOYALTY_INSUFFICIENT_BALANCE blocks checkout | AC1-3 | **FAIL (fixture drift, NOT a product defect)** | Validator correct; precondition not met — see below |
| MCO-GQL-006 — LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED + clears | AC6-7 | **PASS 5/5** | Rule fires on PTS-only cart, clears when cash line added |

## MCO-GQL-006 — PASS (5/5)

- `read_pts_only_validation`: `validationErrors` count = 1, contains `LOYALTY_ONLY_POINT_PRODUCTS_NOT_ALLOWED` ✅
- `add_usd_line`: errors[] empty ✅
- `read_mixed_validation`: errors[] empty — the only-points error **clears** once a cash line is present ✅
- AC6 (PTS-only cart blocked) and AC7 (adding cash clears it) both confirmed at the GraphQL layer.

## MCO-GQL-005 — FAIL, but the validator is correct (fixture drift)

Runner result: 2/9 assertions passed. `cart.validationErrors = []` (empty), and `createOrderFromCart` **succeeded** (order `CO260624-00020`).

**Root cause = the fixture, not the code.** `@td(LOYALTY_NOBAL_USER)` is documented as "zero-balance," but its current balance is **204 PTS**, while the cart's PTS-line subtotal is **200 PTS**. So `required (200) ≤ available (204)` → the insufficient-balance condition was never constructed → the validator correctly stays silent and the order is legitimately placeable.

Causation settled (not inference) by a diagnostic run via the canonical runner:

- `loyaltyBalance(NOBAL).currentBalance = 204` (expected 0)
- Cart PTS line `Autoclave Tuttnauer 3850 M` extendedPrice = `200 PTS`; cash line = `200 USD`; cart `validationErrors = []`.
- **Control probe — raise PTS-total above balance (qty 5 → 1000 PTS):** validator fires immediately:
  ```json
  { "errorCode": "LOYALTY_INSUFFICIENT_BALANCE",
    "errorParameters": [ {"key":"required","value":"1000"}, {"key":"available","value":"204.0000"} ] }
  ```

**This proves LoyaltyCartValidator rule 4 works**: emits `LOYALTY_INSUFFICIENT_BALANCE`, populates non-null `required`/`available`, only when PTS-total > balance.

### GAP-6 — do required/available look consistent?
**Yes.** `required` = PTS line subtotal, `available` = the user's loyalty balance, and `required > available` whenever the rule fires (control probe: required=1000, available=204; PTS subtotal 1000 and balance 204 both independently confirmed). No inconsistency.

## Conclusion / action

- AC6-7 **verified PASS** at the GraphQL layer.
- AC1-3 (insufficient-balance block) — **functionally verified PASS** via the control probe; the suite case fails only because `LOYALTY_NOBAL_USER` accrued ~204 PTS since 2026-06-24 (likely earned points from prior test orders / re-seed). **No bug.**
- **Fix:** re-zero `LOYALTY_NOBAL_USER`'s balance before re-running MCO-GQL-005, OR change the case to add the PTS line at a quantity whose subtotal exceeds the (non-zero) balance (a qty/balance-relative precondition is more resilient than assuming 0). Owner: test-data/seed — not a code change.

## Re-zero follow-up (2026-06-24) — NOT POSSIBLE via available APIs

Attempted to re-zero `LOYALTY_NOBAL_USER` (204 PTS → 0) and re-run MCO-GQL-005 cleanly. **The loyalty module exposes NO balance-write path**, so re-zeroing is not achievable without a code change.

Full loyalty REST surface (`/docs/VirtoCommerce.Loyalty/swagger.json`, 12 paths):
- **Operation-log: READ-ONLY** — only `POST .../operation-log/search` and `GET .../operation-log/balance/{userId}`, both `loyalty:read`. No POST/PUT/DELETE to create/adjust an operation-log entry.
- Write verbs exist only for: `loyalty-programs` (CRUD), `loyalty-program-product-factors` (CRUD + `/factors`), `loyalty-setting` (PUT). **None set or debit a member balance.**
- `scripts/seed-loyalty-users.mjs` has no balance call (its comment confirms it "deliberately does NOT grant any loyalty balance — starts at 0").

Balances are mutated only internally by `LoyaltyProgramHandler` earn/redeem on orders. The 204 PTS on this user accrued from earned points on prior test orders (ProcessOrdersAsync); the only API-reachable way to drain it is to place a points-redeeming order, which can't deterministically hit exactly 0 and just re-introduces drift.

**Outcome:** per the don't-force-it guidance, no workaround attempted. **The control probe (qty-5 → 1000 PTS > 204 → `LOYALTY_INSUFFICIENT_BALANCE` with non-null `required`/`available`, order blocked) stands as the authoritative AC1-3 proof.** The fixture needs a seed-side fix (add a balance-debit/reset capability, or make the case quantity balance-relative). MCO-GQL-005 as-written remains FAIL until the fixture is re-zeroed — not a product defect.

**No JIRA filed, no external writes (read-only mandate honored).** Evidence: `reports/regression/graphql-evidence/MCO-GQL-005-*.json`, `MCO-GQL-006-*.json`, `DIAG-001-*.json`.
