# Test Case Lifecycle Report — TLC-2026-06-15-1817

## Summary
- **Input:** VCST-5162
- **Input Type:** change-source (JIRA ticket → linked PR vc-frontend #2309)
- **Date:** 2026-06-15 18:17
- **Platform:** 3.1037.0
- **Theme:** vc-theme-b2b-vue 2.51.0-pr-2315-3425
- **Module Versions:** VirtoCommerce.AuthorizeNetPayment 3.1002.0 · VirtoCommerce.Payment 3.1003.0 · VirtoCommerce.Skyflow 3.1003.0 · VirtoCommerce.Xapi 3.1010.0
- **Scope:** suite **040b** (Payment — Authorize.Net)
- **Verdict:** ✅ **APPROVED WITH WARNINGS**

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 suite (040b); PR #2309 = 6 files (storefront Vue/TS); duplicate check clean (today's TLC runs were VCST-5028, no 040b overlap) |
| 2. Sync | test-management-specialist | Done | 3 cases updated (PAY-AN-010/018/019); 9 deprecated confirmed; bug `BUG-AN-cart-no-client-card-validation` marked resolved |
| 3. Analyze & Generate | test-management-specialist | Done | 1 gap → 1 case generated (PAY-AN-020, BVA expiry boundary) |
| 4. Review & Fix | test-management-specialist | Done | 6 auto-fixes / 3 cases; 4 manual items (3 resolved by orchestrator) |
| 5. Verify | qa-testing-expert (playwright-edge) | Done | 5/6 VERIFIED, 1 CHANGED (PAY-AN-020 — corrected); 0 BROKEN/BLOCKED |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Required gates 9/9 PASS |

## Change Inventory

| File | Layer | Change | Breaking | New behavior |
|------|-------|--------|----------|--------------|
| `payment.vue` | storefront | Wires `PaymentProcessingAuthorizeNet` on `AuthorizeNetPaymentMethod` | No | AN form on cart-payment surface |
| `payment-processing-authorize-net.vue` | storefront | cart vs order init, processor register/teardown guards, tokenize/pay split, GA4 skip on cart | No | `initializeCartPayment` cart path |
| `bank-card-form.vue` | storefront | `isExpirationDateValid` "not-expired" test gating Create order | No | Expired date now blocks order client-side |
| `useCheckout.ts` | storefront | `finalizePayment` gated on `allowCartPayment` | No | Stale processor can't charge |
| `useAuthorizeNet.ts` | storefront | `dispatchData` re-throws sync failures | No | No hung tokenization promise |
| GraphQL contract | xAPI (consumed) | New `initializeCartPayment(cartId,paymentId)` mutation used | No (additive) | Cart-context payment init |

## Sync Results

| Case ID | Classification | Action | Before → After |
|---------|---------------|--------|----------------|
| PAY-AN-010 | STALE → updated | Enriched | + Cross-layer `[NETWORK] initializeCartPayment (not initializePayment)` + wrong-mutation failure signal |
| PAY-AN-018 | STALE → updated | Preconditions corrected | "ghost order workaround (BUG-AN-cart-no-client-card-validation)" → "verifies client-side form state by design"; bug marked resolved |
| PAY-AN-019 | STALE → updated | Expectation flipped | "expired-date CURRENTLY FAILING (known bug)" → "FIXED by #2309; expired-date rejected, Create order gated"; failure signal KNOWN → REGRESSION |
| PAY-AN-001…009 | VALID (deprecated) | None | Old redirect flow — remain deprecated |
| PAY-AN-011/012/013/014/015/016/017 | VALID | None | Already aligned with #2309 (incl. GA4-by-useCheckout, method-switch guard, multistep survival) |

## Coverage Delta

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total rows | 19 | 20 | +1 |
| Active (non-deprecated) | 10 | 11 | +1 |
| Reviewed | 10 | 10 | 0 |
| Draft | 0 | 1 | +1 (PAY-AN-020) |
| `@td()` refs resolved | — | 63/63 | clean |

## New Cases Generated

| Case ID | Title | Layer | Priority | Status |
|---------|-------|-------|----------|--------|
| PAY-AN-020 | BVA: Partial Expiry Year (1-digit) shows Length error; Full 2-digit Expired Year shows Expiry error (validation-only) | Storefront | High | Draft |

## Context7 Documentation Findings

| Topic Queried | Finding | Cases Influenced |
|---------------|---------|------------------|
| `/virtocommerce/vc-docs` — AllowCartPayment / initializeCartPayment | Docs cover `initializePayment` (order) + `addOrUpdateCartPayment`, but **`initializeCartPayment` is not yet documented** (docs lag #2309). Validated the cart path at the network layer instead of authoring a GraphQL-schema case. | PAY-AN-010 (network assertion only) |

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 15 cols, 20 rows, 0 malformed, no dup IDs |
| G2 Determinism | PASS | Tagged steps, specific elements; auto-fixes applied |
| G3 Completeness | PASS | errors/failure-signals/cleanup present; ≤3 High |
| G4 Testability | PASS | Falsifiable assertions |
| G5 Data Validity | PASS | 63/63 `@td()` resolve; no hardcoded cards/URLs/creds |
| G6 Coverage (BL) | PASS | Active cases carry BL-PAY-001 / BL-CHK-004 refs (>80%) |
| G7 Duplication | PASS | No same-layer duplicates (cart-init network folded into PAY-AN-010, not a new case) |
| G8 Environment | PASS | Phase 5: 0 BROKEN; 1 CHANGED corrected in-run |
| G9 Sync | PASS | All STALE updated; no BROKEN cases |

## Environment Verification (Phase 5 — playwright-edge, vcst-qa)

**Verdict: PR #2309 is LIVE on vcst-qa.**

| Target | Case | Result | Evidence |
|--------|------|--------|----------|
| Cart-inline render | PAY-AN-010 | VERIFIED | URL stays `/cart`; AN card form renders inline; AcceptCore.js 200 |
| init mutation | PAY-AN-010 | VERIFIED | GraphQL `InitializeCartPayment` (`cartId`+`paymentId`), NOT `initializePayment`; GA4 `add_payment_info` fired |
| Expired-date gate | PAY-AN-019 | VERIFIED | `01/20` → inline "Expiration date must be in the future"; Place order disabled; no ghost order |
| Partial-year boundary | PAY-AN-020 | CHANGED → **corrected** | 1-digit year shows "Year must be exactly 2 characters" (length rule), not no-error; button disabled. Case expected-result updated to match. |
| Valid clean fill | PAY-AN-018 | VERIFIED | Valid data → no false errors; Place order enabled (not clicked) |
| Console baseline | — | VERIFIED (clean) | Only benign product-image 404s; no JS exceptions |

No order placed, no charge made.

## Remaining Items

### Must Fix (blocks regression)
_None._

### Should Fix (improves quality)
| Item | Notes |
|------|-------|
| PAY-AN-020 `Draft` → `Reviewed` | New case awaiting peer-review promotion gate (run `/qa-review-tests file 040b` then qa-lead approval). |
| PAY-AN-015 automation status | Accept.js CDN-block step needs DevTools URL-block; flag as semi-automated when promoting. |

## Files Modified
- `regression/suites/Frontend/payment/040b-payment-authorizenet.csv` — 3 synced + 1 new case (PAY-AN-020) + Phase-5 correction
- `config/test-suites.json` — 040b `testCount` 19 → 20

## Environment Note (not a feature defect)
Deep-link page loads (e.g. `/account/login`) returned a blank page + 404 on the hashed JS bundle — the documented stale-MCP-cache / index-mismatch quirk (`feedback_mcp_browser_cache`). Worked around by loading `/` then navigating in-app. **Recommend a Playwright-MCP cache clear before the next deep-link-driven run.**

## Next Steps
- [ ] Promote PAY-AN-020 Draft → Reviewed via `/qa-review-tests file regression/suites/Frontend/payment/040b-payment-authorizenet.csv`
- [ ] Run `/qa-regression 040b` (or `payment` group) — suite is APPROVED for execution
- [ ] No JIRA/env tickets required (PR #2309 verified live; no defects found)
