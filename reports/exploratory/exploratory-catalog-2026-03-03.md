# Exploratory Testing Session Report -- Catalog Area

## Session Metadata

| Field | Value |
|-------|-------|
| **Date** | 2026-03-03 |
| **Tester** | qa-testing-expert (AI agent) |
| **Browser** | Firefox (playwright-firefox) |
| **Environment** | QA -- https://vcst-qa-storefront.govirto.com |
| **Platform Version** | Ver. 2.43.0-pr-2188-c129-c1290c2d |
| **Logged in as** | BMW-Group / Elena Mutykova |
| **Session Duration** | ~25 minutes |
| **Charter** | Explore catalog browsing, product pages, filters, search, and edge cases |
| **Heuristics Applied** | SFDPOT (Structure, Function, Data, Platform, Operations, Time), CRISP (Consistency, Reliability, Integrity, Security, Performance) |

---

## Summary

| Metric | Count |
|--------|-------|
| **Areas Explored** | 7 (Navigation, Listing, Filters, Search, PDP, BOPIS, Edge Cases) |
| **Bugs Found** | 21 |
| **Critical** | 0 |
| **High** | 3 |
| **Medium** | 11 |
| **Low** | 7 |
| **Screenshots Captured** | 21 |

---

## Areas Explored

### 1. Category Navigation and Breadcrumbs

**What was tested:** Top-level category menu ("All products"), 2-level deep navigation (Bolts > Carriage Bolts), breadcrumb rendering and links, main navigation bar.

**Findings:**

| # | Finding | Severity | Screenshot |
|---|---------|----------|------------|
| BUG-01 | **Test categories visible in public navigation.** The "All products" dropdown displays internal test categories: "[E2E Test] RAM", "[E2E] Products", "[E2E Test] Notebooks", "[E2E Test] SSD", "NewTest2". These are test artifacts that should not be visible to end users. | Medium | `02-all-products-menu.png` |
| BUG-02 | **Typo in category name: "Generatation-en"** -- double 'a' in "Generation". Visible in the "All products" dropdown. | Low | `02-all-products-menu.png` |
| BUG-03 | **Breadcrumb naming inconsistency.** Breadcrumb shows "Bolts SEO EN" (SEO title) while the page heading shows "Bolts Name EN" (display name). These should be consistent -- breadcrumbs should use the display name. Path: Home / Catalog / Bolts SEO EN vs heading "Bolts Name EN". | Medium | `04-bolts-category.png` |

### 2. Product Listing Pages (Grid, Pagination, Sort)

**What was tested:** Default list view, grid view toggle, sort by price (ascending), infinite scroll / lazy load pagination, product count display.

**Findings:**

| # | Finding | Severity | Screenshot |
|---|---------|----------|------------|
| BUG-04 | **Grammar error: "1 VARIATIONS"** should be singular ("1 VARIATION") when count is 1. Found on products with a single variant in the Freight Car Bolts subcategory. | Low | `05-subcategory-freight-car-bolts.png` |
| BUG-05 | **Test product names exposed to customers.** Multiple products have internal test names visible: "ACCEPT TEST...", "Item for theme performance. DND!", "One bolt test", "QA-Carriage Bolt", "LAYS CHIPS PAPRIKA BOX 20X40GR (validation)", "DIGITAL product", "Epson WorkForce WF-2760 All-in-One (PRICE 0 reorder )". | Medium | `05-subcategory-freight-car-bolts.png`, `18-product-detail-page.png` |
| BUG-06 | **Repeated vendor name string.** Wine products display "Kft_Vivo_wineKft_Vivo_wineKft_Vivo_wine..." (vendor name concatenated/repeated multiple times) instead of a clean vendor name. Confirmed on cross-sell cards for whiskey PDP as well. | Medium | `07-catalog-sorted-price-asc.png` |
| BUG-07 | **"Increase quantity" button disabled for in-stock products (qty 0).** On product cards in catalog view, the increment button appears disabled even though the product shows as in-stock with available inventory. Users cannot add items to cart from the listing page. Possibly intentional (min order qty rules), but confusing UX. | Medium | `07-catalog-sorted-price-asc.png` |
| OBS-01 | **Accessibility: heading result count concatenated.** The heading "3828results" has no space between the number and "results" in the DOM text content, though it renders visually with spacing due to CSS. Screen readers may announce this incorrectly. | Low | `03-catalog-page.png` |

### 3. Filters and Facets

**What was tested:** Price range histogram slider, "Purchased before" checkbox, Brand filter with search, Reset filters, sidebar filter categories (30+ facets).

**Findings:**

| # | Finding | Severity | Screenshot |
|---|---------|----------|------------|
| BUG-08 | **Filter naming inconsistencies -- technical property names exposed.** Multiple filter facets display raw internal property names instead of user-friendly labels: "ISCONTAINSALCOHOL" (should be "Contains Alcohol"), "boolean_value", "datetime_value", "original_sku". | Medium | `11-sidebar-filters-scrolled.png` |
| BUG-09 | **Brand facet "3DR" shows products with Brand: Apple.** Selecting brand "3DR" in the filter returns products (e.g., iPhones) that display "Brand: Apple" on their cards. This indicates a data or search index mismatch between the facet value and the actual product brand attribute. | High | `13-brand-filter-3DR-applied.png` |
| BUG-10 | **Brand filter search returns "No results" for existing brand "Yalumba."** Typing "Yalumba" in the brand filter search shows "No results", yet Yalumba wine products exist in the catalog. The brand search may be matching on a different field or the brand index is incomplete. | High | `14-brand-search-yalumba.png` |
| OBS-02 | **Sidebar filter click interaction issues.** Playwright click actions on sidebar filter checkboxes and buttons consistently timed out, requiring JavaScript workarounds (scrollIntoView + dispatchEvent). This may indicate custom Vue component event handling that doesn't expose standard click targets, which could also affect assistive technologies. | Low | `10-purchased-before-attempt.png` |
| OBS-03 | **Price filter URL state preservation works correctly.** Applying price filter <=10 updated the URL with `?facets=%22price%22:[TO+10]` and showed 32 results. Reset filters cleared URL params and restored 3,878 results. Good behavior. | -- (PASS) | `09-price-filter-results.png` |

### 4. Search Functionality

**What was tested:** Autocomplete suggestions (hints, products, categories), search results page, XSS injection test, empty results handling, SQL injection test.

**Findings:**

| # | Finding | Severity | Screenshot |
|---|---------|----------|------------|
| BUG-11 | **XSS search `<script>alert(1)</script>` unexpectedly returns 1 result.** While the XSS payload is properly HTML-escaped (no script execution -- Vue.js text interpolation handles this correctly), the search returned 1 result (Epson printer) when the query should logically match nothing. The search engine appears to be tokenizing HTML tags and matching on partial tokens. | Low | `17-search-xss-escaped.png` |
| BUG-12 | **Search autocomplete includes unrelated terms.** Typing "bolt" shows autocomplete hints that include unrelated terms like "printer", "oreo", "epson" -- likely from search history leaking into suggestions. Also shows raw SKU "CFG-ALLOOS-20260224" as an autocomplete hint. | Low | `16-search-autocomplete-bolt-typed.png` |
| OBS-04 | **Autocomplete requires key events, not value injection.** Setting the search input value via JavaScript (`input.value = 'bolt'`) does not trigger the autocomplete dropdown. Only `pressSequentially()` (simulating individual keystrokes) triggers the Vue reactive handler. This is not a bug but is relevant for automation testing. | -- (Note) | `15-search-autocomplete-bolt.png` |
| OBS-05 | **Empty search results UX is good.** Searching for "xyznonexistentproduct12345" shows a clear message with an illustration and "Reset search" button. No console errors. | -- (PASS) | -- |

### 5. Product Detail Pages

**What was tested:** Product info display (title, SKU, price, badges), quantity spinner, "See more" description toggle, "Check pickup locations" (BOPIS), cross-sell section, breadcrumb navigation, configurable product, out-of-stock product.

**Findings:**

| # | Finding | Severity | Screenshot |
|---|---------|----------|------------|
| BUG-13 | **PDP quantity spinner behavior confusing.** Clicking "Increase quantity" from 0 added the product to cart with qty=45 (instead of incrementing by 1). Clicking "Decrease quantity" then removed all 45 from cart at once (back to 0). The spinner appears to restore a previously-saved cart quantity rather than incrementing/decrementing by 1. GA4 event confirmed `qt45`. Cart count jumped from 68 to 113 then back to 68. | High | `19-pdp-quantity-45-added.png` |
| BUG-14 | **"Customers bought together" cross-sells appear unrelated.** Carriage Bolt PDP shows cross-sells: Acqua Minerale water, Epson printer, Eyebolt, Samsung TV (x2), Off-Road Bike. Only the Eyebolt has any relation to bolts. The recommendation engine appears to be returning random or poorly-correlated products. | Medium | `18-product-detail-page.png` |
| BUG-15 | **Configurable product shows no configuration options.** The "Off-Road Bike. Configurable product" PDP displays price and add-to-cart but has NO variant/configuration selectors (no color, size, options dropdown). Either the configuration is not set up, or the UI is not rendering the variant picker. | Medium | `21-pdp-configurable-bike.png` |
| BUG-16 | **Configurable product has broken breadcrumb.** The Off-Road Bike PDP only shows "Home" in breadcrumbs -- no category hierarchy. The URL is GUID-based (`/product/958d0762-...`) instead of a SEO-friendly slug path. | Medium | `21-pdp-configurable-bike.png` |
| BUG-17 | **Product image 404 for Off-Road Bike cross-sell card.** The Honda motorcycle image (`https://images.netdirector.co.uk/.../475635_25ym_honda_crf450rx_1__md.jpg`) returns HTTP 404 when displayed as a cross-sell card on the Carriage Bolt PDP. Console shows "A resource is blocked" warning. The image loads from cache on the bike's own PDP. | Medium | Network trace (no dedicated screenshot) |
| BUG-18 | **Stock value "9999+" on configurable product.** The Off-Road Bike shows "9999+" in stock -- this appears to be a test/placeholder value rather than real inventory. | Low | `21-pdp-configurable-bike.png` |
| OBS-06 | **BOPIS "Pick points" dialog works well.** Opens with searchable list, Google Maps integration, pickup location markers with clustering, "Today" availability indicators. Minor: location names include internal naming patterns ("Main_2; Transfer_1", "Transfer_2_3", "FFC") and one has an emoticon ("B2B - Bristol branch UK ;)"). | -- (PASS with notes) | `20-bopis-pickup-dialog.png` |
| OBS-07 | **Google Maps deprecated API warnings.** The BOPIS map generates ~50 deprecation warnings for `<gmp-pin>: The 'glyph' property is deprecated`. Not a bug now but may break in a future Google Maps API version. | -- (Note) | -- |
| OBS-08 | **"See more" / "See less" toggle works correctly.** Description expands and collapses properly. Button label updates. | -- (PASS) | -- |

### 6. Edge Cases and Boundary Conditions

**What was tested:** Non-existent product URL (404), very long search query (256 chars), SQL injection in search, browser back button navigation.

**Findings:**

| # | Finding | Severity | Screenshot |
|---|---------|----------|------------|
| OBS-09 | **404 page handles gracefully.** Navigating to `/product/nonexistent-product-id-12345` shows a proper 404 page with "Page not found" message and "Home page" link. Title: "QA & 404 Page not found". No console errors. | -- (PASS) | -- |
| OBS-10 | **Long search query handled without errors.** A 256-character all-'a' query processed without crash, truncation, or server error. Full string displayed in heading and search box. | -- (PASS) | -- |
| OBS-11 | **SQL injection properly sanitized.** `'; DROP TABLE products;--` is URL-encoded, displayed as text, returns "no results". No server error, no console error. | -- (PASS) | -- |
| BUG-19 | **Cross-origin image resources generate cookie/CORS warnings.** Multiple product images hosted on external CDNs (e.g., `images.netdirector.co.uk`) generate console warnings about blocked resources and SameSite cookie issues. Affects image loading for some cross-sell products. | Low | -- |

---

## Console and Network Summary

### Console Errors
- **Total errors observed:** 0 across entire session
- **Warnings observed:** ~60+ (mostly benign)
  - Repeated: `"The value of the attribute..."` (Firefox accessibility attribute warning)
  - Google Maps `<gmp-pin>` deprecated property warnings (~50 on BOPIS dialog)
  - `"A resource is blocked"` for cross-origin images (Honda motorcycle, wedding cake)
  - `"WebSocket Connection closed"` / `"Connection opened"` (normal reconnection)
  - `"This site appears to use..."` (Firefox tracking protection notice)

### Network Issues
- **404 errors:** Honda motorcycle image (`images.netdirector.co.uk/.../475635_25ym_honda_crf450rx_1__md.jpg`)
- **GraphQL:** All GraphQL requests returned HTTP 200. No `errors[]` observed in response data.
- **GA4 tracking:** Correctly firing events (`page_view`, `view_item`, `add_to_cart`, `view_item_list`, `scroll`)
- **Performance:** No slow requests observed (all under 500ms threshold during manual testing)

---

## Bug Summary (Sorted by Severity)

### High (3)

| ID | Title | Area |
|----|-------|------|
| BUG-09 | Brand facet "3DR" maps to products displaying Brand: Apple (data/index mismatch) | Filters |
| BUG-10 | Brand filter search returns "No results" for existing brand "Yalumba" | Filters |
| BUG-13 | PDP quantity spinner adds 45 instead of incrementing by 1 | PDP |

### Medium (11)

| ID | Title | Area |
|----|-------|------|
| BUG-01 | Test categories visible in public navigation (5 E2E test categories) | Navigation |
| BUG-03 | Breadcrumb naming inconsistency (SEO title vs display name) | Navigation |
| BUG-05 | Test product names exposed to customers (7+ products) | Listing |
| BUG-06 | Repeated vendor name "Kft_Vivo_wine..." on wine products | Listing |
| BUG-07 | "Increase quantity" disabled for in-stock products on listing cards | Listing |
| BUG-08 | Technical property names exposed in filter labels (ISCONTAINSALCOHOL, boolean_value) | Filters |
| BUG-14 | Cross-sell "Customers bought together" shows unrelated products | PDP |
| BUG-15 | Configurable product shows no configuration options | PDP |
| BUG-16 | Configurable product has broken breadcrumb (only "Home") | PDP |
| BUG-17 | Product image 404 for Off-Road Bike cross-sell card | PDP |
| BUG-19 | Cross-origin image resources generate cookie/CORS warnings | Network |

### Low (7)

| ID | Title | Area |
|----|-------|------|
| BUG-02 | Typo "Generatation-en" in category name | Navigation |
| BUG-04 | Grammar "1 VARIATIONS" (should be singular) | Listing |
| BUG-11 | XSS search returns 1 result (token matching) despite proper escaping | Search |
| BUG-12 | Search autocomplete includes unrelated terms / raw SKUs | Search |
| BUG-18 | Stock "9999+" on configurable product (test data) | PDP |
| OBS-01 | Accessibility: heading result count concatenated without space | Listing |
| OBS-02 | Sidebar filter click interaction issues (automation/a11y concern) | Filters |

---

## Heuristic Evaluation

### SFDPOT Assessment

| Dimension | Finding |
|-----------|---------|
| **Structure** | Category hierarchy works for 2 levels deep. Breadcrumbs functional but inconsistent naming. GUID-based URLs for some products break SEO and breadcrumbs. |
| **Function** | Core catalog browsing, search, and filtering work. Quantity spinner UX is confusing. Configurable product variant picker missing. Cross-sell recommendations are poor quality. |
| **Data** | Significant test data pollution: 5 test categories, 7+ test product names, dummy stock values (9999+), $0 products. Brand index mismatch (3DR -> Apple). Vendor name concatenation bug. |
| **Platform** | Firefox testing only (per charter). No cross-browser comparison. External image CDN issues. Google Maps API deprecation warnings. |
| **Operations** | Filters persist in URL correctly. Search state preserves. 404 handling graceful. Back button navigation has intermediate empty states. |
| **Time** | Infinite scroll loads correctly. No observable timeouts. Apollo WebSocket reconnects cleanly. |

### CRISP Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Consistency** | FAIR | Breadcrumb naming inconsistent. Some products use SEO slugs, others use GUIDs. Filter labels mix technical and user-friendly names. |
| **Reliability** | GOOD | No crashes, no server errors. All pages load. GraphQL endpoints healthy. |
| **Integrity** | FAIR | Brand filter data mismatch is a data integrity issue. Cross-sell recommendations lack meaningful correlation. |
| **Security** | GOOD | XSS properly escaped. SQL injection sanitized. No exposed credentials or error stack traces. |
| **Performance** | GOOD | Pages load quickly. No observable slowness. GraphQL requests complete promptly. (Formal performance testing not conducted.) |

---

## Recommendations

1. **Data cleanup (High priority):** Remove or hide test categories, test product names, and dummy inventory values from the QA environment, or at minimum ensure they are not visible to non-admin users.

2. **Brand index rebuild (High priority):** Investigate and fix the brand facet mismatch (BUG-09) and brand search failure (BUG-10). These affect product discoverability.

3. **Quantity spinner UX review (High priority):** The PDP quantity spinner behavior of jumping from 0 to a large number on first click needs investigation. Expected behavior: increment by 1 per click.

4. **Filter label cleanup (Medium priority):** Replace technical property names ("ISCONTAINSALCOHOL", "boolean_value") with user-friendly labels in the facet configuration.

5. **Cross-sell algorithm review (Medium priority):** "Customers bought together" recommendations need tuning. Currently showing completely unrelated products (bolts with TVs and water).

6. **Breadcrumb consistency (Medium priority):** Standardize on display name vs SEO title in breadcrumbs. Ensure products with GUID URLs also have proper category breadcrumbs.

7. **Configurable product completion (Medium priority):** Either implement variant selectors for configurable products or remove the "Configurable product" suffix from the product name.

---

## Evidence Artifacts

### Screenshots (21 total)

All screenshots saved to: `reports/exploratory/screenshots/`

| File | Description |
|------|-------------|
| `01-homepage-initial.png` | Baseline homepage after login |
| `02-all-products-menu.png` | Category dropdown showing test categories |
| `03-catalog-page.png` | Main catalog page (3,828 results) |
| `04-bolts-category.png` | Bolts category with breadcrumb inconsistency |
| `05-subcategory-freight-car-bolts.png` | Subcategory with "1 VARIATIONS" grammar bug |
| `06-catalog-grid-view.png` | Grid view toggle |
| `07-catalog-sorted-price-asc.png` | Price sort ascending with vendor name bug |
| `08-price-filter-expanded.png` | Price filter histogram UI |
| `09-price-filter-results.png` | Price <=10 filter applied (32 results) |
| `10-purchased-before-attempt.png` | Purchased before filter click attempt |
| `11-sidebar-filters-scrolled.png` | Full sidebar showing filter naming issues |
| `12-brand-filter-expanded.png` | Brand filter with search and checkboxes |
| `13-brand-filter-3DR-applied.png` | Brand 3DR applied showing Apple products |
| `14-brand-search-yalumba.png` | Brand search "No results" for Yalumba |
| `15-search-autocomplete-bolt.png` | Search autocomplete attempt (value injection) |
| `16-search-autocomplete-bolt-typed.png` | Search autocomplete working (key events) |
| `17-search-xss-escaped.png` | XSS payload properly escaped in search |
| `18-product-detail-page.png` | Carriage Bolt PDP with cross-sells |
| `19-pdp-quantity-45-added.png` | Quantity spinner jumped to 45 |
| `20-bopis-pickup-dialog.png` | BOPIS pickup locations dialog with map |
| `21-pdp-configurable-bike.png` | Configurable product with no variant picker |

### Console/Network Logs

Saved automatically by Playwright to `test-results/firefox/`:
- `console-2026-03-03T*.log` (multiple log files per navigation)
- DOM snapshots saved to `test-results/firefox/snapshot-*.md`

---

## Session Sign-Off

| Field | Value |
|-------|-------|
| **Session Status** | COMPLETED |
| **Total Bugs** | 21 (3 High, 11 Medium, 7 Low) |
| **Critical Blockers** | None |
| **Data Quality** | FAIR -- significant test data pollution affects catalog presentation |
| **Functional Quality** | GOOD -- core workflows functional, filter data integrity issues |
| **Security** | GOOD -- XSS and SQL injection properly handled |
| **Recommendation** | Address High bugs (brand filter mismatch, quantity spinner) before next release. Data cleanup is overdue. |
