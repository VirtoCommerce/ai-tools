# BUG: Range filter breaks for property names containing underscores (Volume_ml → Volume)

## Status: CONFIRMED

**Severity:** High
**Component:** Catalog / Search / Filters
**Browser:** Firefox 137.0
**Environment:** https://vcst-qa-storefront.govirto.com
**Platform Version:** 3.1009.0
**Theme Version:** 2.45.0-pr-2204-de06-de06c786
**Module Versions:** VirtoCommerce.XCatalog 3.1001.0, VirtoCommerce.Search 3.1000.0
**USER_EMAIL:** .env
**USER_PASSWORD:** .env
**Date:** 2026-03-24
**Reported By:** QA Agent
**JIRA Reference:** [VP-9035](https://virtocommerce.atlassian.net/browse/VP-9035)

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com/alcoholic-drinks
2. Observe the **Volume_(mL)** range filter button in the filter bar (range: 33–550)
3. Open the Volume_(mL) filter dropdown — slider appears with min=33, max=550
4. Set range to 200–550 (or navigate directly: `/alcoholic-drinks?filter=Volume_ml:200+TO+550`)
5. Observe the applied filter chip and the filtered results

## Expected Result

- Filter chip should show: **Volume_ml: 200 – 550**
- Only products with Volume_ml between 200 and 550 should appear
- Expected products: Three Cents (200), ERDINGER Grapefruit (330), Erdinger Alkoholfrei (550), Efes Can X24 (550), Erdinger Weissbier (550), Erdinger Dunkel (550) — approximately 6 products

## Actual Result

- Filter chip shows: **Volume: ≤ 311** — the field name is truncated from `Volume_ml` to `Volume`, and the range is corrupted
- **4 results** appear, including products with Volume_ml=33 (Beck's bottle, Efes Pilsener) that should be excluded
- The URL mutates to `?filter=Volume_ml:200+TO+550&facets=%22Volume_ml%22:[TO+311]` — the facet range is completely wrong
- The range filter is effectively non-functional for any property with underscores in its name

## Evidence

- Screenshot (slider open): `test-results/firefox/VP-9035-volume-filter-click.png`
- Screenshot (filter applied, wrong results): `test-results/firefox/VP-9035-filter-not-applied.png`
- Network log: `test-results/firefox/VP-9035-network.log`
- Console errors: none (bug is silent — no errors, just wrong behavior)
- HAR file: not captured

## Root Cause Analysis

- **Source file:** [`vc-module-x-catalog/src/VirtoCommerce.XCatalog.Core/Extensions/IFiltertExtensions.cs`](https://github.com/VirtoCommerce/vc-module-x-catalog/blob/dev/src/VirtoCommerce.XCatalog.Core/Extensions/IFiltertExtensions.cs) — `GetFieldName()` method, line ~47
- **Suspected cause:** The `GetFieldName` extension method explicitly splits RangeFilter field names by underscore and takes only the first part:
  ```csharp
  if (filter is RangeFilter)
  {
      return fieldName.Split('_')[0];
  }
  ```
  For a property named `Volume_ml`, this returns `Volume` instead of `Volume_ml`. The truncated name no longer matches the aggregation field name from the search index, so:
  1. `SetAppliedAggregations()` fails to match the filter to its aggregation items (comparing `Volume` vs `Volume_ml`)
  2. The frontend receives incorrect `IsApplied` states
  3. The facet/filter URL parameters become corrupted
- **Same code exists in:** `vc-module-search/src/VirtoCommerce.SearchModule.Data/Services/FilterHelper.cs` and the legacy `vc-module-experience-api` (same pattern)
- **Design intent:** The unit test [`IFilterExtensionTests.cs`](https://github.com/VirtoCommerce/vc-module-x-catalog/blob/dev/tests/VirtoCommerce.XCatalog.Tests/Extensions/IFilterExtensionTests.cs) reveals the `Split('_')[0]` was designed to strip **currency suffixes** from price fields (`price_USD` → `price`). Test case: `[InlineData("price_USD", "price", "RangeFilter")]`. No test case exists for non-currency underscore names.
- **`vc-module-search` also affected:** [`FilterHelper.cs`](https://github.com/VirtoCommerce/vc-module-search/blob/dev/src/VirtoCommerce.SearchModule.Data/Services/FilterHelper.cs) has the identical `Split('_')[0]` pattern AND a `FieldNameRegex` (`^(?<fieldName>[A-Za-z0-9\-]+)(_[A-Za-z]{3})?$`) that correctly matches only 3-letter currency suffixes — but the regex is only used in `Stringify`, not in `GetFieldName`.
- **Suggested fix:** Use the existing `FieldNameRegex` (or equivalent check) in `GetFieldName` to only strip the suffix when it matches a 3-letter currency code pattern, preserving full field names like `Volume_ml` or `breedte_mm`.
- **Recent changes:** No recent changes — no fix on `dev` branch. This is a long-standing design assumption.
- **App Insights:** No server-side errors — the bug is a logic error, not an exception

## Impact

- **All range filters** (sliders) for properties with underscores in their names are broken across the entire storefront
- Affects any customer/partner using custom dynamic properties with underscores (e.g., `breedte_mm`, `Volume_ml`, `weight_kg`, `length_cm`)
- Originally reported by partner **Innovadis** for their ARAS customer with property `breedte_mm`
- Products are incorrectly filtered — users cannot narrow down catalog by these properties
- This is a **data integrity issue** for search/filter functionality

## References

- JIRA: [VP-9035](https://virtocommerce.atlassian.net/browse/VP-9035) (Status: Funnel), [VCST-4833](https://virtocommerce.atlassian.net/browse/VCST-4833) (QA ticket)
- Affected repos:
  - [`vc-module-x-catalog`](https://github.com/VirtoCommerce/vc-module-x-catalog) — `IFiltertExtensions.cs:GetFieldName()` (primary)
  - [`vc-module-search`](https://github.com/VirtoCommerce/vc-module-search) — `FilterHelper.cs:GetFieldName()` (duplicate pattern)
  - `vc-module-experience-api` — legacy `IFiltertExtensions.cs` (same pattern)
