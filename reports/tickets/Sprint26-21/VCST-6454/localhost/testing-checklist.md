# VCST-6454 — verification checklist (verify-fix)

Bug: option radios in Product-type sections of a configurable PDP have no accessible name (WCAG 4.1.2).
Fix: vc-frontend#2599 — `option-product.vue` `:aria-label="product.name"`, `option-product-none.vue` translated "None".
Build under test: localhost frontend-only, theme `vc-theme-b2b-vue-2.61.0-pr-2599-aadc` (marker `X-VC-Local-Theme: fe-169714872a92`), API proxied to vcst-qa, store B2B-store, guest.
Pre-fix control: vcst-qa storefront, theme `2.61.0-pr-2570-2fc9`.
Oracle: BL-A11Y-002 (accessible naming), BL-A11Y-001 (keyboard operability), ticket Expected.

## Fix confirmation
- [ ] 1. RED baseline — on the vcst-qa storefront (pre-fix), the Vintage Wedding cake PDP option radios are unnamed (AX tree + axe `label`).
- [ ] 2. GREEN ×3 — on localhost, Vintage Wedding cake PDP with all 5 sections expanded: every option radio has a non-empty name (product name, or "None"); axe `label` = 0. Three consecutive fresh loads.
- [ ] 3. GREEN ×3 — on localhost, Bed with Additional Options PDP, all sections expanded: every radio named; axe `label` = 0.
- [ ] 4. Root cause — the name comes from the radio input's own `aria-label` (product name / translated "None"), not from a visually hidden workaround; each radiogroup is still named after its section.

## Regression
- [ ] 5. Selecting an option still works — pick a different option in an optional section: it becomes checked, the section header summary and the sidebar "Configuration checklist" update, the price updates.
- [ ] 6. Keyboard (BL-A11Y-001) — Tab reaches the radiogroup, arrow keys move the selection inside it, focus is visible.
- [ ] 7. Add to cart of the configured product still works (guest cart on vcst-qa).
- [ ] 8. No new console errors or failed requests compared with the vcst-qa control (known noise: product image 404/DNS, SalesRep `mf-manifest.json` 404).

## Edge cases
- [ ] 9. "None" is translated — switch the storefront to a second language (if the store offers one) and confirm the "None" radio's name follows the locale.
- [ ] 10. BL-A11Y-002 — axe `label`, `aria-input-field-name`, `button-name` on the expanded cake PDP: no new violations versus the control.
