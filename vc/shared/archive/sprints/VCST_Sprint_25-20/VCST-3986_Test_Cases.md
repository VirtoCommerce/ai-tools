# Test Cases for VCST-3986: [Support] [Frontend] Multilingual SEO URLs in Virto Commerce

## User Story Details
- **Jira Key**: VCST-3986
- **Summary**: [Support] [Frontend] Multilingual SEO URLs in Virto Commerce
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/23/2025

## Description
As a global B2B/B2C customer using Virto Commerce, I want language-specific URLs that are automatically optimized for SEO, so that I always land on the correct localized page and search engines index the right version.

**Key Requirements:**
- Valid only for multi-language configurations
- Routing formats: Default `/about-us`, Unique `/{xx}/about-us`, Multiple `/{xx-XX}/about-us`
- Language switching updates URL with culture code and preserves navigation
- Language preference stored in local storage
- Invalid language codes result in 404 error
- Link sharing preserves culture code
- Sitemap follows multilingual SEO URL principles
- Static routes (cart, etc.) support multilingual URLs

---

## Test Cases

### Test Case 1: Verify Multilingual URL Routing Formats for Content Pages
**Objective**: Validate that the system correctly handles and displays content pages using all supported multilingual URL routing formats (default, unique additional, and multiple per language).

**Preconditions**:
- Multi-language configuration is enabled in Virto Commerce platform (at least 3 languages: Default, en, de)
- Store configuration documentation: https://docs.virtocommerce.org/platform/user-guide/configuration/
- Content page "About Us" exists with SEO URLs configured for all languages
- Frontend application is deployed and accessible

**Test Steps**:
1. Navigate to the default language URL: `https://example.com/about-us`
2. Verify the page loads correctly in the default language
3. Navigate to unique additional language URL: `https://example.com/en/about-us`
4. Verify the page loads with English content
5. Navigate to multiple per language format: `https://example.com/en-US/about-us`
6. Verify the page loads with US English specific content
7. Navigate to another regional variant: `https://example.com/en-GB/about-us`
8. Verify the page loads with GB English specific content
9. Repeat steps for German: `https://example.com/de/über-uns`
10. Inspect browser URL bar to confirm culture code is preserved in all cases
11. Check that cultureName and permalink are passed correctly to backend (using browser dev tools Network tab)

**Expected Results**:
- Default language URL (`/about-us`) displays content in the configured default language without culture code in URL
- Unique additional format (`/en/about-us`) displays English content with `en` in URL
- Multiple per language format (`/en-US/about-us`, `/en-GB/about-us`) displays region-specific content with full culture code
- German URL (`/de/über-uns`) displays German content with localized slug
- Frontend correctly passes `cultureName` and `permalink` parameters to backend API calls
- All pages return HTTP 200 status code
- SEO meta tags reflect the correct language (lang attribute, hreflang tags)

**Test Data**: 
- Default language: English (en)
- Additional languages: German (de), Spanish (es)
- Content page: "About Us" with translations

**Priority**: High

---

### Test Case 2: Verify Language Switching Behavior and Local Storage Persistence
**Objective**: Ensure that when a customer changes language in the storefront, the URL updates with the correct culture code, navigation is preserved, and the language preference is saved to local storage for future visits.

**Preconditions**:
- Multi-language configuration enabled with at least 3 languages (en, de, fr)
- Localization documentation: https://docs.virtocommerce.org/platform/developer-guide/Fundamentals/Localization/
- Frontend application deployed with language switcher component
- Browser local storage is accessible and not full
- User is on a content page: `https://example.com/en/about-us`

**Test Steps**:
1. Open browser developer tools and navigate to Application/Storage > Local Storage
2. Clear any existing language preference from local storage
3. Navigate to `https://example.com/en/about-us`
4. Verify current URL and page language (English)
5. Open language switcher component in the storefront
6. Select German (de) from the language options
7. Verify URL updates to `https://example.com/de/über-uns` (localized slug)
8. Verify page content is now displayed in German
9. Check local storage for saved language preference key-value pair
10. Navigate to another page (e.g., `/products`)
11. Verify URL maintains German culture code: `https://example.com/de/products`
12. Close browser completely and clear session
13. Reopen browser and navigate to domain root: `https://example.com`
14. Verify the page automatically loads with German language from local storage
15. Verify URL includes culture code: `https://example.com/de/`
16. Switch language to French (fr)
17. Verify URL updates to `https://example.com/fr/`
18. Verify local storage is updated with French preference

**Expected Results**:
- Language switcher successfully changes the displayed language
- URL updates from `/en/about-us` to `/de/über-uns` with correct culture code and localized slug
- Navigation remains functional after language switch (no broken links or redirects)
- Local storage contains language preference with correct culture code
- Language preference persists across browser sessions
- Upon reopening, default language is the last selected language from local storage
- All subsequent navigation maintains the selected language in URL structure
- Switching language updates both URL and local storage immediately
- Page content, navigation menus, and UI elements reflect the selected language

**Test Data**: 
- Languages: English (en), German (de), French (fr)
- Test pages: About Us, Products, Cart
- Local storage key: Expected format as per frontend implementation

**Priority**: High

---

### Test Case 3: Verify Invalid Language Code Error Handling with 404 Display
**Objective**: Confirm that when an invalid or unsupported language code is used in the URL, the frontend application displays a 404 error page instead of crashing or showing incorrect content.

**Preconditions**:
- Multi-language configuration with supported languages: en, de, fr, es
- 404 error page is configured and accessible
- Frontend error handling is implemented for invalid culture codes

**Test Steps**:
1. Navigate to URL with completely invalid language code: `https://example.com/wr-WR/about-us`
2. Verify response status and displayed page
3. Check browser URL to confirm redirect to: `https://example.com/404/`
4. Navigate to URL with partially invalid code: `https://example.com/xx/products`
5. Verify 404 error page is displayed
6. Navigate to URL with invalid format: `https://example.com/en-XX-YY/cart`
7. Verify 404 error page is displayed
8. Navigate to URL with misspelled valid code: `https://example.com/eng/about-us` (instead of `en`)
9. Verify 404 error page is displayed
10. Check browser console for any JavaScript errors
11. Verify that 404 page includes proper error messaging and navigation options
12. Test navigation from 404 page back to valid language pages

**Expected Results**:
- Invalid language code `wr-WR` results in HTTP 404 status
- Browser URL redirects to `https://example.com/404/` or displays 404 page
- 404 error page displays with appropriate error message (e.g., "Page not found" or "Unsupported language")
- All invalid language code variations (`xx`, `en-XX-YY`, `eng`) result in 404 error
- No JavaScript errors or crashes in browser console
- 404 page provides navigation options (home link, language switcher, search)
- User can navigate from 404 page to valid language pages
- Backend does not receive requests with invalid culture codes (frontend validation prevents it)
- Page metadata and SEO tags indicate 404 status properly

**Test Data**: 
- Invalid codes: `wr-WR`, `xx`, `en-XX-YY`, `eng`, `zz-ZZ`
- Valid codes for comparison: `en`, `de`, `fr`, `es`, `en-US`, `en-GB`

**Priority**: High

---

### Test Case 4: Verify Link Sharing and Culture Code Preservation
**Objective**: Validate that when a customer copies and shares a URL containing a culture code, the recipient can access the same localized content with the culture code preserved throughout navigation.

**Preconditions**:
- Multi-language configuration enabled (en, de, fr)
- Multiple test pages with SEO URLs in different languages
- Two different browsers or incognito/private browsing windows available
- No language preference stored in local storage for new session

**Test Steps**:
1. In Browser A, navigate to: `https://example.com/de/products/laptop-sample`
2. Verify page displays in German language
3. Copy the complete URL from browser address bar: `https://example.com/de/products/laptop-sample`
4. Open Browser B in incognito/private mode (ensuring no cached language preferences)
5. Paste and navigate to the copied URL: `https://example.com/de/products/laptop-sample`
6. Verify page loads in German language with culture code preserved in URL
7. Verify local storage is updated with German language preference
8. Click on product category link or navigation menu item
9. Verify URL maintains German culture code: `https://example.com/de/products`
10. Test with French URL: Copy `https://example.com/fr/about-us` and open in new incognito window
11. Verify French language loads correctly
12. Test sharing URL with query parameters: `https://example.com/en/products?category=electronics&sort=price`
13. Verify culture code and query parameters are both preserved
14. Navigate through multiple pages and verify culture code remains in URL
15. Test with deep-linked product URL across different languages

**Expected Results**:
- Copied URL with culture code opens correctly in new browser session
- Language from URL culture code takes precedence over browser default language
- Culture code (`/de/`, `/fr/`, `/en/`) is preserved in URL throughout navigation
- Local storage is updated with language from shared URL
- All subsequent page navigations maintain the same language and culture code
- Query parameters and culture codes coexist without conflicts
- Deep links to specific products/categories respect the culture code in URL
- Backend receives correct cultureName parameter from shared link
- Hreflang tags and canonical URLs reflect the shared language version
- Navigation menus, breadcrumbs, and links maintain language consistency

**Test Data**: 
- Test URLs: 
  - `https://example.com/de/products/laptop-sample`
  - `https://example.com/fr/about-us`
  - `https://example.com/en/products?category=electronics&sort=price`
  - `https://example.com/en-GB/cart`

**Priority**: High

---

### Test Case 5: Verify Sitemap Generation with Multilingual SEO URL Principles and Static Route Support
**Objective**: Confirm that the sitemap module generates XML sitemaps following multilingual SEO URL principles with hreflang annotations, and that static routes (cart, checkout, etc.) support multilingual URL formats.

**Preconditions**:
- Sitemap module is installed and configured: https://docs.virtocommerce.org/modules/seo/
- Multi-language configuration with 3+ languages (en, de, fr)
- Static routes configured (cart, checkout, account, search)
- SEO module configured with URL semantics
- Content pages and products exist in multiple languages

**Test Steps**:
1. Navigate to sitemap URL: `https://example.com/sitemap.xml`
2. Verify sitemap loads successfully (HTTP 200)
3. Inspect XML structure for multilingual URL entries
4. Verify content page URLs include language variations:
   - `https://example.com/about-us`
   - `https://example.com/en/about-us`
   - `https://example.com/de/über-uns`
   - `https://example.com/fr/à-propos`
5. Verify each URL entry includes proper `<xhtml:link rel="alternate" hreflang="xx">` tags for all language variants
6. Check product URLs for multilingual format
7. Verify static routes are included with multilingual URLs:
   - `https://example.com/cart` (default)
   - `https://example.com/en/cart`
   - `https://example.com/de/warenkorb`
   - `https://example.com/fr/panier`
8. Navigate to static route with language code: `https://example.com/de/warenkorb`
9. Verify cart page loads in German with correct URL structure
10. Test checkout static route: `https://example.com/fr/checkout`
11. Verify checkout page displays in French
12. Test account static route: `https://example.com/en-GB/account/profile`
13. Verify account page loads with GB English
14. Validate sitemap XML against sitemap.org schema
15. Check that lastmod, priority, and changefreq tags are present for all URLs

**Expected Results**:
- Sitemap XML is accessible and returns HTTP 200 status
- Sitemap contains all multilingual URL variants for each page/product
- Each URL entry includes hreflang annotations pointing to all language alternatives
- Default language URLs appear without culture code prefix
- Additional language URLs include appropriate culture codes (`/en/`, `/de/`, `/fr/`)
- Localized slugs are used for non-English languages (e.g., `/de/über-uns` instead of `/de/about-us`)
- Static routes (cart, checkout, account) are included in sitemap with multilingual URLs
- Static routes are accessible via culture-coded URLs (e.g., `/de/warenkorb` for cart)
- Static route pages display correct language based on URL culture code
- Regional variants (`/en-US/`, `/en-GB/`) are properly represented in sitemap
- Sitemap XML validates against sitemap.org protocol standards
- All required XML tags (loc, lastmod, priority, changefreq, hreflang) are present and correctly formatted
- Frontend routing handles static routes with culture codes without breaking functionality
- Search engines can discover all language versions through sitemap hreflang links

**Test Data**: 
- Languages: English (en, en-US, en-GB), German (de), French (fr)
- Content pages: About Us, Contact, FAQ
- Static routes: /cart, /checkout, /account, /search, /wishlist
- Product samples: At least 5 products with multilingual SEO URLs

**Priority**: Medium

---

## Notes
- **Multi-language Configuration**: All test cases require multi-language setup in Virto Commerce platform. Refer to the platform configuration documentation for enabling multiple languages and cultures.
- **SEO Module Dependency**: Several test cases depend on the SEO module being properly configured. Ensure URL semantics and slug generation are working before executing tests.
- **Browser Testing**: Execute tests across multiple browsers (Chrome, Firefox, Safari, Edge) to ensure consistent behavior.
- **Performance Considerations**: Monitor page load times when switching languages, as locale-specific content and translations may impact performance.
- **CDN and Caching**: If CDN is configured, ensure cache is properly invalidated when testing URL variations to avoid false results from cached responses.
- **Related Stories/Dependencies**: 
  - SEO module configuration and URL routing
  - Localization and translation management
  - Frontend application language switcher component
  - Sitemap generation module
- **Regression Testing**: After implementation, verify that existing single-language functionality remains intact and non-multilingual stores are not affected.
- **Documentation References**:
  - Platform configuration: https://docs.virtocommerce.org/platform/user-guide/configuration/
  - SEO module: https://docs.virtocommerce.org/modules/seo/
  - Localization: https://docs.virtocommerce.org/platform/developer-guide/Fundamentals/Localization/

---

## Edge Cases and Additional Considerations

**Edge Cases Covered in Test Cases Above:**
- Invalid language code handling (Test Case 3)
- Culture code preservation across navigation and sharing (Test Cases 2 and 4)
- Static route multilingual support (Test Case 5)
- Regional language variants (en-US, en-GB) throughout all test cases

**Additional Edge Cases to Monitor:**
- Mixed case culture codes (e.g., `/EN/about-us` vs `/en/about-us`)
- Trailing slashes in URLs with culture codes (`/en/about-us/` vs `/en/about-us`)
- Culture code at different URL positions (e.g., query parameter vs path segment)
- Language switching on pages with POST forms or active sessions
- Simultaneous users with different language preferences on