# Test Case Lifecycle Report — TLC-2026-06-24-1642

## Summary
- **Input:** VCST-5135 ("[Loyalty] Product Points Program")
- **Input Type:** change-source (JIRA Story, status Testing; impl vc-module-loyalty#10)
- **Date:** 2026-06-24 16:42
- **Platform:** 3.1039.0 · **Theme:** 2.52.0-pr-2335 · **Loyalty:** 3.1004.0-pr-10
- **Verdict:** **NEEDS FIXES** (behavior confirmed working live; generated cases use the wrong oracle)

## Phase Results
| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | Suites 075 (primary), 083 (secondary); ProductPoints earning |
| 2. Sync | test-management-specialist | Done | LOY-026..030 all VALID, 0 stale |
| 3. Generate | test-management-specialist | Done | 7 gaps → LOY-031..037 |
| 4. Review | test-management-specialist | Done | 7-dim PASS; 1 Blocker auto-fixed (hardcoded GUID); validate green |
| 5. Verify | orchestrator (canonical graphql-runner — runner-native GraphQL, no browser) | Done | **1/7 executed → FAIL on oracle; earning confirmed via correct oracle** |
| 6. Approve | orchestrator | **NEEDS FIXES** | G-coverage strong; G8 environment fails as authored |

## Change Inventory
| Module | Layer | Breaking | New Feature |
|--------|-------|----------|-------------|
| Loyalty (3.1004.0-pr-10) | xAPI / storefront | No | ProductPoints program — earn points per product (factor × price) |

## Generated Cases (075-loyalty.csv, Draft)
| ID | Title | Gap | Priority | Oracle as authored |
|----|-------|-----|----------|--------------------|
| LOY-031 | All-customers single-SKU earning (happy path) | G1 | Critical | `products().loyaltyPoints` ❌ |
| LOY-032 | Multi-SKU distinct per-product factors | G2 | High | `products().loyaltyPoints` ❌ |
| LOY-033 | Future-window does not grant before start | G3 | High | `products().loyaltyPoints` ❌ |
| LOY-034 | Expired-window does not grant after end | G4 | High | `products().loyaltyPoints` ❌ |
| LOY-035 | Inactive-with-factors gate | G5 | High | `products().loyaltyPoints` ❌ |
| LOY-036 | Priority stacking (observe-and-record) | G6 | High | `products().loyaltyPoints` ❌ |
| LOY-037 | Zero-factor BVA | G7 | Medium | `products().loyaltyPoints` ❌ |

## Phase 5 — Live Verification (the decisive finding)
Verified via the canonical `scripts/graphql-runner.ts` against vcst-qa (these are runner-native GraphQL cases, so the runner — not a browser — is the correct Phase-5 tool).

**LOY-031 result: FAIL (3/5 assertions).** Product resolves (`code=LT-001`) but `products().loyaltyPoints.amount = undefined`.

**Root cause (probed and confirmed):**
- Factor IS seeded: `loyalty-program-product-factors/search` → LT-001 factor=500 on `LOY_PP_ALL`. ✓
- Loyalty IS enabled: store B2B-store `{loyaltyEnabled:true, loyaltyMode:"Mixed Cart", loyaltyCurrency:"PTS"}`. ✓
- `product.loyaltyPoints` is the **Loyalty Store (point-pricing)** field — it stays null in **Mixed Cart** mode.
- Earned points materialize on the **cart line item**. Live probe: clearCart → addItem(LT-001) → `cart.items[0].loyaltyPoints = {amount: 1298690, currency: PTS}` and `cart.loyaltyPoints = 1298690 PTS`. **Earning works.** ✓
- This matches the **verified** oracle in `075b-loyalty-mixed-cart-order.csv` (VCST-5104): `cart.items[?currencyCode=USD].loyaltyPoints.amount > 0`.

**Why the cases were wrong:** they followed existing case **LOY-029** (`products(){ loyaltyPoints }`), which is itself `Draft`/unverified and carries the same latent oracle error.

**Bonus behavioral facts discovered (feed assertion design):**
- `factor` is a **price multiplier** (500 × ~$2,597.38 = 1,298,690 PTS), not flat points-per-unit → assert `amount > 0` / relative ordering, not absolute counts.
- On LT-001 (covered by LOY_PP_ALL pri 10 **and** LOY_PP_PRIORITY pri 100), only the **priority-10 / factor-500** program applied → no stacking; lower priority number wins. (Confirms LOY-036's observe-and-record was correct; the effective rule can now be pinned.)

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 15 cols, IDs unique, parses |
| G2 Determinism | PASS | runner-native tags only |
| G3 Completeness | PASS | preconditions, errors[]/data assertions, failure signals |
| G4 Testability | PASS | concrete predicates |
| G5 Data Validity | PASS | 1 blocker auto-fixed (GUID→`@td(VIRTUAL_CATALOG_B2B.id)`); validate 2998/2998, 0 bare GUIDs |
| G6 Coverage | PASS | BL-LOY-001 + ECL refs; 7 earning gaps covered |
| G7 Duplication | PASS | no overlap with LOY-026..030 |
| **G8 Environment** | **FAIL** | LOY-031 fails live — wrong oracle (`products().loyaltyPoints` null in Mixed Cart) |
| G9 Sync | PASS | LOY-026..030 VALID |

## Must Fix (blocks regression)
| Case(s) | Issue | Fix |
|---------|-------|-----|
| LOY-031..037 | Oracle returns null in Mixed Cart mode | Rework to the verified cart-line-item oracle: `[GQL-OP clearCart]` → `[GQL-OP addItem]` (productId via `@td`) → query `cart(... userId){ items{ sku loyaltyPoints{amount currency{code}} } }`; assert `items[?sku=…].loyaltyPoints.amount > 0` and `currency.code == PTS`. Use relative/`>0` assertions (factor is a price multiplier). Mirror `075b` patterns. |
| LOY-033/034/035 | Gating cases need an isolated user (no other eligible programs) to assert `amount == 0` | Provision a clean user OR keep observe-and-record; document. |

## Should Fix
| Item | Note |
|------|------|
| LOY-029 (existing) | Same latent `products().loyaltyPoints` oracle error — flag for rework when next touched (not edited this run). |
| Fixture gap | No `LOYALTY_WHOLESALE_USER` alias → wholesaler-group earning (LOY_PP_WHOLESALE) uncovered. Provision via `/qa-seed-data b2b` + alias. |
| LOY-037 | QA-OOS-001 may be filtered from `products()`/cart by stock visibility — confirm before relying on it. |

## Files Modified (Phases 2–4, by specialist)
- `regression/suites/Backend/loyalty/075-loyalty.csv` — appended LOY-031..037; fixed 9 hardcoded GUIDs
- `config/test-suites.json` — suite 075 testCount 30→37, estimatedMinutes 22→28

## Next Steps
- [ ] Rework LOY-031..037 to the cart-line-item oracle (re-dispatch test-management-specialist) → re-verify via graphql-runner → re-gate G8
- [ ] Decide on LOY-029 rework + Wholesaler-user fixture
- [ ] After APPROVED: `/qa-regression loyalty`
