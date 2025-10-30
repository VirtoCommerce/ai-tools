# Test Cases for VCST-3591: [E2E] [BOPIS] When selecting a pickup location the stock info is required for the decision

## User Story Details
- **Jira Key**: VCST-3591
- **Summary**: [E2E] [BOPIS] When selecting a pickup location the stock info is required for the decision
- **Priority**: Medium
- **Status**: Cancelled
- **Created**: 7/9/2025

## Description
As a customer I want to understand if I can get the product in the required quantities in single pickup location.
There are 2 scenarios:
The product is available in full quantities in Location1
The system shall show me this
If the product can be transferred internally to the pickup point that I select
I want to be notified if this is possible and when is the ETA

On front: Show info to the user by user action (by click on the pick up point info).
Design:  

_____________
Reference:

---

## Test Cases

### Test Case 1: Verify Full Stock Availability Display at Selected Pickup Location
**Objective**: Verify that when a product is available in full quantities at a pickup location, the system correctly displays this information to the customer

**Preconditions**:
- BOPIS (Buy Online Pickup In Store) functionality is enabled in the store
- At least one [fulfillment center](https://docs.virtocommerce.org/platform/user-guide/fulfillment/) configured as a pickup location (Location1)
- Product SKU "TEST-PROD-001" has inventory quantity of 50 units at Location1
- Customer is logged in or browsing as guest
- Product is added to cart with quantity of 5 units

**Test Steps**:
1. Navigate to the product detail page for "TEST-PROD-001"
2. Select quantity as 5 units and add the product to cart
3. Proceed to checkout
4. Select "Pickup" as the delivery method
5. Click on Location1 pickup point to view details/info
6. Observe the stock availability information displayed

**Expected Results**:
- Pickup location selector displays Location1 as available option
- Upon clicking Location1 info, stock information modal/section appears
- System displays message indicating full quantity (5 units) is available at Location1
- Availability status shows "In Stock" or "Available for Pickup"
- No transfer or wait time information is displayed
- Customer can proceed to complete the order with pickup at Location1

**Test Data**: 
- Product SKU: TEST-PROD-001
- Requested Quantity: 5 units
- Available Stock at Location1: 50 units
- Pickup Location: Location1

**Priority**: High

---

### Test Case 2: Verify Stock Transfer Information and ETA Display When Product Requires Internal Transfer
**Objective**: Verify that when a product needs to be transferred to the selected pickup location, the system displays transfer availability and ETA information

**Preconditions**:
- BOPIS functionality is enabled
- Multiple [fulfillment centers](https://docs.virtocommerce.org/platform/user-guide/fulfillment/) configured (Location1 - pickup point, Location2 - warehouse with stock)
- Product SKU "TEST-PROD-002" has 0 units at Location1 (selected pickup location)
- Product SKU "TEST-PROD-002" has 30 units at Location2 (transfer source)
- Internal transfer is enabled between Location2 and Location1
- Transfer ETA is configured as 2-3 business days
- Customer is logged in or browsing as guest

**Test Steps**:
1. Navigate to the product detail page for "TEST-PROD-002"
2. Select quantity as 3 units and add the product to cart
3. Proceed to checkout
4. Select "Pickup" as the delivery method
5. Click on Location1 pickup point info to view stock details
6. Review the stock availability and transfer information displayed

**Expected Results**:
- Location1 appears as available pickup option
- Stock information modal displays current stock status (0 units available immediately)
- System shows notification: "Available for transfer to this location"
- ETA for transfer is displayed (e.g., "Ready for pickup in 2-3 business days")
- Transfer availability indicator is clearly visible
- Customer can proceed to complete the order with understanding of pickup timeline

**Test Data**: 
- Product SKU: TEST-PROD-002
- Requested Quantity: 3 units
- Stock at Location1 (Pickup Point): 0 units
- Stock at Location2 (Warehouse): 30 units
- Transfer ETA: 2-3 business days

**Priority**: High

---

### Test Case 3: Verify Stock Information When Partial Quantity Available at Pickup Location
**Objective**: Verify system behavior when requested quantity is partially available at the pickup location and requires transfer for remaining items

**Preconditions**:
- BOPIS functionality is enabled
- Multiple fulfillment centers configured (Location1 - pickup point, Location2 - warehouse)
- Product SKU "TEST-PROD-003" has 5 units at Location1
- Product SKU "TEST-PROD-003" has 20 units at Location2
- Internal transfer is enabled between locations
- Transfer ETA is configured as 1-2 business days

**Test Steps**:
1. Navigate to the product detail page for "TEST-PROD-003"
2. Add 10 units to cart
3. Proceed to checkout and select "Pickup" delivery method
4. Click on Location1 pickup point info
5. Observe the stock availability breakdown displayed

**Expected Results**:
- Stock information shows split availability: "5 units available immediately, 5 units require transfer"
- Transfer ETA displayed for the additional 5 units (1-2 business days)
- Clear indication that full order quantity (10 units) can be fulfilled at this location
- Option to proceed with pickup at Location1 with combined availability understanding
- Alternative: System may suggest splitting the pickup or waiting for full transfer

**Test Data**: 
- Product SKU: TEST-PROD-003
- Requested Quantity: 10 units
- Stock at Location1: 5 units
- Stock at Location2: 20 units
- Transfer ETA: 1-2 business days

**Priority**: Medium

---

### Test Case 4: Verify Stock Information Not Available - Insufficient Inventory Across All Locations
**Objective**: Verify system correctly handles and displays information when requested quantity exceeds total available inventory across all locations

**Preconditions**:
- BOPIS functionality is enabled
- Multiple fulfillment centers configured (Location1, Location2, Location3)
- Product SKU "TEST-PROD-004" has total of 8 units across all locations:
  - Location1: 3 units
  - Location2: 5 units
  - Location3: 0 units
- Customer attempts to order 15 units

**Test Steps**:
1. Navigate to the product detail page for "TEST-PROD-004"
2. Attempt to add 15 units to cart
3. Proceed to checkout
4. Select "Pickup" as delivery method
5. Click on any available pickup location info
6. Review the stock availability information

**Expected Results**:
- System prevents adding 15 units to cart OR shows warning at checkout
- Pickup location info displays "Insufficient stock for requested quantity"
- Maximum available quantity is shown (8 units total)
- Clear message indicating the product cannot be fulfilled in requested quantity
- Suggested action: "Reduce quantity to 8 units or less" or "Check availability for lower quantities"
- No transfer ETA shown as transfer cannot fulfill the full request

**Test Data**: 
- Product SKU: TEST-PROD-004
- Requested Quantity: 15 units
- Total Available Stock: 8 units (distributed across locations)

**Priority**: High

---

### Test Case 5: Verify Stock Information Display for Multiple Pickup Locations Comparison
**Objective**: Verify that customer can view and compare stock availability information across multiple pickup locations to make informed decision

**Preconditions**:
- BOPIS functionality is enabled
- Three pickup locations configured in the same geographic area:
  - Location1: Full stock available (20 units of TEST-PROD-005)
  - Location2: Requires transfer (0 units local, transfer ETA 3 days)
  - Location3: Partial stock (3 units local, can transfer remaining)
- Product SKU "TEST-PROD-005" in cart with quantity of 5 units
- Customer is at checkout selecting pickup location

**Test Steps**:
1. Add 5 units of "TEST-PROD-005" to cart
2. Proceed to checkout
3. Select "Pickup" as delivery method
4. View available pickup locations (Location1, Location2, Location3)
5. Click on Location1 info icon/button to view stock details
6. Note the stock availability information
7. Click on Location2 info icon/button to view stock details
8. Note the stock availability and transfer information
9. Click on Location3 info icon/button to view stock details
10. Note the stock availability information
11. Compare information across all three locations

**Expected Results**:
- All three pickup locations are displayed as options
- Location1 info shows: "5 units available - Ready for immediate pickup"
- Location2 info shows: "Available via transfer - Ready in 3 business days" with ETA date
- Location3 info shows: "3 units available immediately, 2 units require transfer" with appropriate ETA
- Stock information is clearly differentiated for each location
- Customer can easily compare and select the most suitable pickup location
- The information is displayed consistently across all pickup locations (same format/layout)
- Stock information updates when user clicks between different location info sections

**Test Data**: 
- Product SKU: TEST-PROD-005
- Requested Quantity: 5 units
- Location1 Stock: 20 units (immediate)
- Location2 Stock: 0 units local, transfer available (3 days)
- Location3 Stock: 3 units local, 2 units via transfer

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Notes on Additional Test Scenarios
Due to the 5 test case limit, the following scenarios should also be considered for comprehensive testing:

**Additional Scenarios to Test**:
- Stock information refresh when inventory changes during user session
- Stock display when transfer is not available/disabled between locations
- Performance testing with multiple products in cart requiring different fulfillment sources
- Mobile responsiveness of stock information modal/popup
- Accessibility testing (screen readers, keyboard navigation for stock info)
- Stock information display for products with variants (size, color) with different availability
- Behavior when fulfillment center is temporarily disabled during checkout
- Stock reserve timeout scenarios (cart abandonment impact on displayed availability)

---

## Notes
- **Documentation References**: 
  - [Virtocommerce Fulfillment Centers](https://docs.virtocommerce.org/platform/user-guide/fulfillment/)
  - Inventory management and stock tracking features
  
- **Dependencies**: 
  - Inventory management system must be configured and synchronized
  - Transfer rules and ETAs must be configured in the backend
  - BOPIS module must be properly installed and configured
  
- **Story Status**: Note that this story is marked as "Cancelled" - verify if testing is still required or if requirements have changed

- **Testing Environment Requirements**:
  - Test environment with multiple fulfillment centers configured
  - Ability to manipulate inventory levels for testing purposes
  - Mock transfer times or ability to configure test ETAs

- **Integration Points**:
  - Inventory management system
  - Fulfillment/warehouse management system
  - Transfer/logistics system for ETA calculations
  - Frontend pickup location selector UI component