# Test Cases for VCST-3865: [BOPIS] [E2E] Add search by keyword and facets on the pick points map

## User Story Details
[As provided in the prompt]

---

## Test Cases

### Test Case 1: Basic Keyword Search Functionality
**Objective**: Verify that users can search pickup locations using keywords

**Preconditions**:
- User is on checkout page
- Multiple pickup locations are available
- Search functionality is enabled

**Test Steps**:
1. Click on the pickup location search bar
2. Enter a valid store name "Central Mall"
3. Press Enter or click search icon
4. Observe results on both map and list view

**Expected Results**:
- Search results update in real-time
- Matching locations are displayed on map with pins
- List view shows matching locations
- Results show store name, address, and availability status

**Test Data**: Store name: "Central Mall"
**Priority**: High

---

### Test Case 2: Search by Subway Station
**Objective**: Verify search functionality using subway station names

**Preconditions**:
- User is on pickup location selection page
- Subway station data is available in system

**Test Steps**:
1. Click search bar
2. Enter subway station name "Union Station"
3. Select from autocomplete suggestions if available
4. Review search results

**Expected Results**:
- Pickup points near subway station are displayed
- Results are sorted by distance from station
- Map centers on selected subway station
- Subway station icon is distinctly visible

**Test Data**: Station name: "Union Station"
**Priority**: High

---

### Test Case 3: Filter by Store Availability
**Objective**: Verify filtering of pickup locations based on item availability

**Preconditions**:
- User has items in cart
- Multiple pickup locations exist with varying availability

**Test Steps**:
1. Open pickup location selector
2. Toggle "Available for Pickup" filter
3. Review filtered results
4. Check store details for availability information

**Expected Results**:
- Only stores with item availability are shown
- Unavailable stores are hidden or grayed out
- Availability status is clearly indicated
- Filter state persists during session

**Priority**: High

---

### Test Case 4: Pagination of Search Results
**Objective**: Verify proper functioning of pagination in search results

**Preconditions**:
- Search returns more than 10 results
- Pagination is enabled

**Test Steps**:
1. Perform search that returns many results
2. Scroll through first page
3. Click next page button
4. Navigate between pages
5. Click last page button

**Expected Results**:
- Results are divided into pages (10 items per page)
- Page controls are visible and functional
- Current page is highlighted
- Map updates with locations on current page

**Priority**: Medium

---

### Test Case 5: Combined Filters and Search
**Objective**: Verify functionality when multiple search criteria are applied

**Preconditions**:
- All filter options are available
- Search functionality is active

**Test Steps**:
1. Enter keyword "downtown"
2. Apply "Available for Pickup" filter
3. Select address filter for specific zip code
4. Review combined results

**Expected Results**:
- Results meet all selected criteria
- Filters can be applied/removed independently
- Clear all filters option works correctly
- Results update immediately when criteria change

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 6: No Results Found
**Objective**: Verify system behavior when search yields no results

**Preconditions**:
- Search functionality is active

**Test Steps**:
1. Enter invalid or non-existent location "XYZABC"
2. Submit search
3. Observe system response

**Expected Results**:
- Appropriate "No results found" message displayed
- Suggestion for alternative search provided
- Option to clear search visible
- Map shows default view

**Priority**: Medium

### Test Case 7: Special Characters in Search
**Objective**: Verify search handling of special characters

**Test Steps**:
1. Enter search with special characters "Store & Mall #123"
2. Enter search with SQL injection characters "'; DROP TABLE"
3. Enter emoji characters "🏪"

**Expected Results**:
- Special characters handled appropriately
- No system errors occur
- Search sanitizes input properly
- Reasonable results shown where applicable

**Priority**: Low

---

## Notes
- Test cases should be executed on multiple browsers
- Mobile responsiveness should be verified for all scenarios
- Performance testing should be considered for search response times
- Integration with store inventory system should be verified
- Accessibility testing should be performed on search interface

Dependencies:
- Store inventory API
- Geolocation services
- Map service integration