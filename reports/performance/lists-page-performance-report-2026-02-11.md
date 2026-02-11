# Performance Analysis Report: Lists Page

**Page:** `/account/lists` (Account Lists)
**Environment:** QA (`https://vcst-qa-storefront.govirto.com`)
**Date:** 2026-02-11
**Browser:** Google Chrome 144 (Chromium) via Playwright MCP
**Viewport:** 1920x1080 (Desktop)
**User:** BMW-Group / Elena Mutykova (authenticated B2B user)
**Storefront Version:** 2.42.0-pr-2149-8584-85843c7b

---

## 1. Executive Summary

The Lists page demonstrates **good overall frontend performance** with fast DOM rendering, low memory usage, and efficient asset delivery. However, a **critical backend bottleneck** was identified: one GraphQL API call takes **4.16 seconds** to respond, which delays the full page interactive state. While the page shell renders quickly (FCP at 748ms), the user must wait over 4 seconds for all list data to fully populate.

### Overall Verdict

| Category | Rating | Details |
|----------|--------|---------|
| **Page Load (shell)** | GOOD | 205ms document load, 748ms FCP |
| **Core Web Vitals** | GOOD (with caveat) | LCP 748ms, CLS 0.046, 1 long task |
| **Network Efficiency** | NEEDS IMPROVEMENT | 10 GraphQL calls, 1 taking 4.16s |
| **DOM & Rendering** | GOOD | 1,205 nodes, 28.7MB heap, no layout thrashing |
| **Interaction Responsiveness** | GOOD | ~17ms dropdown response |
| **Console Errors** | GOOD | 0 errors on Lists page (1 broken image on list detail) |
| **Asset Optimization** | GOOD | 127KB transfer, effective caching, H3 protocol |

---

## 2. Navigation Timing Breakdown

| Metric | Value | Rating |
|--------|-------|--------|
| DNS Lookup | 0.00ms | GOOD (cached/reused) |
| TCP Connect | 0.00ms | GOOD (reused connection) |
| TLS Negotiation | 1.70ms | GOOD |
| **Time to First Byte (TTFB)** | **180.00ms** | GOOD (< 200ms) |
| Response Download | 2.60ms | GOOD |
| DOM Interactive | 197.00ms | GOOD |
| DOM Content Loaded | 203.40ms | GOOD |
| DOM Complete | 204.00ms | GOOD |
| **Total Page Load** | **204.90ms** | GOOD (< 500ms) |

**Document Transfer Size:** 1.47KB (compressed) / 3.78KB (decoded)

**Observation:** The HTML document loads extremely fast. The site uses HTTP/3 (QUIC) protocol which provides excellent connection reuse and multiplexing. The server responds in 180ms which is well within the recommended 200ms TTFB threshold.

---

## 3. Core Web Vitals

| Metric | Value | Threshold | Rating |
|--------|-------|-----------|--------|
| **First Paint (FP)** | 748ms | -- | GOOD |
| **First Contentful Paint (FCP)** | 748ms | < 1,800ms | GOOD |
| **Largest Contentful Paint (LCP)** | 748ms | < 2,500ms | GOOD |
| **Cumulative Layout Shift (CLS)** | 0.046 | < 0.1 | GOOD |
| **First Input Delay (FID)** | N/A (no user input during measurement) | < 100ms | -- |
| **Long Tasks** | 1 task (71ms at 654ms) | < 50ms each | NEEDS ATTENTION |

### LCP Details
- **LCP Element:** `<SPAN>` (text element)
- **LCP Size:** 8,568 pixels
- **LCP URL:** N/A (text, not image)

The LCP is a text element, meaning the page renders meaningful content quickly without waiting for large image downloads.

### CLS Breakdown (4 layout shifts detected)

| Shift | Value | Time | Source Elements |
|-------|-------|------|-----------------|
| 1 | 0.0005 | 760.7ms | DIV, UL |
| **2** | **0.0430** | **788.5ms** | **FOOTER, SECTION, DIV, svg, DIV** |
| 3 | 0.0024 | 931.3ms | DIV |
| 4 | 0.0001 | 1,040.4ms | DIV, DIV, UL |

**Root Cause of CLS:** The largest layout shift (0.043) occurs at 788ms when the FOOTER and SECTION elements reposition. This is caused by the asynchronous loading of list data pushing the footer down. While the total CLS (0.046) is within the "good" threshold (< 0.1), the footer shift at 788ms is the primary contributor and could be improved by reserving space for the list content area with a minimum height or skeleton loader.

### Long Tasks

| Duration | Start Time | Type |
|----------|------------|------|
| 71ms | 654.3ms | self (main thread) |

Only 1 long task was detected (71ms), which is marginally above the 50ms threshold. This likely corresponds to JavaScript hydration and Vue component mounting. This is acceptable.

---

## 4. Network Analysis

### 4.1 Request Summary

| Category | Count | Transfer Size | Decoded Size | Avg Duration |
|----------|-------|---------------|--------------|--------------|
| **Scripts (JS)** | 64 | 23.93KB | 158.28KB | 11.33ms |
| **Fetch (API/GraphQL)** | 13 | 102.81KB | 99.88KB | 468.42ms |
| **CSS** | 4 | 0.00KB (cached) | 91.34KB | 0.25ms |
| **Link (preload)** | 6 | 0.00KB (cached) | 2,319KB | 0.20ms |
| **XHR** | 2 | 0.29KB | 0.00KB | 74.75ms |
| **Images** | 2 | 0.00KB (cached) | 0.00KB | 0.00ms |
| **Other** | 2 | 0.00KB | 1,658KB | 0.45ms |
| **TOTAL** | **93** | **127.04KB** | **4,326.90KB** | -- |

**Key Observation:** The page makes only **127KB of network transfers** thanks to aggressive caching. The decoded size of 4.3MB indicates previously cached JS/CSS bundles being reused. This is excellent asset optimization.

### 4.2 GraphQL API Calls (CRITICAL)

The page makes **10 GraphQL calls** on initial load. This is the primary performance concern.

| # | Start Time | Duration | TTFB | Transfer Size | Download |
|---|------------|----------|------|---------------|----------|
| 1 | 275.9ms | 305.9ms | 205.8ms | 14.91KB | 99.6ms |
| 2 | 593.9ms | 145.6ms | 142.9ms | 3.94KB | 2.2ms |
| 3 | 719.8ms | 152.8ms | 150.7ms | 0.97KB | 1.7ms |
| **4** | **720.2ms** | **4,160.6ms** | **4,153.7ms** | **8.79KB** | **6.5ms** |
| 5 | 720.9ms | 180.5ms | 175.1ms | 3.25KB | 5.0ms |
| 6 | 721.3ms | 307.5ms | 191.9ms | 65.02KB | 115.2ms |
| 7 | 721.6ms | 182.7ms | 180.2ms | 1.12KB | 2.1ms |
| 8 | 721.7ms | 187.3ms | 184.1ms | 3.09KB | 2.6ms |
| 9 | 722.3ms | 188.7ms | 188.2ms | 0.40KB | 0.3ms |
| 10 | 772.1ms | 198.9ms | 196.4ms | 1.32KB | 1.9ms |

### CRITICAL FINDING: GraphQL Call #4 -- 4.16 Second TTFB

**GraphQL call #4 has a server-side processing time (TTFB) of 4,153.7ms.** The response payload is only 8.79KB, so the issue is purely backend processing time, not payload size or download speed (download took only 6.5ms).

This call starts at 720ms and does not complete until 4,880ms, making it the single largest bottleneck on the page. All other GraphQL calls complete within 145-308ms.

**Impact:** While 9 out of 10 GraphQL calls are fast, this single slow query delays the "fully interactive" state of the page by approximately 3.5 seconds beyond what it would otherwise be.

**Recommendation:** Investigate this specific GraphQL query on the backend. It likely involves:
- A complex database query (possibly fetching wishlist/list metadata with related entities)
- Missing database indexes
- N+1 query patterns
- Or a query that could be optimized with caching

### 4.3 GraphQL Call #6 -- Large Payload

GraphQL call #6 returns **65KB** (the largest response). TTFB is 191.9ms which is acceptable, but the download takes 115.2ms due to the payload size. This query likely returns the full list catalog/product data. Consider:
- Implementing pagination at the API level if not already present
- Returning only essential fields (product name, thumbnail, price) instead of full product objects

### 4.4 Third-Party Scripts

| Domain | Requests | Duration | Purpose |
|--------|----------|----------|---------|
| static.cloudflareinsights.com | 1 | 0.0ms | Cloudflare analytics |
| www.googletagmanager.com | 3 | 0.0ms | Google Tag Manager |
| js.monitor.azure.com | 1 | 0.8ms | Azure Application Insights |
| vcst-qa.govirto.com | 2 | 0.0ms | Admin backend (font/config) |
| dc.services.visualstudio.com | 1 | 127.9ms | Azure telemetry upload |

**Third-party impact is minimal** -- 8 requests with effectively 0 blocking impact (all served from cache or are non-blocking). Only the Azure telemetry upload (127.9ms) has measurable latency, and it fires after page load, so there is no user-visible impact.

---

## 5. DOM & Rendering Performance

| Metric | Value | Threshold | Rating |
|--------|-------|-----------|--------|
| Total DOM Nodes | 1,205 | < 1,500 | GOOD |
| Max DOM Depth | 23 | < 32 | GOOD |
| Total Images | 18 | -- | ACCEPTABLE |
| Total Stylesheets | 7 | -- | GOOD |
| CSS Rules | 3,748 | -- | ACCEPTABLE |
| Inline Styles | 235 | -- | NEEDS ATTENTION |
| Total Links | 99 | -- | ACCEPTABLE |
| Total Buttons | 69 | -- | ACCEPTABLE |
| Document Height | 1,472px | -- | Fits in viewport |

### Memory Usage

| Metric | Value | Rating |
|--------|-------|--------|
| Used JS Heap | 28.71MB | GOOD |
| Total JS Heap | 30.96MB | GOOD |
| Heap Size Limit | 4,096MB | -- |
| Heap Usage | 0.70% | EXCELLENT |

Memory usage is very low. The page is lightweight and does not leak memory.

### Layout Metrics

| Metric | Count | Impact |
|--------|-------|--------|
| Fixed position elements | 3 | Low (header, QA badge, notification area) |
| Absolute position elements | 22 | Low |
| Animated elements | 2 | Low |
| will-change elements | 0 | No GPU layer promotion overhead |
| Transform elements | 0 | -- |

**No evidence of layout thrashing or excessive repaints.** The rendering pipeline is clean.

### Image Optimization

| Metric | Value | Rating |
|--------|-------|--------|
| Total Images | 18 | -- |
| Lazy-loaded | 17 | EXCELLENT |
| Eager-loaded | 1 | GOOD (likely logo/critical image) |
| No loading attribute | 0 | EXCELLENT |
| No explicit size | 0 | EXCELLENT (prevents CLS) |

Image loading strategy is well-implemented. 94% of images use lazy loading, and all images have explicit dimensions to prevent layout shifts.

### Inline Styles Observation

235 elements use inline styles. While this does not cause a performance problem at the current scale, it can:
- Increase HTML document size
- Make CSS harder to maintain
- Potentially cause specificity conflicts

This is likely a Vue.js framework pattern (dynamic bindings) and is acceptable for now.

---

## 6. Console Errors

### Lists Page (`/account/lists`)
**0 errors, 0 warnings** -- Clean.

### List Detail Page (`/account/lists/{id}`)
**1 error:**
```
[ERROR] Failed to load resource: the server responded with a status of 404 (Not Found)
URL: https://s1.apart.pl/products/jewellery/packshot/72762/apart-163-120--0_sm.jpg
```

This is a **broken product image** for the "18 K Rhodium-Plated White Gold Ring" product. The image is hosted on an external domain (`s1.apart.pl`) that returns a 404. This is a data quality issue, not a frontend performance issue.

**1 additional error on page 2 of list detail:**
```
[ERROR] Failed to load resource: net::ERR_NAME_NOT_RESOLVED
URL: (encrypted Google image proxy URL)
```

This is a broken product image being served through a Google image proxy that cannot resolve the domain.

---

## 7. Interaction Performance

| Interaction | Response Time | Rating |
|-------------|---------------|--------|
| Settings gear dropdown (DOM-level) | 16.6ms | EXCELLENT |
| Settings gear dropdown (with toggle) | ~610ms | ACCEPTABLE (includes close/open animation) |
| List item click (navigation) | Immediate (SPA route) | GOOD |
| Page pagination (list detail) | Client-side (no new API calls) | EXCELLENT |

### Pagination Behavior
Pagination on the list detail page is **client-side** -- clicking "Next" does not trigger new GraphQL API calls. All list items appear to be fetched on initial load and paginated locally. This provides instant page transitions but means the initial load must fetch all items upfront.

For lists with many items, this could become a problem. Consider implementing server-side pagination for lists exceeding 50+ items.

---

## 8. Protocol & Caching Analysis

| Feature | Status | Details |
|---------|--------|---------|
| HTTP/3 (QUIC) | ENABLED | All first-party requests use H3 |
| Asset Caching | EFFECTIVE | Most JS/CSS served from cache (0KB transfer) |
| Compression | ENABLED | GraphQL responses compressed (transfer < decoded) |
| CDN | Cloudflare | Via Cloudflare edge network |
| WebSocket | Active | GraphQL subscriptions via WSS |

The infrastructure is well-optimized. HTTP/3 provides multiplexing benefits, Cloudflare CDN handles edge caching, and static assets are effectively cached.

---

## 9. Waterfall Analysis

```
Timeline (ms):  0    200    400    600    800    1000   2000   3000   4000   5000
                |------|------|------|------|------|------|------|------|------|

Document:       [===]                                                          205ms
                     |
GraphQL #1:     ..[==========]                                                 306ms (menu/nav data)
                              |
FCP/LCP:        ...........................[*]                                  748ms
                                           |
GraphQL #2:     ....................[=====]                                     146ms
GraphQL #3:     .............................[=====]                            153ms
GraphQL #5-9:   .............................[======]                           ~185ms avg
GraphQL #6:     .............................[==========]                       308ms (65KB payload)
                                           |
***GraphQL #4:  .............................[====================================] 4,161ms <<<BOTTLENECK
                                                                              |
CLS shifts:     ............................[~]  [~]  [~]                      788-1040ms
Long Task:      ....................[==]                                        71ms at 654ms

Page fully interactive: ................................................[*]    ~4,881ms
```

**The waterfall clearly shows that GraphQL call #4 is the sole reason the page takes ~5 seconds to become fully data-populated, instead of the ~1 second it would take without this bottleneck.**

---

## 10. Findings Summary

### CRITICAL (P0)

| # | Finding | Impact | Recommendation |
|---|---------|--------|----------------|
| 1 | **GraphQL call #4: 4.16s TTFB** | Delays full page readiness by ~3.5s | Investigate backend query performance. Add server-side caching, optimize database queries, or defer this data load. |

### MEDIUM (P2)

| # | Finding | Impact | Recommendation |
|---|---------|--------|----------------|
| 2 | **10 parallel GraphQL calls on page load** | Network congestion, server load | Consider batching multiple queries into a single GraphQL request using query composition or `@defer` directive. |
| 3 | **GraphQL call #6: 65KB response** | Large payload, 115ms download | Review what data is returned; trim unnecessary fields with field-level selection. |
| 4 | **CLS from footer shift (0.043)** | Visual instability during load | Add min-height to list content container or use skeleton loaders to reserve space. |

### LOW (P3)

| # | Finding | Impact | Recommendation |
|---|---------|--------|----------------|
| 5 | **Broken product image (404)** on list detail | Broken image icon for one product | Fix image URL in product catalog data for "18 K Rhodium-Plated White Gold Ring". |
| 6 | **235 inline styles** | Maintenance concern, not performance | Consider extracting repeated inline styles to CSS classes. |
| 7 | **Client-side pagination loads all items upfront** | Could be slow for large lists | Implement server-side pagination for lists with 50+ items. |

---

## 11. Comparison Against Performance Budget

| Metric | Budget | Actual | Status |
|--------|--------|--------|--------|
| Total Page Weight (transfer) | < 2MB | 127KB | PASS |
| Total Requests | < 50 | 93 | WARNING (high count, but most cached) |
| FCP | < 1,500ms | 748ms | PASS |
| LCP | < 2,500ms | 748ms | PASS |
| CLS | < 0.1 | 0.046 | PASS |
| TTFB | < 200ms | 180ms | PASS |
| JS Heap | < 50MB | 28.7MB | PASS |
| DOM Nodes | < 1,500 | 1,205 | PASS |
| Console Errors | 0 | 0 (lists page) | PASS |
| Slowest API Call | < 500ms | 4,161ms | **FAIL** |

---

## 12. Screenshots

All screenshots saved to `test-results/chrome/lists-page-performance/`:

| File | Description |
|------|-------------|
| `01-homepage-loaded.png` | Homepage after login verification |
| `02-lists-page-loaded.png` | Lists page fully rendered with 8 lists |
| `03-list-detail-grocuss.png` | List detail page with products and pagination |
| `04-gear-dropdown-opened.png` | Barcode scan modal (interaction test) |
| `05-gear-dropdown-edit-delete.png` | Settings dropdown with Edit/Delete options |

---

## 13. Test Environment Details

| Property | Value |
|----------|-------|
| Platform | Windows 11 Pro (10.0.26200) |
| Browser | Google Chrome 144.0.7559.133 (Chromium) |
| Protocol | HTTP/3 (QUIC) |
| Viewport | 1920x1080 |
| Network | Desktop broadband (no throttling) |
| CDN | Cloudflare |
| Auth State | Authenticated B2B user (BMW-Group organization) |
| Lists Count | 8 lists displayed |
| Storefront Version | 2.42.0-pr-2149-8584-85843c7b |

---

## 14. Conclusion

The Lists page frontend implementation is **well-optimized**. The DOM is lean (1,205 nodes), memory usage is low (28.7MB), images use lazy loading, assets are effectively cached, and the site leverages HTTP/3 for fast multiplexed connections.

The **single most impactful improvement** would be optimizing the slow GraphQL query (call #4) that takes 4.16 seconds. Reducing this to under 500ms would bring the fully-interactive time from ~5 seconds down to under 1.5 seconds -- a dramatic improvement in perceived performance.

Secondary improvements include batching the 10 GraphQL calls into fewer requests and adding skeleton loaders to prevent the 0.043 CLS from the footer shift.

**Overall Assessment: CONDITIONAL PASS -- Frontend performance is good; backend GraphQL optimization required.**
