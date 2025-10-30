# Test Cases for VCST-3927: [E2E] Improve performance of Add to Cart Operations on Category and Product Pages

## User Story Details
- **Jira Key**: VCST-3927
- **Summary**: [E2E] Improve performance of Add to Cart Operations on Category and Product Pages
- **Priority**: Medium
- **Status**: Cancelled
- **Created**: 9/11/2025

## Description
The following steps should help improve the performance of cart operations to be less than 300ms on Virto Start:

**X-Cart**
- The cart validation should be skipped if the Cart operation doesn't query validationErrors, it should improve the performance of the cart operation for the client project as well

**Frontend**
- mutation AddItem and ChangeQuantity should query id, itemsQuantity only

---

## Test Cases

### Test Case 1: Verify Add to Cart Performance from Product Page Without Validation Errors Query
**Objective**: Validate that adding a product to cart from the product page completes in less than 300ms when validationErrors are not queried in the GraphQL mutation

**Preconditions**:
- Virto Start storefront is deployed and accessible
- User is on a product details page with available inventory
- Browser developer tools or performance monitoring tool is ready to measure response time
- Cart is empty or in a known state
- Reference: [Shopping Cart documentation](https://docs.virtocommerce.org/platform/user-guide/cart/)

**Test Steps**:
1. Open browser developer tools and navigate to Network tab
2. Navigate to any product details page (e.g., `/product/sample-product`)
3. Click "Add to Cart" button
4. Monitor the GraphQL mutation request for `addItem` in Network tab
5. Verify the mutation query payload only includes `id` and `itemsQuantity` fields
6. Record the response time of the cart operation
7. Verify cart badge/counter updates with correct quantity

**Expected Results**:
- AddItem GraphQL mutation completes in less than 300ms
- Mutation query only requests `id` and `itemsQuantity` fields (no validationErrors field)
- Cart validation is skipped on backend
- Product is successfully added to cart
- Cart items count updates correctly in the UI
- No console errors are displayed

**Test Data**: 
- Product SKU: Any available product with stock
- Quantity: 1

**Priority**: High

---

### Test Case 2: Verify Change Quantity Performance in Cart Without Validation Errors Query
**Objective**: Validate that changing product quantity in the cart completes in less than 300ms when validationErrors are not queried

**Preconditions**:
- Virto Start storefront is deployed and accessible
- User has at least one product in the cart
- Browser developer tools are ready to measure performance
- Reference: [Cart API documentation](https://docs.virtocommerce.org/platform/developer-guide/GraphQL-Storefront-API-Reference-xAPI/Cart/)

**Test Steps**:
1. Open browser developer tools and navigate to Network tab
2. Navigate to cart page
3. Locate quantity input field for any cart item
4. Change the quantity value (e.g., from 1 to 3)
5. Monitor the GraphQL mutation request for `changeQuantity` in Network tab
6. Verify the mutation query payload only includes `id` and `itemsQuantity` fields
7. Record the response time of the cart operation
8. Verify the cart updates with new quantity and recalculated totals

**Expected Results**:
- ChangeQuantity GraphQL mutation completes in less than 300ms
- Mutation query only requests `id` and `itemsQuantity` fields (no validationErrors field)
- Cart validation is skipped on backend
- Cart item quantity updates successfully
- Cart totals recalculate correctly
- itemsQuantity reflects the total number of items in cart
- No performance degradation or UI freezing occurs

**Test Data**: 
- Initial quantity: 1
- Updated quantity: 3
- Product: Any product already in cart

**Priority**: High

---

### Test Case 3: Verify Bulk Add to Cart Performance from Category Page
**Objective**: Validate that adding multiple products to cart from category page maintains performance under 300ms per operation

**Preconditions**:
- Virto Start storefront is deployed and accessible
- User is on a category page with multiple products displayed
- Cart is empty
- Browser performance monitoring is enabled
- Reference: [Catalog documentation](https://docs.virtocommerce.org/platform/user-guide/catalog/)

**Test Steps**:
1. Open browser developer tools and navigate to Network tab
2. Navigate to a category page with multiple products (e.g., `/category/electronics`)
3. Quickly add 5 different products to cart using "Add to Cart" buttons
4. Monitor all GraphQL `addItem` mutation requests in Network tab
5. Verify each mutation query only includes `id` and `itemsQuantity` fields
6. Record the response time for each cart operation
7. Calculate average response time across all operations
8. Verify final cart state shows all 5 products with correct quantities

**Expected Results**:
- Each AddItem GraphQL mutation completes in less than 300ms
- Average response time across all operations is less than 300ms
- All mutations query only `id` and `itemsQuantity` fields
- Cart validation is skipped for each operation
- All 5 products are successfully added to cart
- itemsQuantity correctly reflects total of 5 items
- UI remains responsive during multiple add operations
- No race conditions or cart state inconsistencies occur

**Test Data**: 
- Category: Any category with 5+ products
- Products: 5 different products with available inventory
- Quantity per product: 1

**Priority**: High

---

### Test Case 4: Verify Performance Optimization Does Not Break Cart Validation When Explicitly Requested
**Objective**: Ensure that cart validation still executes correctly when validationErrors are explicitly queried in the mutation

**Preconditions**:
- Virto Start storefront is deployed and accessible
- Test environment allows custom GraphQL queries
- Product with inventory restrictions (e.g., max quantity limit) is available
- Reference: [Cart validation documentation](https://docs.virtocommerce.org/platform/developer-guide/GraphQL-Storefront-API-Reference-xAPI/Cart/)

**Test Steps**:
1. Open GraphQL playground or API client (e.g., Postman)
2. Construct an AddItem mutation that explicitly includes `validationErrors` field in the query:
   ```
   mutation {
     addItem(input: {...}) {
       id
       itemsQuantity
       validationErrors {
         errorCode
         errorMessage
       }
     }
   }
   ```
3. Attempt to add a product quantity that exceeds inventory or business rules
4. Execute the mutation and measure response time
5. Verify validation errors are returned in the response
6. Repeat with a valid quantity and verify success response

**Expected Results**:
- When validationErrors are queried, cart validation executes properly
- Validation errors are returned when business rules are violated
- Response time may be higher than 300ms (validation overhead is acceptable)
- When validationErrors are NOT queried, validation is skipped and performance is <300ms
- Cart state remains consistent regardless of validation mode
- Error messages are clear and descriptive when validation fails

**Test Data**: 
- Product with max quantity limit: 10 units
- Test quantity exceeding limit: 15 units
- Valid quantity: 5 units

**Priority**: Medium

---

### Test Case 5: Verify Performance Under Concurrent Cart Operations
**Objective**: Validate that cart operation performance remains under 300ms even with concurrent add/update requests from multiple browser tabs or users

**Preconditions**:
- Virto Start storefront is deployed and accessible
- Same user session is opened in 2-3 browser tabs
- Performance testing tool or manual coordination is prepared
- Reference: [Platform scalability documentation](https://docs.virtocommerce.org/platform/developer-guide/)

**Test Steps**:
1. Open 3 browser tabs with the same user session logged in
2. Navigate each tab to different product pages
3. Open browser developer tools in each tab (Network tab)
4. Simultaneously (within 1-2 seconds) click "Add to Cart" in all 3 tabs
5. Monitor GraphQL mutation requests and response times in each tab
6. Verify each mutation only queries `id` and `itemsQuantity`
7. Record response times for all operations
8. Navigate to cart page and verify all 3 products are present with correct quantities
9. Verify itemsQuantity reflects the total of all items (3)

**Expected Results**:
- Each AddItem mutation completes in less than 300ms despite concurrent requests
- All mutations query only `id` and `itemsQuantity` fields
- No cart validation overhead occurs
- All 3 products are successfully added to cart without data loss
- Cart state is consistent across all browser tabs after operations complete
- itemsQuantity accurately reflects total items (3)
- No race conditions or cart corruption occurs
- No 500 errors or timeout errors occur

**Test Data**: 
- 3 different products from different categories
- Quantity: 1 each
- Concurrent operations: 3 simultaneous add-to-cart actions

**Priority**: Medium

---

## Notes
- **Performance Measurement**: All response time measurements should be taken from the GraphQL mutation request/response cycle, excluding network latency where possible (use server-side timing headers if available)
- **Baseline Comparison**: Document current performance metrics before optimization for comparison
- **Browser Compatibility**: Performance tests should be validated across Chrome, Firefox, and Safari
- **Related Documentation**: 
  - [GraphQL Storefront API Reference](https://docs.virtocommerce.org/platform/developer-guide/GraphQL-Storefront-API-Reference-xAPI/)
  - [Shopping Cart Module](https://docs.virtocommerce.org/modules/cart/)
- **Dependencies**: This optimization requires backend changes to conditionally skip validation and frontend changes to minimize queried fields
- **Rollback Plan**: If performance optimization causes cart inconsistencies, feature should be able to be disabled via configuration
- **Monitoring**: Production deployment should include APM monitoring for cart operation performance metrics
- **Status Note**: This story is marked as **Cancelled** - verify with product owner if testing is still required before execution

---

## Additional Testing Considerations

### Performance Regression Testing
- After deployment, establish baseline performance metrics for cart operations
- Set up automated performance monitoring alerts if operations exceed 300ms threshold
- Include cart operation performance in regular regression test suite

### Load Testing Recommendations
- Conduct load testing with 100+ concurrent users performing cart operations
- Validate that optimization maintains performance under high traffic conditions
- Test during peak shopping periods if possible