# Test Case Lifecycle Report — TLC-2026-06-24-1322

## Summary
- **Input:** `083b review verify` (direct scope; Phase 2 Sync + Phase 3 Generate skipped, Phase 4 Review + Phase 5 Verify run)
- **Input Type:** direct-scope
- **Date:** 2026-06-24 13:22
- **Env:** vcst-qa @ Platform 3.1039.0, Theme **2.52.0-pr-2335** (vc-frontend PR #2335 LIVE), Loyalty pr-10, Orders pr-497, XOrder pr-43, XCart pr-125
- **Suite:** 083b — Loyalty Mixed Cart Order (7 cases, Frontend, multi-currency USD+PTS)
- **Verdict:** ✅ **APPROVED WITH WARNINGS**

The headline: every dependency PR the suite was *waiting on* is now deployed, so the suite's pervasive "NOT ON LIVE BUILD YET" caveats were **stale** and the new PR #2335 multi-currency UI verified **live and correct**. The suite is structurally sound; the only test-case defect (MCO-E2E-002 assumed a cart-load banner) was corrected against live evidence.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 suite, 7 cases; build state fetched from vc-deploy-dev@vcst-qa |
| 2. Sync | — | Skipped | direct scope |
| 3. Analyze & Generate | — | Skipped | direct scope (review+verify only) |
| 4. Review & Fix | test-management-specialist | Done | 6 findings; 12 auto-fixes (stale build caveats); 5 manual items |
| 5. Verify | qa-testing-expert (firefox→edge) | Done | 10 VERIFIED, 1 CHANGED, 0 BROKEN, 0 BLOCKED; +1 incidental bug |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Required gates pass; 1 case retimed post-verify |

## Live Verification — what PR #2335 actually shipped (all VERIFIED)

| Case | Target | Result | Evidence |
|------|--------|--------|----------|
| MCO-E2E-003 | `/cart` dual total: `$102.00` block + separate **Total in PTS** block | ✅ VERIFIED | math holds (117−32+17+0=102); `083b-cart-two-currency-summary.png` |
| MCO-E2E-005 | order-details main USD list + **Products in PTS** group | ✅ VERIFIED | CO260624-00009 (USD + PTS200); no raw i18n keys; `083b-order-detail-products-in-pts.png` |
| MCO-E2E-004 | orders-list Total col dual value (`$420.00` + `PTS200.00`) | ✅ VERIFIED | — |
| MCO-E2E-007 | `/account/points-history` Earned/Redeemed rows, balance | ✅ VERIFIED | `083b-points-history.png` |
| MCO-E2E-002 | localized insufficient-balance message | ✅ VERIFIED (server-side at placement) | "Not enough loyalty points… Required: 100, available: 85." `083b-insufficient-balance-message.png` |

Console/network baseline clean (only benign GA4 `ERR_ABORTED`). createOrder loyalty validation is delivered as a GraphQL business error inside a **200**, not a 5xx.

## Fixes Applied to the CSV

**By Phase 4 (test-management-specialist) — 12 edits:** removed every stale "NOT (FULLY) ON LIVE BUILD YET … PR #2335" caveat across MCO-E2E-001/002/003/004/005 and replaced with `Live on theme 2.52.0-pr-2335 (PR #2335 deployed 2026-06-24)`; corrected two now-invalid Failure_Signals; stamped `Reviewed/synced: TLC-2026-06-24` on edited rows.

**By Phase 6 (orchestrator, from live evidence) — MCO-E2E-002 retimed:** the case assumed a pre-emptive `/cart` banner; live behavior is **server-side validation at Place-Order time** (cart shows no banner, Place Order stays enabled). Left as-is this Critical case would false-FAIL. Corrected:
- Precondition: documented place-order-time triggering + balance-below-PTS-total (not exactly zero).
- Step "add PTS product … exceeds the user's 0 balance" → "… exceeds the user's current loyalty balance".
- Cart-load `[ASSERT]` retargeted to assert **no** pre-emptive banner + checkout not disabled.
- Place-Order `[WAIT]`/`[DOM]` assertions retargeted to expect the localized toast on the placement attempt.
- Failure_Signals reworded (cart-banner → place-order-attempt).

Post-edit: `validate-td-refs.ts` 19/19 resolve, CSV integrity 15×7 intact.

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | ✅ PASS | 15-col header, 7 unique `MCO-E2E-NNN` IDs, no parse errors |
| G2 Determinism | ✅ PASS | all steps tagged; WAIT after state-changing ACT; generic refs are intentional env-resilience |
| G3 Completeness | ⚠️ PASS+WARN | mutation cases carry `errors[]`/4xx-5xx cross-layer checks; one env-var gap (below) |
| G4 Testability | ✅ PASS | observable `[DOM]/[STATE]/[FORMAT]/[MATH]` assertions; MCO-E2E-002 corrected to a testable trigger |
| G5 Data Validity | ⚠️ PASS+WARN | 19/19 `@td()` resolve, no bare GUIDs; card env vars valid; `LOYALTY_NOBAL_USER_EMAIL` only in `.env.local` |
| G6 BL/ECL Coverage | ⚠️ PASS+WARN | all ratified BL-* exist; `PROPOSED-BL-ORD-011` unratified (MCO-E2E-005); MCO-E2E-007 better mapped to BL-LOY-009 |
| G7 Duplication | ✅ PASS | shared setup via `[PRE:*]` macros + `state from` references |
| G8 Environment | ⚠️ PASS+WARN | 0 BROKEN, 0 BLOCKED; 1 CHANGED (NOBAL balance ≠ 0 — env seed) |
| G9 Sync | — | N/A (no sync phase) |

## Remaining Items

### Should Fix (improves quality — your call)
| # | Item | Owner action |
|---|------|--------------|
| 1 | **MCO-E2E-005 cites `PROPOSED-BL-ORD-011`** (unratified, HELD draft). | Promote the invariant (needs your explicit approval per BL-promotion policy) **or** annotate the ref as `(proposed/unratified)`. Not auto-changed. |
| 2 | **MCO-E2E-007 Business_Rule = BL-LOY-005** but the primary rule under test is **BL-LOY-009** (cash lines earn, PTS lines earn zero). | Swap to BL-LOY-009 (keep BL-LOY-005 as secondary). |
| 3 | **`LOYALTY_NOBAL_USER_EMAIL` missing from `.env.vcst`** (only in `.env.local`) — CI / clean-env login risk. | Add the email to `.env.vcst` (password stays in `.env.local`), mirroring `LOYALTY_VIP_USER`. |
| 4 | **NOBAL seed drift** — balance is **85 PTS, not 0**. Test still works (PTS line > 85) and precondition now reworded to "below PTS line total". | Optional: re-seed NOBAL to 0 via `scripts/seed-loyalty-users.mjs` for a pristine state. |

### Incidental bug found during verification (separate from this suite)
- **Raw / misspelled i18n key on `/account/orders`**: the orders-search button renders `commmon.buttons.search_orders` (triple-"m" `commmon`) instead of a translated label. Visible in the live UI. **Not filed** (detect-and-report). → Recommend `/qa-bug` to reproduce + file.

## Files Modified
- `regression/suites/Frontend/loyalty/083b-loyalty-mixed-cart-order.csv` (13 field edits across 6 rows: 12 staleness/audit by Phase 4, MCO-E2E-002 retiming by Phase 6)

## Next Steps
- [ ] Decide on items 1–2 (BL refs), apply item 3 (`.env.vcst`), optionally item 4 (re-seed).
- [ ] `/qa-bug` for the `commmon.buttons.search_orders` i18n typo.
- [ ] All 7 cases now Draft on a live build — candidates for Draft→Reviewed promotion; then `/qa-regression 083b` (or `loyalty`) to execute.
