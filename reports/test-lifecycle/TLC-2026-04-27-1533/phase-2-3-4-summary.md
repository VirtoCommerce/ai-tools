# Phase 2-3-4 Summary — VCST-4896 Coupons Sidebar
**RUN_ID:** TLC-2026-04-27-1533 | **Date:** 2026-04-27 | **Scope:** feat(VCST-4896): coupons sidebar (PR #2269, vc-frontend)

---

## Phase 2 — SYNC Results

**Total cases examined:** 28 across 4 suites
**Status breakdown:** 13 STALE/BROKEN → synced, 15 VALID (no changes)

| Suite | File | Cases Examined | Synced | Notes |
|-------|------|---------------|--------|-------|
| 077 | 077-coupons-promotions-storefront.csv | 44+ | 11 | CPN-005, 015, 028, 029, 030, 033, 034, 035, 037, 038, 042 |
| 012 | 012-checkout-guest.csv | ~16 | 1 | CHK-018 |
| 013 | 013-checkout-b2b.csv | ~40 | 1 | CHK-037 |
| 028 | 028-cart-core.csv | 31 | 0 | Zero coupon cases pre-existed; all coverage from Phase 3 |

### Key Sync Changes Applied

- **Selector migration:** All cases referencing `'Enter a promo-coupon' textbox` → `'Enter custom code'` input within `.coupon-card` (Custom code card)
- **Widget location:** All cases updated to scroll to `.coupons-section` sidebar widget (was inline OrderSummary block)
- **Remove action:** `'Deny' button` → `outline-trash icon` on applied coupon card
- **Error text:** Generic "invalid" messages → exact string "This code is not valid"
- **Applied state assertions:** Added green border + round-check icon assertions
- **JIRA AC#5 compliance (CPN-037):** Added DOM assertion that card is retained in default state after trash-icon removal — code display not cleared
- **ISTQB independence fix (CPN-030):** Removed forbidden execution dependency ("CPN-005 or CPN-028 passed") → rewritten as state precondition
- **Checkout cases (CHK-018, CHK-037):** Coupon apply flow now precedes checkout navigation; review page asserts read-only disabled input showing applied code

---

## Phase 3 — GENERATE Results

**13 new cases generated:** CART-057 through CART-069, appended to `028-cart-core.csv`

| ID | Title | Priority | Technique | BL Ref |
|----|-------|----------|-----------|--------|
| CART-057 | Coupons Sidebar Widget Renders on Cart Page | P1 | EP | — |
| CART-058 | Preset Coupon Card — Apply via One-Click | P1 | State Transition | BL-CART-003 |
| CART-059 | Custom Code Card — Apply Valid Coupon | P0 | EP + State Transition | BL-CART-003 |
| CART-060 | Custom Code Card — Apply Invalid Coupon Shows Error | P1 | EP + Error Guessing | BL-CART-003 |
| CART-061 | Radio-Button Enforcement — Applying New Code Auto-Removes Previous | P1 | State Transition | BL-CART-003, PROPOSED-BL-CART-009 |
| CART-062 | Trash Icon Cancels Applied Coupon (AC#5 Compliance) | P1 | State Transition | BL-CART-003 |
| CART-063 | Regression Guard — No Inline Coupon Field on Cart Page | P1 | Error Guessing | — |
| CART-064 | "View All Coupons" Link Opens Account Coupons in New Tab | P2 | EP | ECL-4.2 |
| CART-065 | Empty State — No Preset Cards When User Has No Active Coupons | P2 | EP | — |
| CART-066 | Failed Error Type Shows Correct Message | P1 | Error Guessing | BL-CART-003 |
| CART-067 | Sidebar Coupon Apply Discount Reflected in Order Summary | P0 | EP + MATH | BL-CART-003 |
| CART-068 | Sidebar Widget Not Gated by checkout_coupon_enabled Flag (Advisory) | P2 | Decision Table | — |
| CART-069 | Checkout Review — Applied Coupon Displayed as Read-Only | P1 | State Transition | BL-CART-003 |

All generated cases: `Automation_Status = Draft`. P0 cases: CART-059, CART-067.

---

## Phase 4 — REVIEW Results

**7-dimension review applied to all 13 synced + 13 generated cases (26 total)**

### Findings Summary

| Severity | Count | Items |
|----------|-------|-------|
| Fixed (auto) | 14 | See fixesApplied in phase-2-3-4-output.json |
| Manual (open) | 5 | MAN-001 through MAN-005 |
| Blocked | 0 | — |

### Auto-Fixed Items (14)

1. CPN-030: ISTQB independence violation — precondition rewritten to state-based
2. CPN-037: Title updated to "Trash Icon" + DOM retention assertion added (AC#5)
3. CHK-018: Steps rewritten for sidebar apply-then-checkout pattern
4. CHK-037: Steps rewritten for sidebar apply-then-checkout pattern (B2B context)
5. CPN-005: Full step rewrite — selector, apply method, assertions
6. CPN-015: Input selector updated
7. CPN-028: Preset card apply method used
8. CPN-029: Preset card apply method used
9. CPN-033: E2E cart steps rewritten
10. CPN-034: Error assertion text specified
11. CPN-035: Negative assertion added for private coupon
12. CPN-038: Explicit apply step added before discount-breakdown test
13. CPN-042: Radio-button interaction steps + trash icon cleanup
14. Suite 028 metadata: testCount 31→44, estimatedMinutes 22→32, tags +coupons-sidebar

### Open Manual Items

| ID | Case | Action Required | Owner |
|----|------|----------------|-------|
| MAN-001 | CART-062 | Live verify: trash icon click — card retained in DOM with default state, code not cleared | qa-testing-expert |
| MAN-002 | CART-065 | Provision `{{NO_COUPON_USER_EMAIL}}` seed in test-data/aliases.json | qa-seed-data |
| MAN-003 | CART-066 | Implement mock/intercept for `type: "failed"` error response path | qa-backend-expert |
| MAN-004 | CART-068 | Confirm with PR #2269 author: is `checkout_coupon_enabled` flag intentionally removed from sidebar gating? | qa-lead-orchestrator |
| MAN-005 | CPN-042 | Live verify radio-button + globally-exclusive coupon interaction end-to-end | qa-testing-expert |

---

## BL Proposals

**1 proposal drafted (NOT written to business-logic.md):**

**PROPOSED-BL-CART-009:** When `applyCoupon(code)` is called with a code different from the currently applied coupon, the system MUST first call `removeCartCoupon` on the existing coupon before calling `addCartCoupon` for the new code. Cart MUST NOT hold two coupons simultaneously during this transition. The intermediate state (after remove, before add) MUST not be visible to the user.

Basis: Observed in `useCoupon.ts` source analysis — `applyCoupon()` sequence: clearError → removeCartCoupon(applied) if different → validateCartCoupon → addCartCoupon. BL-CART-003 covers one-coupon-per-cart but does not specify the auto-remove transition sequence.

Requires explicit user approval per project memory rule before promotion to `business-logic.md`.

---

## Files Modified

| File | Change Type | Details |
|------|------------|---------|
| `regression/suites/Frontend/marketing/077-coupons-promotions-storefront.csv` | SYNC | 11 cases updated (CPN-005, 015, 028, 029, 030, 033, 034, 035, 037, 038, 042) |
| `regression/suites/Frontend/checkout/012-checkout-guest.csv` | SYNC | 1 case updated (CHK-018) |
| `regression/suites/Frontend/checkout/013-checkout-b2b.csv` | SYNC | 1 case updated (CHK-037) |
| `regression/suites/Frontend/cart/028-cart-core.csv` | GENERATE | 13 new cases appended (CART-057–069) |
| `config/test-suites.json` | META | Suite 028: testCount 31→44, estimatedMinutes 22→32, tags +coupons-sidebar |
| `reports/test-lifecycle/TLC-2026-04-27-1533/phase-2-3-4-output.json` | REPORT | Full structured output (syncResults, gapInventory, generatedCases, reviewFindings, fixesApplied, manualItems, blProposals, statistics) |

---

## Coverage Assessment

| Layer | Applicable | Cases | Status |
|-------|-----------|-------|--------|
| Storefront UI | Yes | 26 (13 synced + 13 new Draft) | Complete |
| REST API / xAPI | Yes (cross-layer checks embedded) | Per-case [API] checks in CART-059, 061, 062, 067, CPN-005, 033, 042 | Embedded |
| Admin UI | No | — | N/A |
| E2E | Partial | CPN-033 covers storefront→API→admin | Covered |

**JIRA AC Coverage:**

| AC | Cases Covering |
|----|---------------|
| AC#1 (widget renders on cart) | CART-057, CART-063 |
| AC#2 (preset cards from usePromotionCoupons) | CART-058, CART-065 |
| AC#3 (custom code apply + error states) | CART-059, CART-060, CART-066 |
| AC#4 (radio-button auto-remove) | CART-061, CPN-042 |
| AC#5 (trash icon — card retained) | CART-062, CPN-037 |
| AC#6 (view-all link new tab) | CART-064 |
| AC#7 (checkout review read-only) | CART-069, CHK-018, CHK-037 |
| AC#8 (regression — no inline field) | CART-063, CPN-005 |

---

## Gate Readiness

**Gate status: CONDITIONAL PASS**

- Zero Blocker findings
- Zero Critical findings
- 5 open manual items (MAN-001 through MAN-005)
- All generated cases at `Automation_Status = Draft` — require qa-lead-orchestrator approval to promote to `Reviewed`
- CART-068 (advisory) should be held from regression until MAN-004 PR author confirmation received
- MAN-002 (test data seed) is a prerequisite for CART-065 execution

**Recommended next step:** qa-lead-orchestrator review of this summary + phase-2-3-4-output.json, resolution of MAN-004, approval to promote Draft → Reviewed for CART-057 through CART-067, CART-069.
