# Testing Checklist — VCST-4781: Add Missing Atoms Stories

**PR:** VirtoCommerce/vc-frontend#2214
**Date:** 2026-03-30
**Build:** vc-theme-b2b-vue-2.45.0-pr-2214-31b9-31b9206e

---

## Part A: Storybook Story Verification (ui-ux-expert)

For each of the 14 new stories, verify:
1. Story renders without errors in Storybook
2. Controls/args panel works and modifies the component
3. Component visual appearance matches design system expectations
4. No console errors during render

### Stories to verify:

| # | Component | Story Path | Key Controls |
|---|-----------|-----------|--------------|
| 1 | VcActionInput | Components/Atoms/VcActionInput | modelValue, label, placeholder, errorMessage, applied, disabled |
| 2 | VcContainer | Components/Atoms/VcContainer | (slot content) |
| 3 | VcExpansionPanels | Components/Atoms/VcExpansionPanels | (panel items, expand/collapse) |
| 4 | VcLineItemProperty | Components/Atoms/VcLineItemProperty | label, value |
| 5 | VcListItem | Components/Atoms/VcListItem | (slot content, interactive) |
| 6 | VcLoader | Components/Atoms/VcLoader | (loading animation) |
| 7 | VcPopover | Components/Atoms/VcPopover | (trigger, content, placement) |
| 8 | VcPopupSidebar | Components/Atoms/VcPopupSidebar | (open/close, slot content) |
| 9 | VcPriceDisplayCatalog | Components/Atoms/VcPriceDisplayCatalog | price, listPrice, currency |
| 10 | VcProductProperties | Components/Atoms/VcProductProperties | properties array |
| 11 | VcProductsGrid | Components/Atoms/VcProductsGrid | products array, columns |
| 12 | VcScrollTopButton | Components/Atoms/VcScrollTopButton | (scroll behavior) |
| 13 | VcTooltip | Components/Atoms/VcTooltip | text, placement |
| 14 | VcTotalDisplay | Components/Atoms/VcTotalDisplay | label, value |

### Storybook-level checks:
- [ ] No broken stories in the Storybook sidebar navigation
- [ ] All 14 stories appear under Components/Atoms/
- [ ] Story source code/docs tab renders if applicable

---

## Part B: Component Removal Verification (qa-frontend-expert)

### VcCardSkeleton removal:
- [ ] Storefront loads without errors (no missing component warnings in console)
- [ ] Product listing pages render correctly (skeleton/loading states work)
- [ ] Category pages load without visual regressions
- [ ] Search results page renders product grid correctly

### Atoms index.ts/types.d.ts changes:
- [ ] No TypeScript errors visible in console (build succeeded since deployed)
- [ ] Components that use atoms still render correctly on storefront
