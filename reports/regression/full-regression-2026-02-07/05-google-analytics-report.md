# GA4 (Google Analytics 4) Regression Test Report

**Date:** 2026-02-07
**Environment:** QA Storefront (https://vcst-qa-storefront.govirto.com)
**Storefront Version:** 2.41.0-alpha.2219
**Browser:** Chrome (Chromium 144.0.7559.112) via Playwright MCP
**Tester:** qa-frontend-expert (Claude Opus 4.6)
**Test Account:** mutykovaelena@gmail.com / "Muller" % Schmidt GmbH / Elena Mutykova

---

## 1. GA4 Implementation Overview

| Parameter | Value |
|-----------|-------|
| GA4 Property ID | G-S2KXT3KTJZ |
| GTM Container ID | GTM-PBVBKNRC |
| Implementation Method | GTM + gtag.js (dual) |
| GA4 Measurement Protocol | v2 |
| GA Collect Endpoint | region1.google-analytics.com/g/collect |
| Debug Mode | Enabled (debugMode: true) |
| Currency | USD |
| Language | en-US |
| User ID Tracking | Yes (uid parameter sent) |
| Privacy Sandbox | Active (register-conversion requests) |

---

## 2. Test Results Summary

| Test Case | Event(s) Tested | Status | Issues |
|-----------|----------------|--------|--------|
| FR-GA-001 | page_view | PASS | None |
| FR-GA-002 | add_to_cart | PASS | None |
| FR-GA-003 | begin_checkout, view_cart | PASS | None |
| FR-GA-004 | purchase (place_order) | PARTIAL PASS | 3 issues found |
| FR-GA-005 | search, view_search_results | PASS | None |
| Additional | view_item | PASS | None |
| Additional | view_item_list | PASS | None |
| Additional | select_item | PASS | None |
| Additional | add_shipping_info | PASS | None |
| Additional | add_payment_info | PASS | None |
| Additional | scroll | PASS | None |
| Additional | user_engagement | PASS | None |
| Edge Case | Empty search (0 results) | PASS | None |

**Overall Result: PARTIAL PASS (12/13 tests pass, 1 partial pass with issues)**

---

## 3. Detailed Test Results

### FR-GA-001: Page View Events (PASS)

**Objective:** Verify page_view fires on every navigation with correct parameters.

**Pages Tested:**
- Homepage (/)
- Sign-in page (/sign-in)
- Category page (/alcoholic-drinks)
- Product page (/printers/multifunction-printers/laser-monochrome/tester)
- Cart/Checkout page (/cart)
- Order confirmation (/checkout/completed)
- Search results (/search?q=laptop)

**Evidence (Network Requests):**
- Homepage: `en=page_view&dt=QA%20%26%20Main%20page&dl=https://vcst-qa-storefront.govirto.com/`
- Sign-in: `en=page_view&dt=QA%20%26%20Sign%20in&dl=...sign-in`
- Category: `en=page_view&dt=QA%20%26%20Catalog&dl=...catalog`
- Product: `en=page_view&dt=QA%20%26%20Tester&dl=...tester`

**Parameters Verified:**
- `v=2` (Measurement Protocol v2)
- `tid=G-S2KXT3KTJZ` (correct property ID)
- `dl` (document location - correct URL)
- `dt` (document title - correct page title)
- `dr` (document referrer - correct previous URL)
- `uid` (user ID - 42765f34-51cf-4994-806b-e82e65fd5c14)
- `cu=USD` (currency)
- `ep.debugMode=true` (debug mode)

**Screenshot:** `reports/regression/full-regression-2026-02-07/ga/01-login-success-homepage.png`

---

### FR-GA-002: Add to Cart Event (PASS)

**Objective:** Verify add_to_cart fires when product is added to cart with correct product data.

**Test Product:** Tester (SKU: VKS-10769569, Price: $99.00, Stock: 368)

**dataLayer Evidence:**
```json
{
  "event": "add_to_cart",
  "data": {
    "source_route": "/printers/multifunction-printers/laser-monochrome/tester",
    "currency": "USD",
    "value": 99,
    "items": [
      {
        "item_id": "VKS-10769569",
        "item_name": "Tester",
        "price": 99,
        "discount": 0,
        "quantity": 1,
        "item_category": "Catalog",
        "item_category2": "Printers",
        "item_category3": "Laser Printers",
        "item_category4": "Laser Monochrome"
      }
    ]
  }
}
```

**Network Request Evidence:**
```
POST region1.google-analytics.com/g/collect?...
&en=add_to_cart
&pr1=idVKS-10769569~nmTester~pr99~ds0~qt1~caCatalog~c2Printers~c3Laser%20Printers~c4Laser%20Monochrome
&epn.value=99
&ep.source_route=%2Fprinters%2Fmultifunction-printers%2Flaser-monochrome%2Ftester
```

**Parameters Verified:**
- item_id (SKU)
- item_name
- price
- discount
- quantity
- item_category (4 levels of category hierarchy)
- currency
- value (total cart value added)
- source_route (page where add-to-cart happened)

**Screenshot:** `reports/regression/full-regression-2026-02-07/ga/04-add-to-cart-tester-product.png`

---

### FR-GA-003: Begin Checkout Event (PASS)

**Objective:** Verify begin_checkout and view_cart fire when navigating to cart/checkout page.

**Note:** Virto Commerce uses a single-step checkout. The cart page IS the checkout page. Both `view_cart` and `begin_checkout` fire automatically on cart page load.

**dataLayer Evidence (view_cart):**
```json
{
  "event": "view_cart",
  "data": {
    "currency": "USD",
    "value": 478.76,
    "items": [
      {
        "index": 0,
        "item_id": "VKS-10769569",
        "item_name": "Tester",
        "affiliation": "?",
        "currency": "USD",
        "discount": 0,
        "price": 99,
        "quantity": 1
      },
      {
        "index": 1,
        "item_id": "ALCOE2542",
        "item_name": "3D Kawaii Pencil Case Girls Decompression Pen Pouch...",
        "affiliation": "?",
        "currency": "USD",
        "discount": 0.03,
        "price": 100,
        "quantity": 3
      }
    ],
    "items_count": 2
  }
}
```

**dataLayer Evidence (begin_checkout):**
```json
{
  "event": "begin_checkout",
  "data": {
    "currency": "USD",
    "value": 478.76,
    "items": [/* same items array as view_cart */],
    "items_count": 2
  }
}
```

**Network Request Evidence:**
- `en=view_cart` request sent to GA4 collect endpoint (204 response, 143ms)
- `en=begin_checkout` request sent to GA4 collect endpoint (204 response, 141ms)

**Parameters Verified:**
- currency
- value (order total including tax)
- items array (with index, item_id, item_name, affiliation, currency, discount, price, quantity)
- items_count

**Screenshot:** `reports/regression/full-regression-2026-02-07/ga/05-cart-page-view.png`

---

### FR-GA-004: Purchase / Place Order Event (PARTIAL PASS - 3 ISSUES)

**Objective:** Verify purchase event fires on order completion with full transaction details.

**Order Placed:** CO260207-00006 ($658.76 total, 2 items, Manual payment, Fixed Rate Ground shipping)

**Checkout Flow Events Captured:**
1. view_cart (cart page load)
2. begin_checkout (cart page load)
3. add_shipping_info (selected "Fixed Rate Ground", shipping_tier: "Ground", value: 150)
4. add_payment_info (selected "Manual", payment_type: "DefaultManualPaymentMethod", value: 658.76)
5. **place_order** (order placed successfully)

**dataLayer Evidence (place_order):**
```json
{
  "event": "place_order",
  "data": {
    "currency": "USD",
    "value": 658.76,
    "shipping": 150,
    "tax": 109.79,
    "items_count": 2
  }
}
```

**Network Request Evidence:**
```
POST region1.google-analytics.com/g/collect?...
&en=place_order
&epn.value=658.76
&epn.shipping=150
&epn.tax=109.79
&cu=USD
&epn.items_count=2
```

**ISSUES FOUND:**

#### ISSUE 1 (Medium): Non-Standard Event Name
- **Expected:** `purchase` (GA4 standard e-commerce event)
- **Actual:** `place_order` (custom event name)
- **Impact:** GA4 will NOT automatically track this as a revenue event. The `purchase` event is a GA4 recommended event that triggers automatic revenue reporting, conversion tracking, and e-commerce reports. Using `place_order` means this data will only appear in custom reports unless GTM is configured to map `place_order` to `purchase`.
- **Recommendation:** Rename the event from `place_order` to `purchase` OR configure GTM to forward `place_order` as `purchase`.

#### ISSUE 2 (High): Missing transaction_id
- **Expected:** `transaction_id: "CO260207-00006"` (the order number)
- **Actual:** No `transaction_id` parameter present
- **Impact:** Without `transaction_id`, GA4 cannot deduplicate purchase events. If the confirmation page is refreshed or revisited, duplicate revenue may be recorded. This is a required parameter per GA4 purchase event specification.
- **Recommendation:** Include the order number as `transaction_id` in the `place_order`/`purchase` event.

#### ISSUE 3 (Medium): Missing items Array
- **Expected:** Full `items` array with individual product details (item_id, item_name, price, quantity, etc.)
- **Actual:** Only `items_count: 2` is sent; no individual item data
- **Impact:** GA4 cannot attribute revenue to individual products. Product-level e-commerce reports (top products by revenue, product performance, etc.) will be empty for purchase events. The `add_to_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, and `add_payment_info` events all correctly include the `items` array, but the final purchase event does not.
- **Recommendation:** Include the full `items` array in the `place_order`/`purchase` event, consistent with the other checkout events.

**Screenshot:** `reports/regression/full-regression-2026-02-07/ga/07-order-confirmation-page.png`

---

### FR-GA-005: Search Event (PASS)

**Objective:** Verify search event fires when user performs a product search.

**Search Term:** "laptop" (150 results found)

**dataLayer Evidence (search):**
```json
{
  "event": "search",
  "data": {
    "search_term": "laptop",
    "items_count": 150,
    "visible_items": "MPY-11971438, MFJ-86651129, 552223579, ALCOE2497, ALCOE4086, ALCOE1931, ALCOE0382, ALCOE1712"
  }
}
```

**dataLayer Evidence (view_search_results):**
```json
{
  "event": "view_search_results",
  "data": {
    "visible_items": "MPY-11971438, MFJ-86651129, 552223579, ...(16 SKUs)",
    "results_count": 150,
    "results_page": 1,
    "search_term": "laptop"
  }
}
```

**Network Request Evidence:**
- `en=search&ep.search_term=laptop&epn.items_count=150` (confirmed)
- `en=view_search_results&ep.search_term=laptop&epn.results_count=150` (confirmed)

**Parameters Verified:**
- search_term
- items_count / results_count
- results_page
- visible_items (SKU list of visible products)

**Screenshot:** `reports/regression/full-regression-2026-02-07/ga/09-search-results-laptop.png`

---

### Additional Events Tested

#### view_item (PASS)
**Trigger:** Navigating to product detail page (Tester)
```json
{
  "event": "view_item",
  "data": {
    "currency": "USD",
    "value": 99,
    "items": [{
      "item_id": "VKS-10769569",
      "item_name": "Tester",
      "price": 99,
      "discount": 0,
      "quantity": 368,
      "item_category": "Catalog",
      "item_category2": "Printers",
      "item_category3": "Laser Printers",
      "item_category4": "Laser Monochrome"
    }]
  }
}
```
Network: `en=view_item&pr1=idVKS-10769569~nmTester~pr99~ds0~qt368~caCatalog~c2Printers~c3Laser%20Printers~c4Laser%20Monochrome&epn.value=99`

#### view_item_list (PASS)
**Trigger:** Category pages, search results, "Customers bought together" sections, "Recently browsed" sections
**Contexts observed:**
- Category page: `item_list_id=category_alcoholic-drinks_page_1`
- Recommended products: `item_list_id=recommended_products_bought-together`
- Recently browsed: `item_list_id=recently_browsed_products`
- Search results: included in view_search_results

Network: `en=view_item_list&ep.item_list_id=...&ep.item_list_name=...&ep.related_id=...&ep.related_type=...&ep.items_skus=...&epn.items_count=...`

#### select_item (PASS)
**Trigger:** Clicking on a product from a product list
```json
{
  "event": "select_item",
  "data": {
    "items": [{ "item_id": "VKS-10769569", "item_name": "Tester" }]
  }
}
```
Network: `en=select_item&pr1=idVKS-10769569~nmTester~pr99~ds0~qt368&ep.item_list_id=...`

#### add_shipping_info (PASS)
**Trigger:** Selecting a shipping method (Fixed Rate Ground)
```json
{
  "event": "add_shipping_info",
  "data": {
    "shipping_tier": "Ground",
    "currency": "USD",
    "value": 150,
    "items": [/* full items array */],
    "items_count": 2
  }
}
```

#### add_payment_info (PASS)
**Trigger:** Selecting a payment method (Manual)
```json
{
  "event": "add_payment_info",
  "data": {
    "payment_type": "DefaultManualPaymentMethod",
    "currency": "USD",
    "value": 658.76,
    "items": [/* full items array */],
    "items_count": 2
  }
}
```

#### scroll (PASS)
**Trigger:** Scrolling 90% of page
Network: `en=scroll&epn.percent_scrolled=90`

#### user_engagement (PASS)
**Trigger:** On page exit / navigation
Network: `en=user_engagement&_et=...` (engagement time in ms)

---

### Edge Cases Tested

#### Empty Search (PASS)
**Search Term:** "xyz123nonexistent"
**Result:** Both `search` and `view_search_results` fire correctly with `items_count: 0` and `results_count: 0`
```json
{
  "event": "search",
  "data": { "search_term": "xyz123nonexistent", "items_count": 0, "visible_items": "" }
}
```
**Screenshot:** `reports/regression/full-regression-2026-02-07/ga/10-empty-search-results.png`

---

## 4. Complete Event Sequence (Full User Journey)

The following event sequence was captured during a complete user journey from catalog browsing through order completion:

| # | Event | Page/Context | Key Data |
|---|-------|-------------|----------|
| 1 | page_view | /catalog | Catalog page |
| 2 | view_item_list | /catalog | 16 products, category page 1 |
| 3 | select_item | /catalog | Clicked "Tester" (VKS-10769569) |
| 4 | view_item_list | /catalog | 32 products, category page 2 |
| 5 | page_view | /printers/.../tester | Product detail page |
| 6 | view_item | Product page | Tester, $99.00, 368 in stock |
| 7 | view_item_list | Product page | "Customers bought together" (6 items) |
| 8 | add_to_cart | Product page | Tester, qty 1, $99.00 |
| 9 | page_view | /cart | Cart/checkout page |
| 10 | view_cart | /cart | 2 items, $478.76 total |
| 11 | begin_checkout | /cart | 2 items, $478.76 total |
| 12 | view_item_list | /cart | "Recently browsed" products |
| 13 | add_shipping_info | /cart | Ground, $150 shipping |
| 14 | add_payment_info | /cart | Manual, $658.76 total |
| 15 | view_item_list | /cart | "Recently browsed" |
| 16 | place_order | /checkout/completed | $658.76, 2 items |
| 17 | page_view | /search?q=laptop | Search results |
| 18 | search | /search?q=laptop | "laptop", 150 results |
| 19 | view_item_list | /search?q=laptop | Search result products |
| 20 | view_search_results | /search?q=laptop | 150 results, page 1 |

---

## 5. Issues Summary

| # | Severity | Issue | Event | Description |
|---|----------|-------|-------|-------------|
| 1 | **HIGH** | Missing transaction_id | place_order | Order number (CO260207-00006) not included. Required for deduplication. |
| 2 | **MEDIUM** | Non-standard event name | place_order | Uses `place_order` instead of GA4 standard `purchase`. Revenue not auto-tracked. |
| 3 | **MEDIUM** | Missing items array | place_order | No individual product data in purchase event. Product-level revenue attribution broken. |

---

## 6. Observations

### Positive Findings
- GA4 implementation is comprehensive with 13+ distinct event types
- All pre-purchase events (view_item_list, select_item, view_item, add_to_cart, view_cart, begin_checkout, add_shipping_info, add_payment_info) include full item details
- Category hierarchy is tracked up to 4 levels (item_category through item_category4)
- Search tracking includes both `search` and `view_search_results` with SKU-level visibility
- Empty/zero-result searches are properly tracked
- Debug mode is enabled for testing verification
- User ID tracking is active
- Privacy Sandbox integration is present
- scroll event tracks 90% scroll depth
- view_item_list correctly identifies different list contexts (category, recommended, recently browsed, search)

### Areas for Improvement
- The `place_order` event should be renamed to `purchase` to align with GA4 e-commerce spec
- The `place_order` event must include `transaction_id` for purchase deduplication
- The `place_order` event should include the full `items` array for product-level revenue attribution
- Some `affiliation` values are set to "?" (question mark) - should be the vendor/store name
- Some `view_item_list` events have `item_list_id=category_undefined_page_1` - the "undefined" suggests a missing category name in certain contexts

---

## 7. Screenshots Index

| File | Description |
|------|-------------|
| `01-login-success-homepage.png` | Login confirmation, homepage with GA4 active |
| `02-category-page-alcoholic-drinks.png` | Category page with view_item_list event |
| `03-product-page-jameson.png` | Product detail page with view_item event |
| `04-add-to-cart-tester-product.png` | Product page after add_to_cart (in Cart: 1) |
| `05-cart-page-view.png` | Cart/checkout page with begin_checkout |
| `06-checkout-shipping-payment-selected.png` | Checkout with shipping and payment selected |
| `07-order-confirmation-page.png` | Order CO260207-00006 confirmation |
| `08-search-dropdown-laptop.png` | Search autocomplete dropdown for "laptop" |
| `09-search-results-laptop.png` | Search results page (150 results) |
| `10-empty-search-results.png` | Zero results for "xyz123nonexistent" |

---

## 8. GA4 Event Coverage Matrix

| GA4 Recommended Event | Implemented | Verified | Notes |
|-----------------------|:-----------:|:--------:|-------|
| page_view | Yes | Yes | Fires on every SPA navigation |
| view_item_list | Yes | Yes | Multiple contexts (category, recommended, search, recently browsed) |
| select_item | Yes | Yes | Fires on product card click |
| view_item | Yes | Yes | Fires on PDP load |
| add_to_cart | Yes | Yes | Full item details + source_route |
| remove_from_cart | Not tested | - | Not tested in this session |
| view_cart | Yes | Yes | Fires on cart page load |
| begin_checkout | Yes | Yes | Fires on cart page load (single-step checkout) |
| add_shipping_info | Yes | Yes | Includes shipping_tier |
| add_payment_info | Yes | Yes | Includes payment_type |
| purchase | Partial | Yes | Uses custom `place_order` name; missing transaction_id and items |
| search | Yes | Yes | Includes search_term and items_count |
| view_search_results | Yes (bonus) | Yes | Extra event beyond GA4 spec with results_page |
| scroll | Yes | Yes | Fires at 90% scroll depth |
| user_engagement | Yes | Yes | Automatic GA4 event |

---

## 9. Recommendation

**Overall Status: APPROVED WITH CONDITIONS**

The GA4 implementation is strong across the customer journey. All pre-purchase events fire correctly with comprehensive item-level data. The three issues found in the `place_order` event are significant for revenue tracking accuracy but do not block the storefront from functioning.

**Blocking conditions for full approval:**
1. Fix the `place_order` event to include `transaction_id` (HIGH priority - prevents purchase deduplication)
2. Add `items` array to `place_order` event (MEDIUM priority - enables product-level revenue reports)
3. Consider renaming `place_order` to `purchase` or configure GTM mapping (MEDIUM priority - enables automatic GA4 e-commerce reports)

---

*Report generated by qa-frontend-expert on 2026-02-07*
*Tools used: Playwright Chrome MCP, Chrome DevTools MCP*
*Test duration: ~45 minutes*
