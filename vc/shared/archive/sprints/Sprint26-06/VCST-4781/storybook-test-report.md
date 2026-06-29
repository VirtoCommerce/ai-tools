# VCST-4781 — Storybook Atom Stories Test Execution Report

**Date:** 2026-03-30
**Env:** https://vcst-qa-storybook.govirto.com
**Browser:** Chrome (Chrome DevTools MCP)
**PR:** VirtoCommerce/vc-frontend#2214
**Scope:** 14 new atom stories added by PR#2214

**Results:** 14 passed, 0 failed / 14 total — **100% pass rate**

---

## Story Results

| # | Component | Story Path | Status | Notes |
|---|-----------|-----------|--------|-------|
| 1 | VcActionInput | Components/Atoms/VcActionInput — Basic | PASS | Input with apply button renders; 11 controls loaded (modelValue, applied, disabled, readonly, placeholder, label, errorMessage, maxLength). With Label variant confirmed: label + placeholder display correctly. |
| 2 | VcContainer | Components/Atoms/VcContainer — Basic | PASS | Renders with default slot content "Page content goes here"; 6 controls (loading, hasBgImage, noPadding + more). |
| 3 | VcExpansionPanels | Components/Atoms/VcExpansionPanels — Basic | PASS | 3 accordion panels render collapsed (Shipping Information, Returns & Exchanges, Product Care) with expand chevrons; 2 controls (multiple, default slot). |
| 4 | VcLineItemProperty | Components/Atoms/VcLineItemProperty — Basic | PASS | Renders "SKU" label + "Value" text in two-column layout; 2 controls (label, default slot). |
| 5 | VcListItem | Components/Atoms/VcListItem — Basic | PASS | Renders title + description with bullet indicator; 3 controls (title, description, default slot). Multiple story variants present (Title Only, With Slots, Multiple Items). |
| 6 | VcLoader | Components/Atoms/VcLoader — Basic | PASS | Spinning animation renders in top-left; no configurable controls (pure animation component); "In Context" variant also present. |
| 7 | VcPopover | Components/Atoms/VcPopover — Basic | PASS | "CLICK TO OPEN" trigger renders; 23 controls (placement, disabled, hover, arrowEnabled, strategy, flipOptions, offsetOptions etc.); 2 accessibility items noted. |
| 8 | VcPopupSidebar | Components/Atoms/VcPopupSidebar — Basic | PASS | "OPEN SIDEBAR" trigger renders; 5 controls (isVisible, title, hide event, default slot, footer slot). With Title and With Footer variants present. |
| 9 | VcPriceDisplayCatalog | Components/Atoms/VcPriceDisplayCatalog — Basic | PASS | Renders "$99.99" (2 decimal places — BL-PRICE-003 compliant); 2 controls (isOldPrice boolean, value MoneyType). Old Price and Price Comparison variants present. |
| 10 | VcProductProperties | Components/Atoms/VcProductProperties — Basic | PASS | Renders property list in two-column layout (Color: Blue, Size: XL, Material: Cotton); slot-based (default slot). |
| 11 | VcProductsGrid | Components/Atoms/VcProductsGrid — Basic | PASS | 8-item grid renders (6+2 rows); 2 controls (short boolean, columns Partial). Short variant also present. |
| 12 | VcScrollTopButton | Components/Atoms/VcScrollTopButton — Basic | PASS | Story renders correctly with instructional text "Scroll down to see the button appear" (scroll-triggered visibility is by design); no configurable props. |
| 13 | VcTooltip | Components/Atoms/VcTooltip — Basic | PASS | "HOVER OVER ME" trigger renders; 14 controls (placement, disabled, hover, strategy, flipOptions, offsetOptions, shiftOptions, width etc.); Top Placement, Click Trigger, Disabled variants present. |
| 14 | VcTotalDisplay | Components/Atoms/VcTotalDisplay — Basic | PASS | Renders "$1,234.56" (2 decimal places — BL-PRICE-003 compliant); 3 required controls (amount: 1234.56, cultureName: en-US, currencyCode: USD). Euro and Large Amount variants present. |

---

## Sidebar Presence — All 14 Components Confirmed

All 14 new components appeared in the Storybook sidebar under Components > Atoms, confirming the stories.ts files were deployed successfully:

VcActionInput, VcContainer, VcExpansionPanels, VcLineItemProperty, VcListItem, VcLoader, VcPopover, VcPopupSidebar, VcPriceDisplayCatalog, VcProductProperties, VcProductsGrid, VcScrollTopButton, VcTooltip, VcTotalDisplay

---

## Console Errors

None. Zero console errors across all 14 story navigations.

---

## Screenshots

| File | Purpose |
|------|---------|
| `screenshots/storybook-home.png` | Storybook initial load — baseline |
| `screenshots/vcactioninput-default.png` | VcActionInput Basic story |

Representative passing stories were sampled above. No failure screenshots required.

---

## Observations

- VcActionInput has 5 story variants (Basic, With Label, With Error, Disabled, Readonly) — well-covered for all input states.
- VcPriceDisplayCatalog and VcTotalDisplay both display prices with correct 2 decimal places, satisfying BL-PRICE-003.
- VcPopover and VcTooltip share similar prop surfaces (placement, strategy, flipOptions) and both loaded cleanly.
- VcScrollTopButton intentionally hides until scroll — the story documents this with instructional text, which is appropriate UX.
- VcLoader has no Controls panel entries (the "Interactive story playground" message appears) — this is expected for a zero-prop animation component.

---

## Overall Verdict

PASS — All 14 stories from PR VirtoCommerce/vc-frontend#2214 are deployed, render correctly, and produce no console errors. The PR is ready from a Storybook story perspective.
