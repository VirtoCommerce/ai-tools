# Test Cases for VCST-3967: [PDP] Rename product sections for better UX

## User Story Details
- **Jira Key**: VCST-3967
- **Summary**: [PDP] Rename product sections for better UX
- **Priority**: High
- **Status**: Done
- **Created**: 9/19/2025

## Description
There is some difference in logic, BUT I FORGOT! It brings a lot of confusion in each demo.
Moreover the section "Products related to this item" remains the same on each PDP that I open. Is this a right thing?
Rename:
- Related products → Products related to this item
- Products related to this item → Recommended for you

---

## Test Cases

### Test Case 1: Verify "Products related to this item" section displays with correct renamed label on PDP
**Objective**: Verify that the section previously labeled "Related products" now displays as "Products related to this item" on the Product Detail Page

**Preconditions**:
- User has access to the storefront
- At least one product exists with related products configured via [product associations](https://docs.virtocommerce.org/products/catalog/)
- Related products have been added to the main product in the catalog

**Test Steps**:
1. Navigate to the storefront URL
2. Browse to any Product Detail Page (PDP) that has related products configured
3. Scroll down to the product recommendation sections area
4. Locate the section that previously displayed "Related products"
5. Verify the section heading text

**Expected Results**:
- The section heading displays "Products related to this item" instead of "Related products"
- The section contains products that are directly related/associated with the current product
- The section is visible and properly formatted
- Products within this section are relevant to the main product being viewed

**Test Data**: 
- Product SKU: Any product with configured related products associations
- Example: Electronics category products with accessories

**Priority**: High

---

### Test Case 2: Verify "Recommended for you" section displays with correct renamed label on PDP
**Objective**: Verify that the section previously labeled "Products related to this item" now displays as "Recommended for you" on the Product Detail Page

**Preconditions**:
- User has access to the storefront
- Recommendation engine or product recommendation logic is configured in [VirtoCommerce platform](https://docs.virtocommerce.org/)
- Products have recommendation data available

**Test Steps**:
1. Navigate to the storefront URL
2. Open any Product Detail Page (PDP)
3. Scroll through the page to locate all product recommendation sections
4. Find the section that was previously labeled "Products related to this item"
5. Read and verify the section heading

**Expected Results**:
- The section heading displays "Recommended for you" instead of "Products related to this item"
- The section contains personalized or algorithm-based product recommendations
- The section is clearly distinguishable from the "Products related to this item" section
- Recommended products may vary based on user behavior, browsing history, or recommendation algorithm

**Test Data**: 
- Product SKU: Any product SKU from the catalog
- User session: Both authenticated and guest users

**Priority**: High

---

### Test Case 3: Verify both renamed sections display simultaneously on same PDP with distinct content
**Objective**: Confirm that both "Products related to this item" and "Recommended for you" sections appear on the same PDP without confusion and contain different products

**Preconditions**:
- User has access to the storefront
- Product has both related products associations and recommendation data configured
- Test product exists with sufficient related and recommended products to populate both sections

**Test Steps**:
1. Navigate to the storefront
2. Identify and open a PDP that should display both sections (e.g., popular product with associations and recommendations)
3. Scroll through the entire product detail page
4. Document the presence and position of "Products related to this item" section
5. Document the presence and position of "Recommended for you" section
6. Compare the products displayed in each section
7. Verify the visual distinction between both sections

**Expected Results**:
- Both sections are visible on the same PDP
- "Products related to this item" section displays products with direct associations to the current product
- "Recommended for you" section displays personalized or algorithmic recommendations
- The two sections contain different sets of products (no duplicate products across sections)
- Each section has clear, distinct heading labels
- Sections are visually separated and easy to distinguish
- The renamed labels reduce confusion compared to the previous naming convention

**Test Data**: 
- Product: High-traffic product with both associations and recommendations
- Example: Laptop product with related accessories and personalized recommendations

**Priority**: High

---

### Test Case 4: Verify section label consistency across multiple PDPs in different categories
**Objective**: Ensure that the renamed section labels are consistently applied across all Product Detail Pages regardless of product category or type

**Preconditions**:
- User has access to the storefront
- Multiple products exist across different [categories](https://docs.virtocommerce.org/products/catalog/) (e.g., Electronics, Clothing, Books, etc.)
- Products have related products and/or recommendations configured

**Test Steps**:
1. Navigate to the storefront
2. Open a PDP from the Electronics category
3. Note the section labels for product recommendations
4. Navigate to a PDP from the Clothing category
5. Note the section labels for product recommendations
6. Navigate to a PDP from the Books category
7. Note the section labels for product recommendations
8. Navigate to at least 2 more PDPs from different categories
9. Compare all documented section labels across different categories

**Expected Results**:
- "Products related to this item" label is consistently displayed across all PDPs in all categories
- "Recommended for you" label is consistently displayed across all PDPs in all categories
- No instances of old labels ("Related products" or old "Products related to this item") appear on any PDP
- Label formatting, styling, and positioning remain consistent across different product types
- The renaming is applied site-wide without category-specific variations

**Test Data**: 
- Categories to test: Electronics, Clothing, Books, Home & Garden, Sports
- At least 5 different product SKUs across different categories

**Priority**: Medium

---

### Test Case 5: Verify "Products related to this item" section displays consistent products for the same PDP across multiple sessions
**Objective**: Validate that the "Products related to this item" section shows the same products when viewing the same PDP multiple times, as mentioned in the user story concern

**Preconditions**:
- User has access to the storefront
- A specific product with configured related product associations exists
- User can access the same product multiple times

**Test Steps**:
1. Navigate to the storefront
2. Open a specific Product Detail Page (document the Product SKU)
3. Scroll to the "Products related to this item" section
4. Take a screenshot and document all products displayed in this section (SKUs, names, and order)
5. Navigate away from the PDP or close the browser
6. Clear browser cache and cookies (or use incognito/private browsing mode)
7. Navigate back to the same Product Detail Page (same SKU as step 2)
8. Scroll to the "Products related to this item" section
9. Document all products displayed in this section
10. Compare the products from step 4 and step 9

**Expected Results**:
- "Products related to this item" section displays the same products in both sessions (consistent behavior)
- The order of products may remain consistent or follow defined sorting logic
- Products shown are based on admin-configured associations, not personalization
- This behavior is expected and correct as per business logic (addressing the user story concern: "Moreover the section 'Products related to this item' remains the same on each PDP that I open. Is this a right thing?")
- The section demonstrates stability and reliability for related product associations
- Unlike "Recommended for you" section which may vary, this section shows consistent, curated relationships

**Test Data**: 
- Specific Product SKU: Choose a product with 4-6 related products configured
- Test in multiple browsers: Chrome, Firefox, Safari
- Test with different user states: Guest user, Authenticated user

**Priority**: High

---

## Edge Cases and Negative Tests

**Note**: Due to the constraint of maximum 5 test cases, edge cases are documented here for reference but not expanded into full test cases:

- **Missing Sections**: Verify behavior when a product has no related products or recommendations configured (sections should not display or show appropriate messaging)
- **Mobile Responsiveness**: Verify renamed sections display correctly on mobile devices and tablets
- **Localization**: If applicable, verify section labels are properly translated in multi-language storefronts
- **Performance**: Verify page load times are not affected by the renamed sections

---

## Notes
- The user story addresses a UX confusion issue where the previous naming convention was unclear
- The renamed sections clarify the distinction between curated associations ("Products related to this item") and algorithmic/personalized recommendations ("Recommended for you")
- "Products related to this item" should show consistent, admin-curated products across sessions - this is expected behavior
- "Recommended for you" may show variable products based on user behavior and recommendation algorithms
- Testing should verify that the renaming is applied consistently across the entire storefront
- No functional changes are expected beyond the label renaming - existing product association and recommendation logic should remain unchanged
- Documentation reference: [VirtoCommerce Catalog Management](https://docs.virtocommerce.org/products/catalog/)
- Consider regression testing to ensure existing product association functionality was not impacted