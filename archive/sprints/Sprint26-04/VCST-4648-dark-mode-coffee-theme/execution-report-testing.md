# Test Execution Report — VCST-4648 Dark Mode (Coffee Theme)
# Sections 7, 8, 9, 11, 12: FOUC, Cross-Browser, Console Errors, Edge Cases, Theme Isolation

## Summary

- **Date:** 2026-03-04
- **Environment:** https://vcst-qa-storefront.govirto.com (Coffee theme)
- **Browser:** Firefox (playwright-firefox MCP)
- **Tester:** qa-testing-expert agent
- **Ticket:** VCST-4648

| Metric | Count |
|--------|-------|
| Total test cases | 23 |
| Executed | 20 |
| **Passed** | **17** |
| Partial pass | 1 |
| Blocked | 1 |
| Skipped | 2 |
| N/A (scope) | 2 |
| **Pass rate (executed)** | **94.4%** |

---

## Section 9 — JavaScript Console Errors

| TC | Priority | Title | Status | Notes |
|----|----------|-------|--------|-------|
| TC-DM-110 | P0 | Zero JS errors across mode transitions | PASS | Toggled light/dark/system — zero console errors |
| TC-DM-111 | P0 | Zero JS errors after hard reload in dark mode | PASS | Set dark mode, hard reload, zero errors |
| TC-DM-112 | P1 | No accumulated errors across 6+ pages | PASS | Navigated home, catalog, product, cart, account, checkout — zero accumulated JS errors |
| TC-DM-113 | P2 | Corrupted localStorage graceful handling | PARTIAL PASS | See defect below |

### Defect: TC-DM-113 — Raw i18n key displayed for corrupted localStorage

- **Severity:** P3 (Low)
- **STR:** Set `localStorage.setItem('vc-color-mode', 'invalid')` then reload
- **Expected:** Toggle shows fallback label (e.g., "Theme: auto" or "Theme: light")
- **Actual:** Toggle button displays raw i18n key: `shared.layout.header.top_header.dark_mode.invalid`
- **Impact:** Cosmetic — no crash, mode defaults to system correctly, but label is user-facing
- **Evidence:** `screenshots/tc-dm-113-corrupted-localstorage-label.png`

---

## Section 7 — FOUC Prevention

| TC | Priority | Title | Status | Notes |
|----|----------|-------|--------|-------|
| TC-DM-090 | P0 | Dark mode renders from first paint after reload | PASS | Dark background visible immediately, no white flash. Evidence: `screenshots/tc-dm-090-fouc-dark-reload.png` |
| TC-DM-091 | P1 | System mode respects OS dark preference | BLOCKED | Firefox via Playwright MCP cannot emulate `prefers-color-scheme: dark` OS media query |
| TC-DM-092 | P2 | No dark flash on light mode reload | PASS | Light mode reload shows white background from first paint, no dark flash |
| TC-DM-093 | P2 | FOUC prevention script is inline in head | PASS | Confirmed `<script>` in `<head>` reads `localStorage('vc-color-mode')` before body renders |

---

## Section 8 — Cross-Browser and Responsive

| TC | Priority | Title | Status | Notes |
|----|----------|-------|--------|-------|
| TC-DM-100 | P1 | Chrome dark mode rendering | N/A | Chrome scope — assigned to other agent |
| TC-DM-101 | P1 | Firefox dark mode rendering | PASS | Homepage, catalog, cart all render correctly in Firefox dark mode. Evidence: `screenshots/tc-dm-101-firefox-homepage-dark.png`, `tc-dm-101-firefox-catalog-dark.png`, `tc-dm-101-firefox-cart-dark.png` |
| TC-DM-102 | P1 | Edge dark mode rendering | N/A | Edge scope — assigned to other agent |
| TC-DM-103 | P1 | Desktop 1920x1080 | PASS | Full layout, toggle visible in header. Evidence: `screenshots/tc-dm-103-1920x1080-desktop.png` |
| TC-DM-104 | P1 | Tablet 768x1024 | PASS | Responsive layout adapts, toggle accessible. Evidence: `screenshots/tc-dm-104-768x1024-tablet.png` |
| TC-DM-105 | P1 | Mobile 375x812 | PASS | Mobile layout, toggle in hamburger menu area. Evidence: `screenshots/tc-dm-105-375x812-mobile.png` |
| TC-DM-106 | P2 | Laptop 1280x720 | PASS | Mid-range viewport renders correctly. Evidence: `screenshots/tc-dm-106-1280x720-laptop.png` |

---

## Section 11 — Edge Cases

| TC | Priority | Title | Status | Notes |
|----|----------|-------|--------|-------|
| TC-DM-130 | P2 | Rapid toggle 7+ times | PASS | 7 rapid toggles, zero console errors, final state consistent |
| TC-DM-131 | P2 | Mid-checkout dark mode switch | PASS | Toggled dark mode during checkout — form state preserved, shipping/billing data intact. Evidence: `screenshots/tc-dm-131-mid-checkout-switch.png` |
| TC-DM-132 | P2 | Cart persistence after mode change + reload | PASS | Cart item (UNTUCKit eGift Card, $100.00), order comment, and total ($119.99) all preserved after dark mode toggle and hard reload |
| TC-DM-133 | P2 | Language switch with dark mode active | PASS | Switched from English to Deutsch (German) — dark mode persists, toggle label localized to "Design: dunkel", cart preserved, prices in German locale (99,99 $) |
| TC-DM-134 | P2 | No localStorage — graceful fallback | PASS | Removed `vc-color-mode` from localStorage, reloaded. Composable defaults to "system" mode, toggle shows "Theme: auto", no crash |
| TC-DM-135 | P2 | Modal open during mode switch attempt | PASS | Opened "Clear cart" confirmation modal. Toggle click blocked by modal overlay (correct behavior). Modal remained stable. Dismissed with "No" — cart preserved |
| TC-DM-136 | P3 | Print preview in dark mode | SKIPPED | Cannot test print preview via Playwright MCP — no print API |
| TC-DM-137 | P3 | JavaScript disabled fallback | SKIPPED | Cannot disable JS via Playwright MCP |

---

## Section 12 — Theme Isolation

| TC | Priority | Title | Status | Notes |
|----|----------|-------|--------|-------|
| TC-DM-140 | P1 | Coffee dark variables scoped via .dark selector | PASS | Inspected `<style id="vc-theme-variables">`: light variables under `:root { ... }`, dark variables under `.dark { ... }`. 248 CSS custom properties total. Dark palette properly scoped — only applied when `html.dark` class present |
| TC-DM-141 | P2 | Non-Coffee theme has no dark mode | PASS | Navigated to VirtoStart demo store (https://virtostart-demo-store.govirto.com). Confirmed: no dark mode toggle, no `vc-theme-variables` style tag, no `.dark` CSS selector, no dark mode infrastructure |

---

## Technical Observations

1. **Toggle cycle order:** light -> system -> dark (not light -> dark -> system). This is consistent across all tests.
2. **CSS variable architecture:** `<style id="vc-theme-variables">` injects ~7,561 chars of CSS with `:root` (light) and `.dark` (dark) scoped selectors. The `html.dark` class triggers the dark palette.
3. **localStorage key:** `vc-color-mode` stores values `light`, `dark`, or `system`. Invalid values default to system mode behavior but expose raw i18n keys in the toggle label.
4. **FOUC prevention:** Inline `<script>` in `<head>` reads localStorage before first paint, applies `html.dark` class synchronously. Effective — no flash observed in any test.
5. **i18n integration:** Toggle labels are localized (e.g., German: "Design: dunkel/hell/automatisch"). Dark mode state persists across language switches.
6. **Modal interaction:** The modal overlay correctly blocks background clicks, preventing accidental mode switches during confirmation dialogs.

## Defects Summary

| ID | TC | Severity | Description |
|----|-----|----------|-------------|
| 1 | TC-DM-113 | P3 (Low) | Corrupted localStorage value renders raw i18n key as toggle label |

## Cleanup

- Dark mode reset to light
- Cart emptied (removed UNTUCKit eGift Card)
- User logged out
- Browser session closed
