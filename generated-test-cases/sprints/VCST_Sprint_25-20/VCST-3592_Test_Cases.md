# Test Cases for VCST-3592: [BOPIS] [Product details page] Info when the product can be picked up

## User Story Details
- **Jira Key**: VCST-3592
- **Summary**: [BOPIS] [Product details page] Info when the product can be picked up
- **Priority**: Medium
- **Status**: Cancelled
- **Created**: 7/9/2025

## Description
As a customer when viewing product details page I want to see information about the pickup dates in the locations.

**Reference**: Buy Online Pick-up In Store (BOPIS) functionality

---

## Test Cases

### Test Case 1: Verify Pickup Date Information Display for Available Product
**Objective**: Verify that pickup date information is correctly displayed on the product details page when the product is available at one or more store locations.

**Preconditions**:
- User has access to the storefront (https://docs.virtocommerce.org/platform/user-guide/storefront/)
- BOPIS feature is enabled for the store
- At least one product with available inventory exists in one or more physical store locations
- Store locations are configured with pickup capabilities (https://docs.virtocommerce.org/platform/user-guide/stores/)
- User is not logged in (anonymous user)

**Test Steps**:
1. Navigate to the storefront homepage
2. Search for or browse to a product that has inventory available in at least one physical store location
3. Click on the product to open the Product Details Page (PDP)
4. Locate the BOPIS pickup information section on the PDP
5. Review the displayed pickup date information for each available store location

**Expected Results**:
- Pickup date information section is visible on the product details page
- Each store location with available inventory displays the estimated pickup date
- Pickup dates are displayed in a clear, user-friendly format (e.g., "Available for pickup on [Date]" or "Ready for pickup in X hours/days")
- Store location names are clearly visible alongside pickup dates
- The information is displayed in a prominent location on the PDP (above the fold or near the Add to Cart button)

**Test Data**: 
- Product SKU: TEST-BOPIS-001
- Store Locations: Downtown Store, Westside Mall Store
- Available Inventory: 5+ units per location

**Priority**: High

---

### Test Case 2: Verify Pickup Date Information for Multiple Store Locations
**Objective**: Verify that when a product is available in multiple store locations, pickup dates are displayed correctly for each location with the ability to compare options.

**Preconditions**:
- User has access to the storefront
- BOPIS feature is enabled
- A product exists with available inventory in 3+ different store locations (https://docs.virtocommerce.org/platform/user-guide/stores/)
- Each store location has different inventory levels and processing times
- Catalog is configured with products (https://docs.virtocommerce.org/platform/user-guide/catalog/)

**Test Steps**:
1. Navigate to a product details page for a product available in multiple store locations
2. Locate the BOPIS pickup information section
3. Verify that all eligible store locations are listed
4. Check the pickup date displayed for each location
5. Verify if locations are sorted by earliest pickup date or distance (if location services enabled)
6. Check if there's an option to view more store locations (if applicable)
7. Verify if store details (address, hours) are accessible from this view

**Expected Results**:
- All store locations with available inventory are displayed
- Each location shows a unique pickup date based on inventory availability and processing time
- Locations are logically sorted (e.g., earliest pickup first, or nearest location first)
- Pickup dates vary based on each store's processing capabilities
- User can easily compare pickup dates across multiple locations
- Store location details are accessible (via link, tooltip, or expandable section)
- UI clearly distinguishes between different locations

**Test Data**: 
- Product: Multi-location product (e.g., popular electronics item)
- Store Locations: Location A (same-day pickup), Location B (next-day pickup), Location C (2-day pickup)

**Priority**: High

---

### Test Case 3: Verify Pickup Date Information When Product is Out of Stock at All Locations
**Objective**: Verify appropriate messaging is displayed when a product is out of stock at all store locations and no pickup dates are available.

**Preconditions**:
- User has access to the storefront
- BOPIS feature is enabled
- A product exists with zero inventory at all physical store locations
- Product is configured in the catalog (https://docs.virtocommerce.org/platform/user-guide/catalog/)
- Inventory management is properly configured (https://docs.virtocommerce.org/platform/user-guide/inventory/)

**Test Steps**:
1. Navigate to the product details page for a product with no inventory at any store location
2. Locate the BOPIS pickup information section on the PDP
3. Verify the message displayed to the user regarding pickup availability
4. Check if alternative options are presented (e.g., "Notify me when available", "Ship to home")
5. Verify that no pickup dates are shown

**Expected Results**:
- Clear message is displayed indicating the product is not available for pickup at any location (e.g., "Not available for pickup at this time")
- No pickup dates are displayed
- BOPIS section is either hidden or displays unavailability message
- Alternative fulfillment options are presented (if available), such as home delivery
- User is not able to select store pickup as a fulfillment option
- The messaging is user-friendly and does not cause confusion

**Test Data**: 
- Product SKU: TEST-OOS-001
- All Store Locations: 0 inventory

**Priority**: High

---

### Test Case 4: Verify Pickup Date Updates Based on Selected Product Variations
**Objective**: Verify that pickup date information updates dynamically when user selects different product variations (size, color, etc.) that may have different availability across store locations.

**Preconditions**:
- User has access to the storefront
- BOPIS feature is enabled
- A configurable product exists with multiple variations (e.g., different sizes/colors) (https://docs.virtocommerce.org/platform/user-guide/catalog/)
- Different variations have different inventory levels across store locations
- Product variations are properly configured in the catalog

**Test Steps**:
1. Navigate to a configurable product details page (e.g., a shirt available in multiple sizes and colors)
2. Note the initial pickup date information displayed for the default variation
3. Select a different product variation (e.g., change size from Medium to Large)
4. Observe if the pickup date information updates
5. Select another variation that has different inventory availability
6. Verify pickup dates update accordingly
7. Select a variation that is out of stock at all locations
8. Verify appropriate out-of-stock messaging is displayed

**Expected Results**:
- Pickup date information updates immediately when user selects a different product variation
- Pickup dates reflect the actual inventory availability of the selected variation
- Store locations list may change based on which stores have the selected variation in stock
- If a variation is out of stock at all locations, appropriate messaging is displayed
- No page refresh is required (AJAX/dynamic update)
- Loading indicator is shown during the update process (if applicable)
- The update happens smoothly without errors or delays

**Test Data**: 
- Configurable Product: T-Shirt with variations
  - Variation 1: Red/Medium (available at 2 locations)
  - Variation 2: Blue/Large (available at 3 locations)
  - Variation 3: Green/Small (out of stock at all locations)

**Priority**: Medium

---

### Test Case 5: Verify Pickup Date Display for Same-Day Pickup Eligibility
**Objective**: Verify that products eligible for same-day pickup display appropriate messaging and cut-off time information.

**Preconditions**:
- User has access to the storefront
- BOPIS feature is enabled with same-day pickup functionality
- At least one store location offers same-day pickup
- Same-day pickup business rules are configured (e.g., order by 2 PM for same-day pickup)
- Product with adequate inventory exists at a same-day pickup location
- Current time is before the same-day pickup cut-off time

**Test Steps**:
1. Navigate to a product details page for a product available at a store with same-day pickup capability
2. Verify the current time is before the cut-off time for same-day pickup
3. Locate the BOPIS pickup information section
4. Check the pickup date information for the same-day pickup eligible location
5. Verify if cut-off time information is displayed
6. Note the exact messaging used (e.g., "Available for pickup today if ordered by 2:00 PM")
7. Refresh the page after the cut-off time and verify the pickup date changes to next day

**Expected Results**:
- Same-day pickup option is clearly highlighted or badged (e.g., "Same-Day Pickup Available")
- Pickup date shows today's date for eligible stores
- Cut-off time is clearly communicated (e.g., "Order by 2:00 PM for pickup today")
- The messaging emphasizes the urgency and benefit of same-day pickup
- After cut-off time, the pickup date automatically updates to the next available day
- Time zone information is accurate for the store location
- Same-day eligible stores are prominently featured in the location list

**Test Data**: 
- Product: Fast-moving consumer good
- Store: Downtown Store (same-day pickup enabled, cut-off time 2:00 PM)
- Test Time: 10:00 AM (before cut-off) and 3:00 PM (after cut-off)

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Additional Test Scenarios to Consider:
1. **Performance Testing**: Verify pickup date information loads within acceptable time limits (<2 seconds) even with 10+ store locations
2. **User Location Services**: Test pickup date display when user denies location services vs. when location is enabled
3. **Cross-browser Compatibility**: Verify pickup date information displays correctly across different browsers (Chrome, Firefox, Safari, Edge)
4. **Mobile Responsiveness**: Verify pickup date information is properly displayed and functional on mobile devices
5. **Partial Inventory**: Test when product quantity requested exceeds inventory at a specific location
6. **Business Hours Consideration**: Verify pickup dates account for store holidays and non-business days

---

## Notes
- Pickup date calculations should account for store processing times, business hours, and holidays
- The feature integrates with inventory management system for real-time availability
- UI/UX should follow storefront design patterns and be consistent with overall site design
- Consider implementing analytics tracking for pickup date views and location selections
- Accessibility (WCAG) compliance should be verified for all pickup date information displays
- **Status Note**: This user story is marked as Cancelled - verify if testing is still required or if feature scope has changed
- Dependencies: Inventory Management module, Store Management, Order Management for BOPIS fulfillment
- Related documentation: 
  - Stores: https://docs.virtocommerce.org/platform/user-guide/stores/
  - Catalog: https://docs.virtocommerce.org/platform/user-guide/catalog/
  - Inventory: https://docs.virtocommerce.org/platform/user-guide/inventory/
  - Storefront: https://docs.virtocommerce.org/platform/user-guide/storefront/