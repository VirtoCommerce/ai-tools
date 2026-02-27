# BUG: BOPIS Pickup Location Search - Country Code "USA" Returns Zero Results

**Summary:** Searching BOPIS pickup locations by country code "USA" or country name "United States" returns 0 results in both the storefront UI and GraphQL API, while identical searches for other countries (CAN, GBR, DNK, MYS) work correctly.

## Details

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Priority** | P2 |
| **Type** | Bug |
| **Component** | BOPIS Pickup Location Search / Elasticsearch Indexing |
| **Environment** | QA (https://vcst-qa-storefront.govirto.com) |
| **Browser** | Chrome (latest), also confirmed via GraphQL API |
| **Store** | B2B-store |
| **Found During** | VCST-4650 verification testing |
| **Date** | 2026-02-26 |
| **Labels** | bopis, search, elasticsearch, indexing, country-code |

## Steps to Reproduce

### Via Storefront UI:
1. Navigate to any product page (e.g., https://vcst-qa-storefront.govirto.com/bolts/carriage-bolts/1-steel-carriage-bolt-grade-5-zinc-plated-finish-14-20-diathread-size-100-pk-fastener-length-1-thread-size-14-20)
2. Click "Check pickup locations" button
3. In the "Pick points" modal, type "USA" in the search field
4. Click the Search button
5. Observe: "Pickup points not found." message with 0 results

### Via GraphQL API:
```graphql
query {
  productPickupLocations(
    productId: "ec235043d51848249e90ef170c371a1c"
    keyword: "USA"
    first: 50
    storeId: "B2B-store"
    cultureName: "en-US"
    currencyCode: "USD"
  ) {
    totalCount
    items { name }
  }
}
```
Result: `totalCount: 0`

## Expected Behavior

Searching for "USA" should return all US-based pickup locations (~80+ out of 102 total locations), since the majority of fulfillment centers have `countryCode = "USA"` and `countryName = "United States of America"`.

## Actual Behavior

The search returns 0 results for all USA-related keywords:

| Keyword | Result |
|---------|--------|
| "USA" | 0 results |
| "US" | 0 results |
| "United States" | 0 results |
| "United" | 0 results |
| "usa" (lowercase) | 0 results |

## Comparison: Other Countries Work Correctly

| Keyword | Result | Country |
|---------|--------|---------|
| "CAN" | 2 results | Canada |
| "Canada" | 2 results | Canada |
| "GBR" | 1 result | United Kingdom |
| "DNK" | 1 result | Denmark |
| "MYS" | 1 result | Malaysia |
| "Denmark" | 1 result | Denmark |
| "Malaysia" | 1 result | Malaysia |

## Root Cause Analysis

**Hypothesis:** This is an Elasticsearch relevance/scoring issue caused by term frequency distribution.

The term "USA" appears in approximately 80 out of 102 documents (~78% of all documents). Elasticsearch's TF-IDF (Term Frequency-Inverse Document Frequency) scoring assigns extremely low relevance scores to terms that appear in nearly all documents, because such terms have low discriminative power. This can cause the search to effectively filter out all "USA" matches as irrelevant.

Alternative: "USA" or "US" may be configured as stop words in the Elasticsearch analyzer, which would prevent them from being indexed or searched at all.

**Why other countries work:** Countries like Canada (2 documents), UK (1 document), Denmark (1 document), and Malaysia (1 document) have very low document frequency, giving them high IDF scores and making them highly relevant when searched.

## Impact

**Medium** -- Users searching for "USA" to filter pickup locations by country will get zero results. However:
- City search ("New York"), postal code search ("10059"), and street search ("Lexington Ave") all work correctly
- These are more practical search patterns for users looking for nearby pickup locations
- Country-level filtering is a less common use case for pickup location search

## Suggested Fix

1. **Option A (Recommended):** Add country-related fields to a `keyword` or `not_analyzed` field type in the Elasticsearch index mapping, bypassing relevance scoring for exact matches
2. **Option B:** Adjust the search query to use `match` with `minimum_should_match: 1` or `term` query for country fields instead of relying on `multi_match` scoring
3. **Option C:** Reduce the minimum score threshold or use `constant_score` wrapping for country field matches

## Evidence

- **Storefront screenshot:** `tests/Sprint26-04/VCST-4650-bopis-pickup-search-indexing/screenshots/desktop/TC-B03-usa-country-code-no-results.png`
- **GraphQL screenshot:** `tests/Sprint26-04/VCST-4650-bopis-pickup-search-indexing/screenshots/desktop/TC-A04-country-code-USA-0-results.png`

## Related

- **Parent ticket:** VCST-4650 - [BOPIS] Pickup location search does not index address fields
- **Confirmed by:** Both qa-backend-expert (TC-A04) and qa-frontend-expert (TC-B03) independently verified this issue
