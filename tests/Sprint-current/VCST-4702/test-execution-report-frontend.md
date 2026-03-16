# VCST-4702: Implement Dark Mode (Mercury Theme) -- Frontend Test Execution Report

**Date:** 2026-03-16 | **Env:** https://vcst-qa-storefront.govirto.com | **Browser:** Chromium (playwright-chrome)
**Build:** 2.44.0-pr-2202-2d84-2d84f2a4 (PR #2202)
**Tester:** qa-frontend-expert (automated via MCP)
**Results:** 10 passed, 1 failed, 1 observation / 12 checks -- **83% pass rate**

---

## Summary

Dark mode (PR #2202) **IS deployed** on QA environment. The theme toggle is functional and cycles through auto -> dark -> light modes. Overall dark mode rendering is good across all tested pages. One **P1 SCSS bug** was confirmed in button variant dark-mode selectors (outline, no-border, no-background, solid-light). Light mode regression check passed -- no regressions detected.

---

## Failures

### BUG-001: SCSS `#{$colors}` list interpolation generates invalid CSS selectors for button variants -- P1

**Affected variants:** outline, no-border, no-background, solid-light (4 of 5 button variant types)
**Affected colors:** secondary, accent, neutral, success, danger, info, warning (7 of 8 colors -- primary works correctly)

**Expected:** Each button variant+color combination should produce its own CSS rule, e.g.:
```css
html.dark .vc-button--outline--primary { --text-color: var(--color-primary-900); ... }
html.dark .vc-button--outline--secondary { --text-color: var(--color-secondary-900); ... }
```

**Actual:** The SCSS loop interpolates `#{$colors}` (the full list) instead of `#{$color}` (the iterator), producing a single comma-separated rule with invalid selectors:
```css
html.dark .vc-button--outline--primary,
html.dark .vc-button secondary,     /* INVALID -- missing --outline-- prefix */
html.dark .vc-button accent,        /* INVALID */
html.dark .vc-button neutral,       /* INVALID */
...
html.dark .vc-button warning {
  --text-color: var(--color-warning-900);  /* ALL get warning color (last iteration value) */
}
```

**Impact:**
- The invalid selectors (`.vc-button secondary` etc.) will never match any element, so dark-mode colors for outline/no-border/no-background/solid-light buttons in secondary, accent, neutral, success, danger, info colors are NOT applied.
- The `primary` color works correctly because it's the first in the list and gets the properly formatted `--outline--primary` selector.
- All non-primary colors silently fall back to light-mode button styling in dark mode.
- The `solid` button variant is NOT affected -- it uses correctly iterated per-color selectors.
- Chips and badges are NOT affected -- they use a different (correct) SCSS loop pattern.

**Root cause:** In the SCSS `@each` loop for button variants, the variable interpolation uses `#{$colors}` (the list variable) instead of `#{$color}` (the loop iterator variable).

**Evidence:** CSS extracted from browser DevTools confirms 4 invalid selectors matching this pattern. See `invalidSelectors` analysis in test notes.

---

## Passing Tests

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Theme toggle exists and is accessible | PASS | Button in top header bar between "Ship to" and "Call us". Label: "Theme: auto/dark/light". Cycles: auto -> dark -> light -> auto |
| 2 | Dark mode applies `html.dark` class | PASS | `document.documentElement.className === "dark"`, `color-scheme: dark` set |
| 3 | Theme preference persists | PASS | `localStorage['vc-color-mode']` stores selected mode; `localStorage['vc-dark-available']` = "true". Survives navigation and page refresh |
| 4 | Homepage dark mode rendering | PASS | Header, nav, hero, product cards, categories, promo sections, footer all render with dark backgrounds and readable light text |
| 5 | Catalog page dark mode | PASS | Product grid, facet sidebar, filter chips, sort dropdown, prices all readable on /soft-drinks |
| 6 | PDP dark mode | PASS | Product title, SKU, price, quantity controls, stock indicator, action icons, shipment options, configuration sections all readable on configurable-hat |
| 7 | Cart page dark mode (empty state) | PASS | "Your cart is empty" message, CTA buttons, footer all render correctly |
| 8 | Search results dark mode | PASS | Search input, facets, product cards, results count all readable on /search?q=camera |
| 9 | Account dashboard dark mode | PASS | Sidebar navigation (4 groups), orders table, monthly spend chart, order status section all render correctly |
| 10 | Mobile menu dark mode (375px) | PASS | Navigation items, user section, account sections, settings all have readable text on dark background. Mobile menu text color fix (PR objective) confirmed working |
| 11 | Mobile settings/currency dark mode | PASS | Currency list, radio buttons, heading all readable |
| 12 | Light mode regression | PASS | After switching back to light, homepage renders identically to pre-dark-mode state. VcMenuItem bg-additional-50 correctly applied |

---

## Observations

### OBS-001: Solid button variant works correctly in dark mode
The `solid` button variant generates correct per-color selectors (`html.dark .vc-button--solid--primary`, `--solid--secondary`, etc.) with appropriate hover states. This is the most commonly used variant on the storefront, so the SCSS bug (BUG-001) has limited visual impact on current pages but will affect any future use of outline/no-border/no-background/solid-light dark-mode buttons.

### OBS-002: Dark color palette variables do not change between modes
The CSS custom properties (`--color-primary-400`, `--color-neutral-*`, etc.) remain the same values in both light and dark mode. Dark mode styling relies on Tailwind `dark:` utility classes and component-level `html.dark` rules to apply different colors from the same palette, rather than swapping to a different palette. This is a valid architectural choice.

### OBS-003: Theme toggle icon states
- Auto mode: monitor/system icon
- Dark mode: moon icon
- Light mode: sun icon

All three states have correct tooltip labels ("Theme: auto", "Theme: dark", "Theme: light").

### OBS-004: Pre-existing 404 on PDP
`GET skinny_md.png` returns 404 on the Configurable Hat PDP. This is a pre-existing data issue (missing product image), not related to dark mode.

---

## Console & Network

**Console errors:** 0 dark-mode-related errors across all tested pages. 1 pre-existing 404 for a product image on PDP (not dark-mode related).

**Network:** All GraphQL API calls returned 200. No failed requests related to dark mode CSS or SCSS files. No 404s on dark/ module files.

**Vue hydration warnings:** None observed.

---

## Test Environment

| Property | Value |
|----------|-------|
| Storefront URL | https://vcst-qa-storefront.govirto.com |
| Build version | 2.44.0-pr-2202-2d84-2d84f2a4 |
| PR | #2202 (OPEN) |
| Browser | Chromium 145.0.7632.160 |
| Desktop viewport | 1920x1080 |
| Mobile viewport | 375x812 |
| Test account | Elena Mutykova (ACME Store 2) |

## Screenshots

| File | Description |
|------|-------------|
| `screenshots/01-homepage-initial-load.png` | Homepage in light mode (baseline) |
| `screenshots/03-homepage-dark-mode-toggle-clicked.png` | Homepage after dark mode toggle -- first dark mode view |
| `screenshots/04-homepage-dark-mode-fullpage.png` | Full-page homepage in dark mode |
| `screenshots/05-catalog-dark-mode.png` | Catalog page (/soft-drinks) in dark mode |
| `screenshots/06-pdp-dark-mode.png` | Product detail page (Configurable Hat) in dark mode |
| `screenshots/07-cart-dark-mode.png` | Cart page (empty) in dark mode |
| `screenshots/08-search-dark-mode.png` | Search results (?q=camera) in dark mode |
| `screenshots/09-mobile-dark-mode-homepage.png` | Mobile (375px) homepage in dark mode |
| `screenshots/10-mobile-menu-dark-mode.png` | Mobile menu open in dark mode |
| `screenshots/11-mobile-settings-currency-dark.png` | Mobile settings/currency in dark mode |
| `screenshots/12-homepage-light-mode-regression.png` | Homepage after switching back to light mode |
| `screenshots/13-account-dashboard-dark-mode.png` | Account dashboard in dark mode |

## Areas Not Tested (out of scope for this session)

- Cross-browser (Firefox, Edge) dark mode rendering
- Payment page dark mode (CyberSource, Datatrans, Skyflow)
- Accessibility contrast ratio measurements (automated WCAG tools)
- All 8 button color variants visually in dark mode (confirmed via CSS analysis only)
- Builder.io / CMS content pages in dark mode

---

## Recommendation

**Conditional PASS** -- Dark mode is functional and visually correct across all major pages. The SCSS button variant bug (BUG-001) should be fixed before PR merge as it affects 4 of 5 non-solid button variants for 7 of 8 colors. The fix is straightforward: change `#{$colors}` to `#{$color}` in the `@each` loop for outline, no-border, no-background, and solid-light button dark-mode SCSS files.

---

**QA Sign-off:** CONDITIONAL PASS | **Blocker:** BUG-001 (P1)
**Agent:** qa-frontend-expert | **Date:** 2026-03-16
