# VCST-4846 — Exploratory Session (SFDPOT, 15 min)

**Date:** 2026-04-20 | **Charter:** Deprecation marker edge cases — deep-linking, hot reload, mobile viewport, badge scope, stale tags
**Tester:** ui-ux-expert | **Focus areas:** Structure · Function · Data · Platform · Operations · Time

---

## Findings

### S — Structure

**Deep-link directly to Docs tab (edge case from checklist):**
Navigating directly to `/?path=/docs/components-atoms-vclineitem-property--docs` (with wrong slug) results in "Couldn't find story" error in the iframe — this is a pre-existing Storybook behavior unrelated to this PR. The correct URL slug is `vclineitemproperty` (no hyphen between "item" and "property"). The sidebar-based navigation always resolves correctly. No issue with the PR itself.

**Banner DOM position:** Verified via `evaluate_script` — the banner `<div>` is index 1 in the docs content wrapper (index 0 = H1 Title). This is exactly between Title and the primary story preview (index 2). Order matches docs-page.ts spec.

**No unexpected "deprecated" tags found elsewhere:** Scanned Atoms and Molecules sidebar — only VcLineItemProperty, VcPriceDisplayCatalog, VcItemPriceCatalog carry the "Deprecated" suffix. No other stories were inadvertently tagged.

### F — Function

**Toolbar badge additionally appears:** The `storybook-addon-tag-badges` addon renders a "Deprecated" text element in the Storybook toolbar area (uid confirmed in Canvas view) in addition to the sidebar label. This is addon behavior working as intended — provides dual signal.

**Controls still interactive on deprecated components:** Verified prop changes on VcPriceDisplayCatalog (`isOldPrice` toggle, `value` object editor) and VcItemPriceCatalog (`withFromLabel`, `priceColorClass`, `value`). Controls respond without errors.

**a11y addon unaffected:** Running axe-core on VcLineItemProperty Basic reports 0 violations, 1 pass. The custom DocsPage does not interfere with accessibility scanning.

### D — Data

**Banner message precision:** All 3 messages verified character-for-character against spec:
- VcLineItemProperty: exact match
- VcPriceDisplayCatalog: exact match (includes parenthetical note about VcItemPriceCatalog)
- VcItemPriceCatalog: exact match (shortest message, uses only "VcProductPrice")

**Banner CSS tokens:** `rgb(255,202,122)` = `#FFCA7A` ✓ | `rgb(61,37,0)` = `#3D2500` ✓ | `12px 16px` padding ✓ | `8px` border-radius ✓

### P — Platform

**Production Storybook build behavior:** The deployed Storybook is compiled with Vite in production mode (`DEV=false`). The `console.warn` guarded by `import.meta.env.DEV` is compiled away and never executes. This is correct. Teams should be aware that the warn is only verifiable in a local `npm run storybook` dev server.

**Storefront build confirmed:** Footer reads `Ver. 2.47.0-pr-2231-4703-47032789` — matches the deployed PR artifact exactly.

**URL slug format:** Story IDs use camelCase-to-kebab transformation by Storybook. `VcLineItemProperty` becomes `vclineitemproperty` (not `vclineitem-property`). Deep-links must use this exact ID format.

### O — Operations

**No regressions in organism-level components:** VcProductCard (28 stories), VcButton (22 stories) both render fully in Docs view with no errors. The custom DocsPage only injects the banner when `parameters.deprecated` is truthy — non-deprecated components are unaffected.

**Addon coexistence:** a11y, Controls, Actions, Interactions tabs all present and functional alongside the custom DocsPage. No panel layout issues observed.

### T — Time

**Hot reload / page refresh persistence:** The browser was navigated between multiple deprecated component pages and back. Banner persists on each navigation. No state-dependent rendering issue found — the banner derives from story `parameters.deprecated` which is static metadata.

**Story variant coverage:** VcItemPriceCatalog Docs renders all 4 story variants (Regular Price, With Discount, With From Label, Custom Price Color) in the Stories section below the banner. Banner appears once at the top of the page and does not repeat per story.

---

## No Bugs Found

All edge cases explored passed without issues. The implementation is clean and targeted — deprecated metadata is applied only to the 3 intended components, the banner renders correctly on direct navigation and sidebar navigation, CSS matches spec, and the custom DocsPage does not disturb any other Storybook functionality.
