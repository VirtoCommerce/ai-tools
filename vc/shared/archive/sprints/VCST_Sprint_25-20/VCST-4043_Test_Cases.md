# Test Cases for VCST-4043: [E2E] [Intent Search] Apply Boosting Instead of Filters Based on Score Threshold

## User Story Details
- **Jira Key**: VCST-4043
- **Summary**: [E2E] [Intent Search] Apply Boosting Instead of Filters Based on Score Threshold
- **Priority**: Medium
- **Status**: To do
- **Created**: 10/1/2025

## Description
As a Search manager, I want the Intent Search Module to apply boosting instead of strict filtering when scores fall within a defined threshold, so that relevant results are not excluded but instead ranked higher, improving search accuracy and user experience.

---

## Test Cases

### Test Case 1: Verify Boosting is Applied When Scores Fall Within Defined Threshold
**Objective**: Validate that products with intent scores within the defined threshold receive boosting rather than being filtered out, and are ranked higher in search results.

**Preconditions**:
- Virto Commerce platform is installed and configured - https://docs.virtocommerce.org/platform/
- Search module is installed and configured - https://docs.virtocommerce.org/modules/search/
- Intent Search Module is installed and enabled
- Score threshold is configured (e.g., threshold range: 0.6 - 0.8)
- Test catalog with at least 20 products indexed in the search engine
- Products have varying intent scores (some below threshold, some within threshold, some above)
- User has Search Manager permissions

**Test Steps**:
1. Log in to Virto Commerce platform manager as Search Manager
2. Navigate to Search settings and verify the score threshold configuration (e.g., min: 0.6, max: 0.8)
3. Execute a search query that returns products with intent scores within the threshold range (0.6-0.8)
4. Record the order and ranking of products in search results
5. Verify that products with scores within threshold appear in results but ranked according to their boosted scores
6. Compare the ranking with products that have scores above the threshold
7. Verify that products with scores below the minimum threshold (< 0.6) are filtered out

**Expected Results**:
- Products with intent scores within the defined threshold (0.6-0.8) are NOT filtered out
- These products appear in search results with boosted ranking
- Products with higher intent scores within the threshold appear higher in results
- Products with scores below the minimum threshold are excluded from results
- Products with scores above the threshold appear at the top of results
- Boosting calculation is correctly applied to products within threshold range
- Search results metadata includes intent scores and boosting information

**Test Data**: 
- Products: "Red Shirt" (score: 0.75), "Blue Shirt" (score: 0.65), "Green Shirt" (score: 0.50), "Black Shirt" (score: 0.85)
- Search query: "comfortable shirt"
- Threshold: min 0.6, max 0.8

**Priority**: High

---

### Test Case 2: Verify Strict Filtering is Applied for Scores Below Minimum Threshold
**Objective**: Ensure that products with intent scores below the minimum threshold are strictly filtered out and do not appear in search results.

**Preconditions**:
- Virto Commerce platform is installed and configured - https://docs.virtocommerce.org/platform/
- Search module is installed and configured - https://docs.virtocommerce.org/modules/search/
- Intent Search Module is enabled
- Score threshold configured with minimum value (e.g., 0.6)
- Test catalog with products having scores below, within, and above threshold
- Search index is up to date

**Test Steps**:
1. Log in to Virto Commerce platform manager
2. Navigate to Search module configuration
3. Verify minimum threshold value is set (e.g., 0.6)
4. Create a search query that would match products with scores below minimum threshold
5. Execute the search query via storefront search interface
6. Analyze the returned search results
7. Verify pagination to ensure filtered products don't appear on subsequent pages
8. Check search analytics/logs to confirm filtering was applied

**Expected Results**:
- Products with intent scores below minimum threshold (< 0.6) are completely filtered out
- These products do not appear in any page of search results
- Total results count excludes filtered products
- Search logs show filtering was applied based on minimum threshold
- Only products meeting minimum threshold criteria are displayed
- No performance degradation due to filtering operation

**Test Data**:
- Products: "Item A" (score: 0.45), "Item B" (score: 0.55), "Item C" (score: 0.65), "Item D" (score: 0.75)
- Search query: "item"
- Minimum threshold: 0.6

**Priority**: High

---

### Test Case 3: Verify Correct Ranking Order with Mixed Score Ranges
**Objective**: Validate that search results are correctly ordered when products have scores across different ranges (below threshold, within threshold, above threshold).

**Preconditions**:
- Virto Commerce platform with Intent Search Module configured
- Search module operational - https://docs.virtocommerce.org/modules/search/
- Score threshold configured (min: 0.6, max: 0.8)
- Test catalog with 30+ products having diverse intent scores across all ranges
- Products are properly indexed
- Search criteria configured for relevance-based sorting

**Test Steps**:
1. Log in to the platform and navigate to storefront search
2. Execute a search query that returns products across all score ranges
3. Capture the complete list of search results with their positions
4. Extract intent scores for each product in results
5. Verify ranking order: products with scores > 0.8 appear first, then boosted products (0.6-0.8), filtered out (< 0.6)
6. Within the boosted range, verify products are ordered by their boosted score
7. Test with multiple different search queries to validate consistency
8. Verify the ranking remains consistent across page refreshes

**Expected Results**:
- Products with scores > 0.8 (above threshold) appear at the top of results
- Products with scores 0.6-0.8 (within threshold) appear after above-threshold products, ordered by boosted score
- Products with scores < 0.6 (below threshold) are excluded from results
- Within each group, products are correctly ordered by their calculated scores
- Boosting factor correctly influences ranking within threshold range
- Ranking is stable and reproducible across multiple query executions
- No products appear in incorrect ranking positions

**Test Data**:
- 10 products with scores > 0.8
- 15 products with scores between 0.6-0.8
- 10 products with scores < 0.6
- Search query: "premium quality products"

**Priority**: High

---

### Test Case 4: Verify Dynamic Threshold Configuration Changes Take Effect
**Objective**: Ensure that changes to score threshold configuration are immediately applied to search results without requiring system restart or reindexing.

**Preconditions**:
- Virto Commerce platform with admin access
- Intent Search Module installed and configured
- Initial threshold values set (min: 0.5, max: 0.7)
- Products already indexed with various intent scores
- Access to Search module configuration interface
- Test environment with sufficient permissions to modify settings

**Test Steps**:
1. Log in as administrator to Virto Commerce platform manager
2. Navigate to Intent Search Module configuration settings
3. Execute a baseline search query and record results with current threshold (0.5-0.7)
4. Note which products are boosted vs filtered with current settings
5. Modify the threshold values (e.g., change min to 0.6, max to 0.8)
6. Save the configuration changes
7. Execute the same search query again immediately after saving
8. Compare the new results with baseline results
9. Verify that products previously within threshold but now outside it are handled differently
10. Test with multiple threshold configuration changes to ensure consistency

**Expected Results**:
- Configuration changes are saved successfully
- New threshold values are immediately applied to search operations
- Products that were boosted under old threshold but fall outside new threshold are now filtered
- Products that now fall within new threshold receive boosting
- No system restart or manual reindexing is required
- Search results accurately reflect the new threshold configuration
- Configuration changes are persisted across sessions
- Audit log records the threshold configuration change

**Test Data**:
- Initial threshold: min 0.5, max 0.7
- New threshold: min 0.6, max 0.8
- Test products: "Product X" (score: 0.55), "Product Y" (score: 0.65), "Product Z" (score: 0.75)
- Search query: "test product"

**Priority**: Medium

---

### Test Case 5: Verify System Behavior When Threshold Values Are Invalid or at Boundary Conditions
**Objective**: Validate that the system handles edge cases and invalid threshold configurations appropriately without breaking search functionality.

**Preconditions**:
- Virto Commerce platform with Intent Search Module installed
- Admin access to configuration settings
- Test catalog with products indexed
- Search module operational - https://docs.virtocommerce.org/modules/search/

**Test Steps**:
1. Log in as administrator to platform manager
2. Navigate to Intent Search threshold configuration
3. **Test Scenario A - Equal min and max values**: Set minimum threshold = maximum threshold (e.g., both 0.7)
4. Execute search queries and observe behavior
5. **Test Scenario B - Inverted values**: Attempt to set minimum threshold > maximum threshold (e.g., min: 0.8, max: 0.6)
6. Verify validation error or system correction
7. **Test Scenario C - Boundary values**: Set minimum = 0.0 and maximum = 1.0
8. Execute search and verify all scored products are boosted
9. **Test Scenario D - Extreme values**: Attempt to set values outside 0-1 range (e.g., min: -0.5, max: 1.5)
10. Verify validation and error handling
11. **Test Scenario E - Null/empty values**: Remove or clear threshold values
12. Verify default behavior or validation error
13. Test search functionality after each configuration attempt

**Expected Results**:
- **Scenario A**: System accepts equal values; products with exactly that score are handled consistently (either all boosted or all filtered)
- **Scenario B**: System displays validation error preventing inverted threshold values, or automatically corrects them
- **Scenario C**: All products with any score > 0 receive boosting; search functions normally
- **Scenario D**: System validates input and rejects values outside valid range (0-1) with appropriate error message
- **Scenario E**: System either applies default threshold values or requires valid input before saving
- Search functionality continues to work correctly in all scenarios
- No system crashes or unhandled exceptions occur
- Appropriate user feedback is provided for invalid configurations
- Previous valid configuration is retained if invalid configuration is rejected

**Test Data**:
- Valid range: 0.0 to 1.0
- Test values: -0.5, 0.0, 0.5, 0.7, 1.0, 1.5
- Test products with scores: 0.0, 0.3, 0.5, 0.7, 0.9, 1.0

**Priority**: Medium

---

## Edge Cases and Negative Tests

**Note**: Edge cases have been incorporated into Test Case 5 above, covering boundary conditions, invalid configurations, and system behavior under stress conditions.

---

## Notes
- All tests should be executed against both Azure Search and Elasticsearch implementations to ensure consistency across different search providers supported by Virto Commerce
- Performance benchmarks should be established for boosting calculations to ensure no significant impact on search response times
- Consider testing with large product catalogs (10,000+ products) to validate performance at scale
- Verify that boosting behavior is logged appropriately for troubleshooting and analytics purposes
- Intent score calculation methodology may need to be documented separately as it impacts these test scenarios
- Related documentation: https://docs.virtocommerce.org/modules/search/
- Monitor search analytics to verify boosting effectiveness in production environments
- Consider A/B testing framework to measure user engagement with boosted vs filtered results