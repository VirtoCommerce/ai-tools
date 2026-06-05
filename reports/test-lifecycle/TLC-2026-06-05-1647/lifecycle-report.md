# Test Case Lifecycle Report — TLC-2026-06-05-1647

## Summary
- **Input:** VCST-5162 "Extend Authorize.NET with AllowCartPayment" (PRs vc-frontend#2309 + vc-module-authorize-net#12, both OPEN)
- **Input Type:** change-source · **Date:** 2026-06-05 16:47
- **Env:** vcst-qa @ Platform 3.1032.0, theme `2.51.0-pr-2309-ee26` (PR artifact), module `AuthorizeNetPayment 3.1001.0-pr-12-c821` (PR artifact)
- ⚠️ Deployed theme commit `ee2627ef` ≠ PR head `ba0bcf37` — stale-artifact caveat applies to the PAY-AN-012 deviation below
- **Verdict:** **APPROVED WITH WARNINGS**

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 5 suites affected; Skyflow twin TLC-2026-06-04-1916 used as precedent |
| 2. Sync | test-management-specialist | Done | 9 deprecated (user-approved), 3 synced (GA-016, GA-025, ORD-018) |
| 3. Generate | test-management-specialist | Done | 9 new: PAY-AN-010..017 + CART-PAY-GQL-004 |
| 4. Review | test-management-specialist | Done | 0 blockers; 1 auto-fix; validate-td-refs 2255/2255 |
| 5. Verify | qa-testing-expert (edge) + graphql-runner | Done | 6 VERIFIED, 1 CHANGED, 1 env-blocked (multistep OFF) |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 8/9 gates PASS, G8 WARN |

## Sync Results
| Case ID | Classification | Action |
|---------|---------------|--------|
| PAY-AN-001..009 | STALE/BROKEN | Deprecated — encoded old "Place Order → /checkout/payment" redirect flow; superseded by PAY-AN-010..014 |
| GA-016 | INCOMPLETE | Undefined `{{TEST_CARD_AUTHORIZE_NET}}` → `@td(AUTHORIZENET_VISA.*)`; order-context flow kept |
| GA-025 | STALE | Authorize.Net removed from redirect-processor list; Datatrans is the only remaining redirect processor |
| ORD-018 | INCOMPLETE | Sync note: PR#12 transaction shape — Status=short enum, ResponseCode=code, Note=full text + Transaction ID |

## New Cases
| Case ID | Title (short) | Priority | Phase 5 result |
|---------|--------------|----------|----------------|
| PAY-AN-010 | Inline Accept.js form on /cart + cross-layer | Critical | **VERIFIED** (InitializeCartPayment PreparedForm, URL stays /cart, Pay Now hidden) |
| PAY-AN-011 | Method-switch guard AN→Manual no charge | Critical | **VERIFIED (partial)** — form unmounts, no tokenization after switch; Manual order completion not exercised (order cap) |
| PAY-AN-012 | Invalid card rejected inline | High | **CHANGED — see Deviation** |
| PAY-AN-013 | Empty fields block submission | High | Not executed (authored only) |
| PAY-AN-014 | Happy path cart-embedded → confirmation | Critical | **VERIFIED** — CO260605-00011, no redirect, PaymentIn PI260605-00011, cancelled ✓ |
| PAY-AN-015 | Accept.js load failure not stranding /cart | High | Not executed (needs DevTools URL block) |
| PAY-AN-016 | GA4 purchase fires exactly once | High | **VERIFIED** — single `en=purchase` network hit |
| PAY-AN-017 | Multistep: billing-step form survives unmount | Critical | **Env-blocked** — `checkout_multistep_enabled` OFF on vcst-qa (case carries BLOCKED-if-flag-off pre-check) |
| CART-PAY-GQL-004 | xAPI `allowCartPayment=true` for AuthorizeNetPaymentMethod | Critical | **PASS 8/8** via graphql-runner |

## Deviation (needs dev confirmation — NOT filed as bug)
**PAY-AN-012:** Luhn-invalid card produced **no inline field error**; Place Order **created order CO260605-00010** then **fell back to /checkout/payment** (no client tokenization attempted before redirect). Expected: inline error, no order, stay on /cart. Withheld from JIRA per second-source rule + the deployed theme (`ee2627ef`) not being the PR head (`ba0bcf37`). **Action:** confirm intent with PR author (Basil Kotov) / re-run on PR-head build. Both test orders cancelled via admin.

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1–G5 | PASS | Structure/determinism/completeness/testability/data validity clean; td-refs 2255/2255 |
| G6 Coverage | PASS | All new cases carry BL-PAY-001/004, BL-CHK-004, BL-ORD-001 + ECL refs |
| G7 Duplication | PASS | (pre-existing PAY-DT-001..003 duplication in 040 noted, out of scope) |
| G8 Environment | **WARN** | 0 BROKEN; 1 CHANGED (PAY-AN-012 deviation, stale-theme caveat) |
| G9 Sync | PASS | All stale cases addressed; deprecations user-approved |

## Files Modified
- `regression/suites/Frontend/payment/040-payment-processors.csv` (9 deprecated, 8 new; testCount 37→36)
- `regression/suites/Backend/graphql/050c-graphql-xorder.csv` (+CART-PAY-GQL-004; testCount 7→8)
- `regression/suites/Frontend/cross-cutting/043-google-analytics.csv` (GA-016/GA-025 sync)
- `regression/suites/Backend/orders/018-orders-admin-payments.csv` (ORD-018 sync note)
- `config/test-suites.json` (testCounts)

Evidence: `reports/tickets/VCST-5162/screenshots/`, `reports/regression/graphql-evidence/CART-PAY-GQL-004-*.json`

## Next Steps
- [ ] Confirm PAY-AN-012 deviation with PR author (by-design fallback vs missing client validation); re-run PAY-AN-012 + PAY-AN-011 Manual-completion on PR-head build
- [ ] Promote PAY-AN-010/014/016 + CART-PAY-GQL-004 Draft→Reviewed (live-verified this run)
- [ ] PAY-AN-017 runnable only when multistep checkout is enabled (any env)
- [ ] CLAUDE.md "Payment flow" note is stale (Skyflow released 3.1002.0 + AN PR deployed both embed on cart) — update proposed
- [ ] Run `/qa-regression 040` after PR merge + redeploy
