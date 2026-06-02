# VCST-4896 — Exploratory Session Report

**Ticket:** VCST-4896 / PR #2269 — Coupons Sidebar
**Build:** vc-theme-b2b-vue-2.48.0-pr-2269-dfb0-dfb0c1e5
**Date:** 2026-04-28
**Tester:** qa-testing-expert
**Browser:** playwright-edge (fallback — playwright-firefox engine not installed in MCP cache)
**Account:** slot 3 — `qa-agent-slot3@virtocommerce.com` (Agent Edge, BuildRight org)
**Environment:** QA — `https://vcst-qa-storefront.govirto.com`

---

## 1. Part A — CL-007 Failed-Coupon Path

### Method
Network interception via in-page `window.fetch` monkeypatch installed through `browser_evaluate`. Two variants tested:
- **Variant A** — return synthetic `Response { status: 500, body: { errors:[…] } }` for `addCartCoupon` mutation
- **Variant B** — `throw new TypeError('NetworkError')` to trigger the `catch` block in `useCoupon.ts › applyCoupon`

### Result

| Variant | Behavior | Card Shown | Error Text | Mapping |
|---|---|---|---|---|
| A: HTTP 500 + errors[] | Apply on custom card with `TESTCODE` | Custom card flips to `error` state | `"This code is not valid"` | `t('common.messages.invalid_coupon')` — composable treats GraphQL `errors[]` as VALIDATION failure, not network failure |
| B: fetch throws | Apply on custom card with `TESTCODE` | **Wrong card** — THRESH50 (preset) flips to `error`, custom card stays `default` | `"Something went wrong with the coupon. Please try again."` | `t('common.messages.failed_coupon')` — correct text but mis-attached to the wrong coupon card |

### Verdict
- **`failed_coupon` text rendering: PASS** — exact string `"Something went wrong with the coupon. Please try again."` is shown.
- **`failed_coupon` UX attribution: FAIL** — error attaches to a *different* coupon card than the one the user clicked. See **Finding #1** below.
- Discriminator design: HTTP 500 with a `errors[]` payload is treated as `invalid` (composable resolves the response), only a thrown fetch is treated as `failed`. This is a useful design fact but means real-world 5xx server errors will surface as "This code is not valid", not "Something went wrong" — **Finding #5**.

### Evidence
- Screenshot: `tests/Sprint-current/VCST-4896/evidence/exploratory/failed-coupon-error.png` (red outline = error card = THRESH50; blue dashed outline = the actual custom card the user typed into = TESTCODE in default state).

### Recovery Test
Network interceptor restored. Subsequent `applyCoupon('E2E-COUPON')` succeeded (preset card flipped to `applied`). However a follow-up navigation cycle dropped the auth session — possibly an unrelated env quirk; not reproducible deterministically. Re-login restored full functionality. **PASS** for normal recovery once interceptor is removed.

---

## 2. Part B — SBTM Charter

### Charter
- **Mission:** Hunt for unexpected interactions and integration gaps in the new coupons sidebar by exploring boundaries the planned checklist did not cover.
- **Type:** Risk (UI restructure — risk is loss of behavior parity with old inline input).
- **Heuristic:** SFDPOT.
- **Time-box:** 20 min total (10 explore + 5 adjacent + 5 document).

### Scope
- In: `<CouponsSection>` widget on `/cart`, custom-code card behavior, preset-card behavior, network sequencing, mobile structure, i18n locale switch, sign-out persistence, link target.
- Out: Quote conversion (BuildRight org has no quote module access in this run), BOPIS pickup variant (no pickup-eligible items in slot 3 cart), Builder.io flows, exact discount math correctness on sale-priced items (BL-CART-003 belongs to qa-backend-expert).

---

## 3. Session Log (chronological)

| Time | Action | Observation |
|---|---|---|
| T+0 | Login slot 3, navigate `/cart` | 1 item already in cart. CouponsSection renders 4 preset cards + 1 custom card. Cards: `E2E-COUPON / $5`, `THRESH50 / 10% off cart`, `CAT20 / 20% off`, `FREESHIP / $99 off`. View-all link target = `/account/coupons` (NOT `/account/promotion-coupons`). |
| T+2 | Install `window.fetch` interceptor returning HTTP 500 for `addCartCoupon` | Apply on custom card with `TESTCODE` → custom card flips to `error` with text "This code is not valid". Error attribution correct. |
| T+5 | Switch interceptor to throwing fetch | Apply on custom card with `TESTCODE` → THRESH50 preset card flips to `error` with text "Something went wrong with the coupon. Please try again." Error attribution **incorrect**. |
| T+7 | Take evidence screenshot, restore network | Screenshot saved. Recovery test PASS (E2E-COUPON applies normally). |
| T+9 | Whitespace probe — type `"  E2E-COUPON  "` (leading/trailing spaces) | Network body shows `"coupon":"E2E-COUPON"` (trimmed). Trim works. Side-effect: code matched a preset, so the preset E2E-COUPON card flipped to `applied`, NOT the custom card. Custom input retains the un-trimmed `"  E2E-COUPON  "` value visually. |
| T+11 | Radio-button probe: apply CAT20 while E2E-COUPON applied | Network sequence: `RemoveCoupon(CAT20)…`, then later `RemoveCoupon → ValidateCoupon → AddCoupon`. Final state: only CAT20 applied. Order of mutations correct. **BL-CART-009 PASS** for sequencing. |
| T+13 | Rapid-click probe: triple-click apply on E2E-COUPON | Captured operations: `RemoveCoupon(CAT20)`, `ValidateCoupon`, `AddCoupon × 3` (timestamps t=29694, 29695, 29695 — within 1ms). The `loadingCouponCode` guard does NOT prevent duplicate calls. UI converges to correct end state but extra mutations fire. |
| T+15 | Mobile viewport (375×812) | Cards stack vertically (all `x=27`, `w=306`). No horizontal overflow. Custom card visible. View-all link reachable on scroll. Mobile layout PASS. |
| T+17 | View-all link target check | Href = `/account/coupons`. Page renders correctly with H1 "All coupons & promotions". `/account/promotion-coupons` returns 404. AC-3 / CL-012 docs reference the wrong URL but functionality is correct. |
| T+18 | i18n probe (RU locale via auto-redirect to `/ru/cart`) | Title "Скидки и купоны", custom card name "Пользовательский код", placeholder "Введите пользовательский код", view-all link "Посмотреть все купоны и акции". All 5 new i18n keys resolve. Preset card labels (`$5`, `10% off cart`) and names (`QA Cart Threshold`) are NOT localized — these come from backend coupon data and are expected to stay in source language. PASS. |
| T+19 | Sign-out / sign-in persistence (BL-CART-008) | After sign-out → sign-in → return to `/cart`: cart is EMPTY. "Your cart is empty" message. No coupons section rendered. Slot 3 / BuildRight org behavior — possibly pre-existing bug, not introduced by PR #2269. |
| T+20 | Console errors check, write report | 0 JS errors, 4 benign warnings across full session. |

Untestable in budget: refresh during apply, slow-3G load state for `getPromotionCoupons`, expiring-coupon time skew, BOPIS cart variant, two-tab sync, checkout-review `appliedCouponCode` (single-page checkout in this build — `/checkout/review` not reachable as a separate step).

---

## 4. Findings

| # | Type | Title | STR | Severity | Evidence |
|---|---|---|---|---|---|
| 1 | **Bug** | Failed-coupon error attaches to wrong card | 1) Apply preset E2E-COUPON. 2) Trash to remove. 3) Install thrown-fetch interceptor on `addCartCoupon`. 4) Type `TESTCODE` in custom card. 5) Click custom-card apply. **Observed:** THRESH50 preset card flips to error state with "Something went wrong…" text; custom card stays default. **Expected:** custom card itself flips to error state. | High | `failed-coupon-error.png` (red outline = wrong card flagged; blue dashed = the actually clicked custom card) |
| 2 | **Bug** | `loadingCouponCode` guard does not prevent duplicate `addCartCoupon` requests on rapid click | 1) Cart with no coupon applied. 2) Triple-click apply button on a preset card within ~1ms. **Observed:** 3 `addCartCoupon` mutations fire (timestamps within 1ms of each other). **Expected:** only 1 mutation (subsequent clicks should be guarded by `loadingCouponCode`). UI end-state is correct but the server is hit 3× per click burst. | Medium | Network observer log captured in session: `[{op:'AddCoupon',code:'E2E-COUPON',t:29694},{...t:29695},{...t:29695}]` |
| 3 | **Question** | Custom code matching a preset code routes the applied state to the preset card, not the custom card | 1) Cart with no coupon. 2) Type `E2E-COUPON` (a known preset code) in the custom-card input. 3) Click custom-card apply. **Observed:** the preset E2E-COUPON card flips to `applied`; the custom card stays in default state with the typed text still visible. **Question:** Is this the intended UX? It is consistent with the `customCode` `watchEffect` (`isInList` check from PR description), but a user might be confused that "their typed code went somewhere else". Possibly intentional UX deduplication. | Low (UX clarity) | Network body trimmed correctly: `"coupon":"E2E-COUPON"` |
| 4 | **Observation** | View-all link href is `/account/coupons`, but AC-3 and CL-012 specify `/account/promotion-coupons` | Verified: `/account/coupons` → 200 with H1 "All coupons & promotions"; `/account/promotion-coupons` → 404. Functionality is correct; documentation in `scope.md` AC-3, `testing-checklist.md` VCST4896-CL-012 needs an update. | Doc-only | `/account/promotion-coupons` page title = "QA & 404 Page not found" |
| 5 | **Risk** | Discriminator between `invalid` and `failed` collapses real-world 5xx server errors into the "invalid" path | A real backend that returns HTTP 500 with a GraphQL `{errors:[…]}` payload (the most common shape for server errors that still produce a parseable GraphQL response) will surface as "This code is not valid", masking the actual server issue. The `failed` path only fires for genuine network exceptions (no response). Worth confirming with PM whether this is the intended UX; if not, the discriminator should also key on HTTP status or `extensions.code`. | Medium (production observability) | Variant A vs B comparison in section 1 |
| 6 | **Observation** | Trim is applied at request time, not visually | Typed text retains leading/trailing whitespace in the custom-card input even after a successful apply. Pre-existing `useCoupon.ts › applyCoupon` is doing `.trim()` on the value passed to the mutation, but the input's `customCode` ref still holds the un-trimmed string. Cosmetic; not user-facing impact. | Low | `customInputValue: "  E2E-COUPON  "` after successful apply |
| 7 | **Bug** (likely pre-existing, not introduced by PR #2269) | Cart does not persist across sign-out / sign-in for slot 3 (BuildRight org) | 1) Apply coupon on `/cart` with 1 item. 2) Sign out via account menu → Logout. 3) Sign back in with same credentials. 4) Navigate to `/cart`. **Observed:** cart is empty ("Your cart is empty"). **Expected (BL-CART-008):** cart restored with items + coupon still applied. | Medium (cross-domain, BL-CART-008 violation) | Body text "Your cart is empty" after sign-out/in. Recommend qa-frontend-expert verify on slot 1 (TechFlow) before filing — may be org-specific or pre-existing. |
| 8 | **Observation** | Mobile (375×812) layout for `<CouponsSection>` is clean | All cards stack vertically; no horizontal overflow; custom-code input width adapts. PASS. | None | `mobile-coupons-section.png` |
| 9 | **Observation** | i18n keys resolve correctly in RU locale | All 5 new keys (`title`, `expires`, `custom_code`, `enter_custom_code`, `all_coupons`) translate. Preset coupon names (`QA Cart Threshold`, etc.) remain in English — backend data, not i18n keys, expected. | None | RU section title "Скидки и купоны"; placeholder "Введите пользовательский код" |

---

## 5. Coverage Notes — Areas Not Covered

| Area | Reason | Recommendation |
|---|---|---|
| Refresh during in-flight `addCartCoupon` | Time budget; non-deterministic | Defer to a network-throttled session |
| Slow-3G load of `getPromotionCoupons` | Requires DevTools throttle, edge MCP doesn't expose | Use Chrome DevTools MCP for next session |
| Coupon expiry mid-checkout | No coupon with imminent expiry available; admin time-zone manipulation outside session scope | Seed an expiring coupon via Admin and re-test |
| Two-tab sync (apply in tab A, refresh tab B) | Time budget | qa-frontend-expert can cover in Chrome session |
| Checkout-review `appliedCouponCode` (CL-013) | Single-page checkout in this build — `/checkout/review` not reachable as separate step (`checkout_multistep_enabled = false` per project memory) | Re-test once multistep flag is enabled, or document as N/A for this env |
| BOPIS cart variant of CouponsSection | Slot 3 cart had no pickup-eligible items | qa-frontend-expert should add a pickup-eligible item and verify section renders |
| Quote conversion preserving applied coupon | BuildRight org doesn't expose quote module in this run | Re-test on a slot/org that has quote requests enabled |
| BL-CART-008 sign-out/sign-in persistence on slot 1 (TechFlow) | Out of agent slot scope | Cross-check Finding #7 on slot 1 to determine if this is BuildRight-specific |

---

## 6. Recommended Follow-Ups

1. **File Finding #1 as JIRA bug** (P1, Frontend): error UI mis-attribution for failed path. Reproducible in <30 s with the fetch-throw recipe in section 1. STR ready for `/qa-bug`.
2. **File Finding #2 as JIRA bug** (P2, Frontend): missing rate-limit guard on apply button. STR ready.
3. **Update VCST-4896 documentation**: change AC-3 and CL-012 from `/account/promotion-coupons` to `/account/coupons` (or confirm with PM which URL is the source of truth).
4. **PM/Dev question — Finding #5**: confirm whether HTTP 5xx with parseable `errors[]` should fall into `failed` path instead of `invalid`. If yes, update the discriminator in `useCoupon.ts › applyCoupon`.
5. **Cross-check Finding #7** on slot 1 (TechFlow). If reproducible, file as a separate cart-persistence bug not tied to VCST-4896.

---

## 7. Sign-off

- **Charter outcome:** Mission accomplished — found 2 clear bugs, 1 question for PM, 1 doc inconsistency, 1 design risk, 1 likely pre-existing cart-persistence bug, 3 observations on mobile/i18n/trim. New CouponsSection itself is functionally solid; the issues are in error-UX attribution and concurrent-click hardening.
- **Pass-rate during session:** Of explicitly verified items — 6/8 PASS (i18n, mobile, radio-button sequencing, link target functionality, network trim, normal apply); 2/8 FAIL (failed-error attribution, rapid-click guard).
- **Time used:** ~20 minutes (within budget).
