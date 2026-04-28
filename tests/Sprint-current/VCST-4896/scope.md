# VCST-4896 — Scope Analysis

**Ticket:** [VCST-4896](https://virtocommerce.atlassian.net/browse/VCST-4896) — `[Marketing] [Cart] Coupons sidebar`
**PR:** [VirtoCommerce/vc-frontend#2269](https://github.com/VirtoCommerce/vc-frontend/pull/2269) — `feat(VCST-4896): coupons sidebar`
**Type:** Story | **Priority:** Medium | **Status:** Testing
**Assignee:** Anatolii.Vasilev

## Build verified in QA
- Theme artifact: `vc-theme-b2b-vue-2.48.0-pr-2269-dfb0-dfb0c1e5.zip` — matches PR #2269 head SHA `dfb0c1e5` ✅
- Platform: `3.1025.0-pr-2987-eb8e-vcst-4710-eb8e622b`
- Marketing: 3.1003.0 | MarketingExperienceApi: 3.1001.0 | Cart: 3.1003.0 | XCart: 3.1009.0
- Health: All Modules / Cache / Redis / SQL → Healthy

## Environment
- FRONT_URL: https://vcst-qa-storefront.govirto.com
- BACK_URL: https://vcst-qa.govirto.com

## Layer
**Frontend ONLY** — 22 files changed in vc-frontend; no backend module changes in PR.

## Files Changed (key)
| File | Change | Behavior |
|---|---|---|
| `pages/cart.vue` | mod | Removes inline `VcActionInput` coupon from Order Summary footer; adds `<CouponsSection>` below Order Summary |
| `pages/checkout/review.vue` | mod | `couponCode` → `appliedCouponCode` (read-only display) |
| `shared/cart/components/coupons-section.vue` | NEW (102) | Widget: lists available coupons + custom code card + "View all" link |
| `shared/cart/components/coupon-card.vue` | NEW (170) | Card with 3 view states: `default`, `applied`, `error` |
| `shared/cart/composables/useCoupon.ts` | refactor (50/35) | Returns `appliedCouponCode`, `couponError {code,type}`, `loadingCouponCode`; new sequencing: remove-then-add when switching codes |
| `shared/account/composables/usePromotionCoupons.ts` | mod (24/4) | Now accepts `itemsPerPage`, custom variables, `queryEnabled`; sorts by `endDate` asc |
| `core/api/graphql/account/queries/getPromotionCoupons/index.ts` | mod | Accepts custom `GetPromotionCouponsQueryVariables`, `enabled` ref |
| `locales/*.json` (13 langs) | mod | New keys `shared.cart.coupons_section.{title,expires,custom_code,enter_custom_code,all_coupons}`; `invalid_coupon` shortened to "This code is not valid"; new `failed_coupon`; removed `placeholders.promotion_code` |
| `ui-kit/icons/outline-trash.svg` | NEW | Trash icon used in `applied` state |

## Domains
Cart, Marketing (coupons), Pricing (discount calc).

## Acceptance Criteria (extracted from JIRA description)

| # | AC | Source |
|---|---|---|
| AC-1 | "Discounts and coupons" widget placed BELOW Order Summary widget on cart page | Description §1 |
| AC-2 | Widget shows the list of available-for-user coupons (synced with VCST-4590 /account/promotion-coupons) | §1 |
| AC-3 | "View all coupons & promotions" link opens the coupons page at `/account/coupons` (VCST-4590) | §1.2 |
| AC-4 | If no available coupons → empty state shows custom-code input only | §1.1 |
| AC-5 | If available coupons → list rendered + custom-code input below | §1.3 |
| AC-6 | Apply success → card flips to "applied" state with checkmark icon and trash icon | §1.4 |
| AC-7 | Trash icon CANCELS the promo code (does NOT clear input field) | §1.5 |
| AC-8 | One coupon at a time: applying B while A is applied → A removed, B becomes active (radio-btn behavior) | §1.6 — **Main rule** |
| AC-9 | Custom coupon invalid → static text "This code is not valid" | §1.7-1.8 |
| AC-10 | Order Summary widget no longer contains coupon input | §2 |

## Business Rules to Verify
- **BL-CART-009** [P1-data] Radio-button coupon transition — directly targets the new `<CouponsSection>` widget contract: `removeCoupon` mutation must complete before `validateCoupon`+`addCoupon` for the new code; `cart.coupons[]` must never hold two simultaneously; UI must never flash both cards as "applied"
- **BL-CART-003** [P0-revenue] Coupon + sale interaction — percentage coupon applies to sale price, not list price
- **BL-PRICE-001** [P0-revenue] Discount stacking order — coupon discount on already-discounted (sale + tier) amount
- **BL-CART-008** [P1-data] Cart persistence — applied coupon survives sign-out/sign-in and navigation cart→checkout→review
- **BL-CHK-002** [P0-revenue] Place Order idempotency — placing order with applied coupon must not double-apply discount

## Edge Cases (ECL)
- **ECL-1.3** Coupon & Discount Stacking — case sensitivity, expiry mid-checkout, removal mid-checkout
- Custom case: empty available list (auth user with no targeted promotions) → only custom card visible
- Custom case: anon/guest user (`isAuthenticated=false`) → `usePromotionCoupons` query is gated by `queryEnabled=isAuthenticated` so list is empty → only custom card visible
- Custom case: same code in both available list AND typed in custom field
- Custom case: applied custom code, then refresh — `watchEffect` should populate custom field with the applied code (via the `isInList` check)

## Agent Dispatch Plan
| Agent | Browser | Focus |
|---|---|---|
| qa-frontend-expert | playwright-chrome | Cart sidebar, Order Summary check, all 10 ACs in UI, BL-CART-009 sequencing via Network panel |
| qa-backend-expert | playwright-edge | GraphQL `promotionCoupons` query (vars/sort), `addCartCoupon` / `removeCartCoupon` mutation order, cart re-pricing |
| qa-testing-expert | playwright-firefox | Exploratory SBTM (Risk charter): adjacent flows (cart→checkout→review), error recovery, network failure injection, cross-browser confirmation |
| ui-ux-expert | Chrome DevTools MCP | Component visual states (default/applied/error), responsive layout (mobile sidebar collapse), a11y of new card buttons |
