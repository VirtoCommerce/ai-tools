# Test Cases: VCST-4650 - BOPIS Pickup Location Search Address Indexing

**JIRA:** [VCST-4650](https://virtocommerce.atlassian.net/browse/VCST-4650)
**Date:** 2026-02-26
**Environment:** QA (FRONT_URL / BACK_URL from .env)
**Component:** VirtoCommerce.XPickup / productPickupLocations GraphQL / Product Page BOPIS Modal

---

## Section A: Backend API Tests (qa-backend-expert)

### TC-A01: City Search Returns All Matching Locations
**Priority:** P0 - Critical
**Type:** API / GraphQL
**Agent:** qa-backend-expert

**Preconditions:**
- Access to QA backend GraphQL endpoint
- Backend fix deployed (address fields indexed in Elasticsearch)

**GraphQL Query:**
```graphql
query GetProductPickupLocations(
  $storeId: String!, $cultureName: String!, $productId: String!,
  $first: Int, $keyword: String
) {
  productPickupLocations(
    storeId: $storeId, cultureName: $cultureName,
    productId: $productId, first: $first, keyword: $keyword
  ) {
    totalCount
    items { id name address { city line1 postalCode countryCode } }
  }
}
```

**Variables:**
```json
{
  "storeId": "<STORE_ID from .env>",
  "cultureName": "en-US",
  "productId": "<bolts-product-id>",
  "first": 50,
  "keyword": "New York"
}
```

**Steps:**
1. Execute productPickupLocations query with keyword = "New York"
2. Record totalCount from response
3. Examine returned items and verify city field = "New York" on results
4. Compare totalCount against expected value (30+)

**Expected Result:**
- `totalCount` >= 30
- All returned items have `address.city` = "New York" (or name containing "New York")
- Response time < 2 seconds

**Before fix (baseline):** 4 results
**After fix (expected):** 30+ results

---

### TC-A02: Postal Code Search Returns Matching Location
**Priority:** P0 - Critical
**Type:** API / GraphQL
**Agent:** qa-backend-expert

**Steps:**
1. Execute productPickupLocations query with keyword = "10059"
2. Record totalCount and examine returned items
3. Verify returned item has postalCode = "10059"

**Expected Result:**
- `totalCount` >= 1
- Returned items have `address.postalCode` containing "10059"

**Before fix (baseline):** 0 results
**After fix (expected):** 1+ results

---

### TC-A03: Street Address Search Returns Matching Location
**Priority:** P1 - High
**Type:** API / GraphQL
**Agent:** qa-backend-expert

**Steps:**
1. Execute productPickupLocations query with keyword = "Lexington Ave"
2. Record totalCount and examine returned items
3. Verify returned items have address.line1 containing "Lexington Ave"

**Expected Result:**
- `totalCount` >= 1
- Returned items have `address.line1` containing "Lexington" or "Lexington Ave"

**Before fix (baseline):** 0 results
**After fix (expected):** 1+ results

---

### TC-A04: Country Code Search Returns All Matching Locations
**Priority:** P0 - Critical
**Type:** API / GraphQL
**Agent:** qa-backend-expert

**Steps:**
1. Execute productPickupLocations query with keyword = "USA"
2. Record totalCount
3. Verify returned items have address.countryCode = "USA" or "US"

**Expected Result:**
- `totalCount` >= 80
- Returned items have `address.countryCode` matching "USA" or "US"

**Before fix (baseline):** 0 results
**After fix (expected):** 80+ results

---

### TC-A05: Location Name Search Still Works (No Regression)
**Priority:** P0 - Critical
**Type:** API / GraphQL
**Agent:** qa-backend-expert

**Steps:**
1. Execute productPickupLocations query with keyword = "Brooklyn"
2. Record totalCount
3. Verify results match the pre-fix behavior (5 results)

**Expected Result:**
- `totalCount` = 5 (same as before fix)
- No regression in name-based search

---

### TC-A06: Empty String Keyword Returns All Locations
**Priority:** P1 - High
**Type:** API / GraphQL
**Agent:** qa-backend-expert

**Steps:**
1. Execute productPickupLocations query with keyword = "" (empty string)
2. Record totalCount
3. Execute query with no keyword parameter
4. Compare totalCount values

**Expected Result:**
- Both queries return all available pickup locations (maximum count)
- Counts are consistent between empty string and no keyword

---

### TC-A07: Case Insensitivity of Address Search
**Priority:** P1 - High
**Type:** API / GraphQL
**Agent:** qa-backend-expert

**Steps:**
1. Execute query with keyword = "new york" (lowercase)
2. Record totalCount
3. Execute query with keyword = "NEW YORK" (uppercase)
4. Execute query with keyword = "New York" (mixed case)
5. Compare totalCount values

**Expected Result:**
- All three variants return the same count
- Search is case-insensitive

---

### TC-A08: Cart Pickup Locations Query Not Regressed
**Priority:** P1 - High
**Type:** API / GraphQL
**Agent:** qa-backend-expert

**GraphQL Query:**
```graphql
query GetCartPickupLocations($storeId: String!, $cartId: String!, $keyword: String) {
  cartPickupLocations(storeId: $storeId, cartId: $cartId, keyword: $keyword) {
    totalCount
    items { id name address { city line1 postalCode countryCode } }
  }
}
```

**Steps:**
1. Execute cartPickupLocations query with keyword = "New York"
2. Record totalCount and examine items
3. Execute with keyword = "10059"
4. Verify results are consistent (not broken by indexing changes)

**Expected Result:**
- Cart modal results unchanged
- No regression in cartPickupLocations behavior
- Faceted filtering still available in cart modal

---

## Section B: Frontend UI Tests (qa-frontend-expert)

### TC-B01: Product Page BOPIS Modal - City Search
**Priority:** P0 - Critical
**Type:** Functional / UI
**Agent:** qa-frontend-expert

**Preconditions:**
- Logged in as test user (USER_EMAIL / USER_PASSWORD from .env)
- On a BOPIS-eligible product page (e.g., navigate to the Bolts category)
- "Check pickup locations" CTA is visible on product page

**Steps:**
1. Navigate to QA storefront (FRONT_URL from .env)
2. Sign in with test user credentials
3. Navigate to a product in the Bolts category
4. Click "Check pickup locations" CTA button
5. Verify pickup location modal opens
6. Note the total count shown (initial state - all locations)
7. Type "New York" in the search field
8. Click the Search button (or press Enter)
9. Observe result count displayed
10. Capture screenshot of results

**Expected Result:**
- Modal opens with search capability
- Searching "New York" returns 30+ results (significantly more than the old 4)
- Result list shows locations with "New York" in their city/address
- Result count is displayed in modal

**Evidence:** Screenshot showing result count for "New York" search

---

### TC-B02: Product Page BOPIS Modal - Postal Code Search
**Priority:** P0 - Critical
**Type:** Functional / UI
**Agent:** qa-frontend-expert

**Steps:**
1. Open product page BOPIS modal (same as TC-B01, steps 1-5)
2. Clear any existing search
3. Type "10059" in the search field
4. Click Search
5. Observe result count
6. Capture screenshot

**Expected Result:**
- Search returns 1+ result(s) with postal code "10059"
- Result is visible in list (was previously 0 results)

---

### TC-B03: Product Page BOPIS Modal - Country Code Search
**Priority:** P0 - Critical
**Type:** Functional / UI
**Agent:** qa-frontend-expert

**Steps:**
1. Open product page BOPIS modal
2. Clear any existing search
3. Type "USA" in the search field
4. Click Search
5. Observe result count
6. Capture screenshot

**Expected Result:**
- Search returns 80+ results
- All returned locations are in the USA
- Was previously returning 0 results

---

### TC-B04: Product Page BOPIS Modal - Street Address Search
**Priority:** P1 - High
**Type:** Functional / UI
**Agent:** qa-frontend-expert

**Steps:**
1. Open product page BOPIS modal
2. Clear any existing search
3. Type "Lexington Ave" in the search field
4. Click Search
5. Observe result count
6. Capture screenshot

**Expected Result:**
- Search returns 1+ result(s) with "Lexington Ave" in address
- Was previously returning 0 results

---

### TC-B05: Location Name Search Still Works (Regression)
**Priority:** P0 - Critical
**Type:** Functional / UI
**Agent:** qa-frontend-expert

**Steps:**
1. Open product page BOPIS modal
2. Clear any existing search
3. Type "Brooklyn" in the search field
4. Click Search
5. Observe result count
6. Verify ~5 results returned (same as before fix)

**Expected Result:**
- Still returns ~5 results (no regression in name search)
- All results have "Brooklyn" in their name

---

### TC-B06: No Results State Shows Correct Empty State Message
**Priority:** P1 - High
**Type:** Functional / UI
**Agent:** qa-frontend-expert

**Steps:**
1. Open product page BOPIS modal
2. Type a nonsense search term (e.g., "ZZZZZ99999XYZ")
3. Click Search
4. Observe empty state

**Expected Result:**
- "Pickup points not found" or similar empty state message displayed
- No JavaScript errors in console
- "Reset search" button or X clear button available

---

### TC-B07: Search Clear / Reset Behavior
**Priority:** P1 - High
**Type:** Functional / UI
**Agent:** qa-frontend-expert

**Steps:**
1. Open product page BOPIS modal
2. Note total initial count
3. Search "New York" - note filtered count
4. Click X (clear) button in search field
5. Verify search field cleared
6. Verify all locations restored (count matches initial)
7. Search "New York" again
8. Click "Reset search" button (if available)
9. Verify all locations restored again

**Expected Result:**
- Clear/reset restores full location list
- Count after clear matches initial count
- Behavior consistent with clear button

---

### TC-B08: Desktop vs Mobile Layout Consistency
**Priority:** P1 - High
**Type:** Functional / Responsive
**Agent:** qa-frontend-expert

**Steps (Desktop - 1920x1080):**
1. Open product page at 1920x1080 viewport
2. Open BOPIS modal
3. Search "New York"
4. Capture screenshot showing result count

**Steps (Mobile - 390x844 / iPhone equivalent):**
1. Set viewport to 390x844
2. Open BOPIS modal
3. Search "New York"
4. Capture screenshot showing result count

**Expected Result:**
- Both viewports show same result count for "New York"
- Mobile layout not broken by address search results
- Search field accessible on mobile

---

### TC-B09: Multiple Search Cycles - No State Degradation
**Priority:** P1 - High
**Type:** Functional / Stability
**Agent:** qa-frontend-expert

**Steps:**
1. Open product page BOPIS modal
2. Cycle through these searches in sequence:
   - Search "New York" → note count → clear
   - Search "USA" → note count → clear
   - Search "Brooklyn" → note count → clear
   - Search "10059" → note count → clear
   - Search "" (empty) → note count
3. Verify each search returns correct results
4. Verify no performance degradation over cycles
5. Check browser console for any errors

**Expected Result:**
- Each search returns consistent correct results
- No accumulated errors in console
- No UI degradation after multiple searches

---

### TC-B10: Cart BOPIS Modal Not Regressed
**Priority:** P1 - High
**Type:** Regression / UI
**Agent:** qa-frontend-expert

**Steps:**
1. Add a BOPIS-eligible product to cart
2. Navigate to cart
3. Select "Pickup" delivery option
4. Open cart pickup location modal
5. Verify faceted filters (Country, State/Province, City) are present
6. Apply "New York" in city filter
7. Verify results are correct

**Expected Result:**
- Cart BOPIS modal functions unchanged
- Faceted filters still available and working
- No regression introduced by backend indexing change

---

## Section C: Search UX Validation (qa-frontend-expert + ui-ux-expert)

### TC-C01: Search Input Accepts Address Text Without Issues
**Priority:** P2 - Medium
**Type:** UX
**Agent:** qa-frontend-expert

**Steps:**
1. Open product page BOPIS modal
2. Type a full address string: "123 Lexington Ave, New York, NY 10059, USA"
3. Click Search
4. Observe behavior

**Expected Result:**
- Search field accepts full address text
- No truncation or input validation blocking address input
- Results returned based on address fields

---

### TC-C02: Search Performance - Response Time
**Priority:** P2 - Medium
**Type:** Performance
**Agent:** qa-frontend-expert

**Steps:**
1. Open product page BOPIS modal
2. Using Chrome DevTools Network panel, monitor `productPickupLocations` query
3. Search "New York"
4. Record time from search trigger to results displayed

**Expected Result:**
- API response time < 2000ms
- Total perceived load time (including render) < 3000ms
- No timeout errors

---

## Test Execution Summary Template

| TC | Title | Agent | Priority | Result | Notes |
|----|-------|-------|----------|--------|-------|
| TC-A01 | City search returns all matching locations | qa-backend-expert | P0 | | |
| TC-A02 | Postal code search returns matching location | qa-backend-expert | P0 | | |
| TC-A03 | Street address search returns matching location | qa-backend-expert | P1 | | |
| TC-A04 | Country code search returns all matching locations | qa-backend-expert | P0 | | |
| TC-A05 | Location name search still works (regression) | qa-backend-expert | P0 | | |
| TC-A06 | Empty keyword returns all locations | qa-backend-expert | P1 | | |
| TC-A07 | Case insensitivity of address search | qa-backend-expert | P1 | | |
| TC-A08 | Cart pickup locations query not regressed | qa-backend-expert | P1 | | |
| TC-B01 | City search - UI | qa-frontend-expert | P0 | | |
| TC-B02 | Postal code search - UI | qa-frontend-expert | P0 | | |
| TC-B03 | Country code search - UI | qa-frontend-expert | P0 | | |
| TC-B04 | Street address search - UI | qa-frontend-expert | P1 | | |
| TC-B05 | Location name search - regression | qa-frontend-expert | P0 | | |
| TC-B06 | Empty state message | qa-frontend-expert | P1 | | |
| TC-B07 | Search clear / reset behavior | qa-frontend-expert | P1 | | |
| TC-B08 | Desktop vs mobile layout consistency | qa-frontend-expert | P1 | | |
| TC-B09 | Multiple search cycles stability | qa-frontend-expert | P1 | | |
| TC-B10 | Cart BOPIS modal not regressed | qa-frontend-expert | P1 | | |
| TC-C01 | Full address string input | qa-frontend-expert | P2 | | |
| TC-C02 | Search response time performance | qa-frontend-expert | P2 | | |
