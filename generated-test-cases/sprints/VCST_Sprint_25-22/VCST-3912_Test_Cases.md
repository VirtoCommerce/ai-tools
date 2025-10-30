# Test Cases for VCST-3912: [Support] #38981 - Price restriction on order,catalog, pricing modules

## User Story Details
[As provided in the prompt]

---

## Test Cases

### Test Case 1: Verify Direct Distributor Price Visibility in Catalog
**Objective**: Verify that OpCo administrators can view prices for direct distributors in the catalog

**Preconditions**:
- OpCo administrator account is set up
- Both direct and indirect distributors exist in the system
- Catalog items have prices assigned for both distributor types

**Test Steps**:
1. Log in as OpCo administrator
2. Navigate to the catalog section
3. Select a direct distributor from the list
4. View catalog items and their prices
5. Switch to an indirect distributor view

**Expected Results**:
- Prices are visible for direct distributor catalog items
- Prices are hidden/masked for indirect distributor catalog items
- No error messages are displayed

**Test Data**:
- Direct Distributor ID: DD001
- Indirect Distributor ID: ID001
- Sample Product SKUs: SKU001, SKU002

**Priority**: High

---

### Test Case 2: Verify Order Price Visibility Restrictions
**Objective**: Confirm that OpCo administrators can only see prices in orders from direct distributors

**Preconditions**:
- Existing orders from both direct and indirect distributors
- OpCo administrator access rights
- Orders contain multiple line items

**Test Steps**:
1. Log in as OpCo administrator
2. Navigate to Orders section
3. View order details from a direct distributor
4. View order details from an indirect distributor
5. Attempt to export both order types

**Expected Results**:
- Direct distributor order prices are visible
- Indirect distributor order prices are hidden/masked
- Export functionality respects visibility rules
- Order totals maintain consistency

**Test Data**:
- Direct Distributor Order #: DO12345
- Indirect Distributor Order #: IO12345

**Priority**: High

---

### Test Case 3: Export Functionality Price Restrictions
**Objective**: Verify that exported data maintains price visibility restrictions

**Preconditions**:
- Export functionality is enabled
- Multiple data types available for export
- Existing data for both distributor types

**Test Steps**:
1. Log in as OpCo administrator
2. Navigate to export functionality
3. Export catalog data
4. Export order data
5. Export pricing data
6. Verify exported files

**Expected Results**:
- Exported files only show prices for direct distributors
- Indirect distributor prices are properly masked/hidden
- Export format maintains data integrity
- All other non-price data is correctly exported

**Test Data**:
- Export file formats: CSV, Excel
- Date range: Last 30 days

**Priority**: High

---

### Test Case 4: Price Visibility During Bulk Operations
**Objective**: Test price visibility rules during bulk operations

**Preconditions**:
- Multiple orders/catalog items exist
- Bulk operation functionality is available

**Test Steps**:
1. Log in as OpCo administrator
2. Select multiple orders/items including both distributor types
3. Perform bulk export
4. Perform bulk view operation
5. Check price visibility in results

**Expected Results**:
- Bulk operations maintain price visibility rules
- No performance degradation
- Proper error handling for mixed selections

**Test Data**:
- Bulk selection size: 100+ items
- Mixed distributor types

**Priority**: Medium

---

### Test Case 5: Edge Case - Distributor Type Change
**Objective**: Verify price visibility behavior when distributor type changes

**Preconditions**:
- Distributor with existing orders and catalog items
- Administrator rights to change distributor type

**Test Steps**:
1. Log in as system administrator
2. Change distributor type from direct to indirect
3. Verify price visibility in existing orders
4. Verify price visibility in catalog
5. Create new orders

**Expected Results**:
- Price visibility updates immediately
- Historical data maintains appropriate visibility
- New transactions follow new visibility rules

**Test Data**:
- Distributor ID: DD002
- Transition timestamp

**Priority**: Medium

---

### Test Case 6: Negative Test - Invalid Access Attempts
**Objective**: Verify system prevents unauthorized price visibility

**Preconditions**:
- Various user role types configured
- Test accounts for each role

**Test Steps**:
1. Attempt to access prices using non-OpCo admin accounts
2. Try to modify price visibility settings
3. Attempt to bypass restrictions via API
4. Check direct URL access to price data

**Expected Results**:
- Appropriate error messages displayed
- Access denied to unauthorized users
- Security logs show attempt records
- No price data leaked

**Test Data**:
- Various user role credentials
- Invalid access attempts

**Priority**: High

---

## Notes
- All tests should be executed in both UAT and Production environments
- Price visibility rules should be consistent across all modules
- Consider performance impact of visibility rules on large data sets
- Integration with existing security framework needs verification
- Document any specific handling for legacy data

Dependencies:
- Security module implementation
- User role configuration
- Export functionality updates