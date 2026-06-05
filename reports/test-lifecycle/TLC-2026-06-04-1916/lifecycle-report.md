# Test Case Lifecycle Report — TLC-2026-06-04-1916

## Summary
- **Input:** VCST-5009 "Extend Skyflow with AllowCartPayment" (JIRA → PRs vc-frontend#2308 + vc-module-skyflow#23)
- **Input Type:** change-source
- **Date:** 2026-06-04 19:16–21:30
- **Platform:** 3.1032.0 | **Theme:** 2.51.0-pr-2308-219c | **Skyflow:** 3.1002.0-pr-23-5a1b (both PR artifacts deployed to vcst-qa, PRs open)
- **Verdict:** **APPROVED WITH WARNINGS**

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 9 suites affected; GraphQL schema refreshed; no duplicate TLC run |
| 2. Sync | test-management-specialist | Done | 13 STALE/INCOMPLETE synced, 6 VALID minor-updated, 0 deprecated |
| 3. Analyze & Generate | test-management-specialist | Done | 7 gaps (G-1..G-7) + 2 user-requested decline cases → 10 new cases |
| 4. Review & Fix | test-management-specialist | Done | 2 Blocker + 1 Critical + 5 High findings — all fixed |
| 5. Verify | qa-testing-expert (playwright-edge¹) | Done | 6/6 targets VERIFIED + decline CVVs live-proven; 0 CHANGED/BROKEN |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Gates: 7 PASS, 2 WARN |

¹ Deliberate firefox→edge deviation: known playwright-firefox /cart payment-dropdown stability quirk sits on this exact surface.

## Change Inventory
| Module | Layer | Change | Test impact |
|--------|-------|--------|-------------|
| vc-module-skyflow (PR #23) | Backend C# | `AllowCartPayment => true`; safe `is PaymentIn` cast | Old redirect-flow cases stale |
| vc-frontend (PR #2308) | Storefront Vue | payment.vue gateway renders Skyflow on cart; `initializeCartPayment` routing; processor register/cleanup | New cart-embedded flow; CyberSource unmount cleanup |
| xAPI (via module) | GraphQL | New `PaymentMethodType.allowCartPayment` field; `initializeCartPayment` now serves Skyflow | Zero prior GraphQL payment-mutation coverage |

## Sync Results (18 rows — see specialist table for full before/after)
- **040**: PAY-SKY-001..009 + PAY-SKTOK-001 rewritten to cart-embedded flow; PAY-SWITCH-001 enriched (bidirectional switch); PAY-SAVED-001 minor. Order-context /checkout/payment cases preserved (still legitimate for decline-retry + /account/orders pay).
- **043**: GA-025 — Skyflow removed from redirect-processor list.
- **048b**: 4 LAYOUT-*-PAYMENT-001 scope notes (use AN/Datatrans to reach /checkout/payment).
- **080**: FRR-037 rewritten; env-var card refs → `@td(SKYFLOW_MC.*)`.
- **011/039/041/042**: touch-checked VALID, no changes needed.

## New Cases Generated (10)
| Case | Suite | Priority | Validation |
|------|-------|----------|------------|
| CART-PAY-GQL-001 initializeCartPayment happy path | 050c | Critical | Runner **PASS 11/11** |
| CART-PAY-GQL-002 invalid IDs → errors[], no 500 | 050c | High | Runner **PASS 2/2** |
| CART-PAY-GQL-003 allowCartPayment=true exposure | 050c | Critical | Runner **PASS 8/8** |
| PAY-SKY-010 inline form + cross-layer API check | 040 | Critical | Phase 5 VERIFIED |
| PAY-SKY-011 processor switch onUnmounted cleanup | 040 | Critical | Phase 5 VERIFIED |
| PAY-SKY-012 order-context payment (`Pay now`) | 040 | High | Phase 5 VERIFIED (18 unpaid orders available) |
| PAY-SKY-013 processor decline CVV 902 | 040 | High | **LIVE-VERIFIED** (decline code 65, CO260604-00009) → Reviewed |
| PAY-SKY-014 decline CVV 904 → retry → same order | 040 | High | **LIVE-VERIFIED** (CO260604-00010) → Reviewed |
| GA-032 purchase event, cart flow (renumbered from GA-027 — ID collision with existing case) | 043 | High | Draft |
| GA-033 add_payment_info stale values (F6 / VCST-5198) (renumbered from GA-028 — ID collision) | 043 | P2 | Draft — **currently fails by design** until VCST-5198 fixed |

## Live Verification Highlights (Phase 5)
- Exact labels recorded and applied to all cases: `Bank card (Skyflow)`, `Place order`, `Pay now`, `Select credit card`, fields Card number / Cardholder name / Expiration date (MM / YY) / Security code; iframe js.skyflow.com/v2.7.7; GA queue = `dataLayer`.
- **Decline CVVs live-proven:** 902 and 904 → `isSuccess:false` "declined (65)"; CVV 900 → success. Processor behind Skyflow = **Authorize.Net**.
- **Duplicate-transaction window:** immediate same-amount retry fails with "(11) E00027"; window resets per submit → ~3 min wait steps added to PAY-SKY-013/014. Sandbox artifact, not a bug.
- Ghost-order checks PASS: 3–4 attempts per round, exactly 1 order each.

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 2 Blockers found in review, both fixed (td-wildcard prose, sku→slug) |
| G2 Determinism | PASS | Critical assertion-shape fix applied (GQL-002 null-on-error); fresh-cart + duplicate-window waits encoded |
| G3 Completeness | PASS | All synced/new cases have preconditions/assertions/failure signals/cleanup |
| G4 Testability | PASS | Live-verified labels; falsifiable assertions |
| G5 Data Validity | PASS | validate-td-refs: 2,201 refs, 0 failures; 3 GQL cases runner-PASS live |
| G6 Coverage | PASS | All 7 gaps covered; BL-CHK-002/004/006, BL-ORD-001/006 traced |
| G7 Duplication | **WARN** | PAY-SKY-006 (smoke) vs PAY-SKY-010 (cross-layer) deliberate overlap — review post-merge |
| G8 Environment | PASS | 6/6 VERIFIED + 2 decline rounds; console clean (1 known benign 404) |
| G9 Sync | PASS | All STALE updated, 0 BROKEN, 0 deprecated |

## Remaining Items
### Should Fix (non-blocking)
| Item | Detail |
|------|--------|
| ~~GA-033 JIRA ref~~ | DONE 2026-06-04: **VCST-5198** filed (second-source repro confirmed) and linked in GA-033 References |
| ~~graphql-schema.md snapshot~~ | DONE 2026-06-04: introspection list extended (+10 payment types, 46 total); `allowCartPayment` now captured |
| PAY-SKY-006 vs 010 overlap | Decide keep-both (smoke vs cross-layer) or merge after VCST-5009 merges |
| GA-032/033, PAY-SKY-010/011/012 | Draft → Reviewed after first regression execution (PAY-SKY-013/014 already Reviewed via live decline verification) |
| Pre-existing 040 duplicate IDs | PAY-DT-001/002/003 are duplicated in committed 040 (predates this run) — needs deliberate dedup/renumber pass |

## Files Modified
- `regression/suites/Frontend/payment/040-payment-processors.csv` (12 synced + 5 new + decline-verification updates)
- `regression/suites/Frontend/cross-cutting/043-google-analytics.csv` (GA-025 + GA-032/033)
- `regression/suites/Frontend/cross-cutting/048b-layout-stability.csv` (4 scope notes)
- `regression/suites/_release/080-full-regression-release.csv` (FRR-037)
- `regression/suites/Backend/graphql/050c-graphql-xorder.csv` (3 new GQL cases)
- `config/test-suites.json` (testCount: 040=36, 043=33¹, 050c=7) — ¹also fixed pre-existing manifest drift (24→31 before this run)

## Next Steps
- [ ] Run `/qa-regression payment` (or `040,043,050c`) once VCST-5009 PRs merge to confirm the synced suite is green
- [x] File the F6 GA4 bug via `/qa-bug` and link in GA-028 → **VCST-5198**, linked in GA-033
- [ ] Review PAY-SKY-006/010 overlap decision

## Post-run note (2026-06-05)
This report file was deleted from disk by a subagent cleanup before being committed and was restored from session context on 2026-06-05. Subsequent same-scope updates not in the original report: PAY-SKY-015 added (per-brand CVV sentinel, VCST-5202, dry-run verified → Reviewed; 040 testCount → 37); Skyflow rows in test-cards.csv reformatted to MM/YY; PAY-SKY-013/014 NAV steps gained delivery-method + conditional saved-cards clauses.
