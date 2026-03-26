# BUG: Watermelon Dark Mode — Multiple Contrast & Visibility Issues

## Status: CONFIRMED

**Severity:** High
**Component:** White Labeling / Theming / Storefront UI
**Browser:** Chromium 136, Firefox, Edge
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1009.0
**Theme Version:** 2.45.0-pr-2204-de06c786
**Module Versions:** VirtoCommerce.WhiteLabeling 3.1001.0
**Date:** 2026-03-24
**Reported By:** QA Agent
**Related Ticket:** VCST-4718

---

## Summary

The new Watermelon Dark preset (PR #2204) has **4 confirmed contrast/visibility issues** that affect usability across the storefront. The root cause is shared: certain color tokens in `watermelon.dark.json` produce insufficient contrast when paired by existing component CSS.

---

## Issue 1 (P0 — Revenue Critical): Primary Solid Button Contrast Fails WCAG AA

### Steps to Reproduce
1. Navigate to https://vcst-qa-storefront.govirto.com
2. Enable Watermelon theme (Admin → Stores → B2B-store → White Labeling → preset: "watermelon")
3. Toggle dark mode (header toggle: light → auto → dark)
4. Navigate to any catalog page (e.g., /accessories)
5. Observe the "+" (Increase quantity) buttons on product cards
6. Also check: Add to Cart button on PDP, Save button in Add to List modal

### Expected Result
Button text should be clearly readable with at least 4.5:1 contrast ratio (WCAG 2.1 AA).

### Actual Result
Primary solid buttons use olive-green background with near-white text — **2.94:1 contrast ratio**. Text is hard to read. On hover, contrast drops further to **2.07:1**.

### Technical Details
- **Element:** `.vc-button--solid--primary`
- **Background:** `rgb(145, 154, 69)` = `#919A45` (`--color-primary-400`)
- **Text:** `rgb(252, 251, 250)` = `#FCFBFA` (`--color-additional-950`)
- **Contrast:** 2.94:1 (requires 4.5:1 for AA, 3.0:1 for AA-Large)
- **Hover BG:** `#AEB85F` (`--color-primary-500`) → contrast drops to 2.07:1

### Affected Components
- Quantity stepper "+" buttons (catalog, PDP, cart)
- "Add to Cart" button
- "Save" button in Add to List modal
- "NO" button in confirmation dialogs
- Any `.vc-button--solid--primary` instance

### Suggested Fix
Option A: Darken the button background in dark mode — use `--color-primary-200` (`#484d22`) with white text → ~8.5:1
Option B: Switch button text to dark (`#040303`) on the olive background → 9.63:1

---

## Issue 2 (High): Toast/Notification Panel Nearly Invisible

### Steps to Reproduce
1. On catalog page in Watermelon dark mode
2. Click "Add to Compare" on any product card
3. Observe the toast notification in top-right corner

### Expected Result
Toast notification should have a clearly visible background that stands out from the page.

### Actual Result
The toast wrapper (`notifications-host__wrapper`) has **transparent background**. The toast content floats directly over the dark page body (`#040303`). The "Compare" link button inside the toast uses `.vc-button--no-border--accent` with transparent bg and light pink text (`#FCE5E5`) — functional but lacks visual container definition.

### Technical Details
- **Element:** `.notifications-host__wrapper`
- **Background:** `rgba(0, 0, 0, 0)` (transparent)
- **Toast text color:** `rgb(235, 229, 229)` = `#EBE5E5`
- **Compare button text:** `rgb(252, 229, 229)` = `#FCE5E5` (accent-900)
- The `.vc-alert--outline` variant (when used) sets `--bg-color: var(--color-additional-50)` = `#0A0A0A` on body `#040303` → **1.04:1 contrast**

### Suggested Fix
Add dark mode override: `.notifications-host__wrapper { background-color: var(--color-neutral-100); }` → `#313131` gives 4.69:1 against body.

---

## Issue 3 (High): Facet/Widget Sidebar Panels Invisible

### Steps to Reproduce
1. Navigate to any category page (e.g., /accessories) in Watermelon dark mode
2. Observe the left sidebar with facet filters (Price, Categories, Brand, Color, etc.)

### Expected Result
Facet widget panels should have visible boundaries distinguishing them from the page background.

### Actual Result
`.vc-widget` panels use `--color-additional-50` = `#0A0A0A` as background. On body `#040303`, this gives **1.04:1 contrast** — the panel boundaries are effectively invisible. The content inside (text, chevrons) is readable, but the panel structure is lost.

### Technical Details
- **Element:** `.vc-widget`
- **Background:** `color(srgb 0.039 0.039 0.039)` ≈ `#0A0A0A` (`--color-additional-50`)
- **Body background:** `#040303`
- **Contrast:** 1.04:1 (requires 3.0:1 for WCAG 1.4.11 non-text UI)
- **Border:** `color(srgb 0.275 0.275 0.275)` ≈ `#464646` (`--color-neutral-200`)

### Suggested Fix
Use `--color-neutral-50` (`#1c1c1c`) or `--color-neutral-100` (`#313131`) as the dark-mode widget bg.

---

## Issue 4 (Medium): Dark Mode Toggle Too Small for Touch

### Steps to Reproduce
1. View storefront on mobile viewport (375px) in dark mode
2. Locate the dark mode toggle in the header

### Expected Result
Touch target should be at least 44x44px per WCAG 2.5.5 / Apple HIG.

### Actual Result
Dark mode toggle renders at **38x38px** — below the 44x44px minimum.

---

## Root Cause Analysis

All contrast issues trace to the `watermelon.dark.json` color token values and how existing Vue components consume them:

| Token | Value | Problem |
|-------|-------|---------|
| `color_additional_50` | `#0A0A0A` | Too close to body bg `#040303` (1.04:1) — used by `.vc-widget`, `.vc-alert--outline` |
| `color_primary_400` | `#919A45` | Too light for white text (2.94:1) — used by `.vc-button--solid--primary` |
| `color_primary_500` | `#AEB85F` | Even lighter on hover (2.07:1) |

**Source file:** `client-app/assets/presets/watermelon.dark.json` (PR #2204, commit `de06c786`)
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2204

The other dark presets (coffee, default, mercury) don't have these issues because their `additional-50` and `primary-400/500` values have better contrast against their respective body backgrounds.

## Evidence
- Screenshot: `tests/Sprint-current/VCST-4718/bug-evidence/01-compare-toast-dark-mode.png`
- Screenshot: `tests/Sprint-current/VCST-4718/bug-evidence/02-compare-toast-button-hover.png`
- Screenshot: `tests/Sprint-current/VCST-4718/bug-evidence/03-plus-button-olive-contrast.png`
- Screenshot: `tests/Sprint-current/VCST-4718/bug-evidence/04-plus-button-hover.png`
- Console errors: none
- Network errors: none
- Full test reports: `tests/Sprint-current/VCST-4718/`

## Impact
- **Issue 1** affects ALL primary action buttons (Add to Cart, quantity stepper, Save) — **revenue-critical path**
- **Issue 2** affects cart/compare/list feedback — users may miss confirmation toasts
- **Issue 3** affects catalog browsing — filter sidebar loses visual structure
- **Issue 4** affects mobile usability

## References
- JIRA: VCST-4718
- PR: https://github.com/VirtoCommerce/vc-frontend/pull/2204
- WCAG 2.1 AA: 1.4.3 (text contrast 4.5:1), 1.4.11 (non-text UI 3.0:1), 2.5.5 (touch target 44px)
