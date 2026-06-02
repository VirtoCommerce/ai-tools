# VCST-4781: Storefront Smoke Test Report -- VcCardSkeleton Removal

**Ticket:** VCST-4781
**PR:** VirtoCommerce/vc-frontend#2214
**Build:** `2.45.0-pr-2214-31b9-31b9206e` (confirmed in footer)
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Browser:** Chromium (Playwright MCP)
**Viewport:** 1920x1080
**Tested by:** qa-frontend-expert
**Date:** 2026-03-30

---

## Test Results Summary

| # | Checklist Item | Status | Notes |
|---|----------------|--------|-------|
| 1 | Homepage load | PASS | Page loaded ("QA & Home"), all sections rendered, 0 console errors, 0 console warnings, all GraphQL calls 200 |
| 2 | Category page (Bolts) | PASS | 35 products rendered in grid, subcategories visible (Freight Car Bolts, Eyebolts, Flange Bolts, Carriage Bolts EN), filters/sort/view-toggle functional, 0 console errors |
| 3 | Search results ("bolt") | PASS | 28 results displayed in product grid, product cards with images/prices/variations/actions rendered correctly, 0 console errors |
| 4 | Product detail page ("One bolt test") | PASS | Full PDP rendered: images (8 thumbnails), description, price ($345.00), quantity controls, vendor info, "Customers bought together" section (5 related products), 0 Vue warnings |
| 5 | Console monitoring (all pages) | PASS | No "Failed to resolve component" warnings. No Vue runtime errors. No JavaScript errors related to VcCardSkeleton or missing components |

---

## Console Errors Found

| Page | Error | Severity | Related to PR? |
|------|-------|----------|----------------|
| Product detail page | `404` for external image at `images.netdirector.co.uk/.../475635_25ym_honda_crf450rx_1__md.jpg` | Low | NO -- pre-existing test data issue (broken external image URL in product gallery) |

No `[Vue warn]: Failed to resolve component: VcCardSkeleton` messages were observed on any page.
No `[Vue warn]: Hydration` mismatch warnings observed.
No unhandled JavaScript exceptions.

---

## Network Summary

- **GraphQL API:** All calls returned `200` across all pages tested (homepage: 7 calls, category: 1+, search: 6+, PDP: 6+)
- **4xx/5xx:** One `404` for external image (see above). No failed API calls.
- **GA4 ERR_ABORTED:** Standard navigation-aborted pattern during page transitions -- expected, not a bug.

---

## Screenshots Captured

| File | Description |
|------|-------------|
| `category-bolts-page.png` | Bolts category page -- product grid with 4 cards visible, sidebar filters, subcategories |
| `search-results-bolt.png` | Search results for "bolt" -- 28 results, product grid rendering correctly |
| `product-detail-page.png` | Product detail page -- images, description, price, quantity, vendor, related products |

No failure screenshots needed -- all tests passed.

---

## Verified Behavior

1. **Product cards render without VcCardSkeleton** -- The removed component was only referenced in barrel export files (`atoms/index.ts`, `atoms/types.d.ts`), not in templates. Product cards on category, search, and PDP-related-products sections all render correctly.
2. **No missing component warnings** -- Vue did not log any "Failed to resolve component" warnings, confirming the component was unused in runtime templates.
3. **Loading states unaffected** -- Page transitions and data fetching work normally. The skeleton loading pattern (if any) uses different mechanisms than the removed `VcCardSkeleton` atom.

---

## Overall Verdict

**PASS** -- The storefront is not broken after VcCardSkeleton component removal. All product card rendering surfaces (category listing, search results, product detail page with related products, homepage) function correctly with zero console errors related to missing components.

---

*Report generated: 2026-03-30 | qa-frontend-expert | Chromium 146*
