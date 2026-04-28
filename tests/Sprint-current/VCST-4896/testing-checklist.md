# VCST-4896 Testing Checklist — Coupons Sidebar

**PR:** vc-frontend #2269 | **Build:** vc-theme-b2b-vue-2.48.0-pr-2269-dfb0-dfb0c1e5.zip  
**Layer:** Frontend ONLY | **Status:** Testing  
**Date:** 2026-04-28

---

## 1. AC Coverage Matrix

| AC | Description | Existing Suite Row(s) | Gap-filler Item(s) | Agent |
|----|-------------|-----------------------|--------------------|-------|
| AC-1 | "Discounts and coupons" widget placed BELOW Order Summary | CART-057, CART-063 | — | qa-frontend-expert |
| AC-2 | Widget shows list of available-for-user coupons (≤4, sorted endDate ASC) | CART-057, CART-058 | VCST4896-CL-003, CL-004 | qa-frontend-expert |
| AC-3 | "View all coupons & promotions" link opens /account/promotion-coupons in new tab | CART-064 | VCST4896-CL-012 | qa-frontend-expert |
| AC-4 | No available coupons → empty state shows custom-code card only | CART-065 | VCST4896-CL-004, CL-005 | qa-frontend-expert |
| AC-5 | Available coupons → list + custom-code card below | CART-057, CART-058 | — | qa-frontend-expert |
| AC-6 | Apply success → card flips to applied state (checkmark + trash icon) | CART-058, CART-059 | — | qa-frontend-expert |
| AC-7 | Trash icon cancels coupon; does NOT clear input field | CART-062 | VCST4896-CL-008 | qa-frontend-expert |
| AC-8 | Radio-button: applying B while A is active → A removed first, then B added | CART-061 | VCST4896-CL-009 | qa-backend-expert |
| AC-9 | Custom invalid code → static text "This code is not valid" | CART-060 | VCST4896-CL-007 | qa-frontend-expert |
| AC-10 | Order Summary no longer contains inline coupon input | CART-063 | VCST4896-CL-001 | qa-frontend-expert |
| AC-implied | Failed coupon (network/system) → "Something went wrong..." message | CART-066 | VCST4896-CL-007 (failed path) | qa-testing-expert |
| AC-implied | Checkout review shows appliedCouponCode read-only | CART-069 | VCST4896-CL-013 | qa-frontend-expert |
| AC-implied | Applied coupon persists cart→checkout→review navigation | CART-069 | VCST4896-CL-013 | qa-frontend-expert |
| AC-implied | i18n: widget labels render in non-English locales | CART-067 | VCST4896-CL-014 | qa-frontend-expert |
| AC-implied | Guest user → only custom card visible; getPromotionCoupons skipped | CART-065 (partial) | VCST4896-CL-005 | qa-backend-expert |
| AC-implied | GraphQL payload: first=4, after=0, sort=endDate:asc; enabled=false for guest | — | VCST4896-CL-015 | qa-backend-expert |
| AC-implied | BL-CART-003: coupon discount applied to sale price, not list price | CART-058 (partial) | VCST4896-CL-010 | qa-backend-expert |
| AC-implied | BL-CART-008: applied coupon persists across sign-out/sign-in | CART-042 (stale — see §3) | VCST4896-CL-011 | qa-frontend-expert |

---

## 2. New Checklist Items

### VCST4896-CL-001 — Order Summary Contains No Inline Coupon Input (P0 Regression Guard)
**Layer:** FE | **Priority:** P0 | **Agent:** qa-frontend-expert  
**Preconditions:** User logged in. At least 1 item in cart.  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`
2. `[ASSERT]` Inspect `.order-summary` DOM — confirm NO text input, no `VcActionInput` for coupon, no "Apply" button inside it
3. `[ASSERT]` Confirm `.coupons-section` is present in DOM and is a sibling element BELOW `.order-summary` (not a child of it)

**Expected:** Old inline coupon entry is gone from Order Summary. `.coupons-section` exists separately.  
**BL/ECL:** AC-10  
**Failure signals:** `VcActionInput` or text input with coupon label found inside `.order-summary` (regression re-introduction)

---

### VCST4896-CL-002 — CouponsSection Widget Title i18n Key Renders (Not Raw Key)
**Layer:** FE | **Priority:** P1 | **Agent:** qa-frontend-expert  
**Preconditions:** User logged in. At least 1 item in cart.  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`
2. `[ASSERT]` Verify widget heading text is "Discount & coupons" (or locale equivalent) — NOT the raw key `shared.cart.coupons_section.title`
3. `[ASSERT]` Verify "Enter custom code" placeholder appears in custom card input — NOT `shared.cart.coupons_section.enter_custom_code`

**Expected:** All new i18n keys resolve to translated strings in English locale.  
**BL/ECL:** AC-1  
**Failure signals:** Raw i18n key visible in the heading or input placeholder

---

### VCST4896-CL-003 — Auth User With Available Coupons: Preset Cards Sorted by endDate ASC (Max 4)
**Layer:** FE | **Priority:** P1 | **Agent:** qa-frontend-expert  
**Preconditions:** User from agent-user-pool.csv slot 1 (`TEST_AGENT_1_EMAIL`) logged in. At least 2 promotion coupons available for this user with different end dates. Cart has at least 1 eligible item.  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`
2. `[SCROLL]` Scroll to "Discount & coupons" widget (`.coupons-section`)
3. `[ASSERT]` Count preset coupon cards — must be ≤ 4
4. `[ASSERT]` If ≥ 2 cards visible and end dates are shown: verify card with the soonest expiry date appears first (endDate ASC)
5. `[ASSERT]` Custom code card is present below preset cards (or alone if none)
6. `[ASSERT]` "View all coupons & promotions" link is visible

**Expected:** Max 4 preset cards; sorted soonest-first; custom card always present.  
**BL/ECL:** AC-2, AC-5  
**Failure signals:** More than 4 preset cards; wrong sort order; custom card absent

---

### VCST4896-CL-004 — Auth User With NO Available Coupons: Only Custom Card Visible
**Layer:** FE | **Priority:** P1 | **Agent:** qa-frontend-expert  
**Preconditions:** A user account with no targeted/active promotion coupons. Use `{{NO_COUPON_USER_EMAIL}}` (configure in `.env` or use an agent slot with no assigned promotions). Cart has at least 1 item.  
**Steps:**
1. `[NAV]` Log in as `{{NO_COUPON_USER_EMAIL}}` and navigate to `{{FRONT_URL}}/cart`
2. `[SCROLL]` Scroll to `.coupons-section`
3. `[ASSERT]` Widget heading "Discount & coupons" is visible
4. `[ASSERT]` Zero preset coupon cards are rendered (no cards with dashed border other than the custom card)
5. `[ASSERT]` Custom code card with "Enter custom code" placeholder is present
6. `[ASSERT]` "View all coupons & promotions" link is still visible

**Expected:** Widget renders in empty-preset state; only custom card; no JS errors.  
**BL/ECL:** AC-4  
**Failure signals:** Widget absent when no preset coupons; custom card missing; JS crash on empty state

---

### VCST4896-CL-005 — Guest User: getPromotionCoupons Query Skipped; Only Custom Card Visible
**Layer:** BE/FE | **Priority:** P1 | **Agent:** qa-backend-expert  
**Preconditions:** Not logged in (guest session). Cart has at least 1 item (added as guest).  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart` without signing in
2. `[ASSERT]` "Discount & coupons" widget is visible with custom code card
3. `[NETWORK]` Inspect network requests — verify NO `getPromotionCoupons` GraphQL query was fired (query is gated by `isAuthenticated=false` → `enabled=false`)
4. `[ASSERT]` No preset coupon cards appear; only the custom-code input card

**Expected:** `getPromotionCoupons` request absent from network log. Custom card functional.  
**BL/ECL:** AC-4, `queryEnabled` gate  
**Failure signals:** `getPromotionCoupons` request fired for guest; auth error 401 on query

---

### VCST4896-CL-006 — Apply Preset Coupon: Card Transitions to Applied State; Cart Total Reflects Discount
**Layer:** FE | **Priority:** P0 | **Agent:** qa-frontend-expert  
**Preconditions:** User logged in (agent-user-pool slot 1). Cart has ≥1 eligible item. At least one preset coupon card visible in sidebar.  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`; record cart total (T1)
2. `[SCROLL]` Scroll to `.coupons-section`
3. `[ACT]` Click arrow-right (apply) button on the first preset card
4. `[WAIT]` Wait for card to transition (green border, checkmark icon, trash icon appear)
5. `[ASSERT]` Card is in `applied` state: success gradient, round-check icon visible, trash icon visible, apply button gone
6. `[ASSERT]` Discount line visible in Order Summary with non-zero amount
7. `[MATH]` Record new cart total (T2); assert T2 < T1 (delta > 0); do NOT assert exact amounts

**Expected:** Card applies cleanly; total decreases; only one discount line visible.  
**BL/ECL:** BL-CART-003, AC-6  
**Failure signals:** Card stays in default state; discount line absent; T2 = T1  
**Cleanup:** Click trash icon to remove coupon after verification

---

### VCST4896-CL-007 — Custom Code: Invalid → "This code is not valid"; Failed → "Something went wrong…"
**Layer:** FE | **Priority:** P0 | **Agent:** qa-frontend-expert (invalid path) / qa-testing-expert (failed path)  
**Preconditions:** User logged in. Cart has ≥1 item.

**Invalid path (automated):**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`
2. `[SCROLL]` Scroll to custom code card; type `BOGUS-INVALID-999` in "Enter custom code" input
3. `[ACT]` Click apply (arrow-right) button
4. `[WAIT]` Wait for error state
5. `[ASSERT]` Card shows error state; error text reads exactly **"This code is not valid"** (maps to `t('common.messages.invalid_coupon')`)
6. `[ASSERT]` Cart total unchanged

**Failed path (manual — network interception required):**
1. Open browser DevTools → Network → add block rule for GraphQL `addCartCoupon` (or intercept and return 500)
2. Type any code in custom card; click apply
3. `[ASSERT]` Card shows error state; error text reads exactly **"Something went wrong with the coupon. Please try again."** (maps to `t('common.messages.failed_coupon')`)
4. `[ASSERT]` Error is NOT "This code is not valid" (correct discriminant between `invalid` and `failed` types)

**Expected:** Two distinct error messages for two error types.  
**BL/ECL:** AC-9, ECL-1.3  
**Failure signals:** Wrong message shown; no error state rendered; cart total changes after failed apply

---

### VCST4896-CL-008 — Trash Icon Cancels Coupon; Custom Input Field NOT Cleared (AC-7)
**Layer:** FE | **Priority:** P1 | **Agent:** qa-frontend-expert  
**Preconditions:** User logged in. Cart has ≥1 item. Apply a coupon (preset or custom) so a card is in `applied` state.  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`; apply any valid coupon; note cart total (T1-applied)
2. `[ASSERT]` Trash (outline-trash) icon visible on applied card
3. `[ACT]` Click trash icon
4. `[WAIT]` Wait for `removeCartCoupon` mutation to complete and card to return to default state
5. `[ASSERT]` Card is in `default` state (dashed border, arrow-right apply button, receipt-tax icon)
6. `[ASSERT]` For CUSTOM code card: the previously entered code text is STILL visible in the input field (not cleared — per AC-7)
7. `[ASSERT]` Discount line removed from Order Summary
8. `[MATH]` Cart total returns to pre-coupon level

**Expected:** Card flips to default; custom input not cleared; discount removed from total.  
**BL/ECL:** BL-CART-009, AC-7  
**Failure signals:** Card disappears entirely after removal; input cleared; discount persists; card stuck in applied state

---

### VCST4896-CL-009 — Radio-Button Behavior: Mutation Order A-Remove → B-Add; Only B Applied
**Layer:** BE | **Priority:** P0 | **Agent:** qa-backend-expert  
**Preconditions:** User logged in (agent-user-pool slot 2). Cart has ≥1 item. Two valid coupon codes applicable: coupon A and coupon B (both in sidebar as preset or one as custom). Credentials from `test-data/users/agent-user-pool.csv`.  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`
2. `[ACT]` Apply coupon A; verify card A is in `applied` state
3. `[NETWORK]` Open network log; clear captured entries
4. `[ACT]` Apply coupon B (click apply on card B or type B in custom card)
5. `[WAIT]` Wait for both mutations to settle
6. `[NETWORK]` Verify mutation sequence: `removeCartCoupon` for A fires BEFORE `addCartCoupon` for B (check request order in network panel)
7. `[ASSERT]` Card B is in `applied` state; card A is in `default` state
8. `[ASSERT]` Only ONE discount line in Order Summary (for B, not A+B)
9. `[API]` Verify `cart.coupons[]` contains exactly 1 entry with `isAppliedSuccessfully=true`

**Expected:** Remove-first sequencing enforced; never two coupons simultaneously.  
**BL/ECL:** BL-CART-009 (P1-data), ECL-1.3  
**Failure signals:** Both cards show applied simultaneously; discount = A+B stacked; `removeCoupon` not fired before `addCoupon`; `cart.coupons[]` length > 1  
**Cleanup:** Click trash icon to remove coupon B

---

### VCST4896-CL-010 — BL-CART-003: Coupon Applied to Sale Price, Not List Price
**Layer:** BE | **Priority:** P0 | **Agent:** qa-backend-expert  
**Preconditions:** A product is on sale (sale price < list price) and in cart. A percentage coupon is applicable.  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`; note item's displayed unit price (should be sale price)
2. `[API]` Query `cart` via GraphQL; record `items[0].placedPrice` (pre-coupon)
3. `[ACT]` Apply percentage coupon via sidebar
4. `[WAIT]` Wait for discount line to appear in Order Summary
5. `[API]` Query `cart` again; check `items[0].placedPrice` and discount amount
6. `[MATH]` Verify coupon discount = coupon% × sale price (NOT coupon% × list price)

**Expected:** Discount calculated on post-sale price per BL-PRICE-001 stacking order.  
**BL/ECL:** BL-CART-003, BL-PRICE-001  
**Failure signals:** Discount matches coupon% × list price (over-discounting using wrong base)  
**Cleanup:** Remove coupon via trash icon

---

### VCST4896-CL-011 — BL-CART-008: Applied Coupon Persists Across Sign-Out / Sign-In
**Layer:** FE | **Priority:** P1 | **Agent:** qa-frontend-expert  
**Preconditions:** User logged in (agent-user-pool slot 1). Cart has ≥1 item. Valid coupon applied via sidebar widget (card in `applied` state).  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`; apply coupon via sidebar; note cart total (T-discounted)
2. `[ACT]` Sign out (use header account menu → Sign out)
3. `[NAV]` Navigate to `{{FRONT_URL}}/sign-in`; sign back in with same credentials from `test-data/users/agent-user-pool.csv`
4. `[NAV]` Navigate to `{{FRONT_URL}}/cart`
5. `[ASSERT]` Coupon card is still in `applied` state (applied state restored from server)
6. `[ASSERT]` Discount line still visible in Order Summary; cart total matches T-discounted
7. `[API]` Confirm `cart.coupons[0].isAppliedSuccessfully=true` in getCart response

**Expected:** Applied coupon survives sign-out/sign-in; no re-entry required.  
**BL/ECL:** BL-CART-008  
**Failure signals:** Coupon dropped after login; card returns to default; discount line absent; cart total = pre-coupon value  
**Cleanup:** Remove coupon via trash icon

---

### VCST4896-CL-012 — "View All" Link Opens /account/coupons in New Tab
**Layer:** FE | **Priority:** P1 | **Agent:** qa-frontend-expert  
**Preconditions:** User logged in. On `/cart` page with `.coupons-section` visible.  
**Steps:**
1. `[SCROLL]` Scroll to `.coupons-section`
2. `[ASSERT]` "View all coupons & promotions" link is present; verify `target="_blank"` attribute
3. `[ACT]` Click the link
4. `[ASSERT]` New tab opens (original cart tab remains active); new tab URL is `{{FRONT_URL}}/account/coupons`
5. `[ASSERT]` Page renders without 404 or error (heading "All coupons & promotions")

**Expected:** New tab to `/account/coupons`; cart tab not navigated away.  
**BL/ECL:** AC-3  
**Failure signals:** Same-tab navigation; 404 on the coupons page; link absent from widget  
**Cleanup:** Close the new tab

---

### VCST4896-CL-013 — Checkout Review Shows Applied Coupon; Discount Carries Through
**Layer:** FE | **Priority:** P0 | **Agent:** qa-frontend-expert  
**Preconditions:** User logged in. Cart has ≥1 item. Apply a valid coupon via sidebar widget before navigating to checkout.  
**Steps:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart`; apply valid coupon; note discount amount (D1) and total (T1)
2. `[NAV]` Proceed to checkout (click "Proceed to Checkout")
3. `[NAV]` Navigate through checkout steps to review step (`/checkout/review`)
4. `[ASSERT]` Applied coupon code is visible as read-only (non-editable `VcActionInput`) on review page — binding `appliedCouponCode`
5. `[ASSERT]` Discount line visible in checkout order summary with matching amount (D1)
6. `[ASSERT]` Cart total on review matches T1 (no re-calculation or loss of coupon)
7. `[NAV]` Navigate BACK to `/cart` (browser back or cart icon)
8. `[ASSERT]` Coupon still in applied state on sidebar card (not reset by checkout navigation)

**Expected:** `appliedCouponCode` flows from cart → checkout → review without loss.  
**BL/ECL:** BL-CART-008, BL-CHK-002  
**Failure signals:** Coupon code absent on review page; discount disappears at checkout; `couponCode` binding shows undefined (old binding regression)  
**Cleanup:** Navigate away without placing order; remove coupon from cart

---

### VCST4896-CL-014 — i18n: Widget Labels Render Correctly in Non-English Locale
**Layer:** FE | **Priority:** P2 | **Agent:** qa-frontend-expert  
**Preconditions:** User logged in. At least 1 item in cart. Locale can be switched via URL prefix or user settings.

**Check at least 2 locales (e.g., `ru` and `de`):**
1. `[NAV]` Navigate to `{{FRONT_URL}}/ru/cart` (or set locale to Russian)
2. `[ASSERT]` Widget heading is localized (not the raw key `shared.cart.coupons_section.title`)
3. `[ASSERT]` "Enter custom code" placeholder is localized
4. `[ASSERT]` "View all coupons & promotions" link text is localized
5. Repeat for `de` (German) locale

**Expected:** All 5 new i18n keys under `shared.cart.coupons_section.*` resolve in both test locales.  
**BL/ECL:** ECL-1.3 (locale coverage)  
**Failure signals:** Raw key string visible; fallback English shown where translated string expected; console i18n warnings

---

### VCST4896-CL-015 — GraphQL: getPromotionCoupons Payload Includes Correct Variables; Skipped for Guest
**Layer:** BE | **Priority:** P1 | **Agent:** qa-backend-expert  
**Preconditions:** Two sessions needed: (A) logged-in user, (B) guest session.

**Session A — Authenticated user:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart` as logged-in user
2. `[NETWORK]` Capture GraphQL request to `getPromotionCoupons`
3. `[ASSERT]` Request variables include `first: 4`, sort containing `endDate:asc` (or `endDate ASC`)
4. `[ASSERT]` `enabled` variable or composable guard is `true`

**Session B — Guest user:**
1. `[NAV]` Navigate to `{{FRONT_URL}}/cart` without login
2. `[NETWORK]` Confirm NO `getPromotionCoupons` request fired (enabled=false guard active)

**Expected:** Correct pagination and sort variables for auth; query fully suppressed for guest.  
**BL/ECL:** `usePromotionCoupons(4, undefined, isAuthenticated)` contract  
**Failure signals:** `first` value ≠ 4; sort missing or wrong direction; query fires for guest (auth bypass)

---

## 3. Stale Tests Requiring Update

The following rows in `regression/suites/Frontend/cart/029-cart-validation-persistence.csv` reference the OLD inline coupon input (`locate coupon/promo code input field`, click `'Apply'` button) and must be migrated to the new `.coupons-section` sidebar widget interaction pattern:

| Row ID | Current Behavior Tested | Required Change |
|--------|-------------------------|-----------------|
| **CART-014** | Apply valid coupon via "locate coupon/promo code input field" then "Apply" button | Steps must reference `.coupons-section` preset card or custom code card apply button; remove reference to inline `VcActionInput` in Order Summary |
| **CART-015** | Apply invalid coupon via inline input; assert generic "Invalid coupon code" message | Error message assertion must use the new exact string **"This code is not valid"** (locale key `invalid_coupon` shortened); steps must target custom code card in sidebar |
| **CART-042** | Coupon survives sign-out/sign-in — steps use `click 'Apply'` in Order Summary | Steps must apply coupon via sidebar widget; assertion that "coupon code visible in cart summary" should reference `applied` card state in `.coupons-section`, not Order Summary inline display |

Note: `CART-063` in `028-cart-core.csv` already serves as a regression guard for AC-10 (no inline input). The rows above are in suite 029 and need a rewrite of their Steps columns only — the scenario intent is unchanged.

---

## 4. Suggested Cleanup Steps

Before executing checklist items, ensure agent user cart slots are clean:

1. **Agent slot 1 (`TEST_AGENT_1_EMAIL`):** Navigate to `{{FRONT_URL}}/cart` → click "Clear Cart" → confirm. Removes any leftover items from prior runs.
2. **Agent slot 2 (`TEST_AGENT_2_EMAIL`):** Same as above.
3. **Agent slot 3 (`TEST_AGENT_3_EMAIL`):** Same as above.
4. **Coupon state:** If any slot has an applied coupon (card in `applied` state), click the trash icon to remove it before starting a new test item. Coupons are cart-scoped server-side and will carry over between test runs if not explicitly removed.
5. **Guest session:** Clear browser cookies / use incognito for VCST4896-CL-005 to ensure a clean unauthenticated state.
6. **New-tab cleanup (CL-012):** After testing the "View all" link, close the `/account/promotion-coupons` tab before the next checklist item.

Credentials: never hardcode. Read from `.env` (`TEST_AGENT_1_EMAIL`, `TEST_AGENT_1_PASSWORD`, etc.) or resolve from `test-data/users/agent-user-pool.csv` at runtime per project memory `feedback_agents_read_env_creds.md`.
