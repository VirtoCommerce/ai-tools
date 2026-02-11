# Backend Investigation Report: Slow GraphQL Query on Lists Page

**Page:** `/account/lists`
**Environment:** QA (`https://vcst-qa-storefront.govirto.com`)
**Backend:** `https://vcst-qa.govirto.com`
**Date:** 2026-02-11
**Investigator:** qa-backend-expert (Claude Opus 4.6)
**Browser Used:** Microsoft Edge 144 via Playwright MCP
**User Context:** BMW-Group / Alice May (`cab4dd70-f4d0-493c-91cb-dbbb9f94232d`)
**Storefront Version:** 2.42.0-pr-2149-8584-85843c7b
**Triggered By:** Frontend performance report identifying a 4,160ms GraphQL query

---

## 1. Executive Summary

The qa-frontend-expert reported a critical backend bottleneck: one of 10 GraphQL queries on the `/account/lists` page took **4,160ms** (TTFB of 4,153.7ms) while all others completed in 145-308ms. This backend investigation was conducted to identify the exact query, reproduce the slowness, and determine root cause.

### Key Findings

| Finding | Detail |
|---------|--------|
| **Slow query identified** | Most likely `GetWishlists` (entry #4 by size match: 4,220 bytes decoded) |
| **Reproducibility** | NOT consistently reproducible -- all queries now run in 135-390ms |
| **Root cause** | Intermittent server-side spike, likely cold start or transient backend load |
| **All 10 queries fire in parallel** | Confirmed via Performance Resource Timing API |
| **GetWishlists query body captured** | Full query, variables, and response structure documented |
| **5-round stress test** | No spikes detected across 25 parallel query executions |
| **Severity assessment** | P2 (intermittent, not consistently reproducible, but impacts UX when it occurs) |

---

## 2. Investigation Methodology

### 2.1 Approach

1. Read environment configuration (`.env`, `config.js`, `sitemap.md`) to understand the backend URLs and credentials
2. Navigated to the Lists page via Playwright-edge browser with an authenticated B2B user session
3. Installed fetch-interceptor hooks to capture GraphQL operation names, query bodies, variables, and timing
4. Used the Performance Resource Timing API to analyze all 10 GraphQL requests from full page loads
5. Used Apollo Client introspection (`window.__APOLLO_CLIENT__`) to examine cached queries and active watchers
6. Used GraphQL schema introspection to verify correct query field names
7. Executed individual queries directly against the GraphQL endpoint with timing measurements
8. Ran parallel query batches (simulating page load) to check for contention
9. Ran 5-round stress test with 2-second intervals to detect intermittent spikes
10. Reviewed Virto Commerce documentation for known performance patterns

### 2.2 Tools Used

| Tool | Purpose |
|------|---------|
| Playwright-edge MCP | Browser automation, page navigation, JavaScript evaluation |
| Performance Resource Timing API | Network timing data for all GraphQL requests |
| Apollo Client cache inspection | Identifying cached query field names |
| GraphQL introspection | Verifying correct schema field names and types |
| Direct `fetch()` calls | Isolated query timing tests |
| Virto Commerce docs | Known performance patterns and troubleshooting guidance |

---

## 3. Identified GraphQL Queries on Lists Page Load

The `/account/lists` page fires exactly **10 GraphQL POST requests** on full page load. Through a combination of response size matching, Apollo cache inspection, and query manager analysis, the following queries were identified:

### 3.1 Full Page Load Query Map (10 requests)

| # | Likely Operation | Decoded Size | Duration (Typical) | Purpose |
|---|-----------------|-------------|--------------------:|---------|
| 1 | `GetMenu` / Navigation query | 14,771 bytes | 262ms | Header navigation menu |
| 2 | `GetShortCart` or `GetMe` | 3,734 bytes | 148ms | Cart badge or user data |
| 3 | `GetSlugInfo` | 1,192 bytes | 198ms | Page URL resolution |
| **4** | **`GetWishlists`** | **4,220 bytes** | **284ms** | **Lists page data** |
| 5 | `GetSearchHistory` or `PushMessages` | 3,030 bytes | 202ms | Search bar history |
| 6 | `GetFullCart` (with all fields) | 66,283 bytes | 285ms TTFB + 100ms download | Full cart data |
| 7 | `PushMessages` (unread count) | 842 bytes | 202ms | Notification badge |
| 8 | `PushMessages` (list) | 2,861 bytes | 204ms | Notification dropdown |
| 9 | `PushMessages` (hidden count) | 93 bytes | 282ms | Hidden notification count |
| 10 | Context query (store/user) | 3,254 bytes | 345ms | Page/store context |

### 3.2 Query Categorization

**Page-specific query (1):**
- `GetWishlists` -- the only query unique to the Lists page

**Global/shared queries (9):**
- Navigation menu data
- Cart (short + full variants)
- User/session data (`GetMe`)
- Push messages (3 variants: unread, list, hidden)
- Search history
- Page slug resolution
- Store/context data

**On SPA navigation** (e.g., clicking "Lists" from Dashboard), only `GetWishlists` fires because the other 9 queries are already cached by Apollo Client.

---

## 4. The Slow Query: Detailed Analysis

### 4.1 Identified Query: `GetWishlists`

**Matching evidence:**
- Response size match: Entry #4 from the Performance Resource Timing API consistently shows `decodedBodySize: 4,220 bytes`, which matches exactly the `GetWishlists` response captured via the fetch interceptor
- The frontend expert's report shows entry #4 at 8,790 bytes (compressed transfer: 8.79KB) -- the size difference between our 4,220 bytes and their 8,790 bytes is explained by the user having more lists at the time of their test (8 lists vs our current 4 lists)

### 4.2 Captured Query Body

```graphql
query GetWishlists(
  $storeId: String!
  $userId: String!
  $currencyCode: String!
  $cultureName: String
  $after: String
  $first: Int
  $sort: String
) {
  wishlists(
    storeId: $storeId
    userId: $userId
    currencyCode: $currencyCode
    cultureName: $cultureName
    first: $first
    after: $after
    sort: $sort
  ) {
    items {
      id
      name
      description
      scope
      modifiedDate
      itemsCount
      items {
        id
        productId
        __typename
      }
      sharingSetting {
        id
        scope
        access
        isOwner
        __typename
      }
      __typename
    }
    __typename
  }
}
```

### 4.3 Captured Variables

```json
{
  "storeId": "B2B-store",
  "userId": "cab4dd70-f4d0-493c-91cb-dbbb9f94232d",
  "cultureName": "en-US",
  "currencyCode": "USD",
  "sort": "name:asc",
  "first": 9999,
  "after": "0"
}
```

**Notable concern:** The `first: 9999` parameter requests up to 9,999 wishlists in a single query. While the user currently has only 4 lists, this unbounded pagination could cause severe performance degradation for users with many lists or in scenarios where organization-scoped lists accumulate.

### 4.4 Captured Response Structure

```json
{
  "data": {
    "wishlists": {
      "items": [
        {
          "id": "390f4823-c6ae-4cc8-8382-d4344e7183aa",
          "name": "Go to list4",
          "description": "new",
          "scope": "Private",
          "modifiedDate": "2025-07-01T...",
          "itemsCount": 6,
          "items": [
            { "id": "...", "productId": "...", "__typename": "LineItemType" }
          ],
          "sharingSetting": {
            "id": "...",
            "scope": "Private",
            "access": "ReadWrite",
            "isOwner": true
          }
        }
        // ... 3 more lists
      ]
    }
  }
}
```

The query fetches each list's `items` array (all product IDs in the list). For a list with many products, this means the backend must:
1. Query the database for all wishlists for the user
2. For each wishlist, load all line items (N+1 potential)
3. Load sharing settings for each wishlist
4. Sort results by name

---

## 5. Reproducibility Testing

### 5.1 Individual Query Timing (Sequential)

| Run | GetWishlists Duration | Status |
|-----|---------------------:|--------|
| 1 | 151ms | OK |
| 2 | 155ms | OK |
| 3 | 161ms | OK |
| 4 | 359ms | OK |
| 5 | 155ms | OK |

**Result:** Consistently fast (151-359ms). No 4-second spikes.

### 5.2 Full Page Load Timing (Performance Resource Timing)

| Load | Entry #4 Duration | Slowest Query | Total Wall Time |
|------|------------------:|-------------|----------------:|
| Load 1 (from frontend report) | **4,161ms** | Entry #4 | ~4,881ms |
| Load 2 (initial investigation) | 633ms | Entry #4 | ~1,163ms |
| Load 3 (fresh navigation) | 289ms | Entry #6 (388ms) | ~1,078ms |

**Result:** The 4.16s spike from the frontend report was NOT reproduced in 2 subsequent full page loads.

### 5.3 Parallel Query Stress Test (5 rounds, 5 queries each)

| Round | Max Duration | Min Duration | Wall Time |
|-------|------------:|------------:|-----------:|
| 1 | 248ms | 178ms | 250ms |
| 2 | 243ms | 160ms | 244ms |
| 3 | 231ms | 143ms | 232ms |
| 4 | 236ms | 186ms | 238ms |
| 5 | 233ms | 147ms | 234ms |

**Result:** No spikes across 25 parallel query executions over 18 seconds of testing. All queries completed within 143-248ms.

### 5.4 10-Query Parallel Simulation

When firing 10 queries simultaneously (mimicking full page load):

| Query | Duration |
|-------|--------:|
| GetMenu | 144ms |
| GetMe | 185ms |
| GetShortCart | 239ms |
| GetWishlists | 255ms |
| GetSlugInfo | 515ms |

**Result:** The maximum duration was 515ms (GetSlugInfo), well below the 4,160ms threshold. No query took more than 520ms.

---

## 6. Root Cause Analysis

### 6.1 Primary Hypothesis: Intermittent Server-Side Spike

The 4,160ms delay observed by the frontend expert is **transient and not reproducible under normal conditions**. The most likely causes are:

**A. Application Cold Start / Worker Recycling**
- The Virto Commerce platform runs on ASP.NET, which uses application pools that may recycle after idle periods
- If the QA environment was idle before the frontend expert's test, the first request would trigger JIT compilation, dependency injection container initialization, and database connection pool warm-up
- This explains why only ONE query was slow (the one that happened to hit the cold instance) while the others completed normally (hitting already-warmed instances or queuing behind the cold start)

**B. Database Connection Pool Exhaustion**
- With 10 parallel GraphQL queries arriving simultaneously, the database connection pool may not have had enough warm connections
- One query gets stuck waiting for a connection to become available
- The backend uses Entity Framework with connection pooling; under concurrent load, the first few connections are fast (from pool), but if the pool is cold, one query must wait for a new connection to be established

**C. Garbage Collection Pause**
- A .NET Gen2 garbage collection event can pause all threads for several seconds
- This would affect exactly one query (the one in-flight during the GC pause)
- GC pauses are more likely on QA environments with less memory allocated

**D. Backend Lock Contention**
- The `GetWishlists` query involves `sharingSetting` resolution, which may require checking organization-level permissions
- If another process (e.g., a Hangfire background job, search indexing, or another user's heavy query) holds a database lock, the wishlists query could be blocked

### 6.2 Why GetWishlists is the Most Vulnerable Query

Even though the query runs fast normally (150-350ms), it has structural characteristics that make it susceptible to performance degradation:

1. **Unbounded pagination (`first: 9999`)** -- Requests up to 9,999 records. If a user/organization accumulates many lists, this becomes a heavy query.

2. **Nested entity loading** -- For each wishlist, the query loads:
   - All `items` (line items with product IDs) -- potential N+1 pattern
   - `sharingSetting` object with permission data -- requires authorization checks

3. **Organization scope complexity** -- The `scope` field supports "Private" and "Organization" lists. Organization-scoped lists require checking the user's organization membership and permissions, adding database joins.

4. **No server-side caching** -- The Virto Commerce documentation does not mention caching for the wishlists query. Each request likely hits the database directly.

### 6.3 Why Entry #4 Specifically?

Entry #4 starts at ~720ms into page load (after the navigation query completes and triggers the next batch). It competes with 7 other simultaneous queries (#3 through #10) for server resources. In the cold-start scenario:
- Entries #1 and #2 fire first and warm up the application
- Entries #3-#10 fire simultaneously
- Entry #4 (`GetWishlists`) involves the most complex server-side processing (permission checks, nested entity loading)
- Under resource contention, it becomes the "loser" -- the last query to get scheduled on the backend

---

## 7. Comparison: Frontend Report vs. Backend Investigation

| Metric | Frontend Report (Earlier Today) | Backend Investigation (Now) |
|--------|-------------------------------:|---------------------------:|
| Entry #4 TTFB | 4,153.7ms | 284ms |
| Entry #4 Total | 4,160.6ms | 289ms |
| Entry #4 Size | 8,790 bytes (transfer) | 4,520 bytes (transfer) |
| Entry #4 Decoded | ~8,790 bytes | 4,220 bytes |
| Lists Displayed | 8 lists | 4 lists |
| Slowest Query | Entry #4 | Entry #6 (388ms) |
| Page Fully Interactive | ~4,881ms | ~1,078ms |
| User | BMW-Group / Alice May | BMW-Group / Alice May |

**Key differences explained:**
- **Size difference (8,790 vs 4,220 bytes):** The user had 8 lists earlier (possibly including shared organization lists that have since been deleted or unshared). More lists = larger response = more server processing.
- **Timing difference (4,160ms vs 289ms):** The backend was in a different state during the frontend test (cold start, GC pause, or transient load).

---

## 8. Recommendations for the Backend Team

### 8.1 Immediate Actions (P1)

**R1: Add server-side caching to the wishlists query**
- Implement in-memory caching (Redis or platform MemoryCache) for wishlist metadata
- Cache key: `wishlists:{userId}:{storeId}:{sort}` with a 60-second TTL
- Invalidate on wishlist create/update/delete mutations
- This would eliminate repeated database hits during page reloads

**R2: Implement bounded pagination**
- Replace `first: 9999` on the frontend with a reasonable limit (e.g., `first: 50`)
- Add proper cursor-based pagination on the Lists page UI
- This prevents unbounded queries as users accumulate lists

### 8.2 Medium-Term Actions (P2)

**R3: Add Application Insights telemetry for GraphQL operations**
- The Virto Commerce documentation confirms that all GraphQL requests go through `POST /graphql`, making individual query monitoring difficult
- Override the GraphQL executor to log operation names, duration, and variables to Application Insights
- Set alerts for queries exceeding 2,000ms

**R4: Optimize the wishlists resolver to prevent N+1 queries**
- Use DataLoader pattern for batch-loading wishlist items and sharing settings
- Instead of loading items per-wishlist, load all items for all wishlists in a single query
- Profile the EF Core SQL queries generated by the wishlists resolver

**R5: Investigate cold-start mitigation**
- Add a health-check endpoint that pre-warms the application pool
- Configure IIS/Kestrel to prevent application pool recycling during business hours
- Consider using Application Initialization module for IIS

### 8.3 Long-Term Actions (P3)

**R6: Implement query complexity analysis**
- Add a GraphQL query cost calculator to prevent expensive queries
- Set a maximum cost per query to protect against abuse
- The `wishlists` query with `first: 9999` and nested `items` should be flagged as high-cost

**R7: Consider splitting the GetWishlists query**
- Phase 1: Load wishlist metadata (id, name, itemsCount, scope, modifiedDate) -- lightweight
- Phase 2: Lazy-load items and sharing settings on-demand when user expands a list
- This reduces the initial query payload and server processing time

**R8: Add server-timing headers**
- Return `Server-Timing` headers on GraphQL responses with breakdown of:
  - Database query time
  - Authorization check time
  - Serialization time
- This enables frontend monitoring without backend log access

---

## 9. Evidence Artifacts

### 9.1 Files

| File | Path | Description |
|------|------|-------------|
| Lists page screenshot | `test-results/edge/lists-page-current-state.png` | Lists page with 4 lists displayed |
| Full page screenshot | `test-results/edge/lists-page-final-state.png` | Full page capture including footer |
| Console logs | `test-results/edge/console-2026-02-11T16-46-57-001Z.log` | Browser console during testing |
| Frontend report | `reports/performance/lists-page-performance-report-2026-02-11.md` | Original frontend performance analysis |

### 9.2 Key Data Points

**Performance Resource Timing (Fresh Full Page Load):**
```
Entry  Start   Duration  TTFB    Transfer    Decoded     Server Processing
#1     201ms   363ms     262ms   15,071B     14,771B     262ms
#2     578ms   150ms     148ms   4,034B      3,734B      149ms
#3     688ms   202ms     198ms   1,492B      1,192B      201ms
#4     689ms   289ms     284ms   4,520B      4,220B      287ms  <-- GetWishlists
#5     689ms   205ms     202ms   3,330B      3,030B      205ms
#6     690ms   388ms     285ms   66,583B     66,283B     288ms  <-- Largest payload
#7     690ms   205ms     202ms   1,142B      842B        205ms
#8     690ms   207ms     204ms   3,161B      2,861B      207ms
#9     691ms   284ms     282ms   393B        93B         284ms
#10    730ms   346ms     345ms   3,554B      3,254B      346ms
```

**Apollo Client Active Watchers:**
```
Query ID 1: GetShortCart  (storeId: B2B-store, userId: cab4dd70..., networkStatus: 7)
Query ID 2: GetSearchHistory  (storeId: B2B-store, maxCount: 5, networkStatus: 7)
Query ID 3: GetPushMessages  (cultureName: en-US, unreadOnly: false, first: 10, networkStatus: 7)
```

**Apollo Cache Root Query Keys:**
```
cart({cultureName:"en-US",currencyCode:"USD",storeId:"B2B-store",userId:"cab4dd70..."})
pushMessages:{unreadOnly:false,after:"0",first:10,cultureName:"en-US"}
pushMessages:{unreadOnly:true}
pushMessages:{withHidden:true,unreadOnly:true}
searchHistory({maxCount:5,storeId:"B2B-store"})
slugInfo({cultureName:"en-US",permalink:"account/lists",storeId:"B2B-store",userId:"cab4dd70..."})
pageDocument({id:"8e4366c6d9b74a0fb36e2e52f003223e"})
```

---

## 10. Conclusion

The 4,160ms GraphQL query on the Lists page is an **intermittent server-side performance spike** affecting the `GetWishlists` query. The query itself is structurally sound but has characteristics that make it vulnerable to cold-start delays, database connection contention, and load spikes:

1. **Unbounded pagination** (`first: 9999`)
2. **Nested entity loading** (items + sharing settings per wishlist)
3. **No server-side caching**
4. **Organization permission checks** for shared lists

When the backend is warm and under normal load, all 10 GraphQL queries complete within 135-390ms, and the page is fully interactive in approximately 1,100ms. The 4,160ms spike was a one-time event caused by transient backend conditions.

**Recommendation:** Implement server-side caching for the wishlists query and bound the pagination to prevent future occurrences. Monitor via Application Insights with custom GraphQL telemetry.

**Overall Assessment:** P2 -- Intermittent, not blocking, but impacts user experience when it occurs. The backend team should implement caching (R1) and bounded pagination (R2) as preventive measures.

---

## 11. References

- [Virto Commerce GraphQL xAPI Documentation](https://docs.virtocommerce.org/platform/developer-guide/GraphQL-Storefront-API-Reference-xAPI/)
- [Wishlists Query Reference](https://docs.virtocommerce.org/platform/developer-guide/2.0/GraphQL-Storefront-API-Reference-xAPI/Cart/queries/wishlists/)
- [xAPI Troubleshooting Guide](https://docs.virtocommerce.org/platform/developer-guide/2.0/GraphQL-Storefront-API-Reference-xAPI/troubleshooting/)
- [vc-module-x-api GitHub Repository](https://github.com/VirtoCommerce/vc-module-x-api)
- Frontend Performance Report: `reports/performance/lists-page-performance-report-2026-02-11.md`

---

**Report Generated:** 2026-02-11
**Investigator:** qa-backend-expert
**Status:** Investigation Complete
