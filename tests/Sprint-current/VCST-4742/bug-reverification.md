# VCST-4742 Bug Reverification Report

**Date:** 2026-03-23
**PR:** #2212 (dark theme for payment form iframes)
**Deployed Version:** 2.44.0-pr-2212-9072-9072853e
**Environment:** https://vcst-qa-storefront.govirto.com
**Browser:** Firefox (playwright-firefox)
**Theme:** Coffee dark
**Account:** Coffee shop / Elena Mutykova (org account with saved Skyflow cards)
**Code changed since last test:** No

---

## BUG-1 (P0): Skyflow CVV-only COMPOSABLE container collapses to 0px height

**Status: CHANGED -- behavior differs from original report**

### STR Executed
1. Logged in, added item to cart (KODAK ColorPlus film, $99.99)
2. Selected Skyflow payment + Fixed Rate (Ground) shipping
3. Clicked "Place Order" -- redirected to /checkout/payment
4. Selected saved card **** 0015 (09/27) -- CVV iframe rendered (672x150px)
5. Switched to "Add new card" -- full 4-field form appeared correctly
6. Switched BACK to saved card **** 0015 -- CVV iframe rendered (672x150px)
7. Repeated cycle: Add new card -> **** 0015 again -- CVV iframe rendered (672x81px)

### Findings
- The CVV iframe does NOT collapse to 0px height after switching between saved card and "Add new card"
- The iframe renders with the Security code label and input field visible on every switch
- However, the iframe height is INCONSISTENT between renders:
  - First render (fresh selection): 150px
  - After first switch cycle (new card -> saved card): 150px
  - After second switch cycle: 81px
- At 81px, the CVV field is fully visible and functional (no white background leak either)
- At 150px, the CVV field is visible but includes excess white space below (see BUG-2)

### Assessment
The original 0px collapse is no longer reproducing. The iframe renders at either 150px or 81px depending on the render cycle, but is always usable. The 81px height actually appears to be the correct/ideal size. The 150px height includes excess whitespace from BUG-2.

**Evidence:**
- `reverify-BUG1-switch-back-saved-card.png` -- after first switch back (150px, CVV visible)
- `reverify-BUG1-second-switch-back.png` -- after second switch back (81px, CVV visible, no white leak)

---

## BUG-2 (P2): White background leak in CVV-only iframe (dark mode)

**Status: CONFIRMED -- still reproduces on initial render**

### STR Executed
1. Navigated to /checkout/payment in Coffee dark mode (fresh page load after Place Order)
2. Selected saved card **** 0015 (09/27) WITHOUT first switching to "Add new card"
3. Observed white rectangle below the Security code input field

### Findings
- On initial saved card selection, the Skyflow CVV-only iframe renders at 150px height
- The CVV field (label + input) occupies approximately the top 80px
- The remaining ~70px shows a WHITE background rectangle, contrasting sharply with the dark page
- Root cause: The iframe body element has a white background; only the inner container div inherits the dark theme styling, but the iframe's own body/html background is not set to match
- On subsequent re-renders (after switching new card -> saved card), the iframe height reduces to 81px and the white area disappears (the iframe is sized correctly to its content)

### Assessment
The bug is confirmed on the first/fresh render. It self-corrects on subsequent re-renders because the iframe height adjusts to 81px (matching the content). The underlying issue remains: the Skyflow CVV-only iframe body background is white in dark mode. It only becomes invisible when the height happens to match the content exactly.

**Evidence:**
- `reverify-BUG2-saved-card-fresh-dark.png` -- white rectangle clearly visible below CVV field
- `reverify-BUG1-second-switch-back.png` -- for comparison, no white leak at 81px height

---

## BUG-3 (P1): postMessage cross-origin errors

**Status: CONFIRMED -- still reproduces**

### STR Executed
1. Navigated to /checkout/payment with Skyflow payment
2. Selected saved card **** 0015
3. Switched to "Add new card"
4. Switched back to saved card **** 0015
5. Repeated the switch cycle once more

### Findings
- 3 `postMessage` errors accumulated during the session
- All errors are identical:
  ```
  Failed to execute 'postMessage' on 'DOMWindow': The target origin provided
  ('https://js.skyflow.com') does not match the recipient window's origin
  ('https://vcst-qa-storefront.govirto.com').
  ```
- Errors appear to fire once per Skyflow iframe creation (each time a card selection triggers a new COMPOSABLE container mount)
- The errors occur when the storefront code attempts to send a postMessage to the Skyflow iframe using `https://js.skyflow.com` as the target origin, but the iframe's window origin does not match at that moment (likely a timing issue during iframe initialization)
- Despite the errors, the Skyflow forms load and function correctly (fields are interactive, styling applies)

### Assessment
The errors are confirmed and consistent. While they do not block payment functionality, they indicate a cross-origin communication issue in the Skyflow SDK integration that could potentially cause intermittent failures under different timing conditions (slow network, heavy page load).

**Evidence:**
- `reverify-BUG3-console-errors.log` -- captured console output showing 3 errors

---

## Summary

| Bug | Original Severity | Status | Notes |
|-----|-------------------|--------|-------|
| BUG-1 | P0 | CHANGED | 0px collapse no longer reproduces; iframe height inconsistent (150px vs 81px) but CVV always visible and functional. Recommend downgrading to P2 (cosmetic height inconsistency). |
| BUG-2 | P2 | CONFIRMED | White background leak in CVV iframe on initial render in dark mode. Self-corrects on re-render. |
| BUG-3 | P1 | CONFIRMED | 3 postMessage cross-origin errors per session. Non-blocking but indicates SDK integration issue. |

### Recommendation
- **BUG-1** can be reclassified from P0 to P2. The critical 0px collapse that would block payment is no longer present. The inconsistent height (150px vs 81px) is cosmetic and may be related to BUG-2 (the 150px height includes the white background area).
- **BUG-2** and **BUG-1** may share a root cause: the Skyflow COMPOSABLE container does not correctly report its content height to the parent frame on the first render in CVV-only mode. On re-render, it corrects to 81px.
- **BUG-3** should remain P1 as cross-origin errors can mask or cause intermittent issues.
