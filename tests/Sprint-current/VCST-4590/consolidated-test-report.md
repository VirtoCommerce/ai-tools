# VCST-4590 — Coupons & Vouchers Page — Consolidated Test Report

**Ticket:** [VCST-4590](https://virtocommerce.atlassian.net/browse/VCST-4590)
**Feature:** [Marketing] Coupons and Vouchers Page
**Date:** 2026-03-11
**Environment:** QA (vcst-qa-storefront.govirto.com / vcst-qa.govirto.com)
**Storefront Version:** 2.44.0-pr-2198-6327-6327c148
**PRs Under Test:** vc-module-marketing #258, vc-module-marketing-experience-api #14, vc-frontend #2198

---

## Verdict: NO-GO

**Release is blocked by P0 security bug (CPN-035).** The `IsPublic` flag is not enforced during coupon redemption — non-public coupon codes are accepted in the cart. This must be fixed before deployment.

---

## Execution Summary

| Agent | Browser | Scope | Passed | Failed | Skipped | Not Testable | Pass Rate |
|-------|---------|-------|--------|--------|---------|-------------|-----------|
| **qa-frontend-expert** | Chromium | CPN-001 to CPN-018 (18 cases) | 16 | 0 | 1 | 1 | 94.4% |
| **qa-backend-expert** | Edge | CPN-019 to CPN-033 (15 cases) | 14 | 0 | 0 | 1 | 93.3% |
| **qa-testing-expert** | Firefox | CPN-034 to CPN-048 (15 cases) | 11 | 4 | 0 | 0 | 73.3% |
| **ui-ux-expert** | Chrome DevTools | Figma comparison + WCAG audit | — | — | — | — | 73/100 |
| **Total** | | **48 test cases** | **41** | **4** | **1** | **2** | **91.1%** |

**45 executable cases, 41 passed = 91.1% pass rate**
**Testing-expert pass rate (73.3%) is below the 85% escalation threshold**

---

## Bugs Found — 13 Total

### P0 — Release Blocker (1)

| ID | Test Case | Summary | Component |
|----|-----------|---------|-----------|
| **BUG-001** | CPN-035 | **Non-public coupon (IsPublic=false) accepted in cart** — `IsPublic` flag is only enforced during display (promotionCoupons query), not during redemption (addCoupon mutation). Any user who knows a private coupon code can redeem it. | Storefront cart / xAPI coupon validation |

### Medium — Functional (3)

| ID | Test Case | Summary | Component |
|----|-----------|---------|-----------|
| BUG-002 | CPN-040 | **Coupon-level expiration date ignored** — GraphQL `promotionCoupons` query only checks promotion-level dates, not coupon-level expiry. Expired coupons remain visible and redeemable. | GraphQL resolver |
| BUG-003 | CPN-041 | **No alphanumeric validation on coupon code** — Admin UI shows hint "may contain only alphanumeric" but accepts special characters (spaces, `!`, etc.) without validation. | Admin SPA |
| BUG-004 | CPN-044 | **GA4 coupon tracking events missing** — `ep.coupon` parameter absent from all GA4 events when coupon is applied to cart. Breaks e-commerce analytics attribution. | Storefront GA4 integration |

### P1 — WCAG 2.1 AA Violations (3)

| ID | Finding | WCAG Criterion | Measured | Required |
|----|---------|----------------|----------|----------|
| BUG-UI-01 | No `:focus-visible` outline on copy button | 2.4.7 Focus Visible | No outline | Visible indicator |
| BUG-UI-02 | Copy button border contrast too low | 1.4.11 Non-text Contrast | 2.67:1 | 3:1 |
| BUG-UI-03 | Copy button `aria-label` absent/ambiguous — 15 identical "Click to copy" buttons | 4.1.2 Name, Role, Value | No unique label | Descriptive label |

### P2 — Design Deviations (3)

| ID | Finding | Impact |
|----|---------|--------|
| BUG-UI-04 | **Discount badge column missing** — Figma shows colored pills ("$100 OFF", "FREE", "30% OFF") as the most prominent visual element. Not implemented. | Reduced scanability |
| BUG-UI-05 | "Click to copy" label contrast 3.23:1 (fails 4.5:1 for normal text) | Low vision users |
| BUG-UI-06 | Duplicate title + name columns showing identical text for 14/15 coupons | Wasted space, screen reader confusion |

### P3 — Cosmetic (3)

| ID | Finding |
|----|---------|
| BUG-UI-07 | Dashed button border vs solid in Figma (may be intentional coupon metaphor) |
| BUG-UI-08 | No horizontal row separator between coupon items |
| BUG-UI-09 | Heading lacks colored background bar shown in Figma |

---

## What Passed

### Frontend (16/16 executable — 100%)
- Authenticated access, page load, sidebar active state
- Unauthenticated redirect to sign-in
- Coupon card display: name, description, detail text, expiry date, code button
- Click-to-copy clipboard functionality (verified via `navigator.clipboard.readText()`)
- **E2E flow: copy code → apply in cart → discount calculated correctly**
- Multiple coupon copy buttons all functional
- Cards without detail text render cleanly (no empty space)
- Direct URL access, back navigation, localized URL
- Zero functional JS console errors, zero network errors
- GraphQL requests all HTTP 200 with empty errors[]

### Backend (14/14 executable — 100%)
- Admin SPA: IsPublic toggle visible, persists after save/reopen
- Admin SPA: Localized Name/Description fields persist (en-US)
- **Cross-layer: Admin localized name propagates to storefront within 15s**
- GraphQL: `promotionCoupons` returns only public active promotions
- GraphQL: Cursor-based pagination (first/after) works correctly, no duplicates
- GraphQL: Localized name per cultureName (en-US vs de-DE returns distinct values)
- GraphQL: DataLoader batch loading — no cross-contamination of coupon codes
- REST API: Promotion CRUD with IsPublic=true and coupon code
- **GraphQL: IsPublic=false promotions correctly filtered from storefront query**
- **BL-CART-003: Coupon discount applied to sale price ($30.20 = 10% of $302), not list price ($307)**
- **BL-CHK-006: Order total formula verified: $307.00 - $35.20 + $84.36 + $150.00 = $506.16**
- **E2E cross-layer: REST create → GraphQL verify → Cart apply → Cleanup (full lifecycle)**
- DB migration: AddLocalizations applied, both modules installed (Marketing 3.1001.0, MarketingExperienceApi 3.1000.0)
- DynamicContentItemType regression: backward-compatible after PR #14

### Testing Expert (11/15 — 73.3%)
- Invalid coupon code shows "Coupon could not be found" error
- B2B org user sees coupons page with public promotions only
- Coupon removal via Deny button recalculates total
- Discount breakdown shows separate line items for auto-promo and coupon
- Exclusive coupon (EXCLUSIVE10) suppresses auto-promotions
- Auto-promotion applies without coupon code
- Coupon usage limits (max uses per coupon/customer) persist
- Import coupons blade opens with CSV format instructions
- Store-scoped promotion visibility verified

---

## Not Testable (2)

| Case | Reason | Recommendation |
|------|--------|----------------|
| CPN-016 | Empty state — requires store with zero public coupons | Create test user in empty store |
| CPN-029 | Tier price + coupon stacking — no multi-tier products in QA | Configure product with tier pricing |

---

## Design Fidelity

**Figma Comparison Score: 73/100**

| Category | Score |
|----------|-------|
| Layout & Structure | 90/100 |
| Coupon Card Design | 60/100 |
| Typography & Colors | 75/100 |
| Spacing & Alignment | 85/100 |
| Responsive Behavior | 80/100 |
| Accessibility (WCAG 2.1 AA) | 55/100 |

**Primary deviation:** The colored discount amount badge column (most prominent element in Figma design) is not implemented. The coupon title is used as the leftmost element instead.

---

## Observations

1. **Duplicate coupon codes in test data:** "QA" and "SUPER" and "WINE" each appear on 2 different promotions. Not a code bug, but could cause ambiguity at checkout. Recommend adding uniqueness validation.

2. **Localization works end-to-end:** Admin → GraphQL → Storefront pipeline confirmed with en-US and de-DE locales. DataLoader batch loading does not interfere.

3. **de-DE locale not directly editable in Admin blade UI:** Only en-US fields visible. German translations stored and returned via GraphQL but require API-level editing.

4. **Notification auto-dismiss is fast (~2-3s):** Close button present but hard to click manually. UX consideration, not a bug.

---

## Cleanup Status

All test promotions created during testing have been deleted:
- `072a799f-faf6-4cc4-802f-cf8eac7b334f` (API Test Promotion) — 204 OK
- `20006a1a-26b7-4569-ac9c-6774e07be183` (Private Promotion) — 204 OK
- `27258d45-da0f-4a3f-b77f-a3bab50e5411` (E2E Test Promotion) — 204 OK
- `0ea2ccb5-4027-4d5b-961a-e8efb5a7baff` (CPN-026 Test Promotion) — 204 OK

Cart restored to original state.

---

## Release Decision

### NO-GO — Fix Required

| Condition | Status |
|-----------|--------|
| All P0 bugs resolved | FAIL — BUG-001 (CPN-035) open |
| Pass rate ≥ 85% per agent | FAIL — testing-expert at 73.3% |
| WCAG 2.1 AA compliance | FAIL — 3 P1 violations |
| Design fidelity ≥ 80% | FAIL — 73/100 |
| Business invariants verified | PASS — BL-CART-003, BL-CHK-006 confirmed |

### Required Before Release
1. **Fix BUG-001 (P0):** Enforce `IsPublic` check during coupon redemption (addCoupon mutation)
2. **Fix BUG-UI-01/02/03 (P1):** Focus indicator, button border contrast, aria-labels

### Recommended Before Release
3. Fix BUG-002: Coupon-level expiration filtering in GraphQL resolver
4. Fix BUG-004: GA4 `ep.coupon` parameter for analytics attribution

### Can Ship With (Known Issues)
5. BUG-003: Admin coupon code validation (cosmetic inconsistency)
6. BUG-UI-04 to BUG-UI-09: Design deviations (confirm with design team)

---

## Evidence

All screenshots stored in `tests/Sprint-current/VCST-4590/screenshots/`.

### Individual Reports
- [Frontend Report](frontend-test-report.md) — 16 PASS / 0 FAIL
- [Backend Report](backend-test-report.md) + [Retry Report](backend-retry-report.md) — 14 PASS / 0 FAIL
- [Testing Expert Report](testing-expert-report.md) — 11 PASS / 4 FAIL
- [Figma Comparison Report](figma-comparison-report.md) — 73/100 design fidelity

---

## Next Steps

1. File JIRA bugs for BUG-001 through BUG-004 and BUG-UI-01 through BUG-UI-03
2. Transition VCST-4590: TESTING → NEEDS FIX
3. After P0 fix: re-test CPN-035 (private coupon redemption) and CPN-040 (coupon expiry)
4. After WCAG fixes: re-test focus indicators, contrast ratios, aria-labels

---

*Consolidated by qa-lead-orchestrator | 2026-03-11 | VCST-4590*
