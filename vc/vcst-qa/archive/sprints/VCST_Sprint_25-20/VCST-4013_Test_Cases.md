# Test Cases for VCST-4013: Request New Permalink for Seo Entity

## User Story Details
- **Jira Key**: VCST-4013
- **Summary**: Request New Permalink for Seo Entity
- **Priority**: Medium
- **Status**: Cancelled
- **Created**: 9/25/2025

## Description
As a Frontend Developer, I want to request a new Permalink for Seo Entity, so that I can refresh url in the browser when the customer changes current language.

---

## Test Cases

### Test Case 1: Verify Permalink Update on Language Switch for Product SEO Entity
**Objective**: Verify that when a customer changes the language on a product page, a new permalink is requested and the browser URL is updated with the correct language-specific SEO URL.

**Preconditions**:
- Multi-language store is configured with at least 2 languages (e.g., English and Spanish) - https://docs.virtocommerce.org/platform/user-guide/configuration-settings/#languages
- Product with SEO information exists with permalinks defined for both languages - https://docs.virtocommerce.org/products/catalog/
- Customer is on the storefront product detail page
- SEO module is installed and configured - https://docs.virtocommerce.org/modules/

**Test Steps**:
1. Navigate to a product detail page with English language selected (e.g., `/products/sample-product-en`)
2. Verify the current URL displays the English permalink
3. Switch the language to Spanish using the language selector
4. Observe the browser URL after language change
5. Verify the page content is displayed in Spanish

**Expected Results**:
- The browser URL should automatically update to the Spanish permalink (e.g., `/productos/producto-ejemplo-es`)
- The URL change should happen without a full page reload (SPA behavior)
- The product content should display in Spanish language
- The page title and meta tags should update to Spanish SEO values
- Browser history should contain both URLs (back button should work correctly)

**Test Data**: 
- Product ID: TEST-PROD-001
- English Permalink: `/products/leather-wallet-black`
- Spanish Permalink: `/productos/billetera-cuero-negra`

**Priority**: High

---

### Test Case 2: Verify Permalink Request for Category SEO Entity on Language Change
**Objective**: Ensure that category pages request and update to the correct permalink when the language is changed.

**Preconditions**:
- Multi-language store is configured with at least 2 languages (English and French) - https://docs.virtocommerce.org/platform/user-guide/configuration-settings/#languages
- Category with SEO permalinks exists for both languages - https://docs.virtocommerce.org/products/catalog/
- Customer is browsing a category page
- SEO routes are properly configured

**Test Steps**:
1. Navigate to a category page in English (e.g., `/categories/electronics`)
2. Note the current URL and page content
3. Change language to French using the language switcher
4. Observe the URL transition in the browser address bar
5. Verify the category page content loads in French
6. Check that subcategories and product listings display French translations

**Expected Results**:
- Browser URL updates to French permalink (e.g., `/categories/electronique`)
- API call is made to request the new permalink for the category SEO entity
- Category name, description, and SEO metadata display in French
- URL structure remains consistent (same path depth and parameters)
- No 404 errors occur during language transition

**Test Data**:
- Category ID: CAT-ELEC-001
- English Permalink: `/categories/electronics`
- French Permalink: `/categories/electronique`

**Priority**: High

---

### Test Case 3: Verify Permalink Fallback When Language-Specific SEO URL is Not Available
**Objective**: Test the system behavior when requesting a permalink for a language that doesn't have a defined SEO URL for the entity.

**Preconditions**:
- Multi-language store is configured with 3 languages (English, German, Italian)
- Product exists with SEO permalink only for English and German
- Italian language is available but no Italian permalink is defined for the test product
- Customer is on the product page

**Test Steps**:
1. Navigate to the product page in English with permalink `/products/wireless-headphones`
2. Verify the page loads correctly
3. Switch language to German and verify URL updates to `/products/kabellose-kopfhorer`
4. Switch language to Italian (no permalink defined)
5. Observe the URL and page behavior
6. Verify the product content displays in Italian (if translations exist)

**Expected Results**:
- When switching to Italian, the system should fallback to a default URL pattern (e.g., using product ID or default language permalink)
- Possible fallback patterns: `/products/wireless-headphones?lang=it` or `/it/products/[product-id]`
- The page should still load successfully without errors
- Product content should display in Italian if translations exist, otherwise fallback to default language
- Console should not show 404 or server errors

**Test Data**:
- Product ID: PROD-WH-2024
- English Permalink: `/products/wireless-headphones`
- German Permalink: `/products/kabellose-kopfhorer`
- Italian Permalink: Not defined

**Priority**: Medium

---

### Test Case 4: Verify Permalink Request API Response Handling for Invalid SEO Entity
**Objective**: Test error handling when requesting a permalink for a non-existent or deleted SEO entity during language switch.

**Preconditions**:
- Multi-language store is configured
- Customer is on a product page
- Product has been deleted from the catalog but page is still cached/accessible
- Network tab in browser developer tools is open

**Test Steps**:
1. Navigate to a product page URL that references a deleted product
2. Attempt to change the language using language selector
3. Monitor the API request for new permalink in network tab
4. Observe the response status code and error messages
5. Check the browser URL and page display behavior
6. Verify error handling and user feedback

**Expected Results**:
- API request for permalink should return appropriate error code (404 or 410)
- Application should handle the error gracefully without crashing
- User should see appropriate error message (e.g., "Product not found")
- URL should either remain unchanged or redirect to a valid page (e.g., home page or 404 page)
- Error should be logged in browser console for debugging
- No unhandled promise rejections or JavaScript errors

**Test Data**:
- Deleted Product ID: PROD-DELETED-001
- Original URL: `/products/old-product-removed`

**Priority**: Medium

---

### Test Case 5: Verify Concurrent Permalink Requests During Rapid Language Switching
**Objective**: Test the system's behavior when a user rapidly switches between multiple languages, triggering multiple concurrent permalink requests.

**Preconditions**:
- Multi-language store with 4+ languages configured (English, Spanish, French, German)
- Product page with permalinks defined for all languages
- Customer is on the product detail page
- Browser network throttling set to "Fast 3G" to simulate realistic conditions

**Test Steps**:
1. Navigate to product page in English
2. Rapidly switch languages in quick succession: English → Spanish → French → German → English (within 2-3 seconds)
3. Monitor network requests in developer tools
4. Observe which permalink request completes and updates the URL
5. Verify the final page language matches the last selected language
6. Check for any race conditions or incorrect URL updates

**Expected Results**:
- Only the final language selection should determine the displayed content and URL
- Previous pending requests should be cancelled or ignored if still pending
- Final URL should match the last selected language (German in this case)
- No console errors related to race conditions or aborted requests
- Page content should be consistent with the URL language
- Request cancellation should be handled properly (AbortController or similar mechanism)
- UI should not flicker excessively between language switches

**Test Data**:
- Product ID: PROD-TEST-MULTI
- English: `/products/smartphone-case`
- Spanish: `/productos/funda-smartphone`
- French: `/produits/etui-smartphone`
- German: `/produkte/smartphone-huelle`

**Priority**: High

---

## Edge Cases and Negative Tests

### Already covered in Test Cases 3, 4, and 5 above

---

## Notes
- **SEO Considerations**: Ensure that language switches update canonical tags, hreflang tags, and meta descriptions appropriately
- **Browser History**: Test back/forward navigation after language switches to ensure proper history management
- **Performance**: Monitor API response times for permalink requests to ensure acceptable performance (<500ms recommended)
- **Cache Handling**: Verify that permalink responses are properly cached to reduce repeated requests
- **Dependencies**: This functionality depends on the SEO module and proper configuration of language-specific slugs for all entities
- **Related Documentation**: 
  - SEO management: https://docs.virtocommerce.org/modules/
  - Multi-language configuration: https://docs.virtocommerce.org/platform/user-guide/configuration-settings/
  - Catalog management: https://docs.virtocommerce.org/products/catalog/
- **Status Note**: Although this story is marked as Cancelled, these test cases provide comprehensive coverage for permalink language switching functionality if implementation is revisited