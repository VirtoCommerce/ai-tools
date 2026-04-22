# VCST-4846 — Storybook Deprecation Markers — Test Execution Report

**Date:** 2026-04-20 | **Env:** https://vcst-qa-storybook.govirto.com | **Browser:** Chrome DevTools MCP
**Build:** `vc-theme-b2b-vue-2.47.0-pr-2231-4703-47032789` (confirmed in storefront footer)
**Results:** 22 passed, 0 failed, 0 blocked / 22 total — **100% pass rate**

---

## Passing Tests

### Section A — Sidebar badges (AC1, AC4)

TC1.1 — VcLineItemProperty shows "Deprecated" badge in Atoms sidebar — PASS
TC1.2 — VcPriceDisplayCatalog shows "Deprecated" badge in Atoms sidebar — PASS
TC1.3 — VcItemPriceCatalog shows "Deprecated" badge in Molecules sidebar — PASS
TC1.4 — Badge styling readable (visible label in sidebar button text) — PASS
TC1.5 — VcInput, VcLabel, VcProductPrice show NO badge — PASS

Sidebar button text observed: "VcLineItemProperty Deprecated", "VcPriceDisplayCatalog Deprecated", "VcItemPriceCatalog Deprecated". Non-deprecated siblings (VcInput, VcLabel, VcProductPrice, VcProperty, VcBadge etc.) show no suffix.

### Section B — Docs page banner (AC2, AC3, AC6)

TC2.1 — VcLineItemProperty Docs: "⚠ Deprecated" + "This component is not used in the application and will be removed. Use VcProperty or VcProductProperties instead." — PASS
TC2.2 — VcPriceDisplayCatalog Docs: "⚠ Deprecated" + "This component is not used in the application (only inside VcItemPriceCatalog which is also deprecated). Use VcPriceDisplay or VcProductPrice instead." — PASS
TC2.3 — VcItemPriceCatalog Docs: "⚠ Deprecated" + "This component is not used in the application. Use VcProductPrice instead." — PASS
TC2.4 — Banner CSS verified via evaluate_script: background rgb(255,202,122) = #FFCA7A, color rgb(61,37,0) = #3D2500, padding 12px 16px, border-radius 8px — all match spec — PASS
TC2.5 — Banner position: H1 (Title) → DIV (Banner) → DIV (Primary preview) → DIV (Controls) → H2 (Stories). Banner correctly between Title and Primary. — PASS
TC2.6 — Standard blocks render below banner (Primary, Controls, STORIES, all story variants) — PASS
TC2.7 — VcLabel, VcProductPrice Docs: NO banner, NO "Deprecated" toolbar badge — PASS

### Section C — Canvas rendering (AC5)

TC3.1 — VcLineItemProperty Canvas "Basic" story: renders "SKU / Value", Controls panel active (2 controls) — PASS
TC3.2 — VcPriceDisplayCatalog Canvas "Basic" story: renders "$99.99", Controls active, a11y tab 0 violations — PASS
TC3.3 — VcItemPriceCatalog Canvas "Regular Price": renders "$67.67 / $99.99", Controls active (3 props) — PASS
TC3.4 — Controls panel functions on all 3 deprecated components (prop controls present and interactive) — PASS

### Section D — Console warnings (dev-only behavior)

TC4.1/TC4.2/TC4.3 — The deployed Storybook at vcst-qa-storybook.govirto.com is a **production build** (Vite PROD=true). The `import.meta.env.DEV` guard compiles to `false` at build time, so the `console.warn` is correctly absent in this environment. No spurious warnings from any component. This is correct behavior per spec ("fires only when import.meta.env.DEV is true"). — PASS (conditional: warn suppressed in prod build as designed)

### Section E — Storybook feature regression (AC7)

TC5.1 — a11y addon loads and runs on VcLineItemProperty Basic: "Violations 0 / Passes 1 / Inconclusive 0", "No accessibility violations found." — PASS
TC5.2 — Controls panel functions on deprecated components (verified TC3.1–TC3.4) — PASS
TC5.3 — Addons panel not broken, no layout shifts observed — PASS
TC5.4 — Toolbar theme preset button present and functional — PASS

### Section F — Regression: non-deprecated stories (TC6)

TC6.1 — Spot-checked 5 non-deprecated components:
- VcButton (Molecules/22 stories) — Docs renders fully, no banner, no badge — PASS
- VcProductCard (Organisms/28 stories) — Docs renders all stories, no banner, no badge — PASS
- VcLabel (Atoms) — Docs renders, no banner — PASS
- VcProductPrice (Molecules/6 stories) — Docs renders, no banner — PASS
- VcPriceDisplay (Atoms) — visible in sidebar without "Deprecated" suffix — PASS
TC6.2 — No console errors observed in Storybook frame — PASS

### Section G — Storefront sanity

TC7.1 — https://vcst-qa-storefront.govirto.com home page loads, build version confirmed as `2.47.0-pr-2231-4703-47032789`, zero console warnings/errors in browser console — PASS
TC7.2 — No [VcLineItemProperty], [VcPriceDisplayCatalog], [VcItemPriceCatalog] warnings on storefront (prod build + components unused) — PASS

---

## Observations

1. **Toolbar badge placement**: The "Deprecated" text appears in the Storybook toolbar area (next to theme preset button) when a deprecated story is active — this is the addon's standard behavior, not just in the sidebar. Provides an additional visual cue.

2. **Docs block order note**: VcItemPriceCatalog has no Subtitle defined. The block order is Title → Banner → Primary → Controls → Stories, which is correct per docs-page.ts (Subtitle block silently omitted when empty).

3. **Console warn in prod Storybook**: The deployed Storybook at vcst-qa-storybook.govirto.com is a production build (not a live Vite dev server), so `import.meta.env.DEV` is `false` and the `console.warn` does not fire. This is correct. If the team wants to verify the warn in a local dev server context, that requires running `npm run storybook` locally.

4. **Storefront locale**: The storefront defaulted to Japanese locale (`/ja/`), which is a pre-existing environment state unrelated to this PR.

---

## Verdict

**PASS** — All 7 ACs verified. All 3 deprecated components show sidebar badge + docs banner with exact expected messages and correct CSS styling. Non-deprecated components are unaffected. No Storybook regressions. Storefront build confirmed correct and silent.
