# VCST-4702 Dark Mode Checklist Retest: Payment Methods

**Date:** 2026-03-16
**Tester:** qa-frontend-expert (Claude Opus 4.6)
**Browser:** Playwright Chromium (1920x1080)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Build:** 2.44.0-pr-2202-2d84-2d84f2a4

---

## Summary

| ID | Title | Priority | Result | Notes |
|----|-------|----------|--------|-------|
| DM-011 | Datatrans Payment Inputs Dark Mode | High | CONDITIONAL PASS | Wrapper styling correct; iframe content has white background (cross-origin limitation) |
| DM-061 | Datatrans Focus Rings Dark Mode | High | CONDITIONAL PASS | Native fields show correct focus ring; iframe fields cannot propagate focus (cross-origin) |
| DM-063 | Skyflow Payment Label lineHeight (Dark) | Medium | PASS | `lineHeight: 1.25rem` confirmed in SDK config; labels properly spaced in dark mode |
| DM-074 | Skyflow lineHeight in Light Mode | Medium | PASS | `lineHeight: 1.25rem` confirmed in SDK config; layout intact in light mode |
| CyberSource | CyberSource Dark Mode Follow-up | High | KNOWN ISSUE | CyberSource iframe fields have white backgrounds in dark mode (same cross-origin limitation as Datatrans) |

**Overall verdict:** 2 PASS, 2 CONDITIONAL PASS, 1 KNOWN ISSUE

---

## Detailed Results

### DM-011: Datatrans Payment Inputs Dark Mode

**Result: CONDITIONAL PASS**

**What was tested:**
- Navigated to cart page, selected "Bank card (Datatrans)" payment method, clicked "Place order" to reach `/checkout/payment`
- Verified dark mode styling of Datatrans payment form

**Evidence:**
- Screenshots: `cl-retest-pay-03-cart-datatrans-selected-dark.png`, `cl-retest-pay-04-datatrans-payment-dark.png`
- Wrapper `.datatrans-input-wrap` has correct dark background: `srgb 0.039 0.035 0.043` (~`#0a090b`)
- Labels ("Card number", "Cardholder name", "Expiration date", "Security code") are readable in dark mode
- Native fields (Cardholder name, Expiration date) have proper dark styling with dark background and light text

**Issue found:**
- Card number and Security code fields are rendered inside cross-origin Datatrans iframes. The iframe content has a WHITE background that breaks the dark layout. This is a cross-origin limitation -- the parent page cannot style iframe internals. The Datatrans SDK would need to accept style configuration parameters (similar to how Skyflow does) to resolve this.
- This is a pre-existing architectural limitation, not a regression from the PR.

---

### DM-061: Datatrans Focus Rings Dark Mode

**Result: CONDITIONAL PASS**

**What was tested:**
- Focused each Datatrans input field and verified focus ring appearance
- Inspected CSS rules for `.datatrans-input-wrap` and `.datatrans-input-wrap.focused`

**Evidence:**
- Screenshots: `cl-retest-pay-05-datatrans-cardholder-focus-dark.png`, `cl-retest-pay-06-datatrans-expdate-focus-dark.png`, `cl-retest-pay-07-datatrans-cardnum-focus-dark.png`

**CSS rules confirmed (via DevTools):**
```css
/* Base rule */
.datatrans-input-wrap {
  --color: var(--vc-input-base-color, var(--color-primary-500));
  --focus-color: rgb(from var(--color) r g b / .3);
}

/* Focused state */
.datatrans-input-wrap.focused {
  --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(3px + var(--tw-ring-offset-width)) var(--tw-ring-color);
  --tw-ring-color: var(--focus-color);
}

/* Dark mode override — opacity increased to 0.8 for visibility */
html.dark .datatrans-input-wrap {
  --focus-color: rgb(from var(--color) r g b / .8);
}
```

**Focus ring behavior by field:**
| Field | Type | Focus Ring Visible | Color |
|-------|------|-------------------|-------|
| Cardholder name | Native input | Yes | Amber/golden (correct) |
| Expiration date | Native input | Yes | Amber/golden (correct) |
| Card number | Cross-origin iframe | No | N/A (`.focused` class not toggled) |
| Security code | Cross-origin iframe | No | N/A (`.focused` class not toggled) |

**Issue found:**
- `:focus-within` does not propagate across cross-origin iframe boundaries. The Datatrans SDK is expected to add/remove a `.focused` class on the wrapper via JS event handlers, but `hasFocusWithin` remained `false` even when iframe fields were focused.
- Computed values when Card number iframe is focused: `--focus-color: rgb(from #c00c0f r g b / .8)` (error state color), `--color: #c00c0f`
- Computed values for Security code: `--focus-color: rgb(from #bf8b38 r g b / .8)`, `--color: #bf8b38`
- The CSS implementation is correct. The issue is in the SDK event binding for the `.focused` class toggle.

---

### DM-063: Skyflow Payment Label lineHeight (Dark Mode)

**Result: PASS**

**What was tested:**
- Navigated to Skyflow payment form in dark mode by selecting "Bank card (Skyflow)" and clicking "Place order"
- Clicked "Add new card" to expose the Skyflow collect form iframe
- Decoded the base64 Skyflow SDK configuration from the iframe URL

**Evidence:**
- Screenshots: `cl-retest-pay-08-skyflow-payment-dark.png`, `cl-retest-pay-09-skyflow-addcard-dark.png`

**Skyflow SDK config (dark mode) -- decoded from iframe URL:**
```json
{
  "labelStyles": {
    "base": {
      "fontFamily": "Lato, sans-serif",
      "fontSize": "1rem",
      "fontWeight": "700",
      "lineHeight": "1.25rem",
      "paddingBottom": "0.25rem",
      "color": "#e9edf2",
      "background": "#0a090b"
    },
    "requiredAsterisk": { "color": "#e6524c" }
  },
  "inputStyles": {
    "base": {
      "lineHeight": "1.25rem",
      "background": "#0a090b",
      "border": "1px solid #6e6e70",
      "color": "#e9edf2",
      "&:focus": "border: 1px solid transparent; box-shadow: 0 0 0 3px rgb(from #e9be8c r g b / 0.8)"
    }
  }
}
```

**Verification:**
- `lineHeight: 1.25rem` is applied to BOTH `labelStyles.base` and `inputStyles.base`
- Labels are properly spaced and readable (light text `#e9edf2` on dark background `#0a090b`)
- No white background issue -- Skyflow receives dark theme colors via SDK config
- Focus ring uses 0.8 opacity in dark mode (correct per dark mode override)
- "Saved cards" label (outside iframe): `lineHeight: 20px` (= 1.25rem), `fontSize: 16px`, `fontWeight: 700`

---

### DM-074: Skyflow lineHeight in Light Mode

**Result: PASS**

**What was tested:**
- Switched theme from dark to light mode via the theme toggle
- Added product to cart, selected Skyflow payment, placed order to reach `/checkout/payment`
- Clicked "Add new card" to expose the full Skyflow collect form
- Decoded the base64 Skyflow SDK configuration from the iframe URL

**Evidence:**
- Screenshots: `cl-retest-pay-10-skyflow-light-saved-cards.png`, `cl-retest-pay-11-skyflow-light-addnewcard.png`

**Skyflow SDK config (light mode) -- decoded from iframe URL:**
```json
{
  "labelStyles": {
    "base": {
      "fontFamily": "Lato, sans-serif",
      "fontSize": "1rem",
      "fontWeight": "700",
      "lineHeight": "1.25rem",
      "paddingBottom": "0.25rem",
      "color": "#0a0a0a",
      "background": "#ffffff"
    },
    "requiredAsterisk": { "color": "#de3131" }
  },
  "inputStyles": {
    "base": {
      "fontFamily": "Lato, sans-serif",
      "fontSize": "1rem",
      "lineHeight": "1.25rem",
      "background": "#ffffff",
      "borderRadius": ".5rem",
      "border": "1px solid #a3a3a3",
      "padding": "0.75rem",
      "color": "#0a0a0a",
      "&:focus": "border: 1px solid transparent; box-shadow: 0 0 0 3px rgb(from #f99e24 r g b / 0.3)"
    }
  }
}
```

**Verification:**
- `lineHeight: 1.25rem` is applied to BOTH `labelStyles.base` and `inputStyles.base` -- matches dark mode
- Light mode colors are correct: dark text `#0a0a0a` on white background `#ffffff`
- Focus ring uses 0.3 opacity in light mode (correct per light mode default)
- Labels are properly aligned, readable, and visually match the screenshot
- "Saved cards" label (outside iframe): `lineHeight: 20px` (= 1.25rem), `fontSize: 16px`, `fontWeight: 700`, `color: #0a0a0a`
- The `1.25rem` lineHeight addition does NOT break label layout in light mode

**Dark vs Light comparison:**

| Property | Dark Mode | Light Mode | Consistent? |
|----------|-----------|------------|-------------|
| labelStyles.lineHeight | 1.25rem | 1.25rem | Yes |
| inputStyles.lineHeight | 1.25rem | 1.25rem | Yes |
| label color | #e9edf2 | #0a0a0a | Yes (theme-appropriate) |
| background | #0a090b | #ffffff | Yes (theme-appropriate) |
| focus opacity | 0.8 | 0.3 | Yes (correct per spec) |

---

### CyberSource Dark Mode Follow-up

**Result: KNOWN ISSUE**

**What was tested:**
- Viewed CyberSource payment form on cart page in dark mode (CyberSource renders directly on cart, not on `/checkout/payment`)

**Evidence:**
- Screenshots: `cl-retest-pay-01-cart-cybersource-dark.png`, `cl-retest-pay-02-payment-dropdown-dark.png`

**Issue:**
- CyberSource Card number and Security code iframe fields display with white backgrounds in dark mode, breaking the dark layout
- This is the same cross-origin iframe styling limitation as Datatrans
- The parent `.cyber-source-input-wrap` has the correct dark mode CSS rule:
  ```css
  html.dark .cyber-source-input-wrap {
    --focus-color: rgb(from var(--color) r g b / .8);
  }
  ```
- However, the iframe content background cannot be controlled from the parent page
- This requires CyberSource Flex Microform API to support dark theme parameters

---

## Screenshots Index

| # | File | Description |
|---|------|-------------|
| 00 | cl-retest-pay-00-homepage-initial.png | Homepage, initial dark mode state |
| 01 | cl-retest-pay-01-cart-cybersource-dark.png | CyberSource on cart page, dark mode (white iframe issue) |
| 02 | cl-retest-pay-02-payment-dropdown-dark.png | Payment method dropdown, dark mode |
| 03 | cl-retest-pay-03-cart-datatrans-selected-dark.png | Datatrans selected on cart, dark mode |
| 04 | cl-retest-pay-04-datatrans-payment-dark.png | Datatrans payment form, dark mode |
| 05 | cl-retest-pay-05-datatrans-cardholder-focus-dark.png | Datatrans cardholder focus ring, dark mode |
| 06 | cl-retest-pay-06-datatrans-expdate-focus-dark.png | Datatrans expiration date focus ring, dark mode |
| 07 | cl-retest-pay-07-datatrans-cardnum-focus-dark.png | Datatrans card number focus (no ring), dark mode |
| 08 | cl-retest-pay-08-skyflow-payment-dark.png | Skyflow payment page with saved cards, dark mode |
| 09 | cl-retest-pay-09-skyflow-addcard-dark.png | Skyflow add new card form, dark mode |
| 10 | cl-retest-pay-10-skyflow-light-saved-cards.png | Skyflow payment page with saved cards, light mode |
| 11 | cl-retest-pay-11-skyflow-light-addnewcard.png | Skyflow add new card form, light mode |

---

## Console & Network

- **JS errors:** 0 (across all payment pages tested)
- **Warnings:** 2 (non-blocking `postMessage` warnings from Skyflow SDK -- expected cross-origin communication)
- **Failed network requests:** 0
- **Vue hydration warnings:** 0

---

## Orders Created During Testing

Three orders were placed during testing (required to reach the `/checkout/payment` page for Datatrans and Skyflow):

| Order ID | Payment Method | Status |
|----------|---------------|--------|
| cd45baee-... | Datatrans | Unpaid (abandoned at payment) |
| 9904a37d-... | Skyflow (dark mode) | Unpaid (abandoned at payment) |
| e1b22ef0-... | Skyflow (light mode) | Unpaid (abandoned at payment) |

These test orders should be cleaned up via Admin SPA.

---

## Recommendations

1. **Datatrans/CyberSource white iframe background (DM-011, CyberSource follow-up):** File a feature request with Datatrans and CyberSource to support theme/dark-mode parameters in their SDK configuration. Skyflow already handles this correctly by accepting style configuration objects.

2. **Datatrans focus ring on iframe fields (DM-061):** Investigate why the `.focused` class is not being toggled on `.datatrans-input-wrap` when iframe fields receive focus. The CSS implementation is correct -- the issue is in the SDK event binding. Check if the Datatrans `focus`/`blur` event handlers are properly registered.

3. **Skyflow lineHeight (DM-063, DM-074):** No action needed. The `1.25rem` lineHeight is correctly applied in both dark and light modes without layout issues.
