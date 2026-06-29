# Test Cases for VCST-3948: [E2E] Brands page seo info

## User Story Details
- **Jira Key**: VCST-3948
- **Summary**: [E2E] Brands page seo info
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/17/2025

## Description
Now seo info for the brands page is hardcoded. Need to add the ability to change seo info for brands page for different languages:- Page title- Description- Slug- Store

---

## Test Cases

### Test Case 1: Verify SEO Configuration for Brands Page in Default Language
**Objective**: Validate that SEO information (page title, description, slug) can be configured and displayed correctly for the brands page in the default store language.

**Preconditions**:
- Admin user is logged into Virto Commerce Platform Manager (https://docs.virtocommerce.org/platform/user-guide/getting-started/)
- At least one store is configured with default language (e.g., English)
- Brands module is installed and configured (https://docs.virtocommerce.org/modules/)
- User has permissions to manage SEO settings

**Test Steps**:
1. Navigate to the Store management section in Platform Manager
2. Select the target store from the store list
3. Navigate to the Brands page SEO settings section
4. Enter the following SEO information for the default language:
   - Page Title: "Premium Brands Collection | Test Store"
   - Meta Description: "Discover our curated selection of premium brands offering quality products"
   - Slug: "premium-brands"
5. Save the configuration
6. Open the storefront in a browser
7. Navigate to the brands page using the configured slug (/premium-brands)
8. Right-click and view page source or inspect the page head section
9. Verify the SEO meta tags in the HTML source

**Expected Results**:
- SEO settings are successfully saved without errors
- The brands page loads successfully using the custom slug (/premium-brands)
- Page title in browser tab displays: "Premium Brands Collection | Test Store"
- HTML source contains `<title>` tag with the configured page title
- HTML source contains `<meta name="description" content="Discover our curated selection of premium brands offering quality products">`
- The page URL reflects the custom slug configured

**Test Data**: 
- Store: Test Store (English)
- Page Title: "Premium Brands Collection | Test Store"
- Description: "Discover our curated selection of premium brands offering quality products"
- Slug: "premium-brands"

**Priority**: High

---

### Test Case 2: Verify Multi-Language SEO Configuration for Brands Page
**Objective**: Validate that SEO information can be configured separately for different languages and displays correctly based on language selection.

**Preconditions**:
- Admin user is logged into Virto Commerce Platform Manager
- Store is configured with multiple languages (e.g., English, German, French) (https://docs.virtocommerce.org/platform/user-guide/localization/)
- Brands module is installed and configured
- User has permissions to manage SEO settings and localization

**Test Steps**:
1. Navigate to the Store management section in Platform Manager
2. Select the target store that supports multiple languages
3. Navigate to the Brands page SEO settings section
4. Configure SEO information for English:
   - Page Title: "Premium Brands | EN Store"
   - Meta Description: "Explore our premium brand collection"
   - Slug: "brands"
5. Switch language selector to German and configure:
   - Page Title: "Premium Marken | DE Store"
   - Meta Description: "Entdecken Sie unsere Premium-Markenkollektion"
   - Slug: "marken"
6. Switch language selector to French and configure:
   - Page Title: "Marques Premium | FR Store"
   - Meta Description: "Découvrez notre collection de marques premium"
   - Slug: "marques"
7. Save all configurations
8. Open storefront and switch to English language, navigate to brands page
9. Verify SEO elements in English
10. Switch storefront language to German, navigate to brands page
11. Verify SEO elements in German
12. Switch storefront language to French, navigate to brands page
13. Verify SEO elements in French

**Expected Results**:
- All language-specific SEO configurations are saved successfully
- English storefront displays brands page with:
  - URL: /brands
  - Title: "Premium Brands | EN Store"
  - Meta description: "Explore our premium brand collection"
- German storefront displays brands page with:
  - URL: /marken
  - Title: "Premium Marken | DE Store"
  - Meta description: "Entdecken Sie unsere Premium-Markenkollektion"
- French storefront displays brands page with:
  - URL: /marques
  - Title: "Marques Premium | FR Store"
  - Meta description: "Découvrez notre collection de marques premium"
- Language switching maintains correct SEO information for each language
- No cross-language content leakage occurs

**Test Data**: 
- Languages: English, German, French
- SEO data as specified in test steps

**Priority**: High

---

### Test Case 3: Verify SEO Configuration Across Multiple Stores
**Objective**: Validate that different stores can have unique SEO configurations for their brands pages independently.

**Preconditions**:
- Admin user is logged into Virto Commerce Platform Manager
- At least two stores are configured (e.g., "Store A" and "Store B") (https://docs.virtocommerce.org/platform/user-guide/stores/)
- Brands module is installed for both stores
- User has permissions to manage multiple stores and SEO settings

**Test Steps**:
1. Navigate to the Store management section in Platform Manager
2. Select "Store A" from the store list
3. Navigate to the Brands page SEO settings section for Store A
4. Configure SEO information for Store A:
   - Page Title: "Store A Brands Collection"
   - Meta Description: "Browse brands available in Store A"
   - Slug: "store-a-brands"
5. Save configuration for Store A
6. Navigate back and select "Store B" from the store list
7. Navigate to the Brands page SEO settings section for Store B
8. Configure SEO information for Store B:
   - Page Title: "Store B Premium Partners"
   - Meta Description: "Discover Store B partner brands"
   - Slug: "store-b-partners"
9. Save configuration for Store B
10. Open Store A storefront and navigate to the brands page
11. Verify Store A SEO configuration
12. Open Store B storefront and navigate to the brands page
13. Verify Store B SEO configuration

**Expected Results**:
- Both stores save their unique SEO configurations without conflicts
- Store A brands page displays:
  - URL: /store-a-brands
  - Title: "Store A Brands Collection"
  - Meta description: "Browse brands available in Store A"
- Store B brands page displays:
  - URL: /store-b-partners
  - Title: "Store B Premium Partners"
  - Meta description: "Discover Store B partner brands"
- Each store maintains its independent SEO configuration
- Changing SEO settings in one store does not affect the other store
- Both stores' brands pages are accessible via their respective custom slugs

**Test Data**: 
- Store A and Store B with configurations as specified in test steps

**Priority**: High

---

### Test Case 4: Verify Special Characters and Length Limits in SEO Fields
**Objective**: Validate that the SEO configuration handles special characters, Unicode characters, and respects field length limits appropriately.

**Preconditions**:
- Admin user is logged into Virto Commerce Platform Manager
- At least one store is configured
- Brands module is installed and configured
- User has permissions to manage SEO settings

**Test Steps**:
1. Navigate to the Store management section in Platform Manager
2. Select the target store
3. Navigate to the Brands page SEO settings section
4. Test Page Title field:
   - Enter a title with special characters: "Brands & Partners - 50% Off | Store™"
   - Attempt to enter a very long title (>200 characters): "This is an extremely long page title that exceeds the recommended length for SEO purposes and should either be truncated or prevented from being saved in the system to maintain SEO best practices and standards"
   - Enter Unicode characters: "Brands 品牌 Марки Marques"
5. Test Meta Description field:
   - Enter description with HTML entities: "Shop <premium> brands & save 20%"
   - Attempt to enter very long description (>500 characters)
   - Enter Unicode characters: "探索我们的品牌系列"
6. Test Slug field:
   - Enter slug with special characters: "brands&partners"
   - Enter slug with spaces: "brands and partners"
   - Enter slug with uppercase: "BrandsCatalog"
   - Enter slug with Unicode: "品牌-catalog"
   - Enter valid slug: "brands-partners-2025"
7. Save configuration and observe validation messages
8. Navigate to the storefront and verify how special characters are handled

**Expected Results**:
- Page Title field:
  - Accepts special characters (&, -, |, ™) and displays correctly
  - Validates against maximum length (shows warning or error for >200 characters)
  - Accepts and displays Unicode characters correctly
- Meta Description field:
  - Escapes or encodes HTML entities properly to prevent injection
  - Validates against maximum length (shows warning or error for >500 characters)
  - Accepts Unicode characters
- Slug field:
  - Rejects or auto-converts special characters (& becomes "and" or is removed)
  - Auto-converts spaces to hyphens or shows validation error
  - Auto-converts uppercase to lowercase
  - Handles Unicode characters appropriately (either accepts or provides validation error)
  - Accepts valid slugs with hyphens and numbers
- Validation messages are clear and helpful
- Storefront displays configured SEO elements without breaking page layout
- Special characters in meta tags are properly escaped in HTML source

**Test Data**: 
- Various special character combinations as specified in test steps
- Maximum length test strings for title and description

**Priority**: Medium

---

### Test Case 5: Verify Slug Uniqueness and URL Conflict Handling
**Objective**: Validate that the system prevents duplicate slugs and handles URL conflicts appropriately when configuring brands page SEO.

**Preconditions**:
- Admin user is logged into Virto Commerce Platform Manager
- Store is configured with existing pages that have SEO slugs (e.g., /about, /contact)
- Brands module is installed and configured
- User has permissions to manage SEO settings

**Test Steps**:
1. Navigate to the Store management section in Platform Manager
2. Identify existing slugs in the store (e.g., "about", "contact", "products")
3. Navigate to the Brands page SEO settings section
4. Attempt to configure a slug that conflicts with an existing page:
   - Enter slug: "about"
   - Attempt to save
5. Observe validation message or error
6. Configure a unique slug: "all-brands"
7. Save the configuration successfully
8. Navigate back to the Brands page SEO settings
9. Attempt to modify the slug to another existing slug: "contact"
10. Attempt to save and observe validation
11. Configure another valid unique slug: "brand-partners"
12. Save successfully
13. Navigate to storefront and verify:
    - /about still points to the original about page
    - /brand-partners points to the brands page
14. Test accessing old slug /all-brands and verify redirect or 404 behavior

**Expected Results**:
- System validates slug uniqueness before saving
- When attempting to use an existing slug ("about", "contact"), system displays clear error message like "This slug is already in use by another page"
- System prevents saving duplicate slugs
- Unique slugs ("all-brands", "brand-partners") are saved successfully
- Storefront correctly routes to respective pages:
  - /about → About page (not brands page)
  - /brand-partners → Brands page
- When slug is changed from "all-brands" to "brand-partners":
  - Old slug either returns 404 or redirects to new slug (depending on system configuration)
  - New slug works correctly
- No URL conflicts exist in the system
- System prevents SEO configuration that would break existing site navigation

**Test Data**: 
- Existing slugs: "about", "contact", "products"
- New slugs: "all-brands", "brand-partners"

**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 6 (Bonus): Verify Empty and Missing SEO Configuration Handling
**Objective**: Validate system behavior when SEO fields are left empty or partially configured.

**Preconditions**:
- Admin user is logged into Virto Commerce Platform Manager
- Store is configured
- Brands module is installed
- Default/hardcoded SEO values exist in the system (as per user story description)

**Test Steps**:
1. Navigate to the Brands page SEO settings section
2. Leave all SEO fields empty (Page Title, Description, Slug)
3. Attempt to save configuration
4. Observe validation behavior
5. If save is allowed, navigate to storefront brands page
6. Verify what displays in browser title and meta tags
7. Configure only Page Title, leave Description and Slug empty
8. Save and verify storefront behavior
9. Configure only Slug, leave Title and Description empty
10. Save and verify storefront behavior
11. Clear all previously saved SEO configuration
12. Verify if system falls back to default/hardcoded values

**Expected Results**:
- System either requires mandatory fields (Slug at minimum) or allows empty configuration
- If empty fields are allowed:
  - Empty Page Title falls back to default title or site name
  - Empty Description results in no meta description tag or default description
  - Empty Slug falls back to default slug (e.g., "/brands")
- Partial configuration scenarios:
  - Only Title configured: Uses custom title, default description and slug
  - Only Slug configured: Uses default title and description, custom slug
- When all SEO configuration is cleared, system reverts to original hardcoded values mentioned in user story
- Storefront remains functional regardless of empty SEO fields
- No broken pages or errors occur due to missing SEO configuration

**Test Data**: Empty/null values for SEO fields

**Priority**: Medium

---

## Notes
- **SEO Best Practices**: Test cases should verify that configured SEO elements follow best practices (title length 50-60 chars, description 150-160 chars for optimal display in search results)
- **Caching Considerations**: After saving SEO configuration, cache may need to be cleared for changes to reflect on storefront. Verify cache invalidation works correctly (https://docs.virtocommerce.org/platform/developer-guide/fundamentals/caching/)
- **Related Documentation**: 
  - Virto Commerce Platform User Guide: https://docs.virtocommerce.org/platform/user-guide/
  - SEO Module: https://docs.virtocommerce.org/modules/seo/
- **Performance**: Monitor page load times after custom SEO configuration to ensure no performance degradation
- **Browser Compatibility**: Verify SEO elements display correctly across major browsers (Chrome, Firefox, Safari, Edge)
- **Search Engine Testing**: Consider testing with SEO tools (Google Search Console, structured data testing) to verify proper SEO implementation
- **Accessibility**: Ensure page titles are descriptive and helpful for screen readers
- **Dependencies**: This story depends on the Brands module being properly configured and the SEO module being available in the platform