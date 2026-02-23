# Frontend Bug Investigation Report

**Date:** 2026-02-23
**Environment:** QA Storefront (https://vcst-qa-storefront.govirto.com)
**Investigator:** qa-frontend-expert
**Browser:** Chromium via playwright-chrome MCP
**Storefront Version:** 2.42.0-alpha.2241

---

## Table of Contents

1. [Bug 1: PAY-CS-015 - CyberSource CVV Not Masked](#bug-1-pay-cs-015---cybersource-cvv-not-masked)
2. [Bug 2: Broken Product Image CDN Links](#bug-2-broken-product-image-cdn-links)
3. [Summary and Recommendations](#summary-and-recommendations)

---

## Bug 1: PAY-CS-015 - CyberSource CVV Not Masked

### Original Report

| Field | Value |
|-------|-------|
| **ID** | PAY-CS-015 |
| **Original Severity** | MINOR |
| **Summary** | CyberSource CVV/Security code field displays entered digits as plain text instead of masked dots/bullets |
| **Page** | Cart / Checkout - Payment section |
| **Payment Method** | CyberSource |

### Investigation Steps Performed

1. Navigated to storefront cart page with CyberSource payment method selected
2. Identified CyberSource Flex Microform iframes in the DOM
3. Extracted iframe configuration from URL hash fragments
4. Entered CVV value "838" into the security code field
5. Captured screenshots while focused and after blur
6. Entered card number to compare masking behavior between fields
7. Analyzed the microformConfig object for masking options
8. Documented the CyberSource SDK version and initialization parameters

### DOM Inspection Evidence

#### Iframe Structure

Two CyberSource Flex Microform iframes were found in the payment section:

**Card Number Iframe:**
```
Element: iframe[name^="flex-microform-"]
fieldType: "number"
placeholder: "1111 1111 1111 1111"
Source: https://testflex.cybersource.com/microform/bundle/v2.0.2/iframe.html#[JWT]
```

**Security Code (CVV) Iframe:**
```
Element: iframe[name^="flex-microform-"]
fieldType: "securityCode"
placeholder: "..." (bullet characters)
maxLength: 4
Source: https://testflex.cybersource.com/microform/bundle/v2.0.2/iframe.html#[JWT]
```

#### Microform Configuration Extracted

Both iframes share the same `microformConfig` object passed via URL hash:

```json
{
  "styles": {
    "input": {
      "font-size": "1rem",
      "color": "#0a0a0a"
    }
  }
}
```

**Critical finding:** The configuration contains ONLY style properties. There is NO masking configuration, no `type: "password"` directive, and no `masking` option for the securityCode field.

#### CyberSource SDK Details

| Property | Value |
|----------|-------|
| **SDK Version** | Flex Microform v2.0.2 |
| **SDK URL** | `https://testflex.cybersource.com/microform/bundle/v2.0.2/flex-microform.min.js` |
| **Environment** | Test (`testflex.cybersource.com`) |
| **Global Object** | `window.Flex` (confirmed present on page) |

### Observed Behavior

1. **Placeholder displays correctly:** The CVV field shows bullet characters ("...") as placeholder text before any input, suggesting masking was intended.

2. **Entered text is NOT masked:** When "838" was typed into the CVV field, all three digits displayed as plain visible text "838" -- not as dots or bullets.

3. **No masking after blur:** After clicking away from the CVV field (losing focus), the entered value "838" remained visible as plain text. There is no delayed masking behavior.

4. **Card number field also unmasked:** The card number field displayed "4622 9431 2701 3705" as plain text. While card number masking is less standard in payment forms (users need to verify the number), the CVV being visible is the primary concern.

### Screenshots

| Screenshot | Description | Path |
|------------|-------------|------|
| Initial payment form | Cart page with CyberSource selected, empty payment fields | `screenshots/bug1-cybersource-payment-form-initial.png` |
| CVV unmasked (focused) | CVV field showing "838" in plain text while field has focus | `screenshots/bug1-cvv-unmasked-focused.png` |
| CVV unmasked (blurred) | CVV field still showing "838" in plain text after losing focus | `screenshots/bug1-cvv-unmasked-blurred.png` |
| Card number field | Card number field showing "4622 9431 2701 3705" | `screenshots/bug1-card-number-field.png` |
| Complete payment form | Full payment card section with all fields filled | `screenshots/bug1-payment-form-complete.png` |

### Root Cause Analysis

**Root Cause:** The CyberSource Flex Microform initialization code does not configure input masking for the `securityCode` field.

The CyberSource Flex Microform v2 API supports configuring field behavior including input type. When creating the microform fields, the integration code should specify that the security code field render as a masked/password input. The current implementation passes only style configuration:

```javascript
// CURRENT (inferred from extracted config):
microform.createField('securityCode', {
  placeholder: '...',       // Correct: bullet placeholder
  maxLength: 4,             // Correct: max 4 digits
  styles: {                 // Correct: styling
    input: {
      'font-size': '1rem',
      'color': '#0a0a0a'
    }
  }
  // MISSING: No masking/type configuration
});
```

The Flex Microform v2 SDK allows configuring the input field type. The fix requires adding the appropriate masking option during field creation. Depending on the SDK version, this is typically done via:

```javascript
// RECOMMENDED FIX:
microform.createField('securityCode', {
  placeholder: '...',
  maxLength: 4,
  masking: {               // ADD masking configuration
    character: '\u2022'    // Unicode bullet character
  },
  // OR for some SDK versions:
  inputType: 'password',   // Forces type="password" on the iframe input
  styles: {
    input: {
      'font-size': '1rem',
      'color': '#0a0a0a'
    }
  }
});
```

**Note:** Because the CyberSource Flex Microform renders inside a cross-origin iframe (from `testflex.cybersource.com`), the storefront cannot directly manipulate the input field's `type` attribute. Masking MUST be configured through the Flex Microform initialization API. This is a configuration issue on the Virto Commerce integration side, not a CyberSource bug.

### Network Request Details

No network errors related to this bug. The CyberSource SDK and iframe resources load successfully:

| Resource | Status | Notes |
|----------|--------|-------|
| `flex-microform.min.js` | 200 OK | SDK bundle loaded from testflex.cybersource.com |
| `iframe.html#[JWT]` (number) | 200 OK | Card number iframe |
| `iframe.html#[JWT]` (securityCode) | 200 OK | CVV iframe |

### Severity Reassessment

| Aspect | Assessment |
|--------|------------|
| **Original Severity** | MINOR |
| **Reassessed Severity** | **HIGH** |
| **Justification** | CVV exposure has PCI DSS compliance implications. PCI DSS Requirement 3.4 mandates that sensitive authentication data (including CVV/CVC2) must be rendered unreadable. While Flex Microform handles transmission security (data never touches the merchant server), the visual display of CVV to shoulder-surfing or screen-sharing scenarios is a security risk. This could be flagged during a PCI compliance audit. |

**Impact Assessment:**
- **Security Risk:** CVV visible to anyone viewing the screen (shoulder surfing, screen sharing, screen recording)
- **PCI Compliance Risk:** May be flagged as non-compliant during PCI DSS assessment
- **User Trust:** Security-conscious users may notice and lose trust in the payment process
- **Functional Impact:** None -- payment processing works correctly despite the display issue
- **Scope:** Affects all users paying via CyberSource on all browsers/devices

### Recommended Fix

1. **Locate the CyberSource Flex Microform initialization code** in the storefront codebase (likely in a Vue component handling payment methods, possibly `PaymentMethodCyberSource.vue` or similar).

2. **Add masking configuration** to the `createField` call for the `securityCode` field type. Consult CyberSource Flex Microform v2 SDK documentation for the exact parameter name (varies by version: `masking`, `inputType`, or field options).

3. **Verify the card number field** -- while card number masking is less critical (and can interfere with user verification), consider whether partial masking (showing last 4 digits) is desirable.

4. **Test across all environments** -- ensure the fix works on both `testflex.cybersource.com` (test) and `flex.cybersource.com` (production).

5. **Consider upgrading the SDK** -- v2.0.2 may be outdated. Newer versions may have better default masking behavior.

---

## Bug 2: Broken Product Image CDN Links

### Original Report

| Field | Value |
|-------|-------|
| **Original Severity** | LOW |
| **Summary** | 2 failed resource loads for jewelry product images from s1.apart.pl |
| **Initially Reported URLs** | `apart-ap93-0341--0_md.jpg` and `apart-ap538-2861--0_md.jpg` |

### Investigation Steps Performed

1. Navigated to storefront homepage and searched for "apart"
2. Monitored console for image load errors
3. Inspected network requests to identify 404 responses
4. Navigated to product detail page (Gold-Plated Silver Set with Cubic Zirconias)
5. Inspected `<img>` element DOM attributes, discovered `data-size-suffix="md"` attribute
6. Navigated to Jewelry and Gems category page to assess full scope
7. Counted console errors across different pages to quantify impact
8. Verified that original (non-suffixed) image URLs load successfully

### DOM Inspection Evidence

#### Image Element Structure

Product images use the `vc-product-image` component with a `data-size-suffix` attribute:

```html
<img class="vc-product-image__img"
     src="https://s1.apart.pl/products/jewellery/packshot/46692/apart-ap93-0341--0.jpg"
     data-size-suffix="md"
     alt="Image 1"
     loading="eager">
```

**Mechanism:** The storefront JavaScript reads the `data-size-suffix` attribute and attempts to load an optimized thumbnail version of the image by inserting the suffix before the file extension:

- **Original URL:** `apart-ap93-0341--0.jpg`
- **Attempted URL:** `apart-ap93-0341--0_md.jpg` (appends `_md` before `.jpg`)

This suffix convention (`_md` for medium, `_sm` for small) works for images hosted on Virto Commerce's own CDN (`vcst-qa.govirto.com/cms-content/`) where thumbnails are pre-generated. However, external image servers like `s1.apart.pl` do not support this naming convention.

#### Fallback Mechanism

The component implements a fallback: when the `_md` suffixed URL returns a 404, it falls back to the original URL. This means images DO eventually load and display correctly, but the failed `_md` request generates:
- A console error (failed resource load)
- An unnecessary HTTP request (wasted bandwidth and latency)

### Network Request Details

#### From Search Results Page ("apart" query)

| URL | Status | Size | Notes |
|-----|--------|------|-------|
| `https://s1.apart.pl/.../apart-ap93-0341--0_md.jpg` | **404 Not Found** | 0 B | Suffixed URL fails |
| `https://s1.apart.pl/.../apart-ap538-2861--0_md.jpg` | **404 Not Found** | 0 B | Suffixed URL fails |
| `https://s1.apart.pl/.../apart-ap93-0341--0.jpg` | 200 OK | ~50 KB | Original loads via fallback |
| `https://s1.apart.pl/.../apart-ap538-2861--0.jpg` | 200 OK | ~50 KB | Original loads via fallback |

#### From Product Detail Page (Gold-Plated Silver Set)

4 console errors for failed `_md` image loads -- product gallery attempts suffixed versions for all images.

#### From Jewelry and Gems Category Page

**10 console errors** for failed `_md` image loads across product cards in the category listing. Affected products include multiple apart.pl-hosted jewelry items.

### Scope Assessment

**The scope is significantly LARGER than initially reported.**

| Originally Reported | Actual Scope |
|---------------------|--------------|
| 2 failed image loads | 10+ failed loads per category page view |
| Affects 2 specific products | Affects ALL products with images hosted on s1.apart.pl |
| Limited to search results | Affects search results, category pages, AND product detail pages |

The Jewelry and Gems category contains approximately 112 products. Many of these use product images hosted on `s1.apart.pl`. Every page that displays these products generates multiple 404 errors in the console.

**Estimated total impact:** Every page view that includes apart.pl product images generates N failed HTTP requests (where N = number of apart.pl images visible), followed by N successful fallback requests. This effectively doubles the image-related network requests for these products.

### Screenshots

| Screenshot | Description | Path |
|------------|-------------|------|
| Search results | Search dropdown showing "apart" results with product images | `screenshots/bug2-search-results-apart.png` |
| Product detail page | Gold-Plated Silver Set product page with gallery images | `screenshots/bug2-jewelry-product-page.png` |
| Category listing | Beads category page showing product cards with apart.pl images | `screenshots/bug2-beads-category-page.png` |

### Root Cause Analysis

**Root Cause:** The `vc-product-image` component unconditionally applies the `data-size-suffix` attribute to all product images, regardless of whether the image host supports the thumbnail suffix convention.

The suffix convention (`_md`, `_sm`) is a Virto Commerce CDN feature where thumbnails are automatically generated alongside original images. When product images are stored on Virto's CDN (e.g., `vcst-qa.govirto.com/cms-content/catalog/...`), the suffixed URLs resolve correctly.

However, when product image URLs point to external servers (like `s1.apart.pl`), the suffix convention does not apply. The external server has no knowledge of the `_md` suffix convention and returns 404 for all suffixed requests.

**Contributing factors:**
1. Product catalog data contains absolute external URLs for product images (from apart.pl)
2. The `vc-product-image` component does not check whether the image URL is internal (Virto CDN) or external before applying the size suffix
3. No origin/hostname validation before attempting the suffixed URL

### Severity Reassessment

| Aspect | Assessment |
|--------|------------|
| **Original Severity** | LOW |
| **Reassessed Severity** | **LOW** (confirmed, with notes) |
| **Justification** | Visual impact is zero -- images load correctly via fallback. However, the scope is larger than reported and the performance/noise impact is non-trivial. |

**Impact Assessment:**
- **Visual Impact:** None -- all images display correctly after fallback
- **Functional Impact:** None -- product browsing and purchasing work correctly
- **Performance Impact:** Low-to-Medium -- each affected product image generates an unnecessary 404 request before loading the correct image. On the Jewelry and Gems category page, this means ~10 extra failed HTTP requests per page load.
- **Console Noise:** Medium -- 404 errors in the console make it harder to identify real errors during development and debugging
- **SEO Impact:** None -- search engines may log the 404s in their crawl reports but images ultimately load
- **Scope:** All products with external images on s1.apart.pl (primarily Jewelry and Gems category, ~112 products)

### Recommended Fix

**Option 1 (Preferred): Skip size suffix for external URLs**

Modify the `vc-product-image` component to check if the image URL is hosted on the Virto Commerce CDN before applying the size suffix:

```javascript
// Pseudocode for the fix:
function getOptimizedImageUrl(originalUrl, sizeSuffix) {
  const url = new URL(originalUrl);
  const isInternalCdn = url.hostname.includes('govirto.com')
                      || url.hostname.includes('virtocommerce.com');

  if (!isInternalCdn || !sizeSuffix) {
    return originalUrl; // Skip suffix for external images
  }

  // Apply suffix only for internal CDN images
  const ext = originalUrl.lastIndexOf('.');
  return originalUrl.slice(0, ext) + '_' + sizeSuffix + originalUrl.slice(ext);
}
```

**Option 2: Import external images to Virto CDN**

Upload the apart.pl product images to the Virto Commerce CMS content storage. This ensures all images support the thumbnail suffix convention and eliminates dependency on external servers. However, this requires:
- Migrating image data in the product catalog
- Ensuring apart.pl image licensing allows redistribution
- Setting up an image sync process if apart.pl images are updated

**Option 3: Add error suppression for expected 404s**

As a quick fix, the fallback mechanism could suppress console errors for expected 404s when attempting suffixed URLs. This reduces console noise but does not eliminate the unnecessary network requests:

```javascript
// Suppress console error for expected fallback
const img = new Image();
img.onerror = () => {
  // Silently fall back to original URL without console error
  this.src = originalUrl;
};
img.src = suffixedUrl;
```

**Recommended approach:** Option 1 is the cleanest solution. It eliminates unnecessary requests and console errors with minimal code change. The hostname check can be made configurable (e.g., a list of CDN hostnames that support the suffix convention).

---

## Summary and Recommendations

### Bug Comparison

| Aspect | Bug 1: CVV Not Masked | Bug 2: Broken Image CDN Links |
|--------|----------------------|-------------------------------|
| **Original Severity** | MINOR | LOW |
| **Reassessed Severity** | **HIGH** | **LOW** (confirmed) |
| **Severity Change Reason** | PCI DSS compliance risk; CVV visible to shoulder-surfing | Scope larger than reported but no visual/functional impact |
| **User Impact** | Security concern; visible sensitive data | None (images load via fallback) |
| **Functional Impact** | None (payment works) | None (products display correctly) |
| **Fix Complexity** | Low -- configuration change in Flex Microform init | Low-Medium -- URL hostname check in image component |
| **Fix Priority** | **P1 -- Fix before next release** | **P3 -- Fix in regular sprint** |

### Recommended Action Plan

1. **Bug 1 (HIGH priority):** Immediately investigate the CyberSource Flex Microform initialization code in the storefront repository. Add masking configuration for the `securityCode` field. Test across all payment environments (test and production). Target fix for the current sprint.

2. **Bug 2 (LOW priority):** Add the `vc-product-image` component fix to the backlog. The hostname-based check for size suffix application is a low-risk change. Can be scheduled for an upcoming sprint.

3. **Additional recommendation:** Consider auditing other payment method integrations (Skyflow, Authorize.Net, Datatrance) for similar CVV masking issues. If CyberSource has this problem, other integrations may as well.

---

**Report generated:** 2026-02-23
**Investigation tool:** Playwright MCP (chromium)
**All screenshots saved to:** `reports/bugs/screenshots/`
