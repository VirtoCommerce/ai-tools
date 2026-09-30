# Mobile search overlay: submit button unnamed, close control announced as raw key `common.labels.close`, Cancel target 18 px tall `[Medium]`

## Status: FILED — VCST-6097 (relates to VCST-2945)

**Severity:** Medium (P2) · **Type:** Accessibility, WCAG 4.1.2 + 2.5.8 / BL-A11Y-002 + BL-UI-006 · **Archetype:** `RENDER`
**Found by:** /qa-test VCST-2945 (2026-09-28) · **standalone, pre-existing** (see Provenance)
**Env:** vcst-qa · theme `2.59.0-pr-2501-7e0c` (vc-frontend PR #2501, open) · store `B2B-store` · Chromium · **390 px** (the overlay exists below the desktop header breakpoint)

## Summary

The mobile search overlay has three defects in one component, all on controls the shopper uses on every search:

1. **Submit button has no accessible name.** The desktop bar's equivalent is named "Search".
2. **The dismiss control is announced as the raw i18n key `common.labels.close`.** This control is a
   full-viewport button (390 × 844) behind the overlay.
3. **Cancel is 42 × 18 CSS px.** That is below the 24 px minimum.

## Steps to Reproduce

1. Open `{{FRONT_URL}}` at 390 × 844.
2. Tap **Toggle search bar** in the header.
3. Read the overlay in the accessibility tree or with a screen reader. Measure the Cancel link's box.

## Expected vs Actual

| Control | Expected | Actual (accessibility snapshot, boxes in CSS px) |
|---|---|---|
| submit `.mobile-search-bar__button` | named "Search", as on desktop | `button` (no name), 38 × 38 |
| backdrop `.mobile-search-bar__backdrop` | named "Close" | `button "common.labels.close"`, 390 × 844 |
| Cancel `.mobile-search-bar__close` | ≥ 24 × 24 (WCAG 2.5.8 AA, BL-UI-006) | `button "Cancel"`, **42 × 18** |
| Barcode scan (reference) | — | `button "Barcode scan"`, 32 × 32. Correct. |

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | **FAIL** | table above; screenshot below |
| 2–4. Admin / xAPI / REST | N/A | presentation and i18n only |

**Owning layer:** Layer 1 — Storefront.

## Root Cause Analysis

`client-app/shared/layout/components/header/_internal/mobile-search-bar.vue`:

- **Backdrop** (l.8): `:aria-label="$t('common.labels.close')"`. `locales/en.json` has no `common.labels.close`.
  The existing key is `common.buttons.close` ("Close"), so vue-i18n falls back to the key string.
- **Submit** (l.33–38): `<VcButton class="mobile-search-bar__button" icon="search" :loading="loading" …/>` has no
  `aria-label`. Desktop `search-bar/search-bar.vue` l.58 passes
  `:aria-label="$t('shared.layout.search_bar.search_button')"` ("Search").
- **Cancel** (l.42, style l.185): a plain `<button>` styled `appearance-none text-sm`, with no padding or
  min-height, so its box is only the text's line box.

**Suggested fix:**
- Backdrop: use `common.buttons.close`. The backdrop is a mouse or tap affordance, so `tabindex="-1"` is also an option.
- Submit: add the same `aria-label` the desktop bar uses.
- Cancel: give it `min-h-6` or padding so the target reaches 24 px.

## Provenance

**PRE-EXISTING.** On `dev`, `mobile-search-bar.vue` already has the same three lines (`common.labels.close` l.8,
unnamed `mobile-search-bar__button` l.30, `text-sm` Cancel l.181). PR #2501 only adds the `BarcodeScanner`
`v-if` and its `aria-label` in this file. The defect doesn't fail VCST-2945.

## Evidence

- Overlay open, 390 px: ![overlay](reports/bugs/screenshots/mobile-search-overlay-unnamed-controls/overlay-open-390.png)
- Visual/a11y audit: `reports/tickets/Sprint26-19/VCST-2945/design-report.md` findings 2–4

**Related, not duplicates:**
- `reports/bugs/open/medium/BUG-storefront-mobile-account-menu-button-no-accessible-name.md` — a different control
  (header account menu at ≤ 768 px).
- `reports/bugs/open/low/BUG-search-a11y-escape-clear-and-hints.md` — the desktop search bar's clear (X) button.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** header `MobileSearchBar`
- **RCA anchor:** `client-app/shared/layout/components/header/_internal/mobile-search-bar.vue` l.8 (`common.labels.close`), l.34 (`mobile-search-bar__button`), l.185 (`&__close` style)
- **Routing confidence:** HIGH

Found by: /qa-test VCST-2945 (2026-09-28)
