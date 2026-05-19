# Test Case Lifecycle Report — TLC-2026-05-15-2316

## Summary

| Field | Value |
|---|---|
| **Input** | `050b2 review, fix — same migration-style pattern as 050a/050d` |
| **Input Type** | direct-scope |
| **Date** | 2026-05-15 23:16 |
| **Platform** | 3.1026.0 |
| **Theme** | vc-theme-b2b-vue-2.49.0-alpha.2342 |
| **Relevant modules** | XCart (xAPI GraphQL), Marketing (Coupons) |
| **Suite scope** | 050b2 — GraphQL xCart Item Selection & Coupons (14 cases, 9 modified) |
| **Phases run** | 1 (Scope) → 4 (Review & Fix) → 5 (Verify) → 6 (Approve) — Phases 2/3 skipped per direct-scope mode |
| **Verdict** | **APPROVED WITH WARNINGS** (1 residual env-data failure on CRI-GQL-090) |

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 14 cases, 8 failing pre-fix |
| 2. Sync | — | Skipped | Direct-scope |
| 3. Analyze & Generate | — | Skipped | Migration only |
| 4. Review & Fix | test-management-specialist | Done | 9 cases edited across 4 fix categories |
| 5. Verify | qa-backend-expert | Done | **11P / 1F / 2SKIP — 78.6% (+57.2pp)** |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 8/9 applicable gates pass; G8 warns due to 1 env-data fail |

## Phase 4 — Fixes by category

### Category 1 — Capture chain (4 cases) — root cause: `addItem` returns `items: []` due to eventual consistency

**Fix**: capture LINE_ITEM_ID from `unSelectAllCartItems` mutation response (synchronous) instead of `addItem` (async-settled) or follow-up cart() query (also stale).

| Case | Fix |
|---|---|
| CRI-GQL-061 | Capture via unSelectAllCartItems; assert `selectedForCheckout` flag roundtrip |
| CRI-GQL-062 | Same capture pattern; selectCartItems re-selects |
| CRI-GQL-063 | Same; switch product to `@td(BUYABLE_NO_MIN_QTY.id)`; assert `items[?id=REAL_LINE_ID].selectedForCheckout=true` |
| CRI-GQL-064 | Same; assert idempotent re-selection |

### Category 2 — Assertion overspecification (3 cases) — root cause: `itemsCount=2` was env-fragile

**Fix**: switch to single product + `subTotal.amount` arithmetic invariants (zero/non-zero) rather than itemsCount counts.

| Case | Fix |
|---|---|
| CRI-GQL-061 | Replaced itemsCount=2 with selectedForCheckout flag assertions |
| CRI-GQL-065 | Single product; assert `unSelectAllCartItems.subTotal.amount=0` |
| CRI-GQL-066 | Single product; assert `selectAllCartItems.subTotal.amount=100` |

### Category 3 — Test-data setup (2 cases)

| Case | Fix |
|---|---|
| CRI-GQL-057 | `countryCode: "US"` → `"USA"` (ISO-3 per `reference_address_data_conventions`); added `organizationId` from `me.contact`; `currencyCode`/`cultureName` on all mutations |
| CRI-GQL-090 | Added `addItem` pre-step so `validateCoupon` runs against non-empty cart; single-line Test_Data (multi-line caused DV-SYNTAX); cultureName added. **Residual FAIL**: QA10OFF coupon inactive in env (see Manual Items). |

### Category 4 — Missing assertion (1 case)

| Case | Fix |
|---|---|
| CRI-GQL-067 | Added full BL-CHK-001 enforcement chain: `unSelectAllCartItems` → `createOrderFromCart` → `[ERRORS label=create_order] errors[] non-empty` |

## Phase 5 — Verification Results

| Metric | Pre-fix (REG-20260515-2309) | Post-fix (TLC-2026-05-15-2316) | Δ |
|---|---|---|---|
| Passed | 3 | **11** | +8 |
| Failed | 8 | **1** | −7 |
| Skipped | 3 | 2 | −1 |
| Pass rate | 21.4% | **78.6%** | **+57.2pp** |

**Phase 4 predictions matched live verification case-by-case with zero deviations.**

### Notable confirmations

- **CRI-GQL-057** created a real B2B order (`CO260515-00022`) with `organizationId` correctly persisted from `me.contact.organizationId`.
- **CRI-GQL-067** correctly enforces **BL-CHK-001** — `createOrderFromCart` with all items unselected returns `errors[] non-empty` (no HTTP 500, no phantom order).
- **Runner predicate filters** (`items[?id=<GUID>].selectedForCheckout`) work as documented in `graphql-test-cases-runner.md`.
- **B2B-store line-item consolidation** confirmed real: same productId added twice → itemsCount=1 with doubled quantity (canonical mutation-response capture pattern handles this correctly).

## Residual issue — CRI-GQL-090 (environment data gap, NOT authoring debt)

`data.validateCoupon = false` (expected `true`). The **QA10OFF coupon code is not active on vcst-qa** at execution time. The runner contract is correct (errors[] empty, schema valid, happy-path setup ran). Same scenario passes structurally in CRI-GQL-068 (removeCoupon idempotent on inactive code).

**Resolution path**: invoke `/qa-seed-data` (marketing fixture) to provision a live `COUPON_10PCT`-aliased active coupon. Not blocking — assert authoring is correct.

## Manual Items (not auto-fixable, by design)

| Case | Why |
|---|---|
| CRI-GQL-056 | `[MANUAL-BLOCKED]` — needs `createAnonymousOrderEnabled=true` + runner anonymous-session support |
| CRI-GQL-058 | `[MANUAL-BLOCKED]` — needs second-org user inline alias in `test-data/aliases.json` |
| CRI-GQL-090 | Env data gap — QA10OFF coupon needs re-seeding via `/qa-seed-data` |

## Quality Gates

| Gate | Status | Details |
|---|---|---|
| G1: Structure | ✅ PASS | 15-column CSV; 14 rows; no dup IDs |
| G2: Determinism | ✅ PASS | All runner-native cases use balanced `[GQL-OP/EXEC/CAPTURE]` labels (lint clean) |
| G3: Completeness | ✅ PASS | All happy paths have `[ERRORS label=X] errors[] empty`; CRI-GQL-067 now has assertion (was empty) |
| G4: Testability | ✅ PASS | Predicate-based; mutation-response captures eliminate eventual-consistency races |
| G5: Data Validity | ✅ PASS | All cases schema-validate (DV-006..011 clean); `@td(BUYABLE_NO_MIN_QTY.id)` used for buyable product |
| G6: BL/ECL Coverage | ✅ PASS | BL-CART-*, BL-CHK-001, BL-CROSS-002 invariants preserved |
| G7: Duplication | ✅ PASS | No same-suite duplicates |
| G8: Environment | ⚠️ WARN | 11/14 PASS, 1 FAIL is env-data (QA10OFF coupon), 2 SKIPs are by-design `[MANUAL-BLOCKED]` |
| G9: Sync | — | Skipped (direct-scope) |

**8 PASS / 1 WARN — Verdict: APPROVED WITH WARNINGS.** WARN is environmental, not authoring.

## Files Modified

| File | Changes |
|---|---|
| `regression/suites/Backend/graphql/050b2-graphql-xcart-items.csv` | 9 case edits (057, 061, 062, 063, 064, 065, 066, 067, 090); Automation_Status → `synced`; References updated with TLC source note |

## Key Architectural Findings (worth memory entries)

1. **`addItem` mutation has async cart-projection settle** — `data.addItem.items[]` is empty immediately after add. Canonical capture pattern: follow-up mutation (e.g., `unSelectAllCartItems`) returns synchronously-consistent line item IDs.
2. **B2B-store line-item consolidation** — same productId added twice merges into one line item with summed quantity. `itemsCount` is the wrong assertion target for multi-add scenarios; use `subTotal.amount` arithmetic instead.
3. **Multi-line `Test_Data` corrupts GQL body parsing** — keep `@td()` resolvers single-line; move literal constants inline to the GQL body.
4. **Product `f1b26974...` (laptop) has Inventory status=Disabled for ORG_USER** — `addItem` silently no-ops with `itemsCount=0` and no error (per `feedback_xapi_additem_silent_disabled` memory). Use `@td(BUYABLE_NO_MIN_QTY.id)` for reliable cart fixture.

## Next Steps

- [ ] **`/qa-seed-data` marketing** — provision active QA10OFF coupon, then re-run CRI-GQL-090
- [ ] **qa-lead-orchestrator** — promote modified cases (057, 061-067, 090) from `synced` → `Automated`
- [ ] Consider memory entry for **`addItem` async settle pattern** — canonical capture from synchronous mutation response, not addItem response or cart() query
- [ ] Run `/qa-regression 050b2` after coupon re-seed for ≥85% pass rate

## Active runs untouched

`REG-20260515-1438` (sprint:26-09 autonomous) and all prior regression runs today — no modifications outside suite 050b2.
