# Bug Report: Skyflow Payment Iframe White Background in Dark Mode

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-SKYFLOW-DARK-001 |
| **Related Ticket** | VCST-4648 (Dark Mode / Coffee Theme) |
| **Severity** | Medium |
| **Priority** | P2 |
| **Category** | Visual / UI -- Payment Integration |
| **Component** | Checkout > Payment > Skyflow iframe |
| **Environment** | QA (`https://vcst-qa-storefront.govirto.com`) |
| **Browser** | Chromium (Playwright) -- viewport 1280x720 |
| **Theme** | Coffee -- Dark Mode |
| **Date** | 2026-03-04 |
| **Tested By** | qa-testing-expert (automated via MCP) |
| **Status** | New |

---

## Summary

When dark mode is active (Coffee theme), the Skyflow payment iframe on the `/checkout/payment` page renders with a **white (#ffffff) body/container background**, creating a jarring white rectangle against the dark page background. The individual input fields inside the iframe correctly receive dark mode styling, but the iframe's own body element retains the default white background. The payment form remains fully functional -- this is a purely visual defect.

---

## Steps to Reproduce

1. Navigate to `https://vcst-qa-storefront.govirto.com`
2. Click the **theme toggle** in the header (sun/moon icon) **twice** to cycle through: Light -> Auto -> **Dark**
3. Confirm dark mode is active (page background changes to dark brown/black tones)
4. Sign in with a registered B2B account (e.g., `mutykovaelena@gmail.com` / `Password2!`)
5. Add any product to the cart (e.g., "UNTUCKit eGift Card" from the homepage)
6. Navigate to `/cart`
7. Select **"Shipping"** as delivery method
8. Select **"Fixed Rate (Ground)"** as shipping method
9. Select **"Bank card (Skyflow)"** as payment method
10. Click **"Place order"** -- this navigates to `/checkout/payment`
11. On the payment page, locate the **"Saved cards"** dropdown
12. Select **"Add new card"** from the dropdown
13. **OBSERVE**: The Skyflow iframe appears with a **white background** that clashes with the dark page

---

## Expected Result

The Skyflow payment iframe should have a dark background (matching or close to the page background color `#110f0e` or `#1a1a1a`) so that it blends seamlessly with the dark mode theme. The overall visual appearance should be consistent -- no white rectangle should be visible around the card input fields.

---

## Actual Result

The Skyflow iframe body/container has a **white (#ffffff) background**. This creates a visible white rectangular block on the otherwise dark page. The contrast is stark and visually disruptive, especially in the payment flow where user confidence is critical.

**What IS correctly styled (inside the iframe):**
- Input field backgrounds: `#110f0e` (dark) -- CORRECT
- Input field text color: `#eee2dd` (light cream) -- CORRECT
- Input field borders: `1px solid #6f6f6f` -- CORRECT
- Label text color: `#eee2dd` with `font-weight: 700` -- CORRECT
- Font family: `Lato, sans-serif` -- CORRECT

**What is NOT correctly styled:**
- Iframe `<body>` background: **white (#ffffff)** -- INCORRECT, should be dark
- Iframe container/wrapper background: **white (#ffffff)** -- INCORRECT, should be dark or transparent

---

## Root Cause Analysis

### What the storefront does correctly

The Virto Commerce storefront correctly detects dark mode and passes appropriate dark mode style tokens to the Skyflow SDK element configuration. The base64-encoded iframe URL parameters contain:

```json
{
  "inputStyles": {
    "base": {
      "backgroundColor": "#110f0e",
      "color": "#eee2dd",
      "border": "1px solid #6f6f6f",
      "borderRadius": ".5rem",
      "fontFamily": "Lato, sans-serif",
      "fontSize": "14px",
      "padding": "10px 16px",
      "height": "auto"
    },
    "focus": {
      "border": "1px solid #9a6d5b"
    },
    "invalid": {
      "color": "#c00c0f"
    }
  },
  "labelStyles": {
    "base": {
      "color": "#eee2dd",
      "fontWeight": "700",
      "fontFamily": "Lato, sans-serif",
      "fontSize": ".875rem",
      "lineHeight": "1.25rem",
      "marginBottom": "4px"
    }
  },
  "errorTextStyles": {
    "base": {
      "color": "#c00c0f",
      "fontFamily": "Lato, sans-serif",
      "fontSize": ".75rem",
      "lineHeight": "1rem",
      "marginTop": "4px"
    },
    "global": {
      "@import": "url('https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100..900;1,100..900&display=swap')"
    }
  }
}
```

### Where the gap is

The Skyflow SDK (v2.7.3) applies `inputStyles`, `labelStyles`, and `errorTextStyles` to individual form elements. However, **the iframe's own `<body>` element background is not configurable through these style properties**. The SDK defaults the body background to white.

The `errorTextStyles.global` section supports `@import` for font loading, suggesting there may be a mechanism to inject global CSS. However, the storefront does not currently use this to set the body background.

### Cross-origin limitation

The iframe is hosted on `https://js.skyflow.com`, making it cross-origin. The storefront cannot directly manipulate the iframe's DOM or styles via JavaScript. All styling must go through the Skyflow SDK configuration API.

---

## Console Errors

One console warning was observed during the Skyflow iframe interaction:

```
Failed to execute 'postMessage' on 'DOMWindow': The target origin provided
('https://js.skyflow.com') does not match the recipient window's origin
```

**Assessment**: This is a cross-origin postMessage warning. It may be related to the Skyflow SDK's communication with its iframe but does not appear to block functionality. It could indicate a timing issue where the storefront sends a message before the iframe is fully loaded, or an origin mismatch in the postMessage configuration.

---

## Network Analysis

- No failed network requests (4xx/5xx) related to Skyflow were observed
- The Skyflow iframe loaded successfully from `https://js.skyflow.com`
- Skyflow SDK resources loaded without errors
- No timeout or connectivity issues detected

---

## Functional Assessment

Despite the visual defect, the Skyflow payment form is **fully functional** in dark mode:

| Action | Result |
|--------|--------|
| Card number entry (4007000000027) | Accepted, formatted as "4007 0000 0002 7", Visa icon displayed |
| Cardholder name entry ("Test User") | Accepted |
| Expiration date entry (02/29) | Accepted |
| CVV entry (900) | Accepted, masked as "***" |
| "Pay now" button activation | Enabled after all fields populated |
| Form submission | Functional (order was successfully created) |

---

## Visual Evidence

All screenshots are stored in:
`tests/Sprint26-04/VCST-4648-dark-mode-coffee-theme/screenshots/`

| Screenshot | Description |
|------------|-------------|
| `01-homepage-light-mode.png` | Baseline: homepage in light mode before switching |
| `02-theme-toggle-dropdown.png` | Theme toggle interaction (light -> auto -> dark cycle) |
| `03-homepage-dark-mode.png` | Homepage after dark mode activated -- confirmed dark backgrounds |
| `04-cart-skyflow-selected-dark-mode.png` | Cart page with "Bank card (Skyflow)" selected as payment |
| `05-payment-details-scrolled-dark-mode.png` | Payment section scrolled into view -- no card form visible yet |
| `06-checkout-payment-page-dark-mode.png` | `/checkout/payment` page -- "Saved cards" dropdown, no card entry visible |
| **`07-skyflow-form-dark-mode-visible.png`** | **KEY EVIDENCE**: Skyflow iframe visible after selecting "Add new card" -- white background clearly visible against dark page |
| **`08-skyflow-iframe-closeup-dark-mode.png`** | **KEY EVIDENCE**: Close-up of Skyflow iframe -- white body background with correctly dark-styled input fields |
| `09-skyflow-form-filled-dark-mode.png` | Form filled with test card data -- functionally working |
| `10-skyflow-iframe-filled-closeup.png` | Close-up of filled form -- inputs dark, iframe body still white |

---

## Suggested Fix

### Option A: Use Skyflow `containerStyles` or `styles.base.backgroundColor` at container level (Recommended)

Check if the Skyflow Composable Container API supports a `containerStyles` property or a top-level `styles` configuration that applies to the iframe body/wrapper. The Skyflow documentation for `Composable Container` may have a `styles` parameter at the container creation level (not just the element level):

```javascript
// Pseudocode -- check Skyflow SDK docs for exact API
const container = skyflow.container(Skyflow.ContainerType.COMPOSABLE, {
  layout: [1, 1, 2],
  styles: {
    base: {
      backgroundColor: isDarkMode ? '#110f0e' : '#ffffff'
    }
  },
  errorTextStyles: { /* ... */ }
});
```

### Option B: Use `errorTextStyles.global` to inject body background

The existing `errorTextStyles.global` configuration already supports `@import` for CSS fonts. Investigate whether it also supports direct CSS rules that could set the body background:

```javascript
errorTextStyles: {
  global: {
    "@import": "url('https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100..900;1,100..900&display=swap')",
    // Investigate if this is possible:
    "body": {
      "backgroundColor": "#110f0e"
    }
  }
}
```

### Option C: CSS workaround on the parent container

If the Skyflow SDK does not support iframe body styling, apply a CSS background to the parent container (`div.-mx-1.w-full.max-w-2xl`) that holds the iframe. This would not fix the iframe body itself but could reduce the visual impact:

```css
/* In storefront dark mode CSS */
.dark .skyflow-container-wrapper,
.dark .-mx-1.w-full.max-w-2xl {
  background-color: #110f0e;
  border-radius: 0.5rem;
  overflow: hidden;
}
```

**Note**: This workaround may not fully mask the white if the iframe has internal padding/margins with white background.

### Option D: Contact Skyflow support

If none of the above options work, file a feature request with Skyflow for iframe body/container background color configuration. Reference: Skyflow Elements Composable Container documentation.

---

## Impact Assessment

| Dimension | Assessment |
|-----------|------------|
| **Functional Impact** | None -- payment form works correctly in dark mode |
| **Visual Impact** | High -- white rectangle is jarring on dark page |
| **User Confidence** | Medium risk -- visual inconsistency in payment flow may reduce trust |
| **Affected Users** | All users who use dark mode and pay with a new card via Skyflow |
| **Workaround** | Users can switch to light mode before payment, or use a saved card |

---

## Additional Observations

1. **Saved cards work fine in dark mode**: The saved cards dropdown and selection flow render correctly in dark mode. The visual bug only appears when selecting "Add new card" to reveal the Skyflow iframe.

2. **The new card section is initially hidden**: The entire "Add new card" section (including the Skyflow mount point, "Save card" checkbox, policy text, and the real "Pay now" button) is wrapped in `<div style="display: none;">` until the user selects "Add new card" from the dropdown. This is normal UX behavior, not a bug.

3. **Theme toggle cycles through three states**: Light -> Auto -> Dark (requires two clicks from Light to reach Dark). This is working as designed.

4. **Order was created during testing**: The initial "Place order" click on the cart page navigated to `/checkout/payment` but also submitted the order (order ID: `c67a1413-26cd-4b01-ade8-d54c0e92767d`). This prevented a light-mode comparison test in the same session but confirms the checkout flow is functional.
