# Test Cases for VCST-2284: [Catalog browsing] [Mobile] Rework search experience

## User Story Details
- **Jira Key**: VCST-2284
- **Summary**: [Catalog browsing] [Mobile] Rework search experience
- **Priority**: Medium
- **Status**: REFINEMENT
- **Created**: 11/19/2024

## Description
No description provided

---

## Test Cases

### Test Case 1: Verify Mobile Search Bar Visibility and Accessibility
**Objective**: Validate that the search functionality is easily accessible and visible on mobile devices across different screen sizes.

**Preconditions**:
- Mobile storefront is deployed and accessible
- Catalog contains active products (reference: https://docs.virtocommerce.org/products/catalog/)
- User is on the storefront homepage on a mobile device (viewport width: 320px-768px)

**Test Steps**:
1. Open the storefront on a mobile device or mobile emulator
2. Navigate to the homepage
3. Locate the search bar/icon in the header or navigation area
4. Tap on the search icon/field
5. Verify the search input field expands or opens appropriately
6. Check keyboard appearance and focus state

**Expected Results**:
- Search icon/field is prominently displayed in the mobile header
- Tapping the search activates the input field with proper focus
- Mobile keyboard appears automatically when search is activated
- Search interface follows mobile-responsive design patterns
- Search bar is accessible on both portrait and landscape orientations

**Test Data**: 
- Test devices: iPhone (iOS), Android phone (various screen sizes: 320px, 375px, 414px, 768px)

**Priority**: High

---

### Test Case 2: Validate Mobile Search Autocomplete and Suggestions
**Objective**: Ensure that search suggestions and autocomplete functionality works correctly on mobile devices with touch interactions.

**Preconditions**:
- User is on the mobile storefront
- Catalog contains multiple products with varied names and categories (reference: https://docs.virtocommerce.org/products/catalog/)
- Search indexing is configured and up-to-date (reference: https://docs.virtocommerce.org/platform/user-guide/search/)

**Test Steps**:
1. Tap on the mobile search field to activate it
2. Type 2-3 characters (e.g., "sho")
3. Observe the autocomplete suggestions dropdown/overlay
4. Scroll through the suggestion list using touch gestures
5. Tap on one of the suggested items
6. Verify navigation to the selected product or category
7. Return and test typing a complete search term without selecting suggestions

**Expected Results**:
- Autocomplete suggestions appear after 2-3 characters are typed
- Suggestions are displayed in a mobile-optimized dropdown/overlay
- Suggestions include product names, categories, and relevant results
- Touch targets for suggestions are minimum 44x44 pixels (mobile accessibility standard)
- Selected suggestion navigates to the correct product/category page
- Suggestions update dynamically as user types
- Loading indicator appears if search takes more than 300ms

**Test Data**: 
- Search terms: "sho", "electronics", "dress", "phone"
- Expected products in catalog for each term

**Priority**: High

---

### Test Case 3: Verify Mobile Search Results Display and Filtering
**Objective**: Validate that search results are properly displayed and filterable on mobile devices with optimized UI/UX.

**Preconditions**:
- User is on mobile storefront
- Catalog contains at least 20+ products across multiple categories
- Products have proper attributes, prices, and images configured (reference: https://docs.virtocommerce.org/products/catalog/)

**Test Steps**:
1. Enter a search query that returns multiple results (e.g., "laptop")
2. Submit the search
3. Observe the search results page layout on mobile
4. Verify product card display (image, title, price)
5. Tap on filter/sort options
6. Apply a filter (e.g., price range, category)
7. Verify filter application and results update
8. Test pagination or infinite scroll behavior
9. Tap on a product from results to verify navigation

**Expected Results**:
- Search results page is mobile-responsive and easy to navigate
- Product cards display essential information clearly
- Filter/sort buttons are accessible and properly sized for mobile
- Filters open in a mobile-optimized overlay/drawer
- Applied filters are clearly visible with option to clear
- Results update without full page reload when filters are applied
- Pagination or infinite scroll works smoothly
- Product images load with proper lazy loading
- "No results found" message displays appropriately for zero results

**Test Data**: 
- Search term: "laptop" (should return 10+ results)
- Filters: Price range ($500-$1000), Category, Brand

**Priority**: High

---

### Test Case 4: Test Mobile Search Performance and Empty State Handling
**Objective**: Verify search performance, loading states, and appropriate handling of edge cases like empty searches and no results.

**Preconditions**:
- Mobile storefront is accessible
- Catalog is populated with products
- Network throttling tools available for testing

**Test Steps**:
1. Open search on mobile device
2. Submit an empty search (without typing anything)
3. Observe the behavior and messaging
4. Enter a search term that yields no results (e.g., "xyzabc123")
5. Verify the "no results" page/message
6. Test search with special characters (@, #, $, %)
7. Simulate slow network (3G) and perform a search
8. Verify loading states and timeout handling
9. Test search with very long query string (100+ characters)

**Expected Results**:
- Empty search shows helpful message or returns to previous state
- No results page displays user-friendly message with suggestions (e.g., "Check spelling", "Try different keywords")
- Special characters are handled gracefully without breaking search
- Loading spinner/skeleton appears during search processing
- Search completes within 3 seconds on 3G network
- Timeout error message displays if search exceeds 10 seconds
- Long query strings are truncated or handled without UI breaking
- Search history or popular searches may be suggested when no results found

**Test Data**: 
- Empty search: "" (blank)
- No results term: "xyzabc123nonexistent"
- Special characters: "@product#", "item$100", "test&item"
- Long query: 100+ character string

**Priority**: Medium

---

### Test Case 5: Validate Mobile Search with Voice Input and Keyboard Optimization
**Objective**: Ensure that mobile-specific input methods (voice search, virtual keyboard optimization) work correctly with the reworked search experience.

**Preconditions**:
- Mobile device with voice input capability
- Storefront search supports voice input (if implemented)
- User permissions for microphone access granted

**Test Steps**:
1. Tap on search field on mobile device
2. Tap voice input button (if available) on mobile keyboard
3. Speak a search query (e.g., "red shoes")
4. Verify voice-to-text conversion and search execution
5. Test keyboard type attribute (should be "search" type)
6. Verify "Search" or "Go" button on mobile keyboard
7. Test search submission using keyboard action button
8. Test auto-capitalization and autocorrect behavior
9. Verify copy/paste functionality in search field

**Expected Results**:
- Voice input button is available and functional
- Voice search accurately converts speech to text
- Search executes automatically or with confirmation after voice input
- Mobile keyboard displays "Search" action button instead of "Return"
- Tapping keyboard "Search" button submits the query
- Auto-capitalization is disabled for search input (appropriate for search queries)
- Autocorrect doesn't interfere with product names or technical terms
- Copy/paste works correctly in search field
- Search field clears easily with "X" button

**Test Data**: 
- Voice input phrases: "red shoes", "wireless headphones", "laptop computer"
- Copy/paste text: product names, SKUs

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Edge cases are covered within Test Cases 4 and 5 above, specifically:
- Empty search handling
- No results scenarios
- Special characters in search queries
- Long query strings
- Slow network performance
- Voice input edge cases

---

## Notes
- All tests should be executed on multiple mobile devices: iOS (iPhone) and Android (various manufacturers)
- Test on different screen sizes: small (320px), medium (375px-414px), and tablet (768px)
- Verify search functionality works correctly after browser refresh and back button navigation
- Test search behavior when user rotates device from portrait to landscape
- Verify search history/recent searches persistence across sessions (if implemented)
- Check analytics tracking for search queries (if configured)
- Test search with different languages if multi-language support is enabled (reference: https://docs.virtocommerce.org/platform/user-guide/localization/)
- Dependency: Requires proper Elasticsearch or Azure Search configuration for optimal performance
- Related documentation: Virto Commerce Search functionality at https://docs.virtocommerce.org/platform/user-guide/search/