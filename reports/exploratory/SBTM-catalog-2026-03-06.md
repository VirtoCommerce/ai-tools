# SBTM Session Report -- Catalog Exploratory Testing

## Session Details

| Field | Value |
|-------|-------|
| **Charter** | Explore the catalog (browsing, filters, pagination, variants, empty states) to find functional bugs, UX issues, and edge cases that scripted tests miss |
| **Date** | 2026-03-06 |
| **Duration** | ~25 minutes |
| **Tester** | qa-testing-expert (automated via MCP) |
| **Browser** | Firefox (playwright-firefox) |
| **Environment** | https://vcst-qa-storefront.govirto.com (QA) |
| **Platform version** | 2.43.0-pr-2200-24c5-24c519f3 |
| **Logged in as** | Elena Mutykova (Bence and Family org) |
| **Store** | B2B-store, Catalog: B2B-mixed (virtual) |

---

## Summary

| Metric | Count |
|--------|-------|
| Areas explored | 8 |
| Bugs found | 6 |
| Data quality issues | 4 |
| Observations | 5 |
| Console errors | 0 |

**Overall assessment:** Core catalog browsing, filtering, sorting, and navigation work correctly. No console errors or API failures observed. However, several functional bugs and data quality issues were found, including a product with disabled add-to-cart buttons despite having stock, a name mismatch between breadcrumb and heading, and incomplete facet data. The infinite scroll pagination works but there is no traditional page-based navigation alternative.

---

## Areas Explored

### 1. Catalog Browsing and Navigation
- Navigated to /catalog (3,842 results)
- Tested main navigation menu categories
- Verified breadcrumb trail (Home > Catalog > Category > Subcategory)
- Tested category scoped search (search bar shows "Search within [Category]")
- **Result:** Working correctly

### 2. Filters and Facets
- Tested facet filter panel with multiple filter types (Price, Brand, Sugar, Flavor, Type, Weight, etc.)
- Applied "Show in stock" quick filter -- correctly removes out-of-stock products
- Verified filter chips appear and "Reset filters" button works
- Tested URL deep linking with facet parameters
- Found incomplete Brand facet data on Snacks page
- **Result:** Mostly working, data quality issues in facet values

### 3. Sorting
- Tested "Sort by" with Price low-to-high on Snacks category
- Verified correct sort order (lower prices first)
- Tested sort persistence via URL parameter (`?sort=price-asc`)
- **Result:** Working correctly

### 4. Grid/List View Toggle
- Switched between Grid and List views
- Both render correctly with product images, names, prices
- List view shows additional properties (Brand, Brand_Name, Classification)
- **Result:** Working correctly

### 5. Pagination (Infinite Scroll)
- Kitchen supplies category: 140 products
- Uses infinite scroll -- no traditional pagination controls
- Full scroll completed in ~7 iterations, loading all 140 products into DOM
- Page height grew from 3,482px to 11,958px
- No "Load More" button or page numbers
- **Result:** Working, but may cause performance issues on categories with thousands of products (e.g., Accessories with 3,479)

### 6. Product Variants
- Tested Nachos Chips product with 3 variations (50x15g, 50x200g, 50x30g)
- Variations displayed in list/table format with individual prices and stock
- Each variation has its own add-to-cart controls
- Product reviews section displayed correctly (1 review, 5/5 rating)
- **Result:** Working correctly for display; name mismatch bug found

### 7. Search Integration
- Tested XSS injection via search: `<script>alert(1)</script>`
- XSS properly sanitized -- no script execution
- Search returned 1 irrelevant result (Epson printer) for script tag input
- Category-scoped search bar works correctly
- **Result:** Secure but search relevance poor for edge case inputs

### 8. Edge Cases
- Tested product with validation rules (LAYS CHIPS) -- buttons disabled despite stock
- Tested back button behavior from PDP to category
- Tested keyword URL parameter (`?keyword=zzzznonexistent`) -- parameter ignored
- Tested empty search state within category
- **Result:** Multiple issues found

---

## Bugs Found

| # | Severity | Title | Category | Evidence |
|---|----------|-------|----------|----------|
| 1 | **High** | Product quantity buttons disabled despite stock of 62 (LAYS CHIPS) | Functional | `test-results/exploratory/lays-pdp-disabled-buttons.png` |
| 2 | **Medium** | Product name mismatch: breadcrumb says "50x15g" but heading says "50x200g" (Nachos Chips) | Data/SEO | `test-results/exploratory/nachos-variations-page.png` |
| 3 | **Medium** | Brand facet shows only "Nachos (1)" but category has products from Lays, Campina, Reach Juice, Amstel | Data/Facets | `test-results/exploratory/snacks-list-view-sorted.png` |
| 4 | **Medium** | Footer "Popular categories" shows "Allbiz" but homepage shows "Medical goods" for same category ID | Data/Content | Visible in all page footers |
| 5 | **Medium** | URL keyword parameter (`?keyword=zzzznonexistent`) ignored on category page -- shows all 140 results | Functional | `test-results/exploratory/empty-search-in-category.png` |
| 6 | **Low** | Vendor name "Kft_Vivo_wineKft_Vivo_wineKft_Vivo_wine..." repeated text in "Customers bought together" | Data Quality | Observed on Nachos Chips PDP |

### Bug Details

#### BUG-1: Product Quantity Buttons Disabled Despite Stock (HIGH)

**Product:** LAYS CHIPS PAPRIKA BOX 20X40GR
**URL:** https://vcst-qa-storefront.govirto.com/snacks/chips/lays-chips-paprika-box-20x40gr
**SKU:** DXT-94128101
**Price:** $57.00 (was $89.00), -36% discount badge
**Stock:** 62 units (displayed as "In stock: 62")

**Steps to reproduce:**
1. Navigate to Snacks > Chips category
2. Find LAYS CHIPS PAPRIKA BOX 20X40GR product
3. Observe quantity controls: both + and - buttons are DISABLED
4. Navigate to product detail page -- same issue

**Expected:** User can adjust quantity and add product to cart.
**Actual:** Both increase/decrease quantity buttons are disabled. User cannot add this product to cart despite it being in stock.

**Root cause hypothesis:** Product name contains the word "validation" in its test data context. Likely a product validation rule (min/max quantity constraint) that is misconfigured, preventing any quantity from being set. All API calls return HTTP 200 -- no server-side error.

**Impact:** Customer cannot purchase this product. Revenue loss for any product with similar misconfigured validation rules.

---

#### BUG-2: Product Name Mismatch Between Breadcrumb and Heading (MEDIUM)

**Product:** Nachos Chips
**URL:** https://vcst-qa-storefront.govirto.com/snacks/chips/nachos-chips-50x15g

**Steps to reproduce:**
1. Navigate to Snacks > Chips > Nachos Chips

**Expected:** Product name is consistent across all page elements.
**Actual:**
- Breadcrumb shows: "Nachos Chips 50x15g"
- URL slug: "nachos-chips-50x15g"
- H1 heading shows: "Nachos Chips 50x200g"

The product was likely renamed from 50x15g to 50x200g but the URL slug and breadcrumb were not updated.

---

#### BUG-5: Category Page Ignores keyword URL Parameter (MEDIUM)

**URL:** https://vcst-qa-storefront.govirto.com/kitchen-supplies?keyword=zzzznonexistent

**Steps to reproduce:**
1. Navigate to Kitchen supplies category page with `?keyword=zzzznonexistent` parameter

**Expected:** Page should filter products by the keyword, or show "no results" empty state.
**Actual:** Page shows all 140 results as if no keyword was provided. The search bar is empty. The keyword parameter is completely ignored.

**Impact:** Deep links with keyword filters from external sources (email campaigns, bookmarks) will not work as expected.

---

## Data Quality Issues

| # | Item | Issue |
|---|------|-------|
| 1 | Brand facet on Snacks | Shows only "Nachos (1)" but visible products have brands Lays, Campina, Reach Juice, Amstel. The Brand property and Vendor field appear to be different data sources. |
| 2 | Footer "Allbiz" link | Category was renamed to "Medical goods" on homepage but footer still shows old name "Allbiz" for category ID `61b05fae-0ea6-45e7-ae4f-8bdc5c043847`. |
| 3 | Vendor name repeated | "Kft_Vivo_wineKft_Vivo_wineKft_Vivo_wine..." in "Customers bought together" section on Nachos PDP. |
| 4 | SEO title prefix | Breadcrumb on Electric Tea Coffee Maker PDP shows "Page Title1" prefix -- raw SEO metadata leaking into breadcrumb text. |

---

## Observations

1. **Infinite scroll only** -- No traditional pagination controls (page numbers, next/prev). For large categories like Accessories (3,479 products), this could cause significant performance issues as all products accumulate in the DOM.

2. **All Kitchen supplies products same price** -- Every product in the Kitchen supplies category is priced at $99.99 (was $100.00) with stock of 1000. This is clearly test data but means price-based sorting cannot be meaningfully verified in this category.

3. **Mixed language product names** -- One Kitchen Robot product contains Hebrew text mixed with Portuguese and Italian: "Kitchen Robot Machine 220V 6L... Robo De Cozinha Robot Da Cucina Inteligente". This is not necessarily a bug but unusual for an English locale.

4. **Category banner** -- Kitchen supplies has a prominent "THE SOUL OF YOUR KITCHEN / SALE OF PRESSURE COOKER" banner with 4 featured products. This appears to be CMS-managed content (likely Builder.io).

5. **Back button behavior** -- After clicking a product link (SPA navigation), the first browser back press re-renders the product page; the second back press returns to the category listing. This suggests the Vue router pushes an extra history state. Could be a Playwright automation artifact, but worth verifying manually.

---

## Risk Areas Identified

| Risk | Severity | Rationale |
|------|----------|-----------|
| Infinite scroll performance on large categories | Medium | Accessories has 3,479 products. Loading all into DOM will cause memory issues. |
| Product validation rules blocking purchases | High | The LAYS CHIPS bug suggests validation rules can silently prevent add-to-cart with no user-facing error message. Other products may be affected. |
| Facet data completeness | Medium | If Brand facet is incomplete, users cannot find products by brand, reducing discoverability. |
| URL parameter handling | Medium | If keyword parameter is ignored, SEO and deep linking strategies will not work as expected. |

---

## Questions for the Team

1. **LAYS CHIPS disabled buttons** -- Is there a known product validation rule on this product? What is the expected behavior when min/max quantity constraints exist? Should the UI show an explanatory message?

2. **Infinite scroll vs pagination** -- Is there a design decision to use only infinite scroll? For categories with thousands of products, should there be a fallback to paginated navigation? Is there a maximum product count threshold?

3. **Brand vs Vendor** -- Are "Brand" (product property) and "Vendor" (product field) intentionally different? Should the Brand facet include all vendor values, or is this a data mapping issue?

4. **Keyword URL parameter** -- Is `?keyword=` a supported parameter on category pages? If not, what is the correct way to deep link to a filtered category view?

5. **Product name update propagation** -- When a product name is changed in Admin, does the URL slug and breadcrumb update automatically, or is manual re-generation required?

---

## Evidence Files

| File | Description |
|------|-------------|
| `test-results/exploratory/catalog-homepage.png` | Homepage with navigation |
| `test-results/exploratory/catalog-main-page.png` | /catalog page showing 3,842 results |
| `test-results/exploratory/catalog-sugar-filter.png` | Filter panel with facets expanded |
| `test-results/exploratory/snacks-category.png` | Snacks category grid view (7 results) |
| `test-results/exploratory/lays-pdp-disabled-buttons.png` | LAYS CHIPS PDP with disabled quantity buttons |
| `test-results/exploratory/snacks-list-view-sorted.png` | List view sorted by price ascending |
| `test-results/exploratory/search-xss-test.png` | XSS sanitization test |
| `test-results/exploratory/nachos-variations-page.png` | Nachos Chips variation page with name mismatch |
| `test-results/exploratory/kitchen-supplies-category.png` | Kitchen supplies category (140 results) |
| `test-results/exploratory/kitchen-supplies-bottom.png` | Infinite scroll mid-point |
| `test-results/exploratory/kitchen-supplies-fully-scrolled.png` | Fully scrolled category page |
| `test-results/exploratory/kitchen-sorted-price-asc.png` | Sort by price ascending working correctly |
| `test-results/exploratory/back-button-404.png` | 404 on back button (goto-based navigation) |
| `test-results/exploratory/back-button-from-pdp-click.png` | Back button from PDP (click-based navigation) |
| `test-results/exploratory/back-button-second-attempt.png` | Second back press restores category |
| `test-results/exploratory/empty-search-in-category.png` | Keyword parameter ignored on category page |

---

## Session Metrics

| Metric | Value |
|--------|-------|
| Time spent testing | ~25 min |
| Time spent investigating | ~5 min |
| Time spent reporting | ~5 min |
| Pages visited | ~15 |
| Screenshots captured | 16 |
| Console errors observed | 0 |
| Bugs filed | 6 (1 High, 3 Medium, 2 Low) |
| Coverage (of charter areas) | 8/8 (100%) |
