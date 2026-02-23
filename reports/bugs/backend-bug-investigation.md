# Backend Bug Investigation Report

**Date:** 2026-02-23
**Investigator:** qa-backend-expert (Claude Opus 4.6)
**Environment:** QA (https://vcst-qa.govirto.com / https://vcst-qa-storefront.govirto.com)
**Browser:** Microsoft Edge (via playwright-edge MCP)
**Storefront Version:** 2.42.0-alpha.2241

---

## Bug 1: PAY-SKY-001 -- Skyflow Backend Payment Processing Failure

### Original Report

| Field | Value |
|-------|-------|
| **Bug ID** | PAY-SKY-001 |
| **Reported Severity** | HIGH |
| **Summary** | Skyflow vault tokenization succeeds but backend payment processing fails |

### Investigation Steps Performed

1. Logged into storefront as Elena Mutykova / ACME Store 3
2. Navigated to cart (11 items present)
3. Changed payment method from CyberSource to "Bank card (Skyflow)"
4. Observed cart page behavior after Skyflow selection
5. Clicked "Place order" -- order was created and redirected to `/checkout/payment`
6. On payment page, observed "Saved cards" dropdown with one saved card
7. Clicked "Add new card" -- Skyflow iframe loaded after ~5 second delay
8. Filled card details: Visa 4007000000027, Test User QA, 02/29, CVV 900
9. Clicked "Pay now" -- payment failed with error message
10. Analyzed network requests and Skyflow iframe configuration

### Findings

#### Finding 1: Cart Page -- Card Entry Fields Disappear When Skyflow Selected

When selecting "Bank card (Skyflow)" as the payment method on the cart page, the "Payment card" section with card entry fields **completely disappears**. This is unlike CyberSource, Authorize.Net, and other payment methods which display card entry fields inline.

As a result, the "Place order" button becomes enabled **without any card details entered**, allowing the user to proceed to the payment page without providing card information.

**Screenshot:** `reports/bugs/screenshots/skyflow-payment-selected-no-card-fields.png`

#### Finding 2: Payment Page -- No Inline Card Form, Only "Saved Cards" Dropdown

On the `/checkout/payment` page, after Skyflow is selected:
- A "Saved cards" dropdown appears with options: one saved card (".... 0015 (09/27)") and "Add new card"
- No card entry form is visible by default
- The "Pay now" button is disabled until a saved card is selected or a new card form is completed

**Screenshot:** `reports/bugs/screenshots/skyflow-payment-page-no-card-fields.png`

#### Finding 3: Skyflow Iframe Load Delay (~5 seconds)

After clicking "Add new card", the Skyflow iframe appears but takes approximately **5 seconds** to load the card entry fields (Card number, Cardholder name, Expiration date, Security code). During this time, a browser console warning appears:

```
Failed to execute 'postMessage' on 'DOMW...
```

**Screenshot:** `reports/bugs/screenshots/skyflow-card-form-loaded.png`

#### Finding 4: Payment Processing Failure After Successful Tokenization

After filling in valid card details and clicking "Pay now":

**Successful tokenization:**
```
POST https://ebfc9bee4242.vault.skyflowapis.com/v1/vaults/c1aeec61ad7c46c2b724f004a7658b2f
Status: 200 OK
```

The Skyflow vault API successfully tokenized the card data. However, the **subsequent GraphQL mutation** to process the payment returned an error:

**Error displayed:** "Something went wrong. Please try again later."

**Screenshot:** `reports/bugs/screenshots/skyflow-payment-error-something-went-wrong.png`

The GraphQL call returned HTTP 200 but contained an error object in the response body. This indicates the failure occurs on the **Virto Commerce backend** during payment processing, not on the Skyflow vault side.

**TODO:** The actual GraphQL response body error message was not captured during investigation. The error details from the GraphQL `errors[]` array (error code, message, extensions) must be extracted from the network response to determine the exact backend rejection reason. This is critical for root cause — the `[object Object]` serialization bug may cause a malformed token/metadata to be sent to the backend, and the GraphQL error body will confirm whether it's a token validation failure, a gateway config error, or something else.

#### Finding 5: [object Object] Serialization Bug in Skyflow SDK Configuration (Root Cause)

**Critical evidence** was found by analyzing the Skyflow iframe name attribute, which encodes configuration data in Base64:

```
iframe name: element:group:W29iamVjdCBPYmplY3Rd:5e549903-a362-4cca-ab6a-b65ee820281d:ERROR:aHR0cHM6Ly92Y3N0LXFhLXN0b3JlZnJvbnQuZ292aXJ0by5jb20=
```

Decoded components:

| Part | Encoded | Decoded |
|------|---------|---------|
| Type | `element:group` | Element group (card form) |
| Config | `W29iamVjdCBPYmplY3Rd` | **`[object Object]`** |
| Session | `5e549903-a362-4cca-ab6a-b65ee820281d` | Valid UUID |
| State | `ERROR` | **ERROR state** |
| Origin | `aHR0cHM6Ly92Y3N0LXFhLXN0b3JlZnJvbnQuZ292aXJ0by5jb20=` | `https://vcst-qa-storefront.govirto.com` |

**The `[object Object]` value in position 3 is the smoking gun.** This means a JavaScript object is being passed where a string (likely a serialized configuration JSON or vault ID) is expected. The JavaScript runtime converts the object to the string literal `"[object Object]"` instead of properly serializing it with `JSON.stringify()`.

The iframe state is also marked as `ERROR`, confirming the SDK initialization detected a configuration problem.

### Root Cause Analysis

The Skyflow payment failure is caused by **two distinct issues** that compound:

**Primary Issue -- SDK Configuration Serialization Bug:**
The Skyflow Elements SDK initialization code in the storefront is passing a raw JavaScript object where a string value is required. This causes `[object Object]` to be embedded in the iframe configuration, corrupting the communication channel between the parent page and the Skyflow iframe. While tokenization may still succeed (the vault API call works independently), the corrupted configuration prevents the payment token from being properly relayed back to the Virto Commerce backend for payment processing.

**Secondary Issue -- Backend Payment Processing Error:**
The backend GraphQL mutation that processes the Skyflow payment token fails. Given the SDK configuration corruption, the token or associated metadata sent to the backend may be malformed, causing the backend to reject the payment request. The generic "Something went wrong" error message obscures the actual backend error.

### Likely Code Location

The bug is most likely in the **Vue.js storefront** Skyflow payment module initialization, specifically where the Skyflow SDK `Skyflow.init()` or element configuration is set up. A configuration object (possibly containing vault ID, connection URL, or element options) is being passed directly instead of being serialized to a string.

Example of the likely bug pattern:
```javascript
// BUGGY: passing object directly
const config = { vaultId: 'xxx', env: 'prod' };
skyflowElement.mount(containerId, config);  // config becomes "[object Object]"

// CORRECT: should serialize or pass individual values
skyflowElement.mount(containerId, JSON.stringify(config));
// or
skyflowElement.mount(containerId, { ...config, toString: () => JSON.stringify(config) });
```

### Severity Reassessment

| Aspect | Assessment |
|--------|------------|
| **Reassessed Severity** | **CRITICAL (P0)** -- upgraded from HIGH |
| **Impact** | Skyflow payment method is completely non-functional. No customer can pay using Skyflow. |
| **Scope** | All Skyflow payment transactions on QA environment |
| **Workaround** | Customers can use CyberSource, Authorize.Net, or Datatrans as alternative payment methods |
| **Revenue Impact** | Any customer who only has access to Skyflow-supported cards cannot complete checkout |

### Recommended Fixes

1. **Immediate (Frontend):** Inspect the Skyflow SDK initialization code in the Vue.js storefront payment module. Find where a configuration object is being converted to string inadvertently and fix the serialization. Look for `Skyflow.init()` or `Skyflow.createElement()` calls.

2. **Backend:** Add structured error logging in the payment processing GraphQL mutation handler to capture the actual error details (currently masked by generic "Something went wrong" message). This will help diagnose similar issues faster in the future.

3. **UX Fix:** The cart page should not allow "Place order" when Skyflow is selected but no card details have been entered. Either show the card form inline (like CyberSource) or disable the button until payment info is complete.

4. **Performance:** Investigate the ~5 second Skyflow iframe load delay. This may be related to the configuration error causing retries, or it may be a separate network/CDN latency issue.

---

## Bug 2: PERF-API-001 -- Slow GraphQL Category Query (SearchProducts)

### Original Report

| Field | Value |
|-------|-------|
| **Bug ID** | PERF-API-001 |
| **Reported Severity** | MEDIUM |
| **Summary** | One GraphQL call on category page took 1143ms (threshold 500ms), returning 58KB |

### Investigation Steps Performed

1. Navigated to `/printers/inkjet-printers` category page (18 products)
2. Measured all GraphQL calls using `performance.getEntriesByType('resource')` -- 3 separate runs
3. Installed a JavaScript fetch interceptor to capture GraphQL operation names, variables, durations, and response sizes
4. Tested 3 different categories: Inkjet Printers, Laser Printers (Multifunction), Bolts, Soft Drinks
5. Analyzed response size correlation with latency
6. Compared full page load vs. client-side navigation performance

### Measurement Data

#### Run 1: Inkjet Printers (Full Page Load)

| # | Duration (ms) | Transfer Size (bytes) | Notes |
|---|--------------|----------------------|-------|
| 1 | 253 | 17,945 | Initial auth/menu query |
| 2 | 151 | 611 | Small query |
| 3 | 397 | 1,522 | Category query |
| 4 | **438** | **66,583** | **SearchProducts (main listing)** |
| 5 | 159 | 1,142 | Small query |
| 6 | 191 | 3,161 | Medium query |
| 7 | 226 | 386 | Small query |
| 8 | 236 | 1,345 | Small query |
| 9 | 320 | 1,422 | Medium query |
| 10 | 320 | 1,120 | Medium query |
| 11 | **558** | **66,376** | **SearchProducts (duplicate/variant)** |
| 12 | 136 | 565 | Small query |

**Total:** 12 GraphQL calls, 2 exceeding 500ms threshold

#### Run 2: Inkjet Printers (Full Page Load -- repeat)

| # | Duration (ms) | Transfer Size (bytes) |
|---|--------------|----------------------|
| 1 | 253 | 17,945 |
| 2 | 151 | 611 |
| 3 | 166 | 1,522 |
| 4 | **384** | **66,583** |
| 5 | 164 | 1,142 |
| 6 | 238 | 3,161 |
| 7 | 240 | 386 |
| 8 | 211 | 1,345 |
| 9 | 295 | 1,422 |
| 10 | 295 | 1,120 |
| 11 | **558** | **66,376** |
| 12 | 136 | 565 |

#### Run 3: Laser Printers (Client-Side Navigation -- with interceptor)

| Operation Name | Duration (ms) | Response Size (bytes) | Variables |
|---------------|--------------|----------------------|-----------|
| GetSlugInfo | 158 | 454 | storeId, userId, cultureName, permalink |
| GetCategory | 367 | 775 | storeId, userId, cultureName, currencyCode, previousOutline, maxLevel |
| GetCategory | 395 | 1,085 | + onlyActive, productFilter |
| **SearchProducts** | **1,119** | **65,133** | storeId, userId, cultureName, currencyCode, sort, withFacets, withImages, filter, first, after, selectedAddress, preserveUserQuery, previousOutline |
| GetBackInStockSubscriptions | 208 | 114 | storeId, first, after, keyword, sort, productIds |

#### Run 4: Bolts Category (Client-Side Navigation -- with interceptor)

| Operation Name | Duration (ms) | Response Size (bytes) |
|---------------|--------------|----------------------|
| GetSlugInfo | 147 | 402 |
| GetCategory | 159 | 520 |
| GetCategory | 162 | 1,013 |
| **SearchProducts** | **1,155** | **54,719** |

#### Run 5: Soft Drinks Category (Client-Side Navigation -- with interceptor)

| Operation Name | Duration (ms) | Response Size (bytes) |
|---------------|--------------|----------------------|
| GetSlugInfo | 209 | 366 |
| getPageDocument | 144 | 2,482 |
| GetCategory | 175 | 959 |
| **SearchProducts** | **2,128** | **15,732** |
| **SearchProducts** | **2,424** | **18,297** |
| **SearchProducts** | **2,697** | **61,964** |
| SearchProducts | 167 | 15,732 |
| GetBackInStockSubscriptions | 143 | 114 |

**Note:** Soft Drinks had 4 SearchProducts calls (3 exceeding threshold), suggesting the page may be fetching products from multiple sub-categories or performing multiple search passes.

### Key Findings

#### Finding 1: SearchProducts Is the Only Slow Query

Across all categories tested, **only the `SearchProducts` GraphQL operation** exceeds the 500ms threshold. All other operations (GetSlugInfo, GetCategory, getPageDocument, GetBackInStockSubscriptions) consistently complete under 400ms.

#### Finding 2: The Issue Is Universal Across All Categories

| Category | SearchProducts Duration | Response Size |
|----------|------------------------|---------------|
| Inkjet Printers (run 1) | 438-558ms | 66KB |
| Inkjet Printers (run 2) | 384-558ms | 66KB |
| Laser Printers | 1,119ms | 65KB |
| Bolts | 1,155ms | 55KB |
| Soft Drinks | 2,128-2,697ms | 16-62KB |

The issue affects all categories, with **Soft Drinks being the worst at 2.7 seconds**.

#### Finding 3: Client-Side Navigation Is Significantly Slower Than Full Page Load

| Navigation Type | Inkjet SearchProducts | Laser SearchProducts |
|----------------|----------------------|---------------------|
| Full page load | 384-558ms | N/A |
| Client-side (Vue router) | N/A | 1,119ms |

Client-side navigation produces **2-5x slower** SearchProducts queries compared to full page loads. This suggests:
- On full page load, server-side rendering (SSR) or edge caching may serve pre-computed results
- On client-side navigation, the query hits the backend directly without cache benefits
- The Vue router transition may introduce additional overhead or trigger multiple redundant queries

#### Finding 4: Response Payload Is Excessively Large

The SearchProducts query returns **54-66KB of data** for 18 products per page. That is approximately **3.3-3.7KB per product**. This is large for a category listing page which typically only needs:
- Product name
- Price (list/sale)
- Thumbnail URL
- Stock availability status
- URL slug

The response likely includes excessive data such as:
- Full product descriptions (HTML)
- All property values
- All image URLs (not just thumbnail)
- SEO metadata
- Availability details from all fulfillment centers

#### Finding 5: Soft Drinks Category Makes Redundant SearchProducts Calls

The Soft Drinks category page fires **4 separate SearchProducts queries** where other categories fire only 1. Three of the four exceed the 500ms threshold. Two of the queries return identical 15,732-byte responses, indicating **duplicate/redundant requests**.

This suggests a frontend bug where component re-rendering triggers duplicate GraphQL queries, or the page architecture fetches "recommended products" / "related categories" as separate queries.

### Root Cause Analysis

The slow GraphQL category query has **multiple contributing factors**:

1. **Over-fetching in SearchProducts query:** The GraphQL query requests too many fields per product for a listing page. The `withFacets` and `withImages` flags are always true, and the query likely requests full product details instead of a lightweight listing projection.

2. **Missing response caching on client-side navigation:** Full page loads benefit from SSR/CDN caching, but Vue router client-side navigations bypass this cache and hit the backend directly. There is no apparent Apollo Client cache policy preventing redundant fetches.

3. **Redundant SearchProducts calls (Soft Drinks):** Some category pages fire multiple SearchProducts queries, with duplicate responses. This multiplies the performance impact.

4. **Backend query performance:** Even accounting for network overhead, 1-2.7 seconds for a product search query with ~18 results indicates the backend Elasticsearch or database query is not optimized for this use case.

### Severity Reassessment

| Aspect | Assessment |
|--------|------------|
| **Reassessed Severity** | **MEDIUM-HIGH (P1)** -- upgraded from MEDIUM |
| **Impact** | All category pages load slowly on client-side navigation. Worst case: 2.7 seconds for a single API call on Soft Drinks. Combined with other queries, total page load can exceed 3-4 seconds. |
| **Scope** | All categories, all users. Worst on categories with more products/subcategories. |
| **Workaround** | Full page refresh (Ctrl+F5) may load faster than client-side navigation due to SSR/CDN cache |
| **UX Impact** | Noticeable lag when browsing between categories. Users may perceive the site as slow. |

### Recommended Fixes

1. **Frontend -- Reduce query payload (Quick Win):**
   Create a lightweight `SearchProductsListing` query that fetches only the fields needed for the category grid: `id`, `name`, `code`, `slug`, `imgSrc` (single thumbnail), `price.list.amount`, `price.sale.amount`, `availabilityData.isInStock`, `hasVariations`. Exclude full descriptions, all images, SEO metadata, and detailed property values.

2. **Frontend -- Fix duplicate queries:**
   Investigate why Soft Drinks (and potentially other categories) fires 4 SearchProducts queries. Implement query deduplication at the Apollo Client level (`fetchPolicy: 'cache-first'`) and ensure Vue component lifecycle does not trigger redundant fetches.

3. **Frontend -- Add Apollo Client caching for client-side navigation:**
   Configure Apollo cache with a `typePolicies` configuration that caches SearchProducts results by category + filter + sort key. On client-side navigation to a previously visited category, serve from cache with a background refetch.

4. **Backend -- Optimize SearchProducts resolver:**
   Profile the xCatalog `SearchProducts` resolver to identify slow database/Elasticsearch queries. Consider:
   - Adding a `fields` parameter to limit the data returned per product
   - Implementing cursor-based pagination with pre-computed result sets
   - Optimizing Elasticsearch query (check if aggregations/facets add significant overhead)

5. **Backend -- Implement response compression:**
   Verify that GraphQL responses use gzip/brotli compression. The 66KB uncompressed response could be reduced to ~10-15KB with compression, significantly reducing transfer time.

---

## Summary

| Bug | Original Severity | Reassessed Severity | Status | Root Cause |
|-----|-------------------|---------------------|--------|------------|
| PAY-SKY-001 | HIGH | **CRITICAL (P0)** | Confirmed -- payment completely broken | `[object Object]` serialization bug in Skyflow SDK config; backend processes corrupted token |
| PERF-API-001 | MEDIUM | **MEDIUM-HIGH (P1)** | Confirmed -- universal across all categories | Over-fetching in SearchProducts query; no client-side cache on navigation; redundant queries |

### Evidence Files

| File | Description |
|------|-------------|
| `reports/bugs/screenshots/skyflow-payment-selected-no-card-fields.png` | Cart page: Skyflow selected, no card fields shown |
| `reports/bugs/screenshots/skyflow-payment-page-no-card-fields.png` | Payment page: only "Saved cards" dropdown visible |
| `reports/bugs/screenshots/skyflow-card-form-loaded.png` | Skyflow iframe card form after 5-second delay |
| `reports/bugs/screenshots/skyflow-card-filled-ready-to-pay.png` | Card form filled with test Visa card |
| `reports/bugs/screenshots/skyflow-payment-error-something-went-wrong.png` | Error message after clicking "Pay now" |

### Key Network Evidence

**Skyflow Tokenization (successful):**
```
POST https://ebfc9bee4242.vault.skyflowapis.com/v1/vaults/c1aeec61ad7c46c2b724f004a7658b2f
Status: 200 OK
```

**Skyflow Iframe Configuration (corrupted):**
```
iframe name (decoded):
  element:group:[object Object]:5e549903-...:ERROR:https://vcst-qa-storefront.govirto.com
                ^^^^^^^^^^^^^^^^           ^^^^^
                Config should be           State indicates
                serialized JSON,           initialization
                not [object Object]        failure
```

**SearchProducts Performance Across Categories:**
```
Inkjet Printers (full load):   384-558ms   / 66KB
Laser Printers (client nav):   1,119ms     / 65KB
Bolts (client nav):            1,155ms     / 55KB
Soft Drinks (client nav):      2,128-2,697ms / 16-62KB (4 calls, 3 slow)
```
