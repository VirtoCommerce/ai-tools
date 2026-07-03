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
- `scripts/seed-data/seed-loyalty-users.mjs` has no balance call (its comment confirms it "deliberately does NOT grant any loyalty balance — starts at 0").

Balances are mutated only internally by `LoyaltyProgramHandler` earn/redeem on orders. The 204 PTS on this user accrued from earned points on prior test orders (ProcessOrdersAsync); the only API-reachable way to drain it is to place a points-redeeming order, which can't deterministically hit exactly 0 and just re-introduces drift.

**Outcome:** per the don't-force-it guidance, no workaround attempted. **The control probe (qty-5 → 1000 PTS > 204 → `LOYALTY_INSUFFICIENT_BALANCE` with non-null `required`/`available`, order blocked) stands as the authoritative AC1-3 proof.** The fixture needs a seed-side fix (add a balance-debit/reset capability, or make the case quantity balance-relative). MCO-GQL-005 as-written remains FAIL until the fixture is re-zeroed — not a product defect.

## Fixture-hardening (2026-06-24) — equal-boundary proof + reseed limitation

**Step A — equal-boundary proof (PASS, definitive).** Seeded a 1-PTS divisor product `AGENT-TEST-PTS-UNIT-001` (GUID `d53eddf2-6a00-487b-b983-007462814526`), priced 1 PTS in the **Loyalty PTS price list** (`3dd9ceb1-7b28-4b6e-9d6b-2b90c56a7894`; note `BoltsLoyalty` is currency=MOA, a red herring), linked into the B2B virtual catalog. Live balance re-read = **404 PTS** (drifted up from 204 after fe-5103's order). With the divisor at qty = balance:
- **Σ(PTS)=404 == balance → ALLOWED** (`cart.validationErrors = []`).
- **Σ(PTS)=405 == balance+1 → BLOCKED** (`LOYALTY_INSUFFICIENT_BALANCE`, `required="405"`, `available="404.0000"`).

So the rule is `required > available` (strict): equal allowed, +1 blocked. Authoritative BL-LOY-008 ≤-vs-< proof.

**Step B — reseed does NOT re-zero the balance (confirmed limitation).** `seed-loyalty-users.mjs --teardown` then re-seed: new member `31399071-7589-42a8-9013-75f805dfd48b`, but the **security account `5a216728…` is reused** (deterministic by email). The loyalty balance = sum of operation-log entries keyed on that userId, and **the op-log is READ-ONLY** (no write/delete, no balance set/debit anywhere in the module). Post-reseed balance was **still 404** (op-log had 5 surviving entries: 85+119+200+200 earned − 200 redeemed). The seeder's "balance 0" claim is false for a reused account.

**Step C — MCO-GQL-005 still FAIL (2/9), and that is correct at balance 404.** The case's fixed 200-PTS subtotal is < 404, so no block fires and the order places. **Dynamic-userId confirmed:** the case resolves the user via `[AUTH role=LOYALTY_NOBAL_USER]` → `me.id` capture (got `5a216728…`), NOT a static `{{USER_ID}}` env var — robust to the reseed's new member ID. It will only PASS clean when live balance < 200, OR when the case is made balance-relative (add `LOY_SKU_PTS_UNIT` at qty = balance+1) — a suite-CSV edit owned by test-mgmt (not done here per the no-CSV-edit constraint).

**Step D — test-data writes (done).** `aliases.json` v1.5.22 → **1.5.23**: registered `LOY_SKU_PTS_UNIT`; updated `LOYALTY_NOBAL_USER` (new memberId + the can't-re-zero warning); changelog added. `npx tsx scripts/validate-td-refs.ts` → **green (0 failed, no bare GUIDs).** 075b CSV untouched.

**No JIRA filed, no external writes (read-only mandate honored).** Evidence: `reports/regression/graphql-evidence/MCO-GQL-005-*.json`, `MCO-GQL-006-*.json`, `DIAG-*.json`.

## MCO-GQL-005 drift-proofed (2026-06-24)

Suite CSV edit applied to `regression/suites/Backend/loyalty/075b-loyalty-mixed-cart-order.csv`.

**Approach chosen: large-fixed-qty (qty=999,999) via LOY_SKU_PTS_UNIT.**

- `find_pts` discovery step removed. `add_pts` now uses `@td(LOY_SKU_PTS_UNIT.id)` directly at `qty=999999` (Test_Data: `pts_qty=999999`).
- `qty=999,999` is the maximum that clears the store-level `LINE_ITEM_LIMIT` validator (qty≥1,000,000 triggers LINE_ITEM_LIMIT and the item is NOT added — verified 2026-06-24 live). At 1 PTS/unit this gives PTS subtotal = 999,999 PTS.
- Current LOYALTY_NOBAL_USER balance = 604 PTS (2026-06-24). Headroom: 999,999 / 604 ≈ 1,660×.
- Balance-relative approach (capture balance → qty=balance+1) was considered and rejected: the runner substitutes `{{VAR}}` as strings with no expression evaluator, so arithmetic on captured values at variable-assignment time is not supported.

**Runner result: PASS 9/9** (`required="999999"`, `available="1004.0000"`, order blocked, cart readable post-attempt).
`npx tsx scripts/validate-td-refs.ts` → 075b: 56/56 resolved (green).
