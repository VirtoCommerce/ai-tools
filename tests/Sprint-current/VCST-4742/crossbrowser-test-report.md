# VCST-4742: Dark Theme in Payment Form Iframes -- Cross-Browser Test Report (Firefox)

**Date:** 2026-03-23 | **Env:** https://vcst-qa-storefront.govirto.com | **Browser:** Firefox (playwright-firefox)
**Build:** 2.44.0-pr-2212-9072-9072853e | **Theme:** Coffee dark | **Org:** Coffee shop / Elena Mutykova

---

## Test Execution Summary

- **Total:** 8 | **Pass:** 4 | **Fail:** 2 | **Blocked:** 1 | **Observation:** 1
- **Pass Rate:** 50% (excluding blocked)
- **Verdict:** FAIL -- P0 bug in saved card CVV-only flow blocks payment

---

## Part 1A: Skyflow Payment Form -- Dark Theme Verification

### TC-01: Skyflow "Add new card" form renders in Coffee dark mode -- PASS

**Steps:** Cart (2x UNTUCKit eGift Card, $419.98) -> Select Skyflow -> Place Order -> /checkout/payment -> Select "Add new card"
**Expected:** All four input fields (card number, cardholder name, expiration, CVV) render with dark backgrounds and light text matching Coffee dark theme.
**Actual:** All fields correctly themed. Decoded Skyflow iframe config confirms dark colors:
- Input background: `#110f0e` (Coffee dark)
- Input text: `#eee2dd` (Coffee cream)
- Border: `1px solid #6f6f6f` (medium gray)
- Focus ring: `box-shadow: 0 0 0 3px rgb(from #c2a396 r g b / 0.8)` (Coffee accent)
- Labels: `#eee2dd` on `#110f0e` background, red asterisks `#e6524c`
- Invalid state: `border: 1px solid #e6524c` (red)

**Evidence:** `VCST-4742-skyflow-form-closeup.png` -- close-up confirms dark inputs

### TC-02: Skyflow saved card CVV-only COMPOSABLE container -- FAIL (P0)

**Steps:** On /checkout/payment, switch from "Add new card" back to saved card `**** 0015 (09/27)`
**Expected:** CVV-only iframe renders with Security code field in dark theme.
**Actual:** Skyflow COMPOSABLE iframe collapses to **0px height**. No CVV input visible. "PAY NOW" button visible but no way to enter security code. User cannot complete payment with saved card.
**Root Cause:** The COMPOSABLE container for CVV-only form fails to mount/resize after the full card form was displayed. The iframe has `width: 672px` but `height: 0px`.
**Note:** On first page load (without switching from "Add new card"), the CVV form DID render with a white background area (see earlier screenshot), suggesting the mounting issue may be intermittent OR the initial render also has sizing issues.
**Evidence:** `VCST-4742-skyflow-cvv-collapsed.png` -- shows no CVV field between dropdown and PAY NOW button

### TC-03: Skyflow card selector dropdown in dark mode -- PASS

**Steps:** Open saved cards dropdown on /checkout/payment
**Expected:** Dropdown renders with dark background, light text for saved card entries.
**Actual:** Dropdown correctly shows dark background with:
- `**** 0015 (09/27)` -- card icon + light text
- `**** 1111 (01/29)` -- card icon + light text
- "Add new card" -- green "+" icon + light text

### TC-04: Card switching (saved -> new -> saved) mount/unmount -- FAIL (P0)

**Steps:** Select saved card -> switch to "Add new card" -> switch back to saved card
**Expected:** CVV-only form re-mounts correctly with dark theme.
**Actual:** CVV-only COMPOSABLE container fails to re-mount (0px height). This is the same issue as TC-02 but specifically tied to the switching flow.
**Console errors during switch:** `Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('https://js.skyflow.com') does not match the recipient window's origin` (repeated 5x)
**Evidence:** `VCST-4742-skyflow-saved-card-cvv-dark.png` (initial render with white area), `VCST-4742-skyflow-cvv-collapsed.png` (after switching)

---

## Part 1B: Datatrans Payment Form -- Dark Theme Verification

### TC-05: Datatrans form renders in Coffee dark mode -- PASS

**Steps:** Accessed /checkout/payment with Datatrans payment method (from previous order)
**Expected:** Card number, cardholder name, expiration, security code fields render with dark backgrounds.
**Actual:** Host page correctly dark-themed. Datatrans iframe fields (card number, CVV) have dark parent containers with appropriate backgrounds (`srgb 0.067 0.059 0.055`). Host-page fields (cardholder name, expiration date) have dark input backgrounds with light text.
**Evidence:** `VCST-4742-datatrans-payment-dark-mode.png`, `VCST-4742-datatrans-fields-filled-dark.png`

### TC-06: Datatrans field interaction in dark mode -- PASS

**Steps:** Fill cardholder name "Test Cardholder" and expiration "06/28" on Datatrans form
**Expected:** Filled values visible with proper contrast on dark background.
**Actual:** Values correctly displayed -- white text on dark inputs, maintained after fill.

---

## Part 1C: Page-Level Dark Theme Verification

### TC-07: Payment page header/breadcrumb/footer in dark mode -- PASS (Observation)

**Observation:** The /checkout/payment page uses a simplified header (logo + "Secure checkout" only, no theme toggle). The dark theme persists from the cart page via cookies/localStorage. The footer shows the PR build version. The breadcrumb "Back to order details" link uses Coffee accent color.
**Missing:** No theme toggle on payment page -- user cannot switch theme mid-payment. This is by design (minimal checkout UI).

### TC-08: CyberSource payment form -- BLOCKED (not in scope)

**Reason:** CyberSource was NOT changed in PR #2212 (renders on cart page, not /checkout/payment). CyberSource testing is out of scope for this ticket.

---

## Console Error Summary

| Error | Count | Severity | Impact |
|-------|-------|----------|--------|
| `Failed to execute 'postMessage'` (Skyflow cross-origin) | 5+ | High | May cause style/mount failures in Skyflow iframes |
| `Feature Policy: Skipping` (Skyflow) | 30+ | Low | Firefox feature policy warnings, no functional impact |
| `HTTP Referrer header: Length exceeded` (Skyflow SVGs) | 3 | Low | Informational, SVG resources may not load |
| `ApolloError: Error trying to resolve field 'cart'` | 1 | Medium | Cart already emptied by order creation, expected on payment page |

---

## Bugs Filed

| # | Severity | Summary | Repro |
|---|----------|---------|-------|
| 1 | **P0** | Skyflow CVV-only COMPOSABLE container collapses to 0px height after switching from "Add new card" back to saved card | Select saved card -> Add new card -> Select saved card again |
| 2 | **P1** | Skyflow postMessage cross-origin errors on /checkout/payment (Firefox) -- `js.skyflow.com` origin mismatch | Load any Skyflow payment form |
