# VCST-4867 Test Execution Report: Secure Layout Header z-index Fix

**Ticket:** VCST-4867
**PR:** VirtoCommerce/vc-frontend#2241
**Date:** 2026-04-14
**Tester:** qa-frontend-expert (playwright-chrome)
**Environment:** https://localhost:3000 (QA, v2.46.0)
**Browser:** Chromium (Playwright MCP)

---

## Summary

The fix changes the secure layout header's CSS class from `z-10` to `z-20`, matching the common layout header z-index. This prevents dropdown menus in the checkout content area from rendering above the sticky header.

**Overall Verdict: PASS**

---

## Test Results

### 1. Bug Verification (Primary)

#### 1.1 Checkout page -- header z-index: PASS

- Navigated to `/checkout/shipping` (via cart -> Proceed to checkout)
- Secure layout header confirmed with:
  - CSS class: `z-20` present, `z-10` absent
  - Computed z-index: `20`
  - Position: `sticky`
  - Full class list: `sticky top-0 z-20 flex h-14 items-center justify-between gap-3 bg-additional-50 px-6 shadow-md lg:h-auto lg:px-12 lg:py-5 print:relative print:px-0 print:shadow-none`
- Opened "Delivery method" dropdown -- dropdown popover body has `z-index: 10` (position: absolute)
- **Header (z-20) correctly renders ABOVE the dropdown (z-10)**
- Opened "Select address" modal -- header visible behind overlay, no stacking issue
- **Screenshots:** `04-checkout-secure-header.png`, `05-checkout-dropdown-open.png`, `06-checkout-address-selector.png`

#### 1.2 Sign-in page -- header z-index: N/A (OBSERVATION)

- `/sign-in` uses the **common layout** (full header with navigation, banner, footer), NOT the secure layout
- The secure layout is only used on the checkout flow pages
- Common layout header also uses `z-20` -- consistent
- **Screenshot:** `01-sign-in-page-header.png`

#### 1.3 Sign-up / Registration page: N/A (OBSERVATION)

- `/sign-up` uses the common layout, NOT the secure layout
- No secure layout header to test here

#### 1.4 Forgot Password page: N/A (OBSERVATION)

- `/forgot-password` uses the common layout, NOT the secure layout
- No secure layout header to test here

**Note:** The ticket description states the secure layout is used on sign-in, sign-up, forgot-password, reset-password, and confirm-email. However, the deployed storefront (v2.46.0) uses the common layout for these pages. The secure layout is only active on the `/checkout/*` pages. This may be a documentation discrepancy or future planned change.

### 2. Visual Regression

#### 2.1 Header appearance unchanged: PASS

- Checkout header displays: logo ("B2B-store"), lock icon, "Secure checkout" text
- `shadow-md` class present (header has drop shadow)
- Sticky behavior confirmed (`sticky top-0`)
- No visual differences observed
- **Screenshots:** `04-checkout-secure-header.png`, `12-desktop-checkout-final.png`

#### 2.2 Common header NOT affected (regression check): PASS

- Homepage common layout header: `sticky top-0 z-20 shadow-md print:hidden`
- z-index: 20 (same as before, consistent with secure layout)
- Account menu dropdown opens correctly in the top bar area
- Navigation menu items render correctly
- No z-index regression on common layout
- **Screenshots:** `07-homepage-account-dropdown.png`, `08-homepage-account-menu-open.png`

### 3. Edge Cases

#### 3.1 Mobile viewport (375px): PASS

- Secure layout header remains sticky at top with z-20
- Header height: 56px (h-14)
- "Secure checkout" text hidden on mobile (display: none) -- correct responsive behavior (`hidden xs:inline` class)
- Only logo + lock icon visible on mobile
- Delivery method dropdown renders below header correctly
- **Screenshots:** `09-mobile-checkout-header.png`, `10-mobile-checkout-top.png`

#### 3.2 Scroll behavior: PASS

- Fast scroll on checkout page -- header remains pinned at top, no flicker
- Verified on both desktop (1920px) and mobile (375px) viewports
- **Screenshot:** `11-mobile-scroll-sticky.png`

---

## Console Errors

- **Checkout page:** 0 JS errors, 0 warnings related to the fix
- **Session-wide:** 5 errors total -- all are 404s for `/api/files/*_sm:0` (missing product review image thumbnails on the product detail page). Pre-existing data issue, unrelated to this fix.

## Network Errors

- All GraphQL API calls returned 200 OK
- `dc.services.visualstudio.com` ERR_ABORTED -- Azure Application Insights telemetry, known non-issue

---

## Key Technical Finding

| Element | z-index | Position |
|---------|---------|----------|
| Secure layout header (after fix) | **20** (`z-20`) | sticky |
| Common layout header | **20** (`z-20`) | sticky |
| Dropdown popover body (`.vc-popover__body`) | **10** | absolute |

The fix correctly resolves the stacking context conflict. Previously, both the secure header and dropdown popovers had z-index 10, causing the dropdown to potentially render above the header. With z-index 20 on the header, it now consistently renders above all content-area dropdowns.

---

## Screenshots Inventory

| # | File | Description |
|---|------|-------------|
| 01 | `01-sign-in-page-header.png` | Sign-in page with common layout header |
| 02 | `02-product-page.png` | Product page (adding item to cart) |
| 03 | `03-cart-page.png` | Cart page before checkout |
| 04 | `04-checkout-secure-header.png` | Checkout page with secure layout header |
| 05 | `05-checkout-dropdown-open.png` | Delivery method dropdown open -- header above |
| 06 | `06-checkout-address-selector.png` | Address selector modal on checkout |
| 07 | `07-homepage-account-dropdown.png` | Homepage common layout regression check |
| 08 | `08-homepage-account-menu-open.png` | Account menu open on homepage |
| 09 | `09-mobile-checkout-header.png` | Mobile checkout (375px) scrolled |
| 10 | `10-mobile-checkout-top.png` | Mobile checkout top with dropdown open |
| 11 | `11-mobile-scroll-sticky.png` | Mobile scroll sticky header verification |
| 12 | `12-desktop-checkout-final.png` | Desktop checkout final state |
