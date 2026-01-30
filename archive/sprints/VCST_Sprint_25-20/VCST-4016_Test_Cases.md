# Test Cases for VCST-4016: Make Event based indexing enabled by default

## User Story Details
- **Jira Key**: VCST-4016
- **Summary**: Make Event based indexing enabled by default
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/26/2025

## Description
This user story ensures that event-based indexing is enabled by default in Virto Commerce, allowing automatic index updates when catalog changes occur without requiring manual index rebuilding.

---

## Test Cases

### Test Case 1: Verify Event-based Indexing is Enabled by Default on Fresh Installation
**Objective**: Confirm that event-based indexing is enabled by default in a new Virto Commerce installation without any manual configuration.

**Preconditions**:
- Fresh installation of Virto Commerce platform (https://docs.virtocommerce.org/platform/developer-guide/deploy-from-precompiled-binaries/)
- Access to the admin panel
- Search module is installed (https://docs.virtocommerce.org/modules/search/)

**Test Steps**:
1. Complete a fresh installation of Virto Commerce platform
2. Navigate to Settings → Search in the admin panel
3. Locate the "Event based indexing" configuration setting
4. Verify the current value/status of event-based indexing
5. Check the appsettings.json file for Search:EventBasedIndexation configuration

**Expected Results**:
- Event-based indexing setting should be enabled (true) by default
- No manual configuration should be required to enable the feature
- The configuration value in appsettings.json should show event-based indexing as enabled
- The admin UI should display event-based indexing as active/enabled

**Test Data**: N/A

**Priority**: High

---

### Test Case 2: Verify Automatic Index Update on Product Creation
**Objective**: Validate that creating a new product automatically triggers index update without manual rebuild when event-based indexing is enabled.

**Preconditions**:
- Virto Commerce platform is installed and configured (https://docs.virtocommerce.org/platform/)
- Event-based indexing is enabled (default state)
- Catalog module is installed (https://docs.virtocommerce.org/modules/catalog/)
- At least one catalog exists
- Search provider (Elasticsearch or Azure Search) is configured (https://docs.virtocommerce.org/modules/search/)

**Test Steps**:
1. Navigate to Catalog → Products in the admin panel
2. Create a new product with unique name, SKU, and description
3. Save the product
4. Wait 5-10 seconds for index synchronization
5. Navigate to the storefront search functionality
6. Search for the newly created product using its name or SKU
7. Verify the search results without manually rebuilding the index

**Expected Results**:
- The newly created product should appear in search results automatically
- No manual index rebuild should be required
- Product should be searchable within a reasonable time frame (seconds, not minutes)
- Search results should include all product details correctly

**Test Data**: 
- Product Name: "Test Product Auto Index 001"
- SKU: "TEST-AUTO-001"
- Description: "Testing automatic indexing feature"

**Priority**: High

---

### Test Case 3: Verify Automatic Index Update on Product Update
**Objective**: Ensure that updating existing product properties automatically updates the search index when event-based indexing is enabled.

**Preconditions**:
- Virto Commerce platform is running
- Event-based indexing is enabled (default state)
- At least one product exists in the catalog (https://docs.virtocommerce.org/modules/catalog/)
- Search index is up to date

**Test Steps**:
1. Navigate to Catalog → Products in the admin panel
2. Select an existing product
3. Modify the product name, description, or price
4. Save the changes
5. Wait 5-10 seconds for index synchronization
6. Navigate to the storefront search
7. Search for the product using the updated information
8. Verify that the updated information appears in search results
9. Confirm old information is no longer returned in search results

**Expected Results**:
- Updated product information should be reflected in search results automatically
- Old product information should not appear in search results
- No manual index rebuild should be necessary
- Changes should propagate to the index within seconds

**Test Data**:
- Original Product Name: "Sample Product"
- Updated Product Name: "Updated Sample Product - Event Test"

**Priority**: High

---

### Test Case 4: Verify Automatic Index Update on Product Deletion
**Objective**: Validate that deleting a product automatically removes it from the search index when event-based indexing is enabled.

**Preconditions**:
- Virto Commerce platform is operational
- Event-based indexing is enabled (default state)
- At least one test product exists and is indexed (https://docs.virtocommerce.org/modules/catalog/)
- Product is currently searchable in the storefront

**Test Steps**:
1. Navigate to the storefront search and verify the test product is searchable
2. Note the product name/SKU for verification
3. Navigate to Catalog → Products in the admin panel
4. Locate and delete the test product
5. Confirm the deletion
6. Wait 5-10 seconds for index synchronization
7. Return to the storefront search
8. Search for the deleted product using its previous name/SKU
9. Verify the search results

**Expected Results**:
- Deleted product should not appear in search results
- No manual index rebuild should be required
- Product removal should be reflected in the index automatically within seconds
- Search should return no results or exclude the deleted product

**Test Data**:
- Test Product Name: "Product To Delete 001"
- Test SKU: "DELETE-TEST-001"

**Priority**: High

---

### Test Case 5: Verify Event-based Indexing Behavior After Platform Upgrade
**Objective**: Ensure that event-based indexing remains enabled by default after upgrading from a previous version where it may have been disabled by default.

**Preconditions**:
- Previous version of Virto Commerce platform is installed
- Access to platform configuration files
- Ability to perform platform upgrade (https://docs.virtocommerce.org/platform/developer-guide/deploy-from-precompiled-binaries/)
- Documentation on upgrade procedures available

**Test Steps**:
1. Document the current event-based indexing setting before upgrade
2. Perform platform upgrade to the version with event-based indexing enabled by default
3. After upgrade completion, navigate to Settings → Search
4. Check the event-based indexing configuration status
5. Review appsettings.json for Search:EventBasedIndexation value
6. Create a new product to test automatic indexing functionality
7. Verify the product appears in search without manual rebuild

**Expected Results**:
- Event-based indexing should be enabled after upgrade (if previously disabled, it should be auto-enabled)
- If custom configuration explicitly disabled it, that setting should be respected
- Default behavior should enable event-based indexing for standard upgrades
- Automatic indexing should function correctly post-upgrade
- No data loss or index corruption should occur

**Test Data**: N/A (depends on upgrade scenario)

**Priority**: Medium

---

## Edge Cases and Negative Tests

**Note**: As per the requirement to not generate more than 5 test cases, edge cases are documented here for reference but not expanded into full test cases. These should be considered for additional test coverage:

- **Bulk Operations**: Test event-based indexing with bulk product import/update/delete operations
- **Performance Under Load**: Verify indexing performance when multiple products are created/updated simultaneously
- **Network Interruption**: Test behavior when connection to search provider is temporarily lost during indexing events
- **Configuration Override**: Verify that explicit configuration to disable event-based indexing still works if needed
- **Multiple Catalogs**: Test indexing behavior across multiple catalogs with concurrent changes

---

## Notes
- Event-based indexing improves user experience by eliminating the need for manual index rebuilds after catalog changes
- Monitor search provider performance and resource usage with event-based indexing enabled
- Ensure search provider (Elasticsearch/Azure Search) is properly configured and healthy for optimal performance (https://docs.virtocommerce.org/modules/search/)
- Consider testing with different search providers to ensure consistent behavior
- Verify that background jobs related to indexing are properly configured
- Related documentation: https://docs.virtocommerce.org/modules/search/