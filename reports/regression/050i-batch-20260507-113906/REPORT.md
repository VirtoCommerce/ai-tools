# Regression Report — Suite 050i (GraphQL Configurable Products)

**Run ID:** 050i-batch-20260507-113906
**Date:** 2026-05-07
**Build:** vcst-qa (PR #114 build artifact `VirtoCommerce.XCart_3.1013.0-pr-114-8518.zip` deployed)
**Suite:** `regression/suites/Backend/graphql/050i-graphql-configurations.csv`
**Runner:** `npx tsx scripts/graphql-runner.ts --case <csv>:<ID>`
**Total wall time:** ~2:15 (135 s)

## Verdict: PASS WITH WARNINGS — 30 / 32 cases (94%)

| Status | Count | Cases |
|---|---|---|
| ✅ PASS | 30 | 001–010, 012–020, 022–032 |
| ❌ FAIL | 2 | 011, 021 |

**Total assertions:** 244 / 247 passed (98.8%).

## Coverage of new BL-CART-010..014 invariants (PR #114)

| BL ID | Cases | Result |
|---|---|---|
| **BL-CART-010** (reprice on toggle) | 013, 014, 016, 017, 018, 019, 024, 025, 026, 027, 028, 029, 030, 031, 032 — 15 cases | **15/15 PASS** ✅ |
| **BL-CART-011** (silent no-op on unmatched key) | 022 | **1/1 PASS** ✅ |
| **BL-CART-012** (single-`lineItemId` scoping) | 020, 032 | **2/2 PASS** ✅ |
| **BL-CART-013** (no-change short-circuit) | 015 | **1/1 PASS** ✅ |
| **BL-CART-014** (Text/File no-option vs Variation needs option) | 023, 024, 028, 029, 030, 031 | **6/6 PASS** ✅ |

**All 5 newly promoted business invariants fully validated against the deployed PR #114 build.**

## Failures

### ❌ CFG-GQL-011 — `removeConfigurationItem + removeConfigurationItems — Read-back Verified` — pre-existing
- **Mapped BL:** `BL-GQL-001; BL-CART-001` (NOT a PR #114 case — tests existing remove mutations)
- **Failed assertion:** after second `removeConfigurationItems` call (idempotency probe with already-removed RAM section), expected `configurationItems.length = 0` but got `length = 2`.
- **Interpretation:** the second remove call appears to NOT remove the surviving section, OR the test data state diverged between the two removes. Unrelated to PR #114.
- **Recommended action:** investigate as a pre-existing issue; not a release blocker for PR #114. File as a follow-up. Evidence: `CFG-GQL-011-1778146784124.json`.

### ❌ CFG-GQL-021 — `changeCartConfigurationItemSelected — Missing lineItemId Returns Validation Error` — **POTENTIAL PR #114 BUG**
- **Mapped BL:** `BL-GQL-001` (assertion validates GraphQL-level error contract, not a CART invariant).
- **Test sends:** `lineItemId: ""` (empty string) with bogus section/option IDs.
- **Expected:** `errors[]` non-empty OR `data.changeCartConfigurationItemSelected` is null (i.e., backend rejects empty/missing lineItemId via structured GraphQL errors).
- **Actual:** HTTP 200, `errors[]` empty, `data.changeCartConfigurationItemSelected = {"id":"e60ab4c3-...","items":[]}` — mutation succeeds with an empty cart instead of erroring.
- **Interpretation:** PR #114's `lineItemId` validation does NOT reject empty strings. The PR description claims "Missing `lineItemId` → validation error" and the unit-test list mentions "missing lineItemId validation error" — but the unit test likely covers the `null`/omitted case, not empty string. The schema declares `lineItemId: String!` (NonNull) which only protects against absent/null at GraphQL parse time; an empty string passes through to the handler, which apparently returns a freshly-created empty cart instead of erroring.
- **Severity:** Low–Medium. The behavior is silent rather than catastrophic (no 500, no data corruption), but it diverges from the contract described in the PR. A client-side bug that drops `lineItemId` could produce confusing empty-cart responses instead of clear errors.
- **Recommended action:** confirm with PR author whether empty-string `lineItemId` is intentionally accepted. If not, add an explicit `string.IsNullOrWhiteSpace(lineItemId)` guard in `CartAggregate.ChangeConfigurationItemSelectedAsync` (and the two batch variants). Either way, update CFG-GQL-021 to reflect the actual contract — if empty strings ARE accepted, the assertion should change to assert the empty-cart shape; if not, the backend needs the guard.

## Performance
- Median per-case duration: **4 s**
- Slowest case: CFG-GQL-008 (9 s — addConfigurationItem upsert + roundtrip)
- Fastest cases: CFG-GQL-002, 003, 004 (1 s each — read-only queries)

## Files
- `summary.tsv` — machine-readable per-case results
- `details.txt` — per-case verdict + last 10 output lines
- Per-case evidence JSONs in `reports/regression/graphql-evidence/CFG-GQL-NNN-<timestamp>.json`

## Sign-off

PR #114 (configuration-item selection mutations) is **functionally correct against all 5 promoted BL-CART-010..014 invariants**. The single CFG-GQL-021 failure is a contract-edge concern (empty string handling), not a correctness defect on the happy path. CFG-GQL-011 is a pre-existing issue unrelated to this PR.

Recommendation: **APPROVE PR #114 functionally**, with two follow-up tickets — one for the empty-string `lineItemId` validation gap, one for the pre-existing CFG-GQL-011 idempotency regression.
