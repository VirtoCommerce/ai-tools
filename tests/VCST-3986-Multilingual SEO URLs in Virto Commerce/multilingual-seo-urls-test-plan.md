# Multilingual SEO-Friendly URLs - Manual Test Plan

**Project:** Virto Commerce  
**Feature:** Multilingual SEO-Friendly URLs  
**Version:** 1.0  
**Date:** October 14, 2025  
**Test Type:** Manual Testing

---

## Table of Contents

1. [Introduction](#introduction)
2. [Test Scope](#test-scope)
3. [Test Environment](#test-environment)
4. [Test Prerequisites](#test-prerequisites)
5. [Test Cases](#test-cases)
   - 5.1 [Routing Tests](#51-routing-tests)
   - 5.2 [Language Switching Behavior Tests](#52-language-switching-behavior-tests)
   - 5.3 [Local Storage Persistence Tests](#53-local-storage-persistence-tests)
   - 5.4 [Error Handling Tests](#54-error-handling-tests)
   - 5.5 [Link Sharing and Preservation Tests](#55-link-sharing-and-preservation-tests)
   - 5.6 [Sitemap Tests](#56-sitemap-tests)
   - 5.7 [Static Routing Tests](#57-static-routing-tests)
   - 5.8 [SEO Elements Tests](#58-seo-elements-tests)
   - 5.9 [Cross-Page Navigation Tests](#59-cross-page-navigation-tests)
   - 5.10 [Browser Compatibility Tests](#510-browser-compatibility-tests)
6. [Test Data Reference](#test-data-reference)
7. [Test Execution Summary](#test-execution-summary)

---

## 1. Introduction

### 1.1 Purpose
This document provides a comprehensive manual test plan for validating multilingual SEO-friendly URLs in Virto Commerce. The feature enables customers to access localized content through language-specific URLs optimized for search engines.

### 1.2 User Story
**As a** global B2B/B2C customer using Virto Commerce,  
**I want** language-specific URLs that are automatically optimized for SEO,  
**so that** I always land on the correct localized page and search engines index the right version.

### 1.3 Key Requirements
- Support for multilingual URL routing (default language and language-specific prefixes)
- Automatic URL updates when language is switched
- Language preference persistence in local storage
- Proper error handling for invalid language codes
- Culture code preservation in shared links
- Multilingual sitemap generation
- Static route support for multilingual URLs
- SEO-compliant metadata (canonical tags, hreflang tags)

---

## 2. Test Scope

### 2.1 In Scope
- URL routing structure validation
- Language switching functionality
- Local storage persistence
- Error handling and 404 redirects
- Link sharing behavior
- Sitemap validation
- Static and dynamic page routing
- SEO metadata verification
- Cross-page navigation
- Browser compatibility

### 2.2 Out of Scope
- Backend API testing
- Performance testing
- Security testing
- Content translation accuracy
- Admin panel configuration

### 2.3 Pages to Test
| Page Type | Examples |
|-----------|----------|
| **Dynamic Pages** | Product pages, Category/Catalog pages, Search results |
| **Static Pages** | Cart, About Us, Contact |
| **User Account Pages** | Profile, Order history, Account settings |
| **Checkout Pages** | Checkout flow, Payment, Order confirmation |

### 2.4 Languages Configuration
| Language | Code | Example URL |
|----------|------|-------------|
| **English (Default)** | en-US | `/about-us` |
| **German** | de | `/de/über-uns` |
| **Norwegian** | no | `/no/om-oss` |
| **French** | fr | `/fr/à-propos` |
| **Italian** | it-IT | `/it/chi-siamo` |

---

## 3. Test Environment

### 3.1 Required Setup
- Virto Commerce storefront with multilingual configuration enabled
- Browser developer tools access
- Network inspector enabled
- Local storage inspection capability

### 3.2 Test Browsers
- Google Chrome (latest version)
- Mozilla Firefox (latest version)
- Microsoft Edge (latest version)
- Safari (latest version - macOS/iOS)
- Mobile browsers (Chrome Mobile, Safari Mobile)

### 3.3 Test Devices
- Desktop/Laptop (Windows, macOS)
- Mobile devices (iOS, Android)
- Tablet devices

---

## 4. Test Prerequisites

### 4.1 Configuration Requirements
- [ ] Multi-language configuration is enabled in Virto Commerce
- [ ] Norwegian (no) is set as the default language
- [ ] German (de) and French (fr) are configured as additional languages
- [ ] Language switcher component is visible on the storefront
- [ ] Test user account is created and ready
- [ ] Test products and categories exist with translations

### 4.2 Test Data Preparation
- [ ] Sample product pages with translations
- [ ] Sample category pages with translations
- [ ] Static pages (About Us, Contact) with translations
- [ ] Reference URLs documented (see test-data.md)

---

## 5. Test Cases

## 5.1 Routing Tests

### Test Case RT-001: Default Language URL Structure (No Prefix)

**Test ID:** RT-001  
**Priority:** High  
**Category:** Routing

**Objective:** Verify that the default language (Norwegian) loads correctly without a language prefix in the URL.

**Preconditions:**
- Norwegian is configured as the default language
- User is not logged in or has no language preference set

**Test Steps:**
1. Clear browser cookies and local storage
2. Navigate to the storefront base URL (e.g., `https://example.com/`)
3. Navigate to various pages without language prefix:
   - `/about-us`
   - `/products`
   - `/cart`
4. Inspect the URL structure
5. Verify page content language

**Expected Results:**
- URLs display without language prefix (e.g., `/about-us`, `/products`)
- Page content is displayed in Norwegian (default language)
- No automatic redirect occurs
- Browser URL bar shows clean URL without language code

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case RT-002: German Language URL with Prefix

**Test ID:** RT-002  
**Priority:** High  
**Category:** Routing

**Objective:** Verify that German language pages load correctly with `/de/` prefix.

**Preconditions:**
- German language is configured and active
- Test pages have German translations available

**Test Steps:**
1. Clear browser cookies and local storage
2. Manually navigate to URLs with `/de/` prefix:
   - `https://example.com/de/about-us`
   - `https://example.com/de/products`
   - `https://example.com/de/cart`
3. Verify URL structure remains intact
4. Check page content language
5. Navigate to additional pages and verify `/de/` prefix is maintained

**Expected Results:**
- URLs maintain `/de/` prefix (e.g., `/de/about-us`)
- Page content is displayed in German
- Navigation to other pages preserves the `/de/` prefix
- Language switcher shows German as selected

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case RT-003: French Language URL with Prefix

**Test ID:** RT-003  
**Priority:** High  
**Category:** Routing

**Objective:** Verify that French language pages load correctly with `/fr/` prefix.

**Preconditions:**
- French language is configured and active
- Test pages have French translations available

**Test Steps:**
1. Clear browser cookies and local storage
2. Manually navigate to URLs with `/fr/` prefix:
   - `https://example.com/fr/about-us`
   - `https://example.com/fr/products`
   - `https://example.com/fr/cart`
3. Verify URL structure remains intact
4. Check page content language
5. Navigate to additional pages and verify `/fr/` prefix is maintained

**Expected Results:**
- URLs maintain `/fr/` prefix (e.g., `/fr/about-us`)
- Page content is displayed in French
- Navigation to other pages preserves the `/fr/` prefix
- Language switcher shows French as selected

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case RT-004: Product Page Routing with Language Prefix

**Test ID:** RT-004  
**Priority:** High  
**Category:** Routing - Dynamic Pages

**Objective:** Verify that product pages (dynamic content) correctly handle multilingual URLs.

**Preconditions:**
- Test product exists with Norwegian, German, and French translations
- Product has a SEO-friendly slug in all languages

**Test Steps:**
1. Access a product page in Norwegian (default): `/products/test-product`
2. Access the same product in German: `/de/products/test-produkt`
3. Access the same product in French: `/fr/products/produit-test`
4. Verify that each URL loads the correct product
5. Verify that content is in the correct language
6. Check that product images, descriptions, and prices display correctly

**Expected Results:**
- Each language-specific URL loads the correct product
- Product name, description, and attributes are in the selected language
- URL slug reflects the localized product name
- Product ID remains consistent across all language versions
- Images and prices display correctly

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case RT-005: Category Page Routing with Language Prefix

**Test ID:** RT-005  
**Priority:** High  
**Category:** Routing - Dynamic Pages

**Objective:** Verify that category/catalog pages correctly handle multilingual URLs.

**Preconditions:**
- Test category exists with Norwegian, German, and French translations
- Category contains products

**Test Steps:**
1. Access a category page in Norwegian (default): `/category/electronics`
2. Access the same category in German: `/de/category/elektronik`
3. Access the same category in French: `/fr/category/électronique`
4. Verify that each URL loads the correct category
5. Verify that content and products are in the correct language

**Expected Results:**
- Each language-specific URL loads the correct category
- Category name and description are in the selected language
- URL slug reflects the localized category name
- Products within category display in the selected language
- Breadcrumbs display in the selected language

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

## 5.2 Language Switching Behavior Tests

### Test Case LS-001: Language Switching via UI Component (Norwegian to German)

**Test ID:** LS-001  
**Priority:** Critical  
**Category:** Language Switching

**Objective:** Verify that switching from Norwegian to German updates the URL and content correctly.

**Preconditions:**
- User is on a Norwegian page (e.g., `/about-us`)
- Language switcher component is visible

**Test Steps:**
1. Navigate to `/about-us` (Norwegian default)
2. Note the current URL
3. Click on the language switcher component
4. Select "German (de)" from the language options
5. Observe URL change
6. Verify page content language
7. Check browser local storage for language preference

**Expected Results:**
- URL updates from `/about-us` to `/de/über-uns`
- Page content changes to German
- Navigation does not break (no page reload errors)
- Language preference is saved in local storage
- Language switcher shows German as selected

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case LS-002: Language Switching via UI Component (German to French)

**Test ID:** LS-002  
**Priority:** Critical  
**Category:** Language Switching

**Objective:** Verify that switching from German to French updates the URL and content correctly.

**Preconditions:**
- User is on a German page (e.g., `/de/about-us`)
- Language switcher component is visible

**Test Steps:**
1. Navigate to `/de/about-us` (German)
2. Note the current URL
3. Click on the language switcher component
4. Select "French (fr)" from the language options
5. Observe URL change
6. Verify page content language
7. Check browser local storage for language preference

**Expected Results:**
- URL updates from `/de/about-us` to `/fr/à-propos`
- Page content changes to French
- Navigation does not break
- Language preference is saved in local storage as "fr"
- Language switcher shows French as selected

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case LS-003: Language Switching on Product Page

**Test ID:** LS-003  
**Priority:** High  
**Category:** Language Switching - Dynamic Pages

**Objective:** Verify that language switching on product pages maintains product context while updating language.

**Preconditions:**
- User is viewing a product page
- Product has translations in all languages

**Test Steps:**
1. Navigate to a product page in Norwegian: `/products/test-product`
2. Note the product ID and current URL
3. Switch language to German using the language switcher
4. Verify the URL updates to `/de/products/test-produkt`
5. Confirm the same product is displayed
6. Switch language to French
7. Verify the URL updates to `/fr/products/produit-test`
8. Confirm the same product is still displayed

**Expected Results:**
- URL updates with correct language prefix and localized slug
- Same product (by ID) remains displayed across language switches
- Product name, description, and attributes change to selected language
- Product images remain the same
- Prices display in the same currency (or localized if configured)
- No 404 errors occur during language switching

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case LS-004: Language Switching in Cart Page

**Test ID:** LS-004  
**Priority:** High  
**Category:** Language Switching - Static Pages

**Objective:** Verify that language switching on cart page preserves cart contents and updates UI language.

**Preconditions:**
- User has items in the cart
- User is on the cart page

**Test Steps:**
1. Add products to cart
2. Navigate to cart page: `/cart`
3. Note cart contents
4. Switch language to German
5. Verify URL updates to `/de/cart` or `/de/warenkorb`
6. Verify cart contents are preserved
7. Check that cart UI elements are in German
8. Switch to French
9. Verify URL and cart contents again

**Expected Results:**
- URL updates with correct language prefix
- Cart contents (products, quantities, prices) remain unchanged
- UI labels (buttons, headers, messages) change to selected language
- Product names in cart update to selected language
- No items are lost during language switch

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case LS-005: Cart Page Title Localization After Language Switch

**Test ID:** LS-005  
**Priority:** High  
**Category:** Language Switching - Cart Page Localization

**Objective:** Verify that cart page title and UI elements are correctly localized when switching languages, and observe product title behavior for items already in cart.

**Preconditions:**
- User is logged in or session is active
- Language is set to Norwegian (NO)
- Product with SKU "ALCE1993" exists in the catalog

**Test Steps:**
1. Set language to Norwegian (NO) in the storefront
2. Search for and add product SKU "ALCE1993" to cart
3. Navigate to cart page and verify:
   - Page URL is `/no/cart`
   - Page title is "Handlekurv" (Norwegian for "Cart")
   - Product is visible in cart with Norwegian product title
4. Switch language to German (DE) using the language switcher
5. Verify after language switch:
   - Page URL updates to `/de/cart`
   - Page title updates to "Warenkorb" (German for "Cart")
   - All UI elements (buttons, labels, headers) are in German
   - Check product title in cart
   - Check product title in "Recently Viewed" section

**Expected Results:**
- ✅ URL changes from `/no/cart` to `/de/cart`
- ✅ Page title changes from "Handlekurv" (NO) to "Warenkorb" (DE)
- ✅ H1 heading changes from "Handlekurv" to "Warenkorb"
- ✅ All UI elements translate to German (buttons, labels, sections)
- ✅ Cart contents are preserved (quantity, price)
- ⚠️ Product title in cart may retain original language (NO) - document actual behavior
- ✅ Recently viewed items should show German translations

**Actual Results:**  
**EXECUTED:** October 14, 2025

Norwegian Cart Page:
- URL: `/no/cart` ✅
- Page Title: "QA & Handlekurv" ✅
- H1 Heading: "Handlekurv" ✅
- Product: "[NO] 10-tommers bærbar digital TV-spiller 1080P HDMI mini bil-TV DVB-T/T2 ISDB-T USB SD VGA" ✅

German Cart Page (After Switch):
- URL: `/de/cart` ✅
- Page Title: "QA & Warenkorb" ✅
- H1 Heading: "Warenkorb" ✅
- Product in Cart: Still shows Norwegian title "[NO] 10-tommers bærbar digital TV-spiller 1080P HDMI mini bil-TV DVB-T/T2 ISDB-T USB SD VGA"
- Recently Viewed: Shows German title "[DE] 10-Zoll tragbarer digitaler Fernseher 1080P HDMI Mini Auto-TV DVB-T/T2 ISDB-T USB SD VGA" ✅

**Status:** [✅] Pass [  ] Fail [  ] Blocked [  ] Not Tested

**Notes:**  
- Page titles and UI translations work perfectly ✅
- URL updates correctly ✅
- Cart items retain the language they were added in (expected behavior for cart persistence)
- Recently viewed items dynamically update to the current language
- All cart UI elements (buttons, labels, sections) translate correctly
- Cart contents (quantity, price, subtotal) are preserved during language switch

---

## 5.3 Local Storage Persistence Tests

### Test Case LP-001: Language Preference Saved in Local Storage

**Test ID:** LP-001  
**Priority:** High  
**Category:** Local Storage Persistence

**Objective:** Verify that selected language preference is saved in browser's local storage.

**Preconditions:**
- Browser with developer tools available
- User is not logged in

**Test Steps:**
1. Clear browser cookies and local storage
2. Navigate to the storefront
3. Open browser developer tools (F12)
4. Go to Application/Storage tab > Local Storage
5. Switch language to German using language switcher
6. Inspect local storage for language preference key
7. Verify the stored value is "de"
8. Switch to French
9. Verify the stored value updates to "fr"

**Expected Results:**
- Local storage contains a key for language preference (e.g., "language", "cultureName", or "locale")
- Value is correctly set to the selected language code ("de", "fr", "no")
- Value updates immediately when language is changed
- Value persists after page refresh

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Record the exact local storage key name used]_

---

### Test Case LP-002: Default Language on Return Visit

**Test ID:** LP-002  
**Priority:** High  
**Category:** Local Storage Persistence

**Objective:** Verify that the storefront opens in the previously selected language on subsequent visits.

**Preconditions:**
- Browser with local storage enabled
- User has previously selected a non-default language

**Test Steps:**
1. Navigate to the storefront
2. Switch language to German
3. Browse several pages to confirm German is active
4. Close the browser completely
5. Reopen the browser
6. Navigate to the storefront base URL (no language prefix)
7. Observe the language displayed
8. Check the URL for language code

**Expected Results:**
- Storefront opens in German (previously selected language)
- URL includes the language code: `/?lang=de` or redirects to `/de/`
- Local storage still contains "de" as the language preference
- User does not need to reselect language

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case LP-003: Language Preference Across Browser Tabs

**Test ID:** LP-003  
**Priority:** Medium  
**Category:** Local Storage Persistence

**Objective:** Verify that language preference is consistent across multiple browser tabs.

**Preconditions:**
- Browser with multiple tabs support
- User has storefront open

**Test Steps:**
1. Open storefront in Tab 1
2. Switch language to German in Tab 1
3. Open a new tab (Tab 2)
4. Navigate to storefront in Tab 2
5. Verify language displayed in Tab 2
6. Switch language to French in Tab 2
7. Return to Tab 1 and refresh
8. Verify language displayed in Tab 1

**Expected Results:**
- Tab 2 opens in German (same as Tab 1's selection)
- When Tab 2 switches to French, local storage is updated
- Tab 1, after refresh, displays French (synchronized)
- Language preference is shared across tabs within same browser

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case LP-004: Language Preference in Incognito/Private Mode

**Test ID:** LP-004  
**Priority:** Medium  
**Category:** Local Storage Persistence

**Objective:** Verify language preference behavior in browser incognito/private mode.

**Preconditions:**
- Browser with incognito/private browsing mode

**Test Steps:**
1. Open browser in incognito/private mode
2. Navigate to storefront
3. Verify default language is displayed (Norwegian)
4. Switch to German
5. Navigate to several pages
6. Close and reopen incognito window
7. Navigate to storefront again
8. Verify language displayed

**Expected Results:**
- Language can be switched in incognito mode
- Language preference works within the same incognito session
- After closing and reopening incognito mode, language resets to default (Norwegian)
- Local storage does not persist across incognito sessions

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

## 5.4 Error Handling Tests

### Test Case EH-001: Invalid Language Code in URL

**Test ID:** EH-001  
**Priority:** Critical  
**Category:** Error Handling

**Objective:** Verify that invalid language codes in URLs result in proper 404 error handling.

**Preconditions:**
- Storefront is accessible
- 404 error page exists

**Test Steps:**
1. Navigate to URL with invalid language code: `https://example.com/wr-WR/about-us`
2. Observe browser response
3. Check if redirected to 404 page
4. Verify 404 page URL
5. Try additional invalid codes:
   - `https://example.com/xx/products`
   - `https://example.com/zz-ZZ/cart`
6. Verify consistent 404 handling

**Expected Results:**
- Browser displays 404 error page
- URL redirects to `https://example.com/404/` or displays 404 page
- HTTP status code is 404 (verify in network tab)
- 404 page provides helpful navigation options
- No application crash or white screen

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case EH-002: Invalid Language Code with Valid Page Path

**Test ID:** EH-002  
**Priority:** High  
**Category:** Error Handling

**Objective:** Verify that valid page paths with invalid language codes still result in 404 errors.

**Preconditions:**
- Test pages exist and are accessible in valid languages

**Test Steps:**
1. Identify a valid page: `https://example.com/products`
2. Add invalid language prefix: `https://example.com/ab-CD/products`
3. Navigate to the URL
4. Verify 404 response
5. Test with multiple valid paths and invalid language codes:
   - `/invalid/cart`
   - `/xyz/checkout`
   - `/qq-QQ/account`

**Expected Results:**
- All URLs with invalid language codes return 404 errors
- System does not attempt to load the page in default language
- Consistent error handling across all page types
- Clear error message indicating invalid language code

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case EH-003: Non-Existent Page with Valid Language Code

**Test ID:** EH-003  
**Priority:** High  
**Category:** Error Handling

**Objective:** Verify that non-existent pages return 404 even with valid language codes.

**Preconditions:**
- Valid languages are configured

**Test Steps:**
1. Navigate to non-existent page in Norwegian: `https://example.com/non-existent-page`
2. Verify 404 response
3. Navigate to non-existent page in German: `https://example.com/de/non-existent-page`
4. Verify 404 response
5. Navigate to non-existent page in French: `https://example.com/fr/non-existent-page`
6. Verify 404 response

**Expected Results:**
- All non-existent pages return 404 errors regardless of language
- 404 page is displayed in the selected language
- URL structure is preserved (language code remains visible)
- HTTP status code is 404

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case EH-004: Malformed Language Code in URL

**Test ID:** EH-004  
**Priority:** Medium  
**Category:** Error Handling

**Objective:** Verify handling of malformed or partially correct language codes.

**Preconditions:**
- Storefront is accessible

**Test Steps:**
1. Test with single character: `https://example.com/d/about-us`
2. Test with numbers: `https://example.com/12/about-us`
3. Test with special characters: `https://example.com/de!/about-us`
4. Test with uppercase: `https://example.com/DE/about-us`
5. Test with too many characters: `https://example.com/deut/about-us`
6. Observe system behavior for each case

**Expected Results:**
- Invalid formats result in 404 errors
- System does not crash or show server errors
- Consistent error handling across all malformed codes
- If uppercase is accepted (DE = de), document this behavior
- Special characters are rejected

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document if any malformed codes are accepted]_

---

## 5.5 Link Sharing and Preservation Tests

### Test Case LS-001: Share Link with Language Code

**Test ID:** LS-001  
**Priority:** High  
**Category:** Link Sharing

**Objective:** Verify that links shared with language codes preserve the cultureName and open in the correct language.

**Preconditions:**
- User has access to multiple devices or browsers
- Test pages exist in all languages

**Test Steps:**
1. Navigate to a German page: `https://example.com/de/products/test-produkt`
2. Copy the full URL from browser address bar
3. Open a new incognito/private window or different browser
4. Paste and navigate to the copied URL
5. Verify the page opens
6. Check the language displayed
7. Verify URL remains unchanged
8. Repeat with French URL: `https://example.com/fr/products/produit-test`

**Expected Results:**
- Copied URL contains the language code (e.g., `/de/` or `/fr/`)
- Pasted URL opens the page in the specified language
- URL structure is preserved after navigation
- Content displays in the correct language
- No redirect to default language occurs

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case LS-002: Share Link via Social Media (Simulated)

**Test ID:** LS-002  
**Priority:** Medium  
**Category:** Link Sharing

**Objective:** Verify that language-specific URLs work correctly when shared via social media platforms.

**Preconditions:**
- Test URLs are accessible
- Social media meta tags are present

**Test Steps:**
1. Navigate to a product page in French: `https://example.com/fr/products/produit-test`
2. Copy the URL
3. Paste into a text editor or messaging app (simulating social media)
4. Click the link from the text editor
5. Verify the page opens in French
6. Check Open Graph meta tags in page source (right-click > View Page Source)
7. Verify og:url contains the correct language-specific URL

**Expected Results:**
- Link opens in the correct language (French)
- Open Graph tags reflect the language-specific URL
- Social media preview (if applicable) shows correct language content
- No language code is lost during sharing

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case LS-003: Copy-Paste URL from Address Bar

**Test ID:** LS-003  
**Priority:** High  
**Category:** Link Sharing

**Objective:** Verify that URLs copied from the browser address bar maintain language codes.

**Preconditions:**
- User is browsing the storefront

**Test Steps:**
1. Navigate to a page in Norwegian (default): `/about-us`
2. Copy URL from address bar
3. Paste into text editor and verify: should be `https://example.com/about-us`
4. Navigate to German version: `/de/über-uns`
5. Copy URL from address bar
6. Paste into text editor and verify: should be `https://example.com/de/über-uns`
7. Switch to French
8. Copy and verify URL contains `/fr/`

**Expected Results:**
- URLs copied from address bar include language codes
- No query parameters are added unnecessarily
- Language code is part of the path, not a query string (unless specified otherwise)
- Clean, SEO-friendly URL structure is maintained

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document actual URL format observed]_

---

### Test Case LS-004: Email Link with Language Code

**Test ID:** LS-004  
**Priority:** Medium  
**Category:** Link Sharing

**Objective:** Verify that language-specific URLs work when sent via email.

**Preconditions:**
- Email client available
- Test URLs accessible

**Test Steps:**
1. Navigate to a product page in German: `https://example.com/de/products/test-produkt`
2. Copy the URL
3. Send the URL via email to yourself (or use a test email)
4. Open the email on a different device or browser
5. Click the link from the email
6. Verify the page opens
7. Confirm language is German

**Expected Results:**
- Link in email is clickable and functional
- Page opens in German as specified in URL
- Email clients do not modify or break the URL
- Language preference is respected

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

## 5.6 Sitemap Tests

### Test Case SM-001: Sitemap Contains All Language Versions

**Test ID:** SM-001  
**Priority:** High  
**Category:** Sitemap

**Objective:** Verify that the XML sitemap includes all language-specific URLs.

**Preconditions:**
- Sitemap is generated and accessible
- Test pages exist in all languages

**Test Steps:**
1. Navigate to sitemap URL: `https://example.com/sitemap.xml`
2. Open/download the sitemap file
3. Search for URLs in Norwegian (default): look for entries like `<loc>https://example.com/about-us</loc>`
4. Search for URLs in German: look for entries like `<loc>https://example.com/de/about-us</loc>`
5. Search for URLs in French: look for entries like `<loc>https://example.com/fr/about-us</loc>`
6. Verify that all major pages have entries for each language
7. Count entries per language

**Expected Results:**
- Sitemap contains URLs for all configured languages
- Each page has separate entries for each language
- URL format matches the multilingual SEO structure
- All URLs in sitemap are valid and accessible
- No duplicate URLs exist

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document total number of URLs per language]_

---

### Test Case SM-002: Sitemap hreflang Annotations

**Test ID:** SM-002  
**Priority:** High  
**Category:** Sitemap - SEO

**Objective:** Verify that sitemap includes proper hreflang annotations for multilingual URLs.

**Preconditions:**
- Sitemap is generated
- Hreflang implementation is expected

**Test Steps:**
1. Open sitemap: `https://example.com/sitemap.xml`
2. Locate a URL entry for a page available in multiple languages
3. Check for hreflang annotations within the URL entry
4. Verify hreflang tags exist for each language:
   - `<xhtml:link rel="alternate" hreflang="no" href="https://example.com/about-us"/>`
   - `<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/about-us"/>`
   - `<xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/about-us"/>`
5. Check multiple pages for consistent hreflang implementation

**Expected Results:**
- Sitemap includes hreflang annotations for each URL
- All language versions are cross-referenced
- Language codes match configured languages (no, de, fr)
- hreflang="x-default" is set for the default language
- All referenced URLs are valid

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document hreflang implementation if different from expected]_

---

### Test Case SM-003: Sitemap Accessibility and Format

**Test ID:** SM-003  
**Priority:** Medium  
**Category:** Sitemap

**Objective:** Verify that sitemap is accessible, valid, and follows XML sitemap protocol.

**Preconditions:**
- Sitemap should be publicly accessible

**Test Steps:**
1. Navigate to `https://example.com/sitemap.xml`
2. Verify sitemap loads without errors
3. Check HTTP status code (should be 200)
4. Verify XML format is valid:
   - Check for proper XML declaration: `<?xml version="1.0" encoding="UTF-8"?>`
   - Check for sitemap namespace: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`
5. Validate sitemap using online tool (e.g., xml-sitemaps.com validator)
6. Check robots.txt for sitemap reference

**Expected Results:**
- Sitemap is accessible at standard location
- HTTP 200 status code
- Valid XML structure
- Proper namespaces declared
- Sitemap is referenced in robots.txt
- File size is within limits (50MB, 50,000 URLs per file)

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case SM-004: Dynamic Content in Sitemap

**Test ID:** SM-004  
**Priority:** Medium  
**Category:** Sitemap - Dynamic Content

**Objective:** Verify that dynamic content (products, categories) is included in sitemap with all language versions.

**Preconditions:**
- Products and categories exist with translations
- Sitemap generation includes dynamic content

**Test Steps:**
1. Open sitemap.xml
2. Search for a specific product URL in Norwegian
3. Verify the same product has entries in German and French
4. Search for a category URL in all languages
5. Verify product and category URLs follow multilingual SEO format
6. Check that newly added products/categories appear in sitemap after regeneration

**Expected Results:**
- Dynamic content URLs are present in sitemap
- Each product/category has URLs for all languages
- URL format: `/products/{slug}`, `/de/products/{slug-de}`, `/fr/products/{slug-fr}`
- Sitemap updates when new content is added
- All product/category URLs are accessible

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

## 5.7 Static Routing Tests

### Test Case SR-001: Cart Page with Language Prefix

**Test ID:** SR-001  
**Priority:** Critical  
**Category:** Static Routing

**Objective:** Verify that the cart page (static route) supports multilingual SEO URLs.

**Preconditions:**
- Cart page is accessible
- User has items in cart

**Test Steps:**
1. Add items to cart
2. Navigate to cart in Norwegian (default): `/cart`
3. Verify page loads and displays cart
4. Navigate to cart in German: `/de/cart` or `/de/warenkorb`
5. Verify page loads with German UI
6. Navigate to cart in French: `/fr/cart` or `/fr/panier`
7. Verify page loads with French UI
8. Confirm cart contents are preserved across language changes

**Expected Results:**
- Cart is accessible with language prefixes
- URL format: `/cart`, `/de/cart`, `/fr/cart` (or localized slugs)
- Cart contents remain consistent across languages
- UI elements (buttons, labels) are translated
- No 404 errors occur

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document actual URL format used for cart]_

---

### Test Case SR-002: Checkout Page with Language Prefix

**Test ID:** SR-002  
**Priority:** Critical  
**Category:** Static Routing

**Objective:** Verify that checkout pages support multilingual SEO URLs throughout the checkout flow.

**Preconditions:**
- User has items in cart
- Checkout process is functional

**Test Steps:**
1. Start checkout in Norwegian: `/checkout`
2. Note URL and page language
3. Go back to cart and switch to German
4. Proceed to checkout
5. Verify URL: `/de/checkout` or `/de/kasse`
6. Navigate through checkout steps
7. Verify URL maintains `/de/` prefix
8. Repeat with French language

**Expected Results:**
- Checkout is accessible with language prefixes
- URL maintains language code throughout checkout flow
- All checkout steps (shipping, payment, review) have language-specific URLs
- Form labels and validation messages are in selected language
- Checkout process completes successfully in any language

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case SR-003: Account/Profile Pages with Language Prefix

**Test ID:** SR-003  
**Priority:** High  
**Category:** Static Routing

**Objective:** Verify that user account pages support multilingual SEO URLs.

**Preconditions:**
- User is logged in
- Account pages are accessible

**Test Steps:**
1. Navigate to account/profile page in Norwegian: `/account` or `/profile`
2. Note URL and verify page content
3. Switch to German
4. Verify URL updates: `/de/account` or `/de/profil`
5. Navigate to sub-pages:
   - Order history: `/de/account/orders` or `/de/konto/bestellungen`
   - Profile settings: `/de/account/settings`
   - Addresses: `/de/account/addresses`
6. Switch to French and verify similar behavior
7. Verify all account-related pages support language prefixes

**Expected Results:**
- Account pages accessible with language prefixes
- URL format maintains language code
- Sub-pages also include language prefixes
- All account data displays correctly regardless of language
- UI is translated appropriately

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document URL structure for account pages]_

---

### Test Case SR-004: Static Content Pages with Language Prefix

**Test ID:** SR-004  
**Priority:** High  
**Category:** Static Routing

**Objective:** Verify that static content pages (About Us, Contact, etc.) support multilingual SEO URLs.

**Preconditions:**
- Static pages exist with translations

**Test Steps:**
1. Navigate to About Us in Norwegian: `/about-us`
2. Verify content is in Norwegian
3. Navigate to About Us in German: `/de/über-uns` or `/de/about-us`
4. Verify content is in German
5. Navigate to About Us in French: `/fr/à-propos` or `/fr/about-us`
6. Verify content is in French
7. Repeat for other static pages:
   - Contact: `/contact`, `/de/kontakt`, `/fr/contact`
   - Privacy Policy, Terms of Service, etc.

**Expected Results:**
- Static pages are accessible with language prefixes
- Content is translated and displays correctly
- URL slugs may be localized (e.g., `/über-uns` vs `/about-us`)
- Breadcrumbs display in correct language
- Meta tags reflect correct language

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document URL patterns for static pages]_

---

### Test Case SR-005: Account Sub-Pages with Language Prefix (url/cultureName/account/pageName)

**Test ID:** SR-005  
**Priority:** Critical  
**Category:** Static Routing - Account Pages

**Objective:** Verify that all account sub-pages follow the multilingual URL pattern `url/cultureName/account/pageName` and maintain consistent language routing.

**Preconditions:**
- User is logged in with valid credentials
- Account pages are accessible
- Multiple languages are configured (English, German, Norwegian, French)

**Test Steps:**
1. **Dashboard Page:**
   - Navigate to `/account/dashboard` (English - default)
   - Verify URL structure and page loads correctly
   - Switch to German and verify URL: `/de/account/dashboard`
   - Switch to Norwegian and verify URL: `/no/account/dashboard`
   - Switch to French and verify URL: `/fr/account/dashboard`

2. **Orders Page:**
   - Navigate to `/de/account/orders`
   - Verify URL structure maintains language prefix
   - Verify order history displays correctly
   - Verify date/number formatting matches German locale
   - Click on individual order and verify URL: `/de/account/orders/{orderId}`

3. **Profile/Settings Page:**
   - Navigate to `/de/account/profile` or `/de/account/settings`
   - Verify form fields are translated
   - Verify placeholder text is localized
   - Submit form and verify success messages are translated

4. **Addresses Page:**
   - Navigate to `/de/account/addresses`
   - Verify address list displays correctly
   - Add new address and verify form is translated
   - Verify URL remains: `/de/account/addresses/add`

5. **Wishlist/Lists Page:**
   - Navigate to `/de/account/lists` or `/de/account/wishlist`
   - Verify product lists display correctly
   - Verify all UI elements are translated

6. **Payment Methods Page:**
   - Navigate to `/de/account/payment-methods`
   - Verify payment forms are localized
   - Verify currency symbols match locale

7. **Notifications Page:**
   - Navigate to `/de/account/notifications`
   - Verify notification messages are translated

**Expected Results:**
- All account sub-pages follow `url/cultureName/account/pageName` pattern
- URL maintains language prefix throughout navigation
- All UI elements (labels, buttons, messages) are translated
- Date/time formatting matches selected locale (DD.MM.YYYY for German, MM/DD/YYYY for English)
- Number formatting matches selected locale (1.234,56 for German, 1,234.56 for English)
- Currency symbols and formats are appropriate
- Breadcrumbs maintain language prefix: `/de/ > Account > Orders`
- Form validation messages are translated
- Error messages are localized
- All internal links maintain language prefix
- Page titles reflect translated page names
- Meta tags include correct language attributes

**Test Data:**
| Language | Base URL | Dashboard | Orders | Profile | Addresses |
|----------|----------|-----------|--------|---------|-----------|
| English (Default) | `/account` | `/account/dashboard` | `/account/orders` | `/account/profile` | `/account/addresses` |
| German | `/de/account` | `/de/account/dashboard` | `/de/account/orders` | `/de/account/profile` | `/de/account/addresses` |
| Norwegian | `/no/account` | `/no/account/dashboard` | `/no/account/orders` | `/no/account/profile` | `/no/account/addresses` |
| French | `/fr/account` | `/fr/account/dashboard` | `/fr/account/orders` | `/fr/account/profile` | `/fr/account/addresses` |

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document actual URL structure, any deviations, and localization quality]_

---

### Test Case SR-006: Company Info Page with Language Prefix (url/cultureName/company/info)

**Test ID:** SR-006  
**Priority:** High  
**Category:** Static Routing - Company Pages

**Objective:** Verify that the company information page follows the multilingual URL pattern `url/cultureName/company/info` and displays localized company details.

**Preconditions:**
- User is logged in to a corporate/B2B account
- Company information page is accessible
- Company profile has been configured
- Multiple languages are configured

**Test Steps:**
1. **English (Default) Language:**
   - Navigate to `/company/info`
   - Verify page loads with company information
   - Note all displayed fields (company name, address, tax ID, etc.)
   - Verify page title and meta tags

2. **German Language:**
   - Switch language to German
   - Verify URL automatically updates to `/de/company/info`
   - OR manually navigate to `/de/company/info`
   - Verify company information displays correctly
   - Check translations for:
     - Page title: "Unternehmensinformationen"
     - Field labels: "Firmenname", "Adresse", "Steuernummer"
     - Buttons: "Bearbeiten", "Speichern", "Abbrechen"
   - Verify date formatting (DD.MM.YYYY for German)
   - Verify phone number formatting (German style)

3. **Norwegian Language:**
   - Navigate to `/no/company/info`
   - Verify company details display correctly
   - Check Norwegian translations:
     - Page title: "Firmainformasjon"
     - Field labels in Norwegian
   - Verify date formatting (DD.MM.YYYY for Norwegian)

4. **French Language:**
   - Navigate to `/fr/company/info`
   - Verify company details display correctly
   - Check French translations:
     - Page title: "Informations sur l'entreprise"
     - Field labels in French
   - Verify date formatting (DD/MM/YYYY for French)

5. **Content Localization:**
   - Verify company description/bio is translated (if multilingual content exists)
   - Verify industry/category labels are translated
   - Verify status indicators are translated (Active, Pending, etc.)

6. **Functional Testing:**
   - Click "Edit" button (if available) and verify URL: `/de/company/info/edit`
   - Verify edit form is fully translated
   - Submit changes and verify success message is translated
   - Verify error messages are localized (try invalid data)

7. **Navigation Consistency:**
   - Verify breadcrumbs: `Home > Company > Information` (translated)
   - Verify all breadcrumb links maintain language prefix
   - Click any navigation link and verify language prefix persists

8. **SEO Verification:**
   - Inspect page source for `<html lang="de">` attribute
   - Verify meta description is translated
   - Check for canonical tag: `<link rel="canonical" href=".../de/company/info" />`
   - Check for hreflang tags pointing to all language versions

**Expected Results:**
- Company info page accessible at `url/cultureName/company/info` for all languages
- URL structure is consistent: `/de/company/info`, `/no/company/info`, `/fr/company/info`
- All UI elements are fully translated
- Company data displays correctly (unchanged across languages)
- Field labels and descriptions are localized
- Date/time/phone formatting matches locale
- Breadcrumbs maintain language prefix
- Edit functionality (if available) maintains language prefix
- SEO tags are correctly implemented
- Language switcher updates URL appropriately
- Direct URL access works (typing `/de/company/info` directly)
- Page is accessible and functional across languages

**Test Data:**
| Language | URL | Expected Page Title | Edit URL |
|----------|-----|---------------------|----------|
| English (Default) | `/company/info` | Company Information | `/company/info/edit` |
| German | `/de/company/info` | Unternehmensinformationen | `/de/company/info/edit` |
| Norwegian | `/no/company/info` | Firmainformasjon | `/no/company/info/edit` |
| French | `/fr/company/info` | Informations sur l'entreprise | `/fr/company/info/edit` |

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document company info page structure, field translations, and any issues]_

---

### Test Case SR-007: Company Members Page with Language Prefix (url/cultureName/company/members)

**Test ID:** SR-007  
**Priority:** High  
**Category:** Static Routing - Company Pages

**Objective:** Verify that the company members page follows the multilingual URL pattern `url/cultureName/company/members` and displays localized member information and controls.

**Preconditions:**
- User is logged in to a corporate/B2B account with appropriate permissions
- Company has multiple members/users
- Company members page is accessible
- Multiple languages are configured

**Test Steps:**
1. **English (Default) Language:**
   - Navigate to `/company/members`
   - Verify page loads with list of company members
   - Note all columns: Name, Email, Role, Status, Actions
   - Verify pagination (if applicable)
   - Verify search/filter functionality
   - Note any action buttons: Add Member, Edit, Delete, etc.

2. **German Language:**
   - Switch language to German
   - Verify URL automatically updates to `/de/company/members`
   - OR manually navigate to `/de/company/members`
   - Verify member list displays correctly
   - Check translations for:
     - Page title: "Firmenmitglieder"
     - Table headers: "Name", "E-Mail", "Rolle", "Status", "Aktionen"
     - Status labels: "Aktiv", "Inaktiv", "Ausstehend"
     - Role labels: "Administrator", "Manager", "Mitarbeiter"
     - Buttons: "Mitglied hinzufügen", "Bearbeiten", "Löschen"
     - Search placeholder: "Mitglieder suchen"
     - Pagination: "Seite 1 von 5", "Weiter", "Zurück"

3. **Norwegian Language:**
   - Navigate to `/no/company/members`
   - Verify member list displays correctly
   - Check Norwegian translations:
     - Page title: "Firmamedlemmer"
     - Table headers and actions in Norwegian

4. **French Language:**
   - Navigate to `/fr/company/members`
   - Verify member list displays correctly
   - Check French translations:
     - Page title: "Membres de l'entreprise"
     - Table headers and actions in French

5. **Member Details/View:**
   - Click on a member name or "View" button
   - Verify URL updates to: `/de/company/members/{memberId}`
   - Verify member detail page is fully translated
   - Verify all member information displays correctly
   - Check breadcrumbs: `Home > Company > Members > [Member Name]`

6. **Add Member Functionality:**
   - Click "Add Member" button
   - Verify URL: `/de/company/members/add` or `/de/company/members/new`
   - Verify add member form is fully translated
   - Check form field labels:
     - "Vorname" (First Name)
     - "Nachname" (Last Name)
     - "E-Mail-Adresse" (Email Address)
     - "Rolle" (Role)
     - "Berechtigungen" (Permissions)
   - Verify dropdown options are translated
   - Submit form and verify success message: "Mitglied erfolgreich hinzugefügt"

7. **Edit Member Functionality:**
   - Click "Edit" button on a member
   - Verify URL: `/de/company/members/{memberId}/edit`
   - Verify edit form is fully translated
   - Update member details
   - Verify success message is translated

8. **Delete Member Functionality:**
   - Click "Delete" button on a member
   - Verify confirmation dialog is translated: "Möchten Sie dieses Mitglied wirklich löschen?"
   - Verify dialog buttons: "Löschen", "Abbrechen"
   - Cancel and verify URL remains unchanged

9. **Search and Filter:**
   - Use search box to find members
   - Verify search works correctly
   - Verify "No results" message is translated: "Keine Ergebnisse gefunden"
   - Use filters (by role, status, etc.)
   - Verify filter labels are translated

10. **Pagination Testing:**
    - Navigate through pages
    - Verify pagination controls are translated
    - Verify URL updates with page parameter: `/de/company/members?page=2`
    - Verify language prefix is maintained in pagination URLs

11. **Permissions Verification:**
    - Test with user having limited permissions
    - Verify permission error messages are translated
    - Verify disabled buttons have appropriate translated tooltips

**Expected Results:**
- Company members page accessible at `url/cultureName/company/members` for all languages
- URL structure is consistent across languages
- Member list displays correctly with all data
- All UI elements (headers, buttons, labels) are translated
- Status and role labels are localized
- Search and filter functionality works correctly
- Search placeholder text is translated
- "No results" messages are localized
- Add member form is fully translated
- Edit member form is fully translated
- Delete confirmation dialogs are translated
- Success/error messages are localized
- Pagination controls are translated
- Breadcrumbs maintain language prefix and are translated
- Sub-page URLs maintain pattern: `/de/company/members/{action}`
- Date fields show proper locale formatting
- Permission-related messages are translated
- All action buttons work correctly
- Language switcher maintains current page context

**Test Data:**
| Language | Base URL | Add Member | View Member | Edit Member | Search Placeholder |
|----------|----------|------------|-------------|-------------|--------------------|
| English (Default) | `/company/members` | `/company/members/add` | `/company/members/{id}` | `/company/members/{id}/edit` | "Search members" |
| German | `/de/company/members` | `/de/company/members/add` | `/de/company/members/{id}` | `/de/company/members/{id}/edit` | "Mitglieder suchen" |
| Norwegian | `/no/company/members` | `/no/company/members/add` | `/no/company/members/{id}` | `/no/company/members/{id}/edit` | "Søk medlemmer" |
| French | `/fr/company/members` | `/fr/company/members/add` | `/fr/company/members/{id}` | `/fr/company/members/{id}/edit` | "Rechercher des membres" |

**Test Scenarios:**
1. **Scenario: Empty Members List**
   - Login to account with no members
   - Navigate to `/de/company/members`
   - Verify empty state message is translated: "Keine Mitglieder gefunden. Fügen Sie das erste Mitglied hinzu."

2. **Scenario: Member Invite**
   - Add a member
   - Verify invite email is sent
   - Note: Email template translation is out of scope, but verify UI messages

3. **Scenario: Bulk Actions**
   - Select multiple members
   - Verify bulk action buttons are translated
   - Verify bulk delete confirmation is translated

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document company members page structure, translation quality, and any functional issues]_

---

## 5.8 SEO Elements Tests

### Test Case SEO-001: Canonical Tags Verification

**Test ID:** SEO-001  
**Priority:** High  
**Category:** SEO Elements

**Objective:** Verify that each page includes proper canonical tags for SEO.

**Preconditions:**
- Pages are accessible in multiple languages

**Test Steps:**
1. Navigate to a page in Norwegian: `/about-us`
2. View page source (right-click > View Page Source)
3. Search for `<link rel="canonical"` in the source
4. Verify canonical URL points to the correct version
5. Navigate to the same page in German: `/de/about-us`
6. View page source
7. Verify canonical URL for German version
8. Repeat for French version
9. Test on multiple page types (product, category, static)

**Expected Results:**
- Each page has a canonical tag in the `<head>` section
- Canonical URL matches the current page URL
- Format: `<link rel="canonical" href="https://example.com/de/about-us" />`
- No duplicate canonical tags exist
- Canonical tags are consistent across all page types

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document actual canonical tag implementation]_

---

### Test Case SEO-002: Hreflang Tags Verification

**Test ID:** SEO-002  
**Priority:** Critical  
**Category:** SEO Elements

**Objective:** Verify that pages include proper hreflang tags to indicate language alternatives.

**Preconditions:**
- Pages exist in multiple languages

**Test Steps:**
1. Navigate to a page in Norwegian: `/about-us`
2. View page source
3. Search for `<link rel="alternate" hreflang=` tags
4. Verify hreflang tags exist for all language versions:
   ```html
   <link rel="alternate" hreflang="no" href="https://example.com/about-us" />
   <link rel="alternate" hreflang="de" href="https://example.com/de/about-us" />
   <link rel="alternate" hreflang="fr" href="https://example.com/fr/about-us" />
   <link rel="alternate" hreflang="x-default" href="https://example.com/about-us" />
   ```
5. Verify the same tags exist on German and French versions
6. Test on product pages, category pages, and static pages

**Expected Results:**
- All pages have hreflang tags in the `<head>` section
- Tags reference all available language versions of the page
- `hreflang="x-default"` points to default language (Norwegian)
- Language codes match configured languages (no, de, fr)
- URLs in hreflang tags are absolute and correct
- Hreflang implementation is consistent across all pages

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document actual hreflang implementation]_

---

### Test Case SEO-003: Meta Tags Language Verification

**Test ID:** SEO-003  
**Priority:** Medium  
**Category:** SEO Elements

**Objective:** Verify that meta tags reflect the correct language for each page version.

**Preconditions:**
- Pages have meta tags configured

**Test Steps:**
1. Navigate to a page in Norwegian
2. View page source
3. Check meta tags:
   - `<html lang="no">` or `<html lang="nb-NO">`
   - `<meta property="og:locale" content="no_NO" />`
   - `<meta name="description"` content in Norwegian
   - `<meta property="og:title"` content in Norwegian
4. Navigate to the same page in German
5. Verify meta tags reflect German:
   - `<html lang="de">`
   - `<meta property="og:locale" content="de_DE" />`
   - Meta content in German
6. Repeat for French

**Expected Results:**
- HTML lang attribute matches page language
- Open Graph locale matches page language
- Meta descriptions are translated
- Meta titles are translated
- All language-specific meta tags are consistent with displayed content

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document meta tag implementations]_

---

### Test Case SEO-004: Open Graph Tags for Social Sharing

**Test ID:** SEO-004  
**Priority:** Medium  
**Category:** SEO Elements

**Objective:** Verify that Open Graph tags are properly configured for social media sharing in all languages.

**Preconditions:**
- Pages have Open Graph tags

**Test Steps:**
1. Navigate to a product page in German: `/de/products/test-produkt`
2. View page source
3. Verify Open Graph tags:
   - `<meta property="og:url" content="https://example.com/de/products/test-produkt" />`
   - `<meta property="og:title"` (in German)
   - `<meta property="og:description"` (in German)
   - `<meta property="og:image"` (product image)
   - `<meta property="og:locale" content="de_DE" />`
4. Repeat for French version
5. Test social media preview using Facebook Sharing Debugger or similar tool

**Expected Results:**
- og:url contains the language-specific URL
- og:title and og:description are translated
- og:locale matches the page language
- og:image is properly set
- Social media preview shows correct language content

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case SEO-005: Structured Data Language Verification

**Test ID:** SEO-005  
**Priority:** Low  
**Category:** SEO Elements

**Objective:** Verify that structured data (JSON-LD) reflects the correct language.

**Preconditions:**
- Pages include structured data markup

**Test Steps:**
1. Navigate to a product page in German
2. View page source
3. Look for JSON-LD structured data: `<script type="application/ld+json">`
4. Verify that text fields in structured data are in German
5. Check for `inLanguage` property if present
6. Repeat for French version
7. Validate structured data using Google's Rich Results Test

**Expected Results:**
- Structured data content matches page language
- Product names, descriptions in structured data are translated
- `inLanguage` property (if present) matches page language
- Structured data is valid and error-free
- No mixed-language content in structured data

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Document structured data implementation]_

---

## 5.9 Cross-Page Navigation Tests

### Test Case CN-001: Navigation Menu Language Consistency

**Test ID:** CN-001  
**Priority:** High  
**Category:** Cross-Page Navigation

**Objective:** Verify that navigation menus maintain language consistency when navigating between pages.

**Preconditions:**
- User is browsing in a specific language (e.g., German)

**Test Steps:**
1. Switch language to German
2. Verify URL shows `/de/` prefix
3. Click on navigation menu items (e.g., Products, Categories, About)
4. Verify each clicked link maintains `/de/` prefix
5. Check that menu labels are in German
6. Navigate through multiple pages
7. Confirm language remains consistent
8. Repeat test with French

**Expected Results:**
- All navigation links include the language prefix
- Clicking navigation items maintains language context
- Menu labels and items are translated
- URLs consistently show language code
- No unexpected language switches occur

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case CN-002: Breadcrumb Navigation Language Consistency

**Test ID:** CN-002  
**Priority:** Medium  
**Category:** Cross-Page Navigation

**Objective:** Verify that breadcrumb navigation displays correctly in the selected language.

**Preconditions:**
- Pages have breadcrumb navigation
- User is viewing nested pages (e.g., category > subcategory > product)

**Test Steps:**
1. Navigate to a product page in German: `/de/category/subcategory/product`
2. Observe breadcrumb trail
3. Verify breadcrumb labels are in German (e.g., "Startseite > Kategorie > Produkt")
4. Click on a breadcrumb link (e.g., category)
5. Verify URL maintains `/de/` prefix
6. Verify destination page is in German
7. Repeat for French language

**Expected Results:**
- Breadcrumb labels are translated to selected language
- Breadcrumb links include language prefix
- Clicking breadcrumbs maintains language context
- Breadcrumb structure reflects localized page hierarchy

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case CN-003: Search Results Language Consistency

**Test ID:** CN-003  
**Priority:** High  
**Category:** Cross-Page Navigation

**Objective:** Verify that search functionality maintains language consistency.

**Preconditions:**
- Search functionality is available
- Products/content exist with translations

**Test Steps:**
1. Switch to German language
2. Verify URL: `/de/`
3. Enter search query in German (e.g., "produkt")
4. Submit search
5. Verify search results URL: `/de/search?q=produkt`
6. Check that search results are displayed in German
7. Click on a search result (product)
8. Verify product page opens with `/de/` prefix
9. Verify product is displayed in German

**Expected Results:**
- Search results page URL includes language prefix
- Search results display in selected language
- Product names and descriptions in results are translated
- Clicking search results maintains language context
- Search interface (labels, buttons) is translated

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case CN-004: Pagination Language Consistency

**Test ID:** CN-004  
**Priority:** Medium  
**Category:** Cross-Page Navigation

**Objective:** Verify that pagination controls maintain language consistency on catalog pages.

**Preconditions:**
- Category or search results have multiple pages
- User is viewing in a specific language

**Test Steps:**
1. Navigate to a category in French: `/fr/category/electronics`
2. Verify page has pagination controls
3. Check pagination URLs include `/fr/` prefix
4. Click "Next" or page number
5. Verify URL: `/fr/category/electronics?page=2`
6. Verify content remains in French
7. Click through multiple pages
8. Confirm language consistency throughout

**Expected Results:**
- Pagination URLs include language prefix
- Clicking pagination maintains language context
- Pagination controls are translated (Next, Previous, etc.)
- No language switching occurs during pagination
- URL parameters are appended correctly

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

### Test Case CN-005: Footer Links Language Consistency

**Test ID:** CN-005  
**Priority:** Medium  
**Category:** Cross-Page Navigation

**Objective:** Verify that footer links maintain language consistency.

**Preconditions:**
- Footer contains links to various pages
- User is browsing in a specific language

**Test Steps:**
1. Switch to German language
2. Scroll to page footer
3. Verify footer links are in German
4. Inspect link URLs (hover or inspect element)
5. Verify links include `/de/` prefix
6. Click on footer link (e.g., "Kontakt", "Datenschutz")
7. Verify destination page URL includes `/de/`
8. Verify destination page content is in German

**Expected Results:**
- Footer link text is translated
- Footer link URLs include language prefix
- Clicking footer links maintains language context
- All footer pages open in the selected language

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Additional observations]_

---

## 5.10 Browser Compatibility Tests

### Test Case BC-001: Chrome Browser Compatibility

**Test ID:** BC-001  
**Priority:** High  
**Category:** Browser Compatibility

**Objective:** Verify multilingual SEO URLs work correctly in Google Chrome.

**Preconditions:**
- Google Chrome browser (latest version)

**Test Steps:**
1. Open Chrome browser
2. Clear cache and cookies
3. Navigate to storefront
4. Test language switching functionality
5. Test URL routing with language prefixes
6. Verify local storage persistence
7. Test sharing/copying URLs
8. Check console for JavaScript errors (F12 > Console)

**Expected Results:**
- All multilingual features work as expected in Chrome
- No console errors related to language switching
- URLs display correctly in address bar
- Local storage functions properly
- No rendering issues

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Chrome version tested: ___]_

---

### Test Case BC-002: Firefox Browser Compatibility

**Test ID:** BC-002  
**Priority:** High  
**Category:** Browser Compatibility

**Objective:** Verify multilingual SEO URLs work correctly in Mozilla Firefox.

**Preconditions:**
- Mozilla Firefox browser (latest version)

**Test Steps:**
1. Open Firefox browser
2. Clear cache and cookies
3. Navigate to storefront
4. Test language switching functionality
5. Test URL routing with language prefixes
6. Verify local storage persistence
7. Test sharing/copying URLs
8. Check console for JavaScript errors (F12 > Console)

**Expected Results:**
- All multilingual features work as expected in Firefox
- No console errors related to language switching
- URLs display correctly in address bar
- Local storage functions properly
- No rendering issues

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Firefox version tested: ___]_

---

### Test Case BC-003: Safari Browser Compatibility

**Test ID:** BC-003  
**Priority:** High  
**Category:** Browser Compatibility

**Objective:** Verify multilingual SEO URLs work correctly in Safari.

**Preconditions:**
- Safari browser (latest version, macOS or iOS)

**Test Steps:**
1. Open Safari browser
2. Clear cache and cookies
3. Navigate to storefront
4. Test language switching functionality
5. Test URL routing with language prefixes
6. Verify local storage persistence
7. Test sharing/copying URLs
8. Check console for JavaScript errors (Develop menu > Show JavaScript Console)

**Expected Results:**
- All multilingual features work as expected in Safari
- No console errors related to language switching
- URLs display correctly in address bar
- Local storage functions properly
- No rendering issues

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Safari version tested: ___]_

---

### Test Case BC-004: Edge Browser Compatibility

**Test ID:** BC-004  
**Priority:** Medium  
**Category:** Browser Compatibility

**Objective:** Verify multilingual SEO URLs work correctly in Microsoft Edge.

**Preconditions:**
- Microsoft Edge browser (latest version)

**Test Steps:**
1. Open Edge browser
2. Clear cache and cookies
3. Navigate to storefront
4. Test language switching functionality
5. Test URL routing with language prefixes
6. Verify local storage persistence
7. Test sharing/copying URLs
8. Check console for JavaScript errors (F12 > Console)

**Expected Results:**
- All multilingual features work as expected in Edge
- No console errors related to language switching
- URLs display correctly in address bar
- Local storage functions properly
- No rendering issues

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Edge version tested: ___]_

---

### Test Case BC-005: Mobile Browser Compatibility (iOS Safari)

**Test ID:** BC-005  
**Priority:** High  
**Category:** Browser Compatibility - Mobile

**Objective:** Verify multilingual SEO URLs work correctly on iOS Safari (iPhone).

**Preconditions:**
- iPhone or iPad with Safari
- OR Chrome DevTools device emulation

**Test Steps:**
1. Open Safari on iOS device (or use device emulation)
2. Navigate to storefront
3. Test language switching via mobile interface
4. Verify URL routing with language prefixes
5. Test local storage persistence
6. Test sharing URLs via iOS share sheet
7. Verify touch interactions work properly

**Expected Results:**
- All multilingual features work on iOS Safari
- Language switcher is accessible and functional on mobile
- URLs display correctly
- Local storage persists across sessions
- Share functionality preserves language codes
- Mobile UI is responsive and functional

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[iOS version tested: ___]_

---

### Test Case BC-006: Mobile Browser Compatibility (Chrome Android)

**Test ID:** BC-006  
**Priority:** High  
**Category:** Browser Compatibility - Mobile

**Objective:** Verify multilingual SEO URLs work correctly on Chrome for Android.

**Preconditions:**
- Android device with Chrome
- OR Chrome DevTools device emulation

**Test Steps:**
1. Open Chrome on Android device (or use device emulation)
2. Navigate to storefront
3. Test language switching via mobile interface
4. Verify URL routing with language prefixes
5. Test local storage persistence
6. Test sharing URLs via Android share sheet
7. Verify touch interactions work properly

**Expected Results:**
- All multilingual features work on Chrome Android
- Language switcher is accessible and functional on mobile
- URLs display correctly
- Local storage persists across sessions
- Share functionality preserves language codes
- Mobile UI is responsive and functional

**Actual Results:**  
_[To be filled during test execution]_

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] Not Tested

**Notes:**  
_[Android version tested: ___]_

---

## 6. Test Data Reference

See [test-data.md](./test-data.md) for detailed test data including:
- Sample URLs for each language
- Expected translations
- Test product/category data
- Sample error scenarios

---

## 7. Test Execution Summary

### Test Execution Tracking

| Test Category | Total Tests | Passed | Failed | Blocked | Not Tested |
|---------------|-------------|--------|--------|---------|------------|
| Routing Tests | 5 | | | | |
| Language Switching | 4 | | | | |
| Local Storage Persistence | 4 | | | | |
| Error Handling | 4 | | | | |
| Link Sharing | 4 | | | | |
| Sitemap Tests | 4 | | | | |
| Static Routing | 4 | | | | |
| SEO Elements | 5 | | | | |
| Cross-Page Navigation | 5 | | | | |
| Browser Compatibility | 6 | | | | |
| **TOTAL** | **45** | **0** | **0** | **0** | **45** |

### High Priority Issues Log

| Issue ID | Test Case | Description | Severity | Status |
|----------|-----------|-------------|----------|--------|
| | | | | |

### Test Environment Details

**Storefront URL:** _______________________  
**Test Date:** _______________________  
**Tester Name:** _______________________  
**Build/Version:** _______________________

### Overall Test Summary

**Total Test Cases:** 45  
**Execution Date:** __________  
**Overall Status:** [ ] Pass [ ] Fail  

**Notes:**  
_[Overall observations and recommendations]_

---

## Appendix A: Language Code Reference

| Language | ISO 639-1 Code | ISO 3166-1 Code | Example URL Prefix |
|----------|----------------|-----------------|-------------------|
| Norwegian | no | NO | `/` (default, no prefix) |
| German | de | DE | `/de/` |
| French | fr | FR | `/fr/` |

## Appendix B: Test Case Priority Definitions

- **Critical:** Core functionality, blocking issues
- **High:** Important features, significant impact
- **Medium:** Standard features, moderate impact
- **Low:** Nice-to-have features, minimal impact

## Appendix C: Useful Tools

- **Browser DevTools:** Inspect elements, network traffic, local storage
- **XML Sitemap Validator:** https://www.xml-sitemaps.com/validate-xml-sitemap.html
- **Google Rich Results Test:** https://search.google.com/test/rich-results
- **Facebook Sharing Debugger:** https://developers.facebook.com/tools/debug/
- **hreflang Tag Validator:** https://www.aleydasolis.com/english/international-seo-tools/hreflang-tags-generator/

---

**End of Test Plan**

