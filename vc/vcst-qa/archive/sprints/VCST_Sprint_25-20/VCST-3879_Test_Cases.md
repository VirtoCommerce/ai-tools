# Test Cases for VCST-3879: [E2E] [Intent Search] Category Detection

## User Story Details
- **Jira Key**: VCST-3879
- **Summary**: [E2E] [Intent Search] Category Detection
- **Priority**: High
- **Status**: Done
- **Created**: 9/8/2025

## Description
As a Customer using the search bar,
I want The search system to detect my intent and determine if a specific category is highly relevant to my search query,
So that I can be automatically navigated or suggested to the best-matching category page, improving my browsing experience and reducing the time to find products.

---

## Test Cases

### Test Case 1: Exact Category Name Match Detection
**Objective**: Verify that searching for an exact category name detects the intent and navigates/suggests the corresponding category page.

**Preconditions**:
- VirtoCommerce storefront is accessible and operational
- [Catalog module](https://docs.virtocommerce.org/modules/catalog/) is properly configured with categories
- Search functionality is enabled and configured in the store
- At least one test category exists (e.g., "Electronics", "Clothing", "Furniture")
- User is on the storefront home page or any page with search bar access

**Test Steps**:
1. Navigate to the storefront search bar
2. Enter an exact category name (e.g., "Electronics") in the search field
3. Press Enter or click the search button
4. Observe the search results page or navigation behavior

**Expected Results**:
- The system detects the category intent from the search query
- User is either automatically navigated to the "Electronics" category page OR the category is prominently suggested at the top of search results
- Category page displays all products belonging to that category
- The URL reflects the category path (e.g., `/electronics` or `/catalog/electronics`)
- Breadcrumb navigation shows the correct category hierarchy

**Test Data**: 
- Category Name: "Electronics"
- Alternative Categories: "Clothing", "Books", "Home & Garden"

**Priority**: High

---

### Test Case 2: Partial Category Name Match with High Relevance
**Objective**: Verify that searching with partial or synonymous terms related to a category correctly detects intent and suggests the relevant category.

**Preconditions**:
- VirtoCommerce storefront is accessible
- [Search module](https://docs.virtocommerce.org/modules/search/) is properly configured with intent detection capabilities
- Multiple categories exist in the catalog (e.g., "Mobile Phones", "Smartphones", "Cell Phones")
- User is logged in or browsing as guest on the storefront

**Test Steps**:
1. Navigate to the search bar on any storefront page
2. Enter a partial or synonymous term related to a category (e.g., "phones" when category is "Mobile Phones")
3. Submit the search query
4. Observe the search results and category suggestions

**Expected Results**:
- System recognizes "phones" as relevant to "Mobile Phones" category
- Category "Mobile Phones" is suggested prominently (top of results or as a highlighted suggestion)
- Search results may include products from the category
- A clear call-to-action or link to view the full category is displayed
- Relevance scoring prioritizes the category match appropriately

**Test Data**: 
- Search Query: "phones"
- Expected Category: "Mobile Phones" or "Cell Phones"
- Alternative Queries: "laptops" → "Computers", "shirts" → "Clothing"

**Priority**: High

---

### Test Case 3: Multi-Category Intent Detection with Disambiguation
**Objective**: Verify that when a search query could match multiple categories, the system provides appropriate suggestions without auto-navigation.

**Preconditions**:
- VirtoCommerce platform is running with search module enabled
- [Catalog structure](https://docs.virtocommerce.org/modules/catalog/) contains multiple related categories (e.g., "Men's Shoes", "Women's Shoes", "Kids' Shoes")
- Search index is up-to-date
- User is on the storefront

**Test Steps**:
1. Open the storefront and locate the search bar
2. Enter a generic search term that applies to multiple categories (e.g., "shoes")
3. Execute the search
4. Review the presented results and category suggestions

**Expected Results**:
- System detects multiple potential category matches
- All relevant category options are displayed as suggestions (e.g., "Men's Shoes", "Women's Shoes", "Kids' Shoes")
- User is NOT automatically navigated to a single category
- Category suggestions are clearly presented with distinguishing information
- User can click on any suggested category to navigate to it
- Search results may show products from all matching categories

**Test Data**: 
- Ambiguous Query: "shoes"
- Expected Categories: "Men's Shoes", "Women's Shoes", "Kids' Shoes"
- Alternative Queries: "accessories", "toys"

**Priority**: High

---

### Test Case 4: Product-Focused Query with No Strong Category Intent
**Objective**: Verify that specific product searches do not trigger category navigation when intent is clearly product-focused rather than category-focused.

**Preconditions**:
- VirtoCommerce storefront is operational
- Catalog contains specific products with detailed names (e.g., "iPhone 15 Pro Max 256GB")
- Search functionality is properly configured
- Both categories and products are indexed for search

**Test Steps**:
1. Navigate to the search bar
2. Enter a very specific product name or SKU (e.g., "iPhone 15 Pro Max 256GB Space Black")
3. Submit the search
4. Analyze the search results page layout and content

**Expected Results**:
- System correctly identifies the query as product-specific rather than category-focused
- User is shown product search results, not navigated to a category page
- The specific product(s) matching the query appear prominently in results
- Category breadcrumb may be shown for context, but primary focus is on products
- No automatic category page navigation occurs
- Product details are emphasized over category suggestions

**Test Data**: 
- Product-Specific Query: "iPhone 15 Pro Max 256GB Space Black"
- SKU Query: "SKU-12345-ABC"
- Expected Behavior: Product results display, no category auto-navigation

**Priority**: Medium

---

### Test Case 5: Non-Existent or Irrelevant Category Search (Negative Test)
**Objective**: Verify that searching for terms that don't match any category provides appropriate feedback without false category detection.

**Preconditions**:
- VirtoCommerce storefront is accessible
- Search module is configured and operational
- Catalog contains defined categories but does NOT include certain test categories
- Standard "no results" messaging is configured

**Test Steps**:
1. Access the storefront search functionality
2. Enter a search term that doesn't correspond to any existing category or product (e.g., "xyzabc123nonexistent")
3. Execute the search
4. Observe the response and messaging

**Expected Results**:
- System does not falsely detect a category match
- No category page navigation or suggestion occurs
- Appropriate "no results found" or similar message is displayed
- Alternative search suggestions may be provided (e.g., "Did you mean...", popular categories)
- Search experience gracefully handles the negative case
- No system errors or broken pages are displayed
- User is given options to refine search or browse categories manually

**Test Data**: 
- Invalid Query: "xyzabc123nonexistent"
- Misspelled Query: "elektronics" (if "Electronics" exists)
- Nonsensical Query: "qwerty12345"

**Priority**: Medium

---

## Edge Cases and Negative Tests

**Note**: Edge cases are incorporated into Test Cases 3, 4, and 5 above, covering:
- Multi-category ambiguity (Test Case 3)
- Product vs. Category intent differentiation (Test Case 4)
- Invalid/non-existent category searches (Test Case 5)

---

## Notes
- Test cases assume that the search module supports intent detection and category matching capabilities
- Performance testing for category detection response time should be conducted separately
- Verify that category detection works across different languages if multi-language support is enabled
- Consider testing with special characters, numbers, and mixed case in category names
- Integration testing should verify proper communication between the Search module and Catalog module
- Related documentation: [VirtoCommerce Search Module](https://docs.virtocommerce.org/modules/search/) and [Catalog Module](https://docs.virtocommerce.org/modules/catalog/)
- Dependencies: Search indexing must be properly configured and up-to-date for accurate category detection
- Regression testing recommended after any updates to search algorithms or catalog structure