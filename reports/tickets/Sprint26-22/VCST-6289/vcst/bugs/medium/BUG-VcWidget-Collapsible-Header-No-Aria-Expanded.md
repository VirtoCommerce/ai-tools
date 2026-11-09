# Collapsible VcWidget header has no aria-expanded / aria-controls — screen readers get no open/closed state

## Status: READY_TO_SUBMIT — filed as VCST-6729 (2026-11-06) — PRE-EXISTING, not introduced by vc-frontend PR #2620
**Found by:** agent — testing VCST-6289 (labels: `found-by-agent`, `found-in-testing`, `vc-fix`, `qa-autofix`)
**Tracker:** [VCST-6729](https://virtocommerce.atlassian.net/browse/VCST-6729) — relates to VCST-6289 · Need hotfixes set (defect in bundles v15 = vc-frontend 2.51.1 and v16 = 2.59.0)
**Severity:** Medium (P2) — accessibility, BL-A11Y-004 / WCAG 2.2 SC 4.1.2; not checkout-blocking

**Environment:** vcst · Platform 3.1094.0 · theme vc-theme-b2b-vue-2.62.0-pr-2620-b47e-b47e1167 · QA Storybook (PR build) + DEV Storybook (dev build)

**Steps:**
1. Storybook → Components / Organisms / VcWidget → "Collapsible" (`components-organisms-vcwidget--collapsible`), either design.
2. Read `aria-expanded` / `aria-controls` on `button.vc-widget__header-container`; click it; read again.
3. Storefront `/catalog` → expand the Brand facet (a `collapsible` VcWidget); inspect the accessibility tree.

**Actual:** Both attributes are null in both states; the body toggles `display:block ⇄ none` (v-show) and has no id. The accessibility tree shows `button "Widget title"` / the facet button with no `[expanded]` state. Same on QA SB, DEV SB and the storefront facet.

**Expected:** The toggle button exposes `aria-expanded="true|false"` that follows the visible state, and `aria-controls` pointing at the body region (BL-A11Y-004; WCAG 4.1.2).

**Control:** the header Language button on the same page reports `[expanded]` when open, so the lane does read the state.

**Reach:** every collapsible VcWidget — catalog facets (`facet-filter.vue`, `slider-filter.vue`), configurable product sections (`product-configuration.vue`).

**Evidence:** `evidence/C-21/` (evidence-index.md, root-cause.md, `network/attribute-reads.json`) · screenshots `bugs/screenshots/VcWidget-Collapsible-Header-No-Aria-Expanded/` (qa-sb-collapsible-collapsed.png; storefront-brand-facet-expanded.png re-captured 2026-11-06 because the package copy is blank) · checklist C-21 · kb KB-B70B1A4A

## Fix Routing (→ /qa-fix)
- **Owning layer:** Storefront UI kit
- **Suggested repo:** VirtoCommerce/vc-frontend — `client-app/ui-kit/components/organisms/widget/vc-widget.vue`
- **Fix shape:** when `collapsible`, bind `aria-expanded` to `!_collapsed` and `aria-controls` to a unique id on `.vc-widget__slot-container` (additive, no visual change)
- **Routing confidence:** HIGH
