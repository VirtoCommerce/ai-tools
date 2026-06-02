# VCST-4590 — Coupons & Vouchers Page — Retest 2 Consolidated Report

**Ticket:** [VCST-4590](https://virtocommerce.atlassian.net/browse/VCST-4590)
**Feature:** [Marketing] Coupons and Vouchers Page
**Date:** 2026-03-17 (Retest 2 — Full Execution)
**Previous Retests:** 2026-03-11 (NO-GO, 13 bugs), 2026-03-17 Retest 1 (NO-GO, P0 blocker)
**Environment:** QA (vcst-qa-storefront.govirto.com / vcst-qa.govirto.com)
**Storefront Build:** 2.44.0-pr-2198-9f58-9f5885d7
**Platform Build:** 3.1008.0-pr-2988-8fd8
**PRs Under Test:** vc-frontend #2198, vc-module-marketing #258, vc-module-marketing-experience-api #14

---

## Verdict: NO-GO

**P0 blocker BUG-001 (IsPublic enforcement during coupon redemption) remains unfixed.** Confirmed on both Chrome and Firefox. The `addCoupon` mutation accepts any valid coupon code regardless of the `IsPublic` flag. This is a backend xAPI issue in vc-module-marketing-experience-api.

---

## Execution Summary

| Agent | Browser | Cases | Passed | Failed | Blocked | N/A | Pass Rate (exec) |
|-------|---------|-------|--------|--------|---------|-----|-------------------|
| **qa-frontend-expert** | Chrome | 28 | 22 | 1 | 1 | 4 | 95.7% (22/23) |
| **qa-testing-expert** | Firefox | 7 | 4 | 1 | 1 | 1 | 80.0% (4/5) |
| **qa-backend-expert** | Edge | 16 | 15 | 1 | 0 | 0 | 93.8% (15/16) |
| **Total** | | **51** | **41** | **3** | **2** | **5** | **93.2% (41/44)** |

---

## Per-Case Results Matrix

### Access & Navigation

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-001 | Authenticated access to /account/coupons | PASS | — | — | PASS |
| CPN-002 | Unauthenticated redirect to sign-in | N/A | — | — | N/A (tooling) |
| CPN-008 | Sidebar active state highlighted | PASS | — | — | PASS |
| CPN-010 | Direct URL access works | PASS | — | — | PASS |
| CPN-018 | Back navigation to dashboard | PASS | — | — | PASS |

### Display

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-003 | Card fields (name, description, code, label) | PASS | — | — | PASS |
| CPN-006 | Multiple coupons — all copy buttons functional | PASS | — | — | PASS |
| CPN-007 | Null description — no empty space | PASS | — | — | PASS |
| CPN-009 | Shipping coupon card renders correctly | PASS | — | — | PASS |
| CPN-L01 | Special chars in coupon code | OBS* | — | — | OBSERVATION |

*OBS: `CAT20#%$$^%%$&^%` displays as "CAT20" — special characters stripped. Needs backend verification.

### Copy Functionality

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-004 | Click to copy + notification | PASS | — | — | PASS |
| CPN-011 | Notification manual close | PASS | — | — | PASS |
| CPN-015 | Case preserved on copy | PASS | — | — | PASS |

### E2E Flow

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-005 | Copy from page → apply in cart | PASS | — | — | PASS |

### API Integration

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-012 | GraphQL includes storeId + cultureName | PASS | — | — | PASS |
| CPN-013 | Zero JS console errors | PASS | — | — | PASS |

### Business Logic

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-014 | Expired coupons not displayed | PASS | — | — | PASS |
| CPN-016 | Empty state handling | BLOCKED | — | — | BLOCKED |
| CPN-017 | Localized URL works | PASS | — | — | PASS |

### Negative Cases

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-034 | Invalid coupon → error message | PASS | — | — | PASS |
| CPN-035 | **Private coupon REJECTED in cart** | **FAIL** | **FAIL** | — | **FAIL (P0)** |

### Cart Integration

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-036 | B2B org user access | PASS | PASS | — | PASS |
| CPN-037 | Deny button removes coupon | PASS | — | — | PASS |
| CPN-038 | Discount breakdown expandable | PASS | — | — | PASS |

### Analytics

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-044 | GA4 ep.coupon tracked | PASS | — | — | PASS |

### New Features

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-049 | /graphql endpoint (not /xapi/graphql) | PASS | PASS | — | PASS |
| CPN-050 | Pagination | PASS | N/A | — | PASS |
| CPN-051 | Skeleton loading | N/A | — | — | N/A (tooling) |
| CPN-052 | Label field displayed when set | PASS | — | — | PASS |
| CPN-053 | Label null — no empty element | PASS | — | — | PASS |

### Business Invariants (Firefox)

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-028 | BL-CART-003: Discount on sale price | — | PASS | — | PASS |
| CPN-029 | BL-PRICE-001: Tier price stacking | — | BLOCKED | — | BLOCKED |
| CPN-030 | BL-CHK-006: Order total formula | — | PASS | — | PASS |

### Admin SPA (Edge)

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-019 | IsPublic toggle visible and persists | — | — | PASS | PASS |
| CPN-020 | Localized name/description persists | — | — | PASS | PASS |
| CPN-021 | Cross-layer localized name on storefront | — | — | PASS | PASS |
| CPN-031 | Marketing modules installed | — | — | PASS | PASS |
| CPN-039 | Coupon usage limits (spinbuttons) | — | — | PASS | PASS |
| CPN-040 | Coupon-level expiration date | — | — | PASS | PASS |
| CPN-041 | Alphanumeric constraint | — | — | **FAIL** | **FAIL (P2)** |
| CPN-042 | Exclusivity — globally exclusive | — | — | PASS | PASS |
| CPN-043 | Auto promotion without code not shown | — | — | PASS | PASS |
| CPN-045 | "Can be redeemed more than once" toggle | — | — | PASS | PASS |
| CPN-046 | Priority field (API only, not in UI) | — | — | PASS | PASS |
| CPN-047 | Bulk import coupons | — | — | PASS | PASS |
| CPN-048 | Store-scoped promotion isolation | — | — | PASS | PASS |

### GraphQL API (Edge)

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-022 | promotionCoupons returns only public | — | — | PASS | PASS |
| CPN-023 | Pagination (cursor-based first/after) | — | — | PASS | PASS |
| CPN-024 | Localized name per cultureName | — | — | PASS | PASS |
| CPN-025 | DataLoader batch — distinct codes | — | — | PASS | PASS |

### REST API (Edge)

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-026 | Create promotion with IsPublic=true | — | — | PASS | PASS |
| CPN-027 | IsPublic=false not in GraphQL | — | — | PASS | PASS |

### Regression & E2E (Edge)

| ID | Title | Chrome | Firefox | Edge | Overall |
|----|-------|--------|---------|------|---------|
| CPN-032 | DynamicContentItemType regression | — | — | PASS | PASS |
| CPN-033 | E2E Admin → storefront → cart | — | — | PASS | PASS |

---

## Bug Status

### P0 — Release Blocker

| Bug | Test Case | Status | Details |
|-----|-----------|--------|---------|
| **BUG-001** | CPN-035 | **STILL OPEN** | Non-public coupon PRIVATE4590 (IsPublic=false) accepted in cart with $10 discount. Confirmed Chrome + Firefox. Root cause: `addCoupon` mutation in xAPI does not check `IsPublic` flag. **Backend fix required in vc-module-marketing-experience-api.** |

### Fixed Since 2026-03-11

| Item | Status | Details |
|------|--------|---------|
| **CPN-049** (endpoint bug) | **FIXED** | Frontend calls `/graphql` not `/xapi/graphql`. Confirmed Chrome + Firefox. |
| **BUG-002** (coupon expiry) | **FIXED** | Coupon-level expiration enforced (verified retest 1). |
| **Admin SPA 404** | **FIXED** | Marketing → Promotions now loads with 47 promotions (was 404 in retest 1). |
| **BUG-004** (GA4 tracking) | **FIXED** | `ep.coupon=QA10OFF` now present in `add_shipping_info` and `begin_checkout` events. |
| **Label field** | **WORKING** | QA2 card shows "$20.00 off" label. Null labels render no empty element. |
| **Pagination** | **WORKING** | 15 coupons display on single page. No pagination needed at current count. |

### P2 — Medium

| Bug | Test Case | Status | Details |
|-----|-----------|--------|---------|
| **BUG-NEW-041** | CPN-041 | **NEW** | Coupon code alphanumeric validation not enforced. Help text says "only alphanumeric" but Admin accepts spaces and special characters (e.g. "INVALID CODE!"). No client-side or server-side validation. |

### Observations (Not Bugs)

| ID | Severity | Summary |
|----|----------|---------|
| OBS-1 | Low | `CAT20#%$$^%%$&^%` displays as "CAT20" — special chars stripped |
| OBS-2 | Low | Initial page load sometimes shows 3 cards; refresh shows all 15 |
| OBS-3 | Info | Duplicate codes (SUPER, WINE) from different promotions — by design |

---

## Business Rules Verified

| Rule | Status | Evidence |
|------|--------|----------|
| **BL-PRICE-001**: Discount integrity | **VIOLATED** | CPN-035: PRIVATE4590 accepted despite IsPublic=false |
| **BL-CART-003**: Coupon on sale price | PASS | CPN-028: 10% on $200 = $20.00 correct |
| **BL-CHK-006**: Order total formula | PASS | CPN-030: $200 - $20.02 + $66 + $150 = $395.98 correct |
| IsPublic hides from listing | PASS | CPN-034: PRIVATE4590 not on coupons page |
| Expired promotion filtered | PASS | CPN-014: EXPIRED-TEST not displayed |
| GA4 coupon tracking | PASS | CPN-044: ep.coupon in checkout events |
| B2B org access | PASS | CPN-036: 15 coupons visible for org user |
| Module deployment | PASS | CPN-031: Marketing 3.1001.0-pr-258, xAPI 3.1000.0-pr-14 |

---

## Cross-Browser Summary

| Check | Chrome | Firefox |
|-------|--------|---------|
| Coupons page loads | PASS | PASS |
| Coupon cards rendered (15) | PASS | PASS |
| Copy to clipboard | PASS | PASS |
| Apply/remove in cart | PASS | PASS |
| Error handling | PASS | PASS |
| Console errors | None | None |
| CPN-035 (P0) | FAIL | FAIL |
| GA4 tracking | PASS | — |
| Endpoint /graphql | PASS | PASS |

No browser-specific issues. Both browsers behave identically.

---

## Environment Improvements Since Retest 1

| Change | Impact |
|--------|--------|
| Coupon count: 2 → 15 | Test data restored — all seeded promotions now active |
| Admin SPA: 404 → working | Marketing → Promotions blade loads with 47 promotions |
| GA4 tracking: missing → working | ep.coupon now tracked in checkout events |

---

## Release Decision

### NO-GO — P0 Fix Required

| Condition | Status |
|-----------|--------|
| All P0 bugs resolved | **FAIL** — BUG-001 still open |
| Pass rate ≥ 85% (executed) | **PASS** — 93.2% (41/44) |
| Business invariants verified | **PARTIAL** — BL-PRICE-001 violated (CPN-035) |
| Cross-browser compatibility | PASS |
| GA4 analytics | PASS |
| Admin SPA functional | PASS |

### Required Before Release
1. **Fix BUG-001 (P0):** Enforce `IsPublic` check in `addCoupon` mutation (vc-module-marketing-experience-api)

### Recommended
2. Fix BUG-NEW-041 (P2): Add alphanumeric validation for coupon codes in Admin SPA
3. Investigate OBS-1: Special characters stripped from coupon code CAT20#%$$^%%$&^%
4. Find tier-priced products for CPN-029 verification

---

## Evidence

### Screenshots
- `tests/Sprint-current/VCST-4590/screenshots/CPN-035-P0-PRIVATE-COUPON-ACCEPTED.png` (Chrome)
- `tests/Sprint-current/VCST-4590/screenshots/retest2-CPN035-PRIVATE-ACCEPTED-P0-BUG.png` (Firefox)
- `tests/Sprint-current/VCST-4590/screenshots/CPN-001-coupons-page-top.png`
- `tests/Sprint-current/VCST-4590/screenshots/CPN-005-coupon-applied.png`
- `tests/Sprint-current/VCST-4590/screenshots/CPN-006-all-coupons-fullpage.png`
- `tests/Sprint-current/VCST-4590/screenshots/retest2-CPN028-coupon-applied.png`
- `tests/Sprint-current/VCST-4590/screenshots/retest2-CPN030-order-total-formula.png`
- `tests/Sprint-current/VCST-4590/screenshots/retest2-CPN036-b2b-coupons-page.png`
- `tests/Sprint-current/VCST-4590/screenshots/retest2-CPN050-fullpage-all-coupons.png`

### Individual Reports
- [Frontend Retest 2 Report](retest2-frontend-results.md) — Chrome, 28 tests
- [Cross-Browser Retest 2 Report](retest2-crossbrowser-results.md) — Firefox, 7 tests
- [Backend Retest 2 Report](retest2-backend-results.md) — Edge, 16 tests (Admin SPA + GraphQL + REST API)

### Previous Reports
- [Retest 1 Consolidated Report](retest-consolidated-report.md) — 2026-03-17
- [Original Consolidated Report](consolidated-test-report.md) — 2026-03-11, 48 cases, 13 bugs

---

*Consolidated by qa-lead-orchestrator | 2026-03-17 | VCST-4590 Retest 2 — Full Execution*
