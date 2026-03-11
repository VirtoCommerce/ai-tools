# Search Bar — Comprehensive Test Cases

**Feature:** Global Search Bar
**Sprint:** 26-04
**Environment:** https://vcst-qa-storefront.govirto.com
**UI Validated:** 2026-03-05 via Playwright (Chrome)
**Author:** test-management-specialist
**Existing coverage (skip duplicates):** SRCH-001 through SRCH-010 in regression/suites/Frontend/03-catalog-search-tests.csv

---

## UI Exploration Summary

| Feature | Present | Notes |
|---------|---------|-------|
| Search input in header | Yes | searchbox "Search", always visible in main nav |
| Barcode scan button | Yes | Button next to search input |
| Clear (X) button | Yes | Appears once text is typed |
| Search (submit) button | Yes | Magnifier icon, right of input |
| Hints section (search history) | Yes | Labeled "Hints"; items: "laptop", "hoodie" |
| Autocomplete product dropdown | Yes | "Products" section: image, name, price |
| "Check all products" link | Yes | In empty-state dropdown; goes to /catalog |
| Search results page | Yes | URL: /search?q={query} |
| Results count in heading | Yes | "Your search for X returned the following N results" |
| Sort by dropdown | Yes | Default: "Featured" |
| Grid / List view toggle | Yes | "Switch to grid view" / "Switch to list view" |
| Sidebar filters | Yes | price, Size, Categories, Color, Type, Product color, Size chart |
| "Purchased before" checkbox | Yes | Unchecked by default |
| "Show in stock" checkbox | Yes | Checked by default; chip shown |
| "Available at branches" checkbox | Yes | Unchecked by default |
| Filter chips | Yes | "Close chip" button per chip |
| "Reset filters" button | Yes | Appears when filters active |
| No-results state | Yes | Heading + "There are no results found" + "Reset search" button |
| Fuzzy matching / "Did you mean...?" | No | Not active on this environment |
| Pagination on results | No | "You have reached the end of the list." message instead |
| "View All Results" link in autocomplete | No | Not present when products are shown |

---

## Coverage Map vs. Existing Suite

| Existing ID | Overlap | New cases addressing gaps |
|-------------|---------|--------------------------|
| SRCH-001 | Basic query submission | SRCH-NEW-007, 008 (Enter vs button), SRCH-NEW-035 (E2E) |
| SRCH-002 | Suggestions dropdown | SRCH-NEW-002 (product detail validation), SRCH-NEW-005 (click to PDP) |
| SRCH-003 | No results | SRCH-NEW-016 (exact labels), SRCH-NEW-017 (Reset search button) |
| SRCH-004 | Special characters | SRCH-NEW-022 (URL encoding), SRCH-NEW-020, 021 (XSS/SQL) |
| SRCH-006 | Filters on results | SRCH-NEW-012, 013, 014 (checkbox + sidebar facets), SRCH-NEW-015 (reset) |
| SRCH-007 | Sorting | SRCH-NEW-011 (sort persistence) |
| SRCH-008 | History | SRCH-NEW-003 (exact "Hints" label + interaction) |

---

## Section 1: Search Input and Dropdown Behavior

### SRCH-NEW-001 — Search Bar: Click to Open Dropdown (Empty State)
**Priority:** P0 | **Section:** Search > Dropdown | **Type:** Functional | **Estimate:** 2m

**Preconditions:**
- Storefront open at homepage
- Search input contains no text

**Steps:**
1. Locate the search input labeled "Search" in the main navigation bar
2. Click the search input

**Expected Result:**
- A dropdown panel opens below the search input
- The dropdown shows a "Hints" section (labeled exactly "Hints") with 1+ prior search terms as clickable buttons
- Each hint shows a search icon and the query text
- "Start typing to search" text is visible in the dropdown
- A "Check all products" link is visible, pointing to /catalog
- No product results appear yet
- CONSOLE: No JavaScript errors on open
- NETWORK: No failed API calls triggered on focus

---

### SRCH-NEW-002 — Search Bar: Autocomplete Shows Product Previews While Typing
**Priority:** P0 | **Section:** Search > Autocomplete | **Type:** Functional | **Estimate:** 3m
**References:** E2E-SEARCH-005, SRCH-002

**Preconditions:**
- Storefront open at any page
- Products matching "hoodie" exist in catalog (at least: Vintage Colorado Hoodie $54.00, Hoodie Base product with only File req $250.00, Hoodie Base with Only File non required $300.00, Black California Beach Pullover Hoodie From $19.00)

**Steps:**
1. Click the search input
2. Type "hoodie" one character at a time, pausing briefly between characters
3. Observe the dropdown after each character
4. Observe the final dropdown state with all 6 characters typed

**Expected Result:**
- As typing begins, a "Products" section appears in the dropdown
- Each product entry shows: thumbnail image, product name as a clickable link, and price (e.g., "$54.00" or "From $19.00")
- At least 4 products matching "hoodie" are listed
- The "Hints" section remains visible above the "Products" section
- A clear (X) button appears to the right of the typed text
- NETWORK: A GraphQL searchProducts query fires with keyword: "hoodie"
- CONSOLE: No JavaScript errors

---

### SRCH-NEW-003 — Search Bar: Hints Section Shows Prior Searches on Focus
**Priority:** P1 | **Section:** Search > Hints | **Type:** Functional | **Estimate:** 3m
**References:** E2E-SEARCH-003, SRCH-008

**Preconditions:**
- At least 2 prior searches have been performed ("laptop" and "hoodie" are present as hints)
- Storefront open at homepage

**Steps:**
1. Click the search input
2. Observe the "Hints" section label (exact text)
3. Observe the hint items (icon + text for each)
4. Click the hint button labeled "laptop"

**Expected Result:**
- The section is labeled exactly "Hints" (not "Recent searches" or "History")
- Each hint is a clickable button with a search icon and the query text
- Clicking "laptop" populates the search input with "laptop"
- The browser navigates to /search?q=laptop
- Search results for "laptop" are displayed on the results page

---

### SRCH-NEW-004 — Search Bar: Clear Button Resets Input to Empty
**Priority:** P1 | **Section:** Search > Input Controls | **Type:** Functional | **Estimate:** 2m

**Preconditions:**
- Storefront open at any page

**Steps:**
1. Click the search input
2. Type "hoodie"
3. Verify the clear (X) button is visible to the right of the input text
4. Click the clear (X) button

**Expected Result:**
- After typing: clear button is visible and input contains "hoodie"
- After clicking clear: input is empty (value "")
- The dropdown returns to the "Hints" + "Start typing to search" state
- The clear button disappears
- User remains on the same page (no navigation occurs)

---

### SRCH-NEW-005 — Search Bar: Clicking Autocomplete Product Navigates to PDP
**Priority:** P0 | **Section:** Search > Autocomplete | **Type:** Functional | **Estimate:** 3m
**References:** E2E-SEARCH-005

**Preconditions:**
- Storefront open at homepage
- "Vintage Colorado Hoodie" is in the catalog

**Steps:**
1. Click the search input
2. Type "hoodie"
3. Wait for the autocomplete dropdown to show product results
4. Click the link "Vintage Colorado Hoodie" in the dropdown

**Expected Result:**
- Browser navigates to /products-with-options/configurable-caps-shirts/hoodie
- The PDP loads with product name "Vintage Colorado Hoodie"
- The search dropdown closes
- No JavaScript errors occur during navigation

---

### SRCH-NEW-006 — Search Bar: "Check all products" Link Goes to Catalog
**Priority:** P2 | **Section:** Search > Dropdown | **Type:** Functional | **Estimate:** 2m

**Preconditions:**
- Storefront open at homepage

**Steps:**
1. Click the search input (do not type)
2. Verify "Check all products" link is visible in the dropdown
3. Click "Check all products"

**Expected Result:**
- Browser navigates to /catalog
- Full product catalog page loads
- Search dropdown closes

---

## Section 2: Search Execution and Results Page

### SRCH-NEW-007 — Search: Submit via Enter Key
**Priority:** P0 | **Section:** Search > Submission | **Type:** Functional | **Estimate:** 2m
**References:** E2E-SEARCH-001, SRCH-001

**Preconditions:**
- Storefront open at any page

**Steps:**
1. Click the search input
2. Type "hoodie"
3. Press the Enter key

**Expected Result:**
- Browser navigates to /search?q=hoodie
- Search results page loads
- Heading reads: "Your search for hoodie returned the following 4 results" (count may vary)
- The word "hoodie" in the heading is bold/emphasized
- Search input in the header retains the text "hoodie"
- Product cards are displayed in grid view by default

---

### SRCH-NEW-008 — Search: Submit via Search Button (Magnifier Icon)
**Priority:** P0 | **Section:** Search > Submission | **Type:** Functional | **Estimate:** 2m

**Preconditions:**
- Storefront open at any page

**Steps:**
1. Click the search input
2. Type "hoodie"
3. Click the "Search" button (magnifier icon)

**Expected Result:**
- Browser navigates to /search?q=hoodie
- Results page loads identically to Enter key submission
- Same products, same count as SRCH-NEW-007

---

### SRCH-NEW-009 — Search Results Page: Result Count in Heading Is Accurate
**Priority:** P1 | **Section:** Search > Results Page | **Type:** Functional | **Estimate:** 2m

**Preconditions:**
- Navigate to /search?q=hoodie
- Current product count for "hoodie" query is 4

**Steps:**
1. Navigate to https://vcst-qa-storefront.govirto.com/search?q=hoodie
2. Read the page heading
3. Count the product cards displayed in the grid

**Expected Result:**
- The h1 heading reads: "Your search for hoodie returned the following 4 results"
- The count in the heading (4) matches the actual number of product cards rendered in the grid
- No discrepancy between heading count and visible product count

---

### SRCH-NEW-010 — Search Results Page: Grid and List View Toggle
**Priority:** P1 | **Section:** Search > Results Page > Layout | **Type:** Functional | **Estimate:** 3m

**Preconditions:**
- Navigate to /search?q=hoodie (4 results)

**Steps:**
1. Navigate to /search?q=hoodie
2. Confirm the default layout is grid (multiple product columns)
3. Click "Switch to list view"
4. Verify layout changes to a single-column list
5. Click "Switch to grid view"
6. Verify layout returns to grid

**Expected Result:**
- Default is grid view (products in multiple columns)
- List view: products in single-column format with more detail per row
- Grid view: products return to multi-column layout
- Product count is consistent across view changes (still 4)
- No JavaScript errors during view switching
- The active view button has a visual active/selected state

---

### SRCH-NEW-011 — Search Results Page: Sort Options Change Product Order
**Priority:** P1 | **Section:** Search > Sorting | **Type:** Functional | **Estimate:** 5m
**References:** SRCH-007

**Preconditions:**
- Navigate to /search?q=hoodie (multiple results with varying prices)

**Steps:**
1. Navigate to /search?q=hoodie
2. Locate "Sort by:" dropdown showing "Featured"
3. Open the dropdown and note all available options
4. Select "Price: Low to High"
5. Record the order of products by price
6. Select "Price: High to Low"
7. Verify the order is reversed compared to step 5
8. Select "Name: A to Z" (or equivalent alphabetical option)
9. Verify alphabetical ordering
10. Select "Featured" to reset

**Expected Result:**
- Sort dropdown contains at minimum: Featured, and at least one price sort option
- "Price: Low to High": products appear in ascending price order ($19 before $54 before $250)
- "Price: High to Low": products appear in descending price order ($300 before $250 before $54)
- "Name: A to Z": products appear in alphabetical order by name
- Product count remains 4 after each sort change
- URL updates to reflect the selected sort (e.g., ?sort=price-asc or equivalent)

---

### SRCH-NEW-012 — Search Results Page: "Show in stock" Checkbox Default State and Toggle
**Priority:** P1 | **Section:** Search > Filters > Checkboxes | **Type:** Functional | **Estimate:** 3m

**Preconditions:**
- Navigate to /search?q=hoodie

**Steps:**
1. Navigate to /search?q=hoodie
2. Verify "Show in stock" checkbox is checked by default
3. Verify a "Show in stock" filter chip is visible in the chip bar
4. Uncheck the "Show in stock" checkbox
5. Observe the chip bar and the result count
6. Re-check "Show in stock"
7. Verify the chip returns

**Expected Result:**
- "Show in stock" is checked on page load by default
- A "Show in stock" chip is present in the active filter chip bar
- Unchecking "Show in stock" removes the chip; result count may change
- Re-checking adds the chip back and the filtered result set is restored
- The "Reset filters" button visibility updates based on active non-default filters

---

### SRCH-NEW-013 — Search Results Page: "Purchased before" Checkbox
**Priority:** P2 | **Section:** Search > Filters > Checkboxes | **Type:** Functional | **Estimate:** 3m

**Preconditions:**
- User is authenticated with at least one prior purchase matching "hoodie"
- Navigate to /search?q=hoodie

**Steps:**
1. Verify "Purchased before" is unchecked by default
2. Check "Purchased before"
3. Verify a "Purchased before" chip appears in the chip bar
4. Verify results filter to show only previously purchased items matching the query
5. Uncheck "Purchased before"
6. Verify chip disappears and full results return

**Expected Result:**
- "Purchased before" defaults to unchecked
- Checking it adds a chip and filters results to prior purchases
- Unchecking removes the chip and restores all results

---

### SRCH-NEW-014 — Search Results Page: Sidebar Facet Filter
**Priority:** P1 | **Section:** Search > Filters > Sidebar | **Type:** Functional | **Estimate:** 5m
**References:** SRCH-006

**Preconditions:**
- Navigate to /search?q=hoodie
- Sidebar shows: price, Size, Categories, Color, Type, Product color, Size chart

**Steps:**
1. Click the "Color" facet group header to expand it
2. Select a color value from the expanded list (e.g., "Malachite" if visible)
3. Observe the chip bar and results
4. Verify a chip labeled with the selected color appears
5. Verify product count updates to show only items matching that color
6. Click "Close chip" on the color chip
7. Verify results return to the full set

**Expected Result:**
- Sidebar facet groups are expandable by clicking the header
- Selecting a facet value creates a chip in the active-filter bar
- The product list updates to show only products matching the facet value
- "Close chip" button removes the filter and restores the full result count
- No errors occur during facet application or removal

---

### SRCH-NEW-015 — Search Results Page: Reset Filters Preserves Search Term
**Priority:** P1 | **Section:** Search > Filters > Reset | **Type:** Functional | **Estimate:** 3m
**References:** CAT-021

**Preconditions:**
- Navigate to /search?q=hoodie
- Apply at least one additional filter beyond the default "Show in stock"

**Steps:**
1. Navigate to /search?q=hoodie
2. Apply a sidebar facet filter (e.g., Color: Malachite)
3. Verify the "Reset filters" button is visible
4. Click "Reset filters"

**Expected Result:**
- All applied filters (beyond any defaults) are cleared
- The search term "hoodie" remains in the header search input
- The URL retains ?q=hoodie but filter parameters are removed
- The full result set for "hoodie" is restored
- The "Reset filters" button disappears after all non-default filters are cleared

---

## Section 3: No Results and Edge Cases

### SRCH-NEW-016 — Search: No Results State UI Validation
**Priority:** P0 | **Section:** Search > No Results | **Type:** Functional | **Estimate:** 2m
**References:** E2E-SEARCH-004, SRCH-003

**Preconditions:**
- Storefront is accessible

**Steps:**
1. Navigate to https://vcst-qa-storefront.govirto.com/search?q=xyzqwerty9876543

**Expected Result:**
- The h1 heading reads: Sorry, your search for "xyzqwerty9876543" didn't return any results
- The searched term is bold/emphasized in the heading
- A "There are no results found" message is displayed below the heading
- A "Reset search" button is visible
- No product cards are displayed
- No sidebar filter panel is shown
- No "Did you mean...?" suggestion appears
- The URL is /search?q=xyzqwerty9876543

---

### SRCH-NEW-017 — Search: "Reset search" Button Clears Query
**Priority:** P1 | **Section:** Search > No Results | **Type:** Functional | **Estimate:** 2m

**Preconditions:**
- Navigate to /search?q=xyzqwerty9876543 (no-results page is showing)

**Steps:**
1. Verify no-results state with "Reset search" button is visible
2. Click "Reset search"

**Expected Result:**
- The search input in the header is cleared
- The user is redirected away from the no-results page (to homepage or catalog)
- No JavaScript error occurs

---

### SRCH-NEW-018 — Search: Whitespace-Only Query Handling
**Priority:** P1 | **Section:** Search > Edge Cases | **Type:** Functional | **Estimate:** 2m

**Preconditions:**
- Storefront open at any page

**Steps:**
1. Click the search input
2. Type "   " (three spaces, no other characters)
3. Press Enter or click the "Search" button

**Expected Result:**
- Either: no navigation occurs (submission is blocked for whitespace-only input)
- Or: if navigation occurs, the user lands on a no-results or catalog page
- The application does not crash or throw a JavaScript error
- NETWORK: No 5xx server error is returned

---

### SRCH-NEW-019 — Search: Very Long Query (200+ Characters)
**Priority:** P2 | **Section:** Search > Edge Cases | **Type:** Functional | **Estimate:** 2m

**Preconditions:**
- Storefront open at any page

**Steps:**
1. Click the search input
2. Type a 200-character string of repeated "a" characters
3. Press Enter

**Expected Result:**
- The input accepts the long string (or enforces a visible max-length constraint)
- If submitted: the search executes and returns a no-results page (or results if any match)
- No JavaScript error, no 500 error, no application crash
- The URL is properly URL-encoded (no raw unescaped characters)

---

### SRCH-NEW-020 — Search: XSS Script Injection in Search Input
**Priority:** P0 | **Section:** Search > Security | **Type:** Security | **Estimate:** 3m
**References:** E2E-SEC-002

**Preconditions:**
- Storefront is accessible

**Steps:**
1. Click the search input
2. Type: <script>alert('xss')</script>
3. Press Enter
4. Observe the browser for any alert dialog
5. Read the search results page heading
6. Check the browser console for script execution messages

**Expected Result:**
- No JavaScript alert dialog appears
- The script tag is not executed
- The URL encodes the input: %3Cscript%3E... or equivalent
- The results page heading displays the query as literal text (not rendered as HTML)
- CONSOLE: No alerts, no XSS-related errors, no unexpected script output

---

### SRCH-NEW-021 — Search: SQL Injection Attempt
**Priority:** P1 | **Section:** Search > Security | **Type:** Security | **Estimate:** 2m
**References:** E2E-SEC-002

**Preconditions:**
- Storefront is accessible

**Steps:**
1. Click the search input
2. Type: ' OR '1'='1
3. Press Enter

**Expected Result:**
- No database error, exception page, or stack trace is displayed
- The search results page handles the query gracefully (no results or escaped output)
- Application remains stable
- NETWORK: API response is 200 (not 500 or 503)
- CONSOLE: No error-level messages

---

### SRCH-NEW-022 — Search: Special Characters Are URL-Encoded Correctly
**Priority:** P1 | **Section:** Search > Edge Cases | **Type:** Functional | **Estimate:** 3m
**References:** SRCH-004

**Preconditions:**
- Storefront open at any page

**Steps:**
1. Search for "hoodie & jeans" — check the URL in the browser address bar
2. Search for "product (new)" — check the URL
3. Search for "item #123" — check the URL

**Expected Result:**
- "hoodie & jeans": URL contains encoded ampersand (q=hoodie+%26+jeans or q=hoodie%20%26%20jeans)
- "product (new)": URL encodes parentheses (%28 and %29)
- "item #123": URL encodes hash (%23)
- In all cases: the results page loads without errors
- The h1 heading displays the decoded query text (human-readable, not encoded)
- NETWORK: All requests return 200

---

## Section 4: URL-Based Search Navigation

### SRCH-NEW-023 — Search: Direct URL with Query Parameter
**Priority:** P1 | **Section:** Search > URL Navigation | **Type:** Functional | **Estimate:** 2m
**References:** E2E-SEARCH-001

**Preconditions:**
- Storefront is accessible

**Steps:**
1. Open a new browser tab
2. Navigate directly to: https://vcst-qa-storefront.govirto.com/search?q=hoodie

**Expected Result:**
- The search results page loads correctly without first visiting the homepage
- The search input in the header is pre-populated with "hoodie"
- The heading shows the correct result count for "hoodie"
- Products matching "hoodie" are displayed
- Sidebar filters and sort dropdown are functional

---

### SRCH-NEW-024 — Search: Empty Query Parameter Loads Catalog
**Priority:** P2 | **Section:** Search > URL Navigation | **Type:** Functional | **Estimate:** 2m

**Preconditions:**
- Storefront is accessible

**Steps:**
1. Navigate directly to: https://vcst-qa-storefront.govirto.com/search?q=

**Expected Result:**
- Page loads without error (no 404, no 500)
- Page title shows "QA & Catalog" (catalog-style page)
- Products are displayed (not a no-results state)
- The search input is empty or contains no query

---

## Section 5: Keyboard Navigation and Accessibility

### SRCH-NEW-025 — Search Bar: Keyboard-Only Navigation (Tab, Arrow, Enter, Escape)
**Priority:** P1 | **Section:** Search > Accessibility | **Type:** Accessibility | **Estimate:** 5m
**References:** WCAG 2.1 AA 2.1.1 Keyboard, 2.4.3 Focus Order

**Preconditions:**
- Storefront open at homepage
- Using keyboard only (no mouse)

**Steps:**
1. Press Tab repeatedly from the top of the page until the search input receives focus
2. Verify a visible focus indicator (ring or outline) is shown on the input
3. Type "hoodie" using the keyboard
4. Verify the autocomplete dropdown appears
5. Press Tab or Arrow Down to move focus into the dropdown
6. Use Arrow Down/Up to navigate hint items
7. Press Enter on a hint item to execute that search
8. Repeat steps 1-4, then press Escape to close the dropdown without submitting

**Expected Result:**
- Search input is reachable via Tab navigation
- Visible focus indicator is present when input is focused
- Typing triggers the autocomplete dropdown
- Arrow keys navigate within the dropdown
- Enter on a hint item executes the search
- Escape closes the dropdown and returns focus to the search input
- No keyboard trap: user can Tab past the search area normally
- CONSOLE: No keyboard-related JavaScript errors

---

### SRCH-NEW-026 — Search Bar: ARIA Roles and Labels
**Priority:** P1 | **Section:** Search > Accessibility | **Type:** Accessibility | **Estimate:** 5m
**References:** WCAG 2.1 AA 4.1.2 Name, Role, Value

**Preconditions:**
- Storefront open at homepage
- Browser accessibility tree available via DevTools (Accessibility panel)

**Steps:**
1. Inspect the search input's role and accessible name via DevTools Accessibility panel
2. Inspect the "Barcode scan" button's accessible name
3. Inspect the "Search" (submit) button's accessible name
4. Type text in the search input, then inspect the clear (X) button's accessible name
5. With the autocomplete dropdown open, inspect the dropdown container's role and aria attributes

**Expected Result:**
- Search input: role is "searchbox" and accessible name is "Search"
- "Barcode scan" button: accessible name is "Barcode scan"
- "Search" submit button: accessible name is "Search"
- Clear button: has an accessible name describing its purpose (e.g., "Clear" or "Clear search")
- Autocomplete dropdown: uses role="listbox" or role="combobox" or equivalent ARIA pattern
- All interactive elements in the dropdown have non-empty accessible names

---

## Section 6: Performance

### SRCH-NEW-027 — Search: Autocomplete Response Time
**Priority:** P2 | **Section:** Search > Performance | **Type:** Performance | **Estimate:** 5m

**Preconditions:**
- Storefront open at homepage
- DevTools Network tab is open

**Steps:**
1. Open DevTools Network tab
2. Click the search input and type "hoodie"
3. Start a timer from the first character typed
4. Observe when autocomplete product results appear in the UI
5. In the Network tab, locate the GraphQL searchProducts request and record its duration

**Expected Result:**
- Autocomplete product results appear within 2 seconds of the first character being typed
- The GraphQL API call completes in under 1500ms
- No loading spinner is visible for more than 2 seconds without results appearing

---

### SRCH-NEW-028 — Search: Results Page Load Time
**Priority:** P2 | **Section:** Search > Performance | **Type:** Performance | **Estimate:** 5m

**Preconditions:**
- DevTools Network tab is open; throttling set to "No throttling"

**Steps:**
1. Navigate to /search?q=hoodie (from a fresh navigation, not from cache)
2. Measure time from navigation start until product cards are visible and the heading with result count is rendered

**Expected Result:**
- The results page is fully rendered (heading + product cards + filters) within 3 seconds
- The h1 heading with result count is visible within 2 seconds
- No major layout shift after initial product render
- NETWORK: All API calls return 200; no 4xx or 5xx responses

---

## Section 7: Cross-Browser and Mobile

### SRCH-NEW-029 — Search Bar: Firefox Compatibility
**Priority:** P2 | **Section:** Search > Cross-Browser | **Type:** Compatibility | **Estimate:** 5m

**Preconditions:**
- Firefox is available and configured via playwright-firefox MCP

**Steps:**
1. Open https://vcst-qa-storefront.govirto.com/ in Firefox
2. Click the search input
3. Type "hoodie"
4. Verify autocomplete dropdown appears with products
5. Press Enter
6. Verify search results page loads

**Expected Result:**
- Search input is accessible and focused in Firefox
- Autocomplete renders with product images, names, prices
- Enter submission works the same as Chrome
- Results page displays correctly; no Firefox-specific layout breaks
- CONSOLE: No Firefox-specific errors

**Delegation:** qa-frontend-expert (playwright-firefox)

---

### SRCH-NEW-030 — Search Bar: Edge Compatibility
**Priority:** P2 | **Section:** Search > Cross-Browser | **Type:** Compatibility | **Estimate:** 5m

**Preconditions:**
- Edge is available and configured via playwright-edge MCP

**Steps:**
1. Open https://vcst-qa-storefront.govirto.com/ in Edge
2. Click the search input
3. Type "hoodie"
4. Verify autocomplete dropdown
5. Press Enter
6. Verify search results page

**Expected Result:**
- Identical behavior to Chrome
- No Edge-specific rendering or interaction issues

**Delegation:** qa-frontend-expert (playwright-edge)

---

### SRCH-NEW-031 — Search Bar: Mobile Viewport at 375px Width
**Priority:** P1 | **Section:** Search > Mobile | **Type:** Functional | **Estimate:** 5m

**Preconditions:**
- Chrome DevTools device emulation set to 375px width
- Storefront open at homepage

**Steps:**
1. Set viewport to 375px wide
2. Verify the search input is visible in the header
3. Tap/click the search input
4. Verify the dropdown opens in a mobile-appropriate layout
5. Type "hoodie"
6. Verify autocomplete results are visible and readable
7. Tap a product in the dropdown

**Expected Result:**
- Search input is visible and interactive at 375px
- Autocomplete dropdown fits within the mobile viewport (no horizontal scroll introduced)
- Product names and prices in the dropdown are readable (not truncated to unreadable length)
- Tapping a product navigates to the correct PDP
- No layout breaks at mobile width

**Delegation:** qa-frontend-expert

---

### SRCH-NEW-032 — Search: Mobile Results Page Layout (375px)
**Priority:** P1 | **Section:** Search > Mobile | **Type:** Functional | **Estimate:** 5m

**Preconditions:**
- Chrome DevTools device emulation at 375px
- Navigate to /search?q=hoodie

**Steps:**
1. Set viewport to 375px
2. Navigate to /search?q=hoodie
3. Verify the results heading is readable
4. Verify product cards use a 1 or 2 column grid (not 4 columns)
5. Verify sort dropdown is accessible (no horizontal scroll required)
6. Verify filter controls are accessible on mobile (e.g., sidebar collapsed behind a "Filters" button)
7. Tap filter controls and verify they open
8. Verify touch targets are at least 44x44px

**Expected Result:**
- Heading is visible and readable at 375px
- Product card grid adapts to 1-2 columns
- Sort dropdown is accessible without horizontal scrolling
- Filter sidebar is accessible via a mobile-friendly control (button, drawer, or modal)
- All interactive elements (buttons, checkboxes, links) meet 44x44px minimum touch target

**Delegation:** qa-frontend-expert

---

## Section 8: GA4 Analytics

### SRCH-NEW-033 — Search: GA4 "search" Event on Query Submission
**Priority:** P2 | **Section:** Search > Analytics | **Type:** Functional | **Estimate:** 5m
**References:** E2E-GA-004

**Preconditions:**
- DevTools Console is open
- Google Tag Manager is configured on the storefront

**Steps:**
1. Open DevTools Console
2. Run: window.dataLayer to confirm the array exists
3. Click the search input, type "hoodie", press Enter
4. After the results page loads, run: window.dataLayer.filter(e => e.event === 'search')

**Expected Result:**
- window.dataLayer is an array and exists
- A search event is found: { event: 'search', search_term: 'hoodie' }
- The search_term matches the submitted query
- CONSOLE: No GA4 or GTM errors

---

### SRCH-NEW-034 — Search: GA4 "view_search_results" Event on Results Page
**Priority:** P2 | **Section:** Search > Analytics | **Type:** Functional | **Estimate:** 5m
**References:** E2E-GA-004

**Preconditions:**
- DevTools Console is open

**Steps:**
1. Navigate to /search?q=hoodie
2. In the Console, run: window.dataLayer.filter(e => e.event === 'view_search_results')

**Expected Result:**
- At least one view_search_results event is in dataLayer
- The event includes search_term: 'hoodie'
- Optionally includes a result count or items list
- CONSOLE: No GA4 or GTM errors

---

## Section 9: Cross-Layer E2E

### SRCH-NEW-035 — Search to Cart: Full End-to-End Flow
**Priority:** P0 | **Section:** Search > E2E | **Type:** Functional | **Estimate:** 10m
**References:** E2E-SEARCH-001, BL-CART

**Preconditions:**
- User is authenticated
- Cart is empty or at a known state

**Steps:**
1. Click the search input and type "hoodie"
2. Press Enter — verify navigation to /search?q=hoodie
3. Locate "Vintage Colorado Hoodie" ($54.00) on the results page
4. Click the "+" (Increase quantity) button on the Vintage Colorado Hoodie card to set quantity to 1
5. Verify a success notification or the cart icon badge increments
6. Click the "Cart" link in the navigation
7. On the cart page, verify the Vintage Colorado Hoodie is listed at $54.00

**Expected Result:**
- Search finds the product and displays it on the results page
- Quantity stepper is functional on search result product cards
- Cart badge increments after add-to-cart
- Cart page (/cart) shows the correct product: name "Vintage Colorado Hoodie", price $54.00, quantity 1
- NETWORK: GraphQL addItem mutation returns success (no 4xx/5xx)
- CONSOLE: No errors during the complete flow

---

### SRCH-NEW-036 — Search: Browser Back Returns to Results Page
**Priority:** P1 | **Section:** Search > Navigation | **Type:** Functional | **Estimate:** 3m
**References:** E2E-SEARCH-001

**Preconditions:**
- User has navigated: search results → product PDP (any product from search results)

**Steps:**
1. Navigate to /search?q=hoodie
2. Click "Vintage Colorado Hoodie" to open the PDP
3. Verify the PDP loads correctly
4. Click the browser Back button

**Expected Result:**
- Browser returns to /search?q=hoodie
- The search results page is displayed with the same query and results
- The search input in the header still shows "hoodie"
- Product cards are visible (page is not blank or in error state)

---

## Coverage Summary

| Section | Test Cases | P0 | P1 | P2 |
|---------|-----------|----|----|-----|
| 1. Input & Dropdown | 001-006 | 3 | 2 | 1 |
| 2. Results Page | 007-015 | 2 | 5 | 2 |
| 3. No Results & Edge Cases | 016-022 | 2 | 4 | 1 |
| 4. URL Navigation | 023-024 | 0 | 1 | 1 |
| 5. Keyboard & Accessibility | 025-026 | 0 | 2 | 0 |
| 6. Performance | 027-028 | 0 | 0 | 2 |
| 7. Cross-Browser & Mobile | 029-032 | 0 | 2 | 2 |
| 8. GA4 Analytics | 033-034 | 0 | 0 | 2 |
| 9. Cross-Layer E2E | 035-036 | 1 | 1 | 0 |
| **TOTAL** | **36** | **8** | **17** | **11** |

## Delegation Recommendations

| Agent | Test Case IDs |
|-------|---------------|
| qa-frontend-expert (Chrome, playwright-chrome) | SRCH-NEW-001 to 028, 033-036 |
| qa-frontend-expert (Firefox, playwright-firefox) | SRCH-NEW-029 |
| qa-frontend-expert (Edge, playwright-edge) | SRCH-NEW-030 |
| qa-frontend-expert (Mobile emulation) | SRCH-NEW-031, 032 |
| ui-ux-expert | SRCH-NEW-025, 026 (accessibility deep-dive with screen reader) |
| qa-backend-expert | Verify GraphQL searchProducts query parameters, fuzzy level settings, response schema |