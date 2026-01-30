# Test Cases for VCST-3856: Remove language code from sitemap root files

## User Story Details
[As provided in the original request]

## Description
[As provided in the original request]

---

## Test Cases

### Test Case 1: Verify Sitemap Root Files Structure without Language Code
**Objective**: Verify that the sitemap root files are generated without language code in the URL path

**Preconditions**:
- Store is properly configured in VC Platform ([Store Management documentation](https://docs.virtocommerce.org/user_guide/stores/store-management/))
- SEO settings are configured ([SEO documentation](https://docs.virtocommerce.org/user_guide/marketing/seo/))
- Multiple languages are configured for the store
- Store has products in different categories (fences, access, accessory)

**Test Steps**:
1. Access the store's root sitemap file
2. Verify the XML structure
3. Check all sitemap URLs in the sitemapindex
4. Validate XML against sitemap schema

**Expected Results**:
- All sitemap URLs should NOT contain language code (e.g., "nl-BE")
- URLs should follow pattern: https://[domain]/sitemap/[category].xml
- XML should be well-formed and valid

**Priority**: High

---

### Test Case 2: Verify Multi-Language Store Sitemap Generation
**Objective**: Ensure correct sitemap generation for stores with multiple languages

**Preconditions**:
- Store has multiple languages configured ([Multilingual Store Setup](https://docs.virtocommerce.org/user_guide/stores/store-management/#managing-store-languages))
- Each language has specific content

**Test Steps**:
1. Configure store with multiple languages (e.g., EN, FR, DE)
2. Generate sitemap
3. Access sitemap files for each category
4. Check content accessibility through sitemap URLs

**Expected Results**:
- Root sitemap should not contain language codes
- Individual category sitemaps should still maintain language-specific content
- All URLs should be accessible

**Priority**: High

---

### Test Case 3: Verify SEO Impact
**Objective**: Ensure SEO functionality remains intact after language code removal

**Preconditions**:
- SEO tools are configured
- Previous sitemap is indexed by search engines

**Test Steps**:
1. Submit new sitemap to search engines
2. Verify Google Search Console indexing
3. Check redirect handling from old URLs
4. Monitor 404 errors

**Expected Results**:
- No 404 errors for previously indexed URLs
- Proper redirection from old (with language code) to new URLs
- Search engine can successfully crawl new sitemap structure

**Priority**: Medium

---

### Test Case 4: Large Category Sitemap Handling
**Objective**: Verify handling of large sitemaps without language codes

**Preconditions**:
- Store has large number of products (>50,000)
- Multiple category sitemaps exist

**Test Steps**:
1. Generate sitemap for large catalog
2. Verify sitemap size limits
3. Check pagination if implemented
4. Validate all category sitemap references

**Expected Results**:
- Sitemap index should handle large numbers of entries correctly
- All category sitemaps should be referenced correctly
- No performance issues during generation

**Priority**: Medium

---

### Test Case 5: Error Handling and Edge Cases
**Objective**: Verify system behavior with invalid or edge case scenarios

**Test Steps**:
1. Try accessing non-existent sitemap categories
2. Test with invalid XML characters in URLs
3. Test with extremely long category names
4. Test with special characters in URLs

**Expected Results**:
- Appropriate error handling for non-existent sitemaps
- Special characters should be properly encoded
- System should handle edge cases gracefully

**Priority**: Medium

---

### Test Case 6: Legacy URL Compatibility
**Objective**: Ensure backward compatibility with old sitemap URLs

**Test Steps**:
1. Access old sitemap URLs with language codes
2. Check redirect behavior
3. Verify impact on existing backlinks
4. Test bookmark functionality

**Expected Results**:
- Old URLs should redirect to new format
- No loss of SEO value
- Proper HTTP status codes (301 redirects)

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 7: Invalid Configuration Handling
**Objective**: Verify system behavior with invalid store configurations

**Test Steps**:
1. Configure invalid store URLs
2. Set up incorrect language settings
3. Test with missing category information
4. Attempt to generate sitemap with insufficient permissions

**Expected Results**:
- Appropriate error messages
- No system crashes
- Proper logging of errors
- Graceful degradation

**Priority**: Low

---

## Notes
- Integration testing with search engines should be performed
- Performance monitoring during sitemap generation is recommended
- Backward compatibility should be maintained for at least 6 months
- Documentation should be updated to reflect new URL structure
- Related to SEO optimization initiatives