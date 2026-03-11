# Execution Report — VCST-4648: Dark Mode (Coffee Theme) — Frontend Testing

**Ticket:** [VCST-4648](https://virtocommerce.atlassian.net/browse/VCST-4648)
**PR:** [vc-frontend#2200](https://github.com/VirtoCommerce/vc-frontend/pull/2200)
**Agent:** frontend-tester (qa-frontend-expert)
**Environment:** QA (`https://vcst-qa-storefront.govirto.com`)
**Version:** 2.43.0-pr-2200-cbd4-cbd47d7f
**Browser:** Chromium (Playwright MCP)
**Viewport:** 1920x1080 (desktop)
**Date:** 2026-03-04
**Test Account:** mutykovaelena@gmail.com / Boundaries Inc.

---

## Summary

| Section | Area | Tests | Pass | Fail | Skip | Status |
|---------|------|-------|------|------|------|--------|
| 1 | Toggle UI: Presence and Placement | 7 | 7 | 0 | 0 | PASS |
| 2 | Mode Switching: Light / Dark / System | 10 | 10 | 0 | 0 | PASS |
| 3 | Persistence and Session Behaviour | 7 | 7 | 0 | 0 | PASS |
| 5 | i18n and Localisation | 4 | 4 | 0 | 0 | PASS |
| 10 | Regression: Critical Revenue Flows | 9 | 9 | 0 | 0 | PASS |
| **Total** | | **37** | **37** | **0** | **0** | **PASS** |

**Decision: APPROVED** — All 37 test cases passed. No dark-mode-specific bugs found. Two pre-existing issues observed (not dark mode related).

---

## Section 1 — Toggle UI: Presence and Placement (7/7 PASS)

| TC ID | Title | Priority | Result | Notes |
|-------|-------|----------|--------|-------|
| TC-DM-001 | Toggle visible in desktop header | P0 | PASS | Moon icon visible next to phone number in top bar |
| TC-DM-002 | Toggle is a cycling button, not a dropdown | P1 | PASS | Single button cycles through modes on click |
| TC-DM-003 | Aria-label present and reflects current mode | P0 | PASS | `aria-label="Theme: dark"` / `"Theme: light"` / `"Theme: auto"` |
| TC-DM-004 | Toggle visible in mobile menu (375px) | P1 | PASS | Verified in mobile viewport |
| TC-DM-005 | Toggle icon changes per mode | P1 | PASS | Moon (dark), Sun (light), System (auto) icons |
| TC-DM-006 | Toggle is keyboard-accessible (Tab + Enter) | P2 | PASS | Focusable via Tab, activates via Enter |
| TC-DM-007 | No layout shift when toggle appears | P2 | PASS | No CLS observed during page load |

---

## Section 2 — Mode Switching: Light / Dark / System (10/10 PASS)

| TC ID | Title | Priority | Result | Notes |
|-------|-------|----------|--------|-------|
| TC-DM-010 | Click toggle: dark -> auto -> light -> dark cycle | P0 | PASS | Cycle confirmed: dark -> auto -> light -> dark |
| TC-DM-011 | Dark mode: `<html class="dark">` present | P0 | PASS | `document.documentElement.classList.contains('dark')` === true |
| TC-DM-012 | Light mode: `class="dark"` removed | P0 | PASS | Class removed, light theme applied |
| TC-DM-013 | System mode: follows OS prefers-color-scheme | P1 | PASS | Tested via `page.emulateMedia({ colorScheme: 'dark'/'light' })` |
| TC-DM-014 | `<style id="vc-theme-variables">` injected with dark vars | P1 | PASS | Style tag present with CSS custom properties |
| TC-DM-015 | CSS variables match coffee.dark.json palette | P1 | PASS | `--color-primary`, `--color-neutral-*` values confirmed |
| TC-DM-016 | Background switches to dark palette | P0 | PASS | Body background changes between modes |
| TC-DM-017 | Text color switches to light on dark | P0 | PASS | Text visible and legible in dark mode |
| TC-DM-018 | No flash of wrong theme during mode switch | P2 | PASS | Transition is instantaneous, no FOUC |
| TC-DM-019 | Console: no errors during mode toggle | P1 | PASS | No JS errors or Vue warnings on toggle |

---

## Section 3 — Persistence and Session Behaviour (7/7 PASS)

| TC ID | Title | Priority | Result | Notes |
|-------|-------|----------|--------|-------|
| TC-DM-020 | localStorage key `vc-color-mode` set to `"dark"` | P0 | PASS | Confirmed via `localStorage.getItem('vc-color-mode')` |
| TC-DM-021 | Refresh page: dark mode persists | P0 | PASS | Page reload retains dark mode |
| TC-DM-022 | Switch to light, refresh: light persists | P1 | PASS | Light mode retained across refresh |
| TC-DM-023 | Switch to auto, refresh: auto persists | P1 | PASS | Auto mode retained across refresh |
| TC-DM-024 | New tab: inherits stored preference | P1 | PASS | New tab opens with same mode |
| TC-DM-025 | Clear localStorage: falls back to system default | P2 | PASS | Removing key reverts to system preference |
| TC-DM-026 | Dark mode persists across sign-in/sign-out | P1 | PASS | Logout + login retains dark mode setting |

---

## Section 5 — i18n and Localisation (4/4 PASS)

| TC ID | Title | Priority | Result | Notes |
|-------|-------|----------|--------|-------|
| TC-DM-070 | English labels: "Theme: dark/light/auto" | P1 | PASS | All three labels verified in EN |
| TC-DM-071 | German labels: "Design: dunkel/hell/automatisch" | P1 | PASS | All three labels verified in DE at `/de/` |
| TC-DM-072 | Russian labels translated correctly | P1 | PASS | Labels: "Тема: тёмная/светлая/авто" verified at `/ru/` |
| TC-DM-073 | No raw translation keys visible | P2 | PASS | No dot-underscore patterns found in toggle labels |

**Observation:** Toggle cycle order appears consistent across locales: dark -> auto -> light -> dark. The labels differ by language but the underlying cycle is the same.

---

## Section 10 — Regression: Critical Revenue Flows in Dark Mode (9/9 PASS)

| TC ID | Title | Priority | Result | Notes |
|-------|-------|----------|--------|-------|
| TC-DM-120 | Sign-in flow renders correctly | P0 | PASS | Email/password fields legible, social sign-in buttons visible, sign-in completes, dark mode persists after auth |
| TC-DM-121 | Add to cart from PDP | P0 | PASS | Configurable Hat PDP renders correctly, add-to-cart works, cart badge updates |
| TC-DM-122 | Cart page and checkout navigation | P0 | PASS | Single-page checkout layout: cart items, shipping, payment, order comment, order summary all render correctly |
| TC-DM-123 | Checkout — shipping step | P0 | PASS | Address dialog opens with legible fields, address created, shipping method selected (Fixed Rate Ground) |
| TC-DM-124 | Checkout — payment step | P0 | PASS | Payment method dropdown renders correctly, Skyflow selected, billing address synced |
| TC-DM-125 | Checkout — place order | P0 | PASS | Order placed (CO260304-00001), payment page at `/checkout/payment` renders correctly in dark mode |
| TC-DM-126 | Global search results | P1 | PASS | Search for "hoodie" returns 4 results, product cards/filters/sort controls all legible |
| TC-DM-127 | Order history page | P1 | PASS | `/account/orders` renders with sidebar, filters, order list in dark mode |
| TC-DM-128 | Registration page | P1 | PASS | Form fields (name, email, password, confirm), radio buttons, password tips all legible |

---

## Pre-existing Issues (Not Dark Mode Related)

1. **Orders page i18n bug:** Search button shows raw translation key `commmon.buttons.search_orders` (triple 'm' typo in key). Visible in all themes, not dark-mode-specific.

2. **PDP 404 error:** Console shows `Failed to load resource: 404` for `skinny_md.png` on the Configurable Hat PDP. Missing image asset, not dark-mode-specific.

3. **Console error on logout:** `ApolloError: Anonymous access denied` — expected behavior when trying to fetch user-specific data after session ends.

---

## Screenshots

All screenshots captured in `screenshots/desktop/`:

| File | Page | Mode |
|------|------|------|
| `homepage-dark-mode.png` | Homepage | Dark |
| `homepage-light-mode.png` | Homepage | Light |
| `search-results-dark-mode.png` | Search results (`/search?q=hoodie`) | Dark |
| `orders-dark-mode.png` | Order history (`/account/orders`) | Dark |
| `pdp-dark-mode.png` | Product detail (Configurable Hat) | Dark |
| `cart-dark-mode.png` | Cart / Single-page checkout (`/cart`) | Dark |
| `shipping-address-dialog-dark-mode.png` | New address dialog | Dark |
| `checkout-payment-dark-mode.png` | Checkout with payment method | Dark |
| `checkout-skyflow-dark-mode.png` | Skyflow payment section | Dark |
| `skyflow-payment-page-dark-mode.png` | Payment page (`/checkout/payment`) | Dark |
| `order-details-dark-mode.png` | Order details page | Dark |
| `sign-in-dark-mode.png` | Sign-in page | Dark |
| `registration-dark-mode.png` | Registration page | Dark |

---

## Test Data Created

| Item | Details | Cleanup Status |
|------|---------|----------------|
| Shipping address | 123 Test Street, New York, NY 10001, USA | Needs manual cleanup in Admin |
| Order | CO260304-00001 (Payment required, $198.00) | Needs manual cleanup in Admin |

---

## Verdict

**APPROVED** — All 37 test cases across Sections 1, 2, 3, 5, and 10 passed. The dark mode implementation for the Coffee theme correctly handles:

- Toggle UI placement and accessibility
- Three-mode switching (dark/light/system) with correct CSS variable injection
- Persistence via localStorage across refreshes, tabs, and auth state changes
- Internationalization in English, German, and Russian
- All critical revenue flows (sign-in, PDP, cart, checkout, search, orders, registration) render correctly in dark mode with proper contrast and legibility

No dark-mode-specific bugs found. No blocking issues. Ready for sign-off pending completion of other test sections.
