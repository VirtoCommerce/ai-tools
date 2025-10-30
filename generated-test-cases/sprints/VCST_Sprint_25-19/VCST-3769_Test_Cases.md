# Test Cases for VCST-3769: [Support] #38992 - Translated main route urls

## User Story Details
- **Jira Key**: VCST-3769
- **Summary**: [Support] #38992 - Translated main route urls
- **Priority**: Low
- **Status**: Done
- **Created**: 8/14/2025

## Description
[As provided in the original story]

---

## Test Cases

### Test Case 1: Verify Basic Route Translation Configuration
**Objective**: Verify that main route URLs can be translated using SEO settings

**Preconditions**:
- Access to Virto Commerce Platform Manager
- Multi-language store configuration is enabled
- Reference: [Internationalization](https://docs.virtocommerce.org/platform-manager/configuration/internationalization/)
- Reference: [SEO Configuration](https://docs.virtocommerce.org/platform-manager/configuration/seo/)

**Test Steps**:
1. Log in to Platform Manager
2. Navigate to Store > Select store > SEO
3. Add translations for basic routes:
   - sign-in → aanmelden (Dutch)
   - cart → winkelwagen (Dutch)
4. Save configurations
5. Access the storefront
6. Switch language to Dutch
7. Verify URL translations

**Expected Results**:
- URLs should reflect translated versions in Dutch
- Navigation should work correctly with translated URLs
- Internal links should update accordingly

**Priority**: High

---

### Test Case 2: Menu Navigation with Translated Routes
**Objective**: Verify menu functionality with translated route URLs

**Preconditions**:
- Translated routes configured in SEO settings
- Menu configuration exists
- Reference: [Navigation Configuration](https://docs.virtocommerce.org/platform-manager/configuration/navigation/)

**Test Steps**:
1. Configure menu items with translated routes
2. Navigate to storefront
3. Switch between languages
4. Click menu items in different languages
5. Verify browser URL changes
6. Test breadcrumb navigation

**Expected Results**:
- Menu items should link to correct translated URLs
- Navigation should maintain consistency across languages
- Breadcrumbs should display correct translated paths

**Priority**: High

---

### Test Case 3: Form Submissions with Translated Routes
**Objective**: Verify form submissions work with translated route URLs

**Preconditions**:
- Translated routes for forms (sign-up, forgot-password)
- Test user account
- Reference: [Authentication](https://docs.virtocommerce.org/platform-manager/security/authentication/)

**Test Steps**:
1. Access translated sign-up route
2. Complete registration form
3. Submit form
4. Verify redirect behavior
5. Test forgot-password functionality
6. Verify error handling with invalid inputs

**Expected Results**:
- Forms should submit correctly regardless of URL language
- Success/error messages should display in correct language
- Redirects should maintain language context

**Priority**: High

---

### Test Case 4: SEO Configuration Edge Cases
**Objective**: Test boundary conditions for route translations

**Preconditions**:
- Access to SEO settings
- Multiple language configurations

**Test Steps**:
1. Configure extremely long translated URLs (>255 characters)
2. Set up similar translations for different routes
3. Use special characters in translations
4. Test routes with query parameters
5. Verify caching behavior

**Expected Results**:
- System should handle long URLs appropriately
- Similar translations should not conflict
- Special characters should be properly encoded
- Query parameters should work with translated routes

**Priority**: Medium

---

### Test Case 5: Dynamic Route Translation Updates
**Objective**: Verify real-time updates of route translations

**Preconditions**:
- Active storefront session
- Access to Platform Manager

**Test Steps**:
1. Update existing route translation in SEO settings
2. Clear cache if necessary
3. Verify immediate effect on storefront
4. Test navigation with both old and new URLs
5. Verify 301 redirects from old to new URLs

**Expected Results**:
- Changes should reflect in storefront
- Old URLs should redirect to new translations
- No 404 errors should occur

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 6: Invalid Translation Configurations
**Objective**: Verify system behavior with invalid translations

**Test Steps**:
1. Configure invalid characters in route translations
2. Set up duplicate translations for different routes
3. Leave translation fields empty
4. Test with missing language configurations

**Expected Results**:
- System should handle invalid inputs gracefully
- Appropriate error messages should display
- Default routes should work as fallback

**Priority**: Low

---

## Notes
- Test cases should be executed for all supported languages
- Consider impact on existing SEO rankings
- Verify compatibility with various browser versions
- Consider caching implications
- Reference: [Theme Development](https://docs.virtocommerce.org/platform-manager/guides/theme-development/) for custom theme considerations