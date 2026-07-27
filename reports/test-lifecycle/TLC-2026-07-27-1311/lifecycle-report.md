# Test Case Lifecycle Report — TLC-2026-07-27-1311

## Summary
- **Input:** `029,030 review, verify, auto-fix` → direct-scope, Phases 4 + 5 + 6 (`--skip-sync --skip-generate --auto-fix`, verify on)
- **Date:** 2026-07-27 13:11 · **Env:** vcst-qa
- **Platform:** 3.1048.0 · **Theme:** vc-theme-b2b-vue 2.54.0-pr-2395
- **Modules:** Cart 3.1007.0 · XCart 3.1028.0 · XOrder 3.1007.0 · Store 3.1006.0 · Pricing 3.1004.0
- **Verdict:** **APPROVED WITH WARNINGS** — all required gates pass; the recommended traceability gate carries 7 unresolved REQ-001 findings that cannot be closed without inventing ticket numbers.

## Phase Results

| Phase | Agent | Status | Key metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 2 suites, 52 cases; no duplicate run (today's 0900 TLC covered 042) |
| 2. Sync | — | Skipped | direct scope, no change source |
| 3. Generate | — | Skipped | `--skip-generate` |
| 4. Review & Fix | test-management-specialist | Done | 67 → 41 findings; 37 → 7 High |
| 4c. BL Audit | ba-system-analyzer | Done | 4 candidates: 2 applied, 2 held |
| 5. Verify | qa-testing-expert | Done | 10 targets; 1 BROKEN + 4 CHANGED assertions found |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 8/8 required gates pass |

## Findings

| Suite | Before | After |
|-------|--------|-------|
| 029 Cart Validation & Persistence | 50 (25 High / 24 Med / 1 Info) | **31 (7 High / 23 Med / 1 Info)** |
| 030 Cart Merge | 17 (6 High / 10 Med / 1 Info) | **10 (0 High / 9 Med / 1 Info)** |

## What Phase 5 falsified (highest-value result)

Live verification **contradicted Phase 4's own work**, and 4c then found the root cause in source:

1. **`BL-CART-001` was wrong, not just the cases.** The 2026-07-22 amendment claimed the system *rejects* an over-stock quantity and leaves the line unchanged. Observed: the **PDP** stepper rejects (`Order from 1 to 5 item(s)`, nothing added), but on the **cart line** the over-stock quantity is **accepted and persisted server-side** — it survives a full reload, and subtotal/total recalculate at it (`You can order maximum 5 item(s)` shown inline). Source confirms why: `AddCartItemCommandHandler.Handle` and `ChangeCartItemQuantityCommandHandler.Handle` save **unconditionally**; `CartLineItemValidator` only attaches an advisory error. The amendment's cited source anchor was real but did not do what was claimed. Oracle corrected (DRIFT, auto-applied).
2. **No stale-price indicator exists.** 0 code hits for `priceChanged`/`price_changed`/`PRICE_CHANGED`/`previousPrice`; the full i18n price-key set and the complete cart validation-code list contain no price-change key. CART-044/076 were asserting a nonexistent surface. The `listPrice > actualPrice` strikethrough is a *discount* affordance — a price **increase** renders as a plain number.

## Fixes applied

**Phase 4** (`test-management-specialist`) — 22 rows in 029, 15 in 030: 22 wrong `Business_Rule` IDs corrected (notably `BL-CART-006` pack-size → `BL-CART-008` across the merge matrix), 18 missing `errors[]` cross-layer checks added, 18 + 6 real `VCST-*` requirement links resolved by JIRA lookup, 1 DUP-004 trim (CART-044), 1 stray in-Steps `[ASSERT]` removed (CART-105).

**Phase 5 follow-up** (orchestrator, from live observation):

| Case | Correction |
|------|-----------|
| CART-026 | Rewritten to the observed cart-line contract (accept + persist + inline flag, no silent cap); `Proceed to Checkout` → removed (no such control; `/cart` is the combined cart+checkout page, CTA is `Place order`). All 4 assertions `{OBSERVED}`. |
| CART-047 | Same correction; removed the self-contradictory `[MATH] … (capped) quantity`; **made the oversell-block assertion isolatable** by adding delivery + billing selection steps; `Failure_Signals` now names oversell. |
| CART-044 | Indicator assertions removed; price literals `$18.00`/`$25.00` de-hardcoded to recorded-relative values; title → "Price Drop Refreshes Silently". |
| CART-076 | `price warning` assertion → silent-refresh assertions; title → "Stale Cart Price Refresh". |
| CART-114/115/116 | Fixture drift: `'Select your fav color'` → `'Color *'` (**now required**, previously documented optional); `color: Black`/`Green` → `Black hat`/`Green hat`; added the `Components list` expand step — the always-visible per-line properties are the **base** product's attributes, identical on both lines, so the old assertion would fail on a *working* product. |
| 9 cases | `BL-PRICE-001` (discount stacking — inapplicable) → `PROPOSED-BL-PRICE-009`, matching the existing `PROPOSED-BL-*` convention, since 4c did not promote the invariant. |

## BL Audit (Phase 4c)

| Candidate | Docs | Live | Source | Verdict | Applied |
|-----------|------|------|--------|---------|---------|
| BL-CART-001 max-qty PDP vs cart-line | N/A §1a | fresh | fresh | **DRIFT** | **Yes** |
| BL-CART-008 coupon persists + re-prices | N/A §1a | fresh | fresh | **MISSING clause** | **Yes** |
| PROPOSED-BL-PRICE-009 silent price refresh | N/A §1a | partial | fresh | UNGROUNDED | Held |
| PROPOSED-BL-CART-016 `selectedForCheckout` merge | — | none | partial | UNGROUNDED | Held |

Held drafts + re-audit triggers: `reports/ba/bl-proposals-2026-07-27.md`. Trail: `reports/knowledge/BL-AUDIT-2026-07-27.md`.

**Residual risk on the applied BL-CART-001.** Its "blocks order completion" clause rests on observing `Place order` disabled — but that control was disabled anyway from missing delivery/billing, so the observation is **confounded**. The accept-and-persist half is solidly proven (unconditional `SaveAsync`); the oversell-block half is not independently isolated. CART-047 as now written is what settles it on next execution.

## Quality Gates

| Gate | Status | Detail |
|------|--------|--------|
| G1 Structure | **PASS** | 0 Blocker; 34/18 rows × 15 cols, all IDs unique and preserved |
| G2 Determinism | **PASS** | 0 Critical; compound steps split |
| G3 Completeness | **PASS** | 0 High completeness findings; `errors[]` checks added |
| G4 Testability | **PASS** | 0 Critical; unfalsifiable/contradictory assertions removed |
| G5 Data Validity | **PASS** | `@td()` 11/11 (029), 10/10 (030); no bare GUIDs; DV-021 clean |
| G6 Coverage | **WARN** | `BL-*` mapping 100%; BL-audit left **0 CONTRADICTORY**. Warn: 7 REQ-001 traceability gaps (below) |
| G7 Duplication | **PASS** | 1 DUP-004 (CART-109) deliberately preserved — pairwise matrix independence |
| G8 Environment | **PASS** | 0 pages BROKEN; all `POST /graphql` 200, no `errors[]` |
| G9 Sync | SKIP | Phase 2 not run |

## Remaining items

### Must fix — none blocking regression

### Should fix
| Item | Detail |
|------|--------|
| 7 × REQ-001 (CART-019/020/021/025/040/042/048) | No originating ticket exists. 8+ targeted JQL queries found none — these are coverage-gap-generated, not ticket-driven. **Not auto-fixable by design** (`review-criteria.md`); the `smoke-baseline` placeholder is reserved for infrastructure/smoke cases, not P1 functional ones. Needs a decision: accept as permanent, or adopt a documented placeholder convention for gap-generated regression cases. |
| `configurable-products.csv` CFG-001 drift | Documents the old section name, "all sections optional", and stale option prices (Black $10 vs observed $2.00). Test-data fixture drift — owned by `test-data-engineer`, not a test-case edit. |
| CART-044/076 refresh half unverified | The admin price mutation was correctly skipped as ADMIN-DESTRUCTIVE on a shared fixture. Needs a disposable fixture to verify end-to-end (also the re-audit trigger for BL-PRICE-009). |
| CART-100 unverified | Anonymous → register → email-verify → sign-in merge; out of budget. |
| **Firefox unusable for cart suites** | `browser_click` fails with `TimeoutError … visible, enabled and stable` on sign-in, PDP stepper, and clear-cart; `browser_type` works. Broader than the known payment-dropdown quirk. Phase 5 completed on `playwright-edge`. Affects any cart/merge lane assigned to Firefox. |

### Out of scope, observed
- `npm run td:validate` exits 1 on a **pre-existing** failure in `036-bopis-store-selector.csv` (17/22 refs) — untouched by this run.
- Console 404s for missing images on AGENT-TEST fixtures (`QA-LOW-001`, `AGENT-TEST-CFG-*`) — seed-data gap, not a defect; a case asserting "no console errors" at all would false-fail on any seeded-fixture page.

## Files Modified
- `regression/suites/Frontend/cart/029-cart-validation-persistence.csv` — 34 rows intact; BL/reference/assertion corrections + 6 Phase-5 rewrites
- `regression/suites/Frontend/cart/030-cart-merge.csv` — 18 rows intact; BL/reference corrections + configurable fixture-drift corrections
- `.claude/knowledge/oracles/business-logic.md` — BL-CART-001 (DRIFT), BL-CART-008 (+coupon clause)
- `reports/knowledge/BL-AUDIT-2026-07-27.md`, `reports/ba/bl-proposals-2026-07-27.md`
- Evidence: `screenshots/` (4)

`config/test-suites.json` unchanged (counts stable at 34/18). Uncommitted edits to `regression/suites/Frontend/smoke/SMOKE-*.md` belong to a **different** session (suite 042) and were deliberately left untouched.

## Next Steps
- [ ] Decide the REQ-001 policy for gap-generated regression cases (only item gating a clean G6)
- [ ] Route `configurable-products.csv` CFG-001 drift to `test-data-engineer`
- [ ] Re-run CART-047 to settle the confounded oversell-block clause of BL-CART-001
- [ ] `/qa-regression 029,030` — **not on a Firefox lane**
- [ ] Review `reports/ba/bl-proposals-2026-07-27.md` (2 held invariants)
