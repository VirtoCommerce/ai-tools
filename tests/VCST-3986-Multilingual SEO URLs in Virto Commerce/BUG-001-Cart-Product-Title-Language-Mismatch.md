# Bug Report: BUG-001 - Cart Product Title Not Translated After Language Switch

**Report Date:** October 14, 2025  
**Reporter:** AI Assistant  
**Environment:** QA (https://vcst-qa-storefront.govirto.com/)  
**Severity:** 🟡 **Medium** (Usability Issue)  
**Priority:** 📊 **Medium**  
**Status:** 🆕 **New**  
**Category:** Localization / User Experience

---

## 📋 Summary

When a user adds a product to the cart in one language (e.g., Norwegian) and then switches to another language (e.g., German), the product title in the cart remains in the original language instead of updating to the current language.

---

## 🔍 Description

### Issue

Cart items do not update their product titles when the user switches languages. The product title remains in the language it was added in, creating a mixed-language experience where:
- The cart UI (buttons, labels, headers) is fully translated to the current language
- The product titles remain in the language from when they were added to cart

This creates an inconsistent user experience, especially for users who frequently switch languages or share cart links across different language regions.

### Expected Behavior

When a user switches the storefront language, **one of the following** should occur:

**Option A (Ideal):** Product titles in the cart should dynamically update to the current language
- All cart content should be in a single, consistent language
- Provides the best user experience

**Option B (Alternative):** Clear indication that items are in a different language
- Show a small flag icon or language code next to each product
- Inform user that cart contains items in multiple languages
- Provide an option to "Update cart language"

### Actual Behavior

Product titles in the cart retain their original language after language switch:
- Cart added in Norwegian (NO) → Product shows Norwegian title
- Language switched to German (DE) → Product title still shows Norwegian
- Only the cart UI elements translate, not the product data

---

## 🔁 Steps to Reproduce

1. **Set language to Norwegian (NO)**
   - Language selector shows: "Språk: norsk (Norge) no"
   - URL: `https://vcst-qa-storefront.govirto.com/no/`

2. **Search for and add product to cart**
   - Search for SKU: "ALCE1993"
   - Product found: "[NO] 10-tommers bærbar digital TV-spiller 1080P HDMI mini bil-TV DVB-T/T2 ISDB-T USB SD VGA"
   - Add 1 unit to cart
   - Navigate to cart: `/no/cart`

3. **Verify cart in Norwegian**
   - Cart page title: "Handlekurv"
   - Product title: "[NO] 10-tommers bærbar digital TV-spiller 1080P HDMI mini bil-TV DVB-T/T2 ISDB-T USB SD VGA"

4. **Switch language to German (DE)**
   - Click language selector
   - Select "Deutsch"
   - URL changes to: `/de/cart`

5. **Observe product title**
   - Cart page title: "Warenkorb" ✅ (correctly translated)
   - All UI elements: German ✅ (correctly translated)
   - Product title in cart: **Still shows Norwegian** ❌
   - Product title in "Recently Viewed": Shows German ✅

---

## 📸 Screenshots

### Screenshot 1: German Cart with Norwegian Product Title

![Cart showing mixed languages](./screenshots/bug-cart-product-title-not-translated.png)

**Evidence:**
- URL: `/de/cart` (German)
- Page Title: "QA & Warenkorb" (German)
- H1 Heading: "Warenkorb" (German)
- Product Title: "[NO] 10-tommers bærbar..." (Norwegian) ❌

### Screenshot Location
```
tests/manual/screenshots/bug-cart-product-title-not-translated.png
```

---

## 🧪 Test Case Reference

**Test ID:** LS-005  
**Test Name:** Cart Page Title Localization After Language Switch  
**Test Status:** ✅ PASSED (Core functionality works, this is an enhancement opportunity)

---

## 💻 Technical Details

### Current Implementation

```
Cart Structure:
{
  locale: "de-DE",                    // Current language ✅
  items: [
    {
      productId: "...",
      title: "[NO] 10-tommers...",    // Original language ❌
      quantity: 1,
      price: 99.99
    }
  ]
}
```

### Observed Behavior

| Component | Language | Status |
|-----------|----------|--------|
| Page URL | German (`/de/cart`) | ✅ Correct |
| Page Title | German ("Warenkorb") | ✅ Correct |
| Cart UI | German (all buttons, labels) | ✅ Correct |
| Product Title (Cart) | Norwegian | ❌ **Not translated** |
| Product Title (Recently Viewed) | German | ✅ Correct |

### Browser Details

- **Browser:** Chromium (Playwright)
- **User Agent:** Mozilla/5.0...
- **Test URL:** `https://vcst-qa-storefront.govirto.com/de/cart`
- **User Account:** USER2 (ricreyacrouyi-3425@yopmail.com)

---

## 🎯 Impact Assessment

### User Impact: **Medium** 🟡

**Affected Users:**
- ✅ Multilingual users who switch languages frequently
- ✅ Users sharing cart links across different language regions
- ✅ B2B customers with international teams
- ❌ Single-language users (not affected)

**Impact Scenarios:**

1. **Multilingual Shopping Experience**
   - User browses in Norwegian, adds items
   - Switches to German for colleague review
   - Colleague sees mixed Norwegian/German content
   - Creates confusion about product details

2. **Shared Cart Links**
   - User creates cart in one language
   - Shares link with colleague in different language
   - Colleague opens link in their preferred language
   - Product titles don't match their language preference

3. **International B2B Teams**
   - Team members from different countries
   - Each prefers their own language
   - Cart appears partially translated
   - Reduces trust in the system

### Business Impact: **Low to Medium** 📊

- **Usability:** Moderate impact - creates confusion but doesn't block purchases
- **Brand Perception:** Minor impact - appears less polished for multilingual users
- **Conversion:** Minimal impact - unlikely to prevent purchases
- **Support Tickets:** Potential increase in "Why is this not translated?" questions

---

## 🔧 Suggested Solutions

### Solution 1: Dynamic Product Title Translation ⭐ **RECOMMENDED**

**Approach:** Fetch product title in current language when rendering cart

```javascript
// Pseudocode
function renderCartItem(item, currentLocale) {
  const productTitle = getProductTitle(item.productId, currentLocale);
  return {
    ...item,
    title: productTitle  // Dynamic translation
  };
}
```

**Pros:**
- ✅ Best user experience
- ✅ Consistent language throughout cart
- ✅ No user action required

**Cons:**
- ⚠️ Requires API call per cart item
- ⚠️ Performance consideration for large carts
- ⚠️ Handling missing translations

### Solution 2: Language Indicator with Manual Update

**Approach:** Show language indicator and provide "Update language" button

```
Product Title: [NO] 10-tommers... 🇳🇴
[Button: Translate to German 🇩🇪]
```

**Pros:**
- ✅ User awareness of language mismatch
- ✅ User control over translation
- ✅ No automatic API calls

**Cons:**
- ⚠️ Requires user action
- ⚠️ Additional UI complexity
- ⚠️ Not as seamless

### Solution 3: Cart Language Lock

**Approach:** Lock cart to the language it was created in

```
⚠️ This cart was created in Norwegian.
[View in Norwegian] [Translate entire cart to German]
```

**Pros:**
- ✅ Clear communication to user
- ✅ Preserves original context
- ✅ Simple to implement

**Cons:**
- ⚠️ Less flexible
- ⚠️ Doesn't solve the root issue
- ⚠️ Poor multilingual experience

---

## 📝 Recommendations

### Immediate Action (Optional)

**Priority:** Medium  
**Effort:** Low to Medium  
**Recommendation:** Implement **Solution 1** (Dynamic Translation) with caching

**Implementation Steps:**

1. **Backend API Enhancement**
   - Add endpoint: `GET /api/cart/translated?locale={code}`
   - Returns cart with all product titles in requested language
   - Implement caching to minimize performance impact

2. **Frontend Integration**
   - Call translation API when language changes
   - Update cart display with translated titles
   - Add loading indicator during translation

3. **Edge Case Handling**
   - If product doesn't have translation in target language:
     - Fall back to default language (English)
     - Show language indicator: `[EN] Product Title`
   - Cache translations for better performance

### Alternative (Quick Fix)

**Priority:** Low  
**Effort:** Very Low  
**Recommendation:** Add visual indicator

- Add small language badge to cart items: 🇳🇴 NO
- Add tooltip: "This item was added in Norwegian"
- Inform user that language can be changed on product page

---

## 🧩 Related Issues

**Possibly Related:**
- Product descriptions in cart (need to verify if they have the same issue)
- Saved lists with products in different languages
- Quote requests with multilingual items
- Email order confirmations language handling

**Should Also Test:**
- Do product properties/attributes translate?
- Do product variant names translate?
- Do error messages translate?

---

## ✅ Workarounds

### For Users

**Workaround 1:** Re-add products in desired language
1. Remove item from cart
2. Switch language
3. Re-add the same product
4. Product will now show in current language

**Workaround 2:** View product in Recently Viewed
- Recently viewed items show correct language
- Click product to see full details in current language

**Workaround 3:** Click product title link
- Product title in cart is still a clickable link
- Opens product page in current language
- Shows full details in German

### For Developers

**Quick Fix:** Document current behavior
- Add tooltip explaining cart language persistence
- Update user documentation
- Set user expectations

---

## 📊 Test Data

### Test Execution Details

| Parameter | Value |
|-----------|-------|
| **Test Date** | October 14, 2025 |
| **Tester** | AI Assistant |
| **Test ID** | LS-005 |
| **Product SKU** | ALCE1993 |
| **Original Language** | Norwegian (no-NO) |
| **Target Language** | German (de-DE) |
| **Cart Item Count** | 1 |
| **Issue Reproduced** | ✅ Yes (100% reproduction rate) |

### Product Details

**Norwegian Title:**
```
[NO] 10-tommers bærbar digital TV-spiller 1080P HDMI mini bil-TV DVB-T/T2 ISDB-T USB SD VGA
```

**German Title (from Recently Viewed):**
```
[DE] 10-Zoll tragbarer digitaler Fernseher 1080P HDMI Mini Auto-TV DVB-T/T2 ISDB-T USB SD VGA
```

**Expected Cart Title (German):**
```
[DE] 10-Zoll tragbarer digitaler Fernseher 1080P HDMI Mini Auto-TV DVB-T/T2 ISDB-T USB SD VGA
```

---

## 🎫 Issue Tracking

### Jira/GitHub Issue Template

```
Title: Cart product titles do not translate after language switch

Type: Enhancement / Usability Issue
Component: Cart, Localization
Affects Version: 2.33.0-pr-1976-d87f
Labels: multilingual, i18n, cart, ux, enhancement

Description:
When users switch languages, cart product titles remain in the language 
they were added in, creating a mixed-language experience.

Steps to Reproduce:
1. Add product to cart in Language A
2. Switch to Language B
3. Observe cart still shows product title in Language A

Expected: Product title should update to Language B
Actual: Product title remains in Language A

Screenshot: [Attached]
```

---

## 🔄 Status Updates

| Date | Status | Updated By | Notes |
|------|--------|------------|-------|
| Oct 14, 2025 | 🆕 New | AI Assistant | Initial bug report created based on test LS-005 |

---

## 📞 Contact

**Reported By:** AI Assistant  
**Email:** [Testing Team Contact]  
**Test Report:** LS-005-TEST-EXECUTION-REPORT.md  
**Related Documentation:** multilingual-seo-urls-test-plan.md

---

## 🏷️ Tags

`multilingual` `i18n` `localization` `cart` `ux` `enhancement` `medium-priority` `norwegian` `german` `translation` `user-experience`

---

**End of Bug Report**

---

## Appendix: Additional Screenshots (If Needed)

### A1. Norwegian Cart (Before Language Switch)
```
URL: /no/cart
Title: Handlekurv
Product: [NO] 10-tommers bærbar digital TV-spiller...
Status: ✅ Correct (all in Norwegian)
```

### A2. German Cart (After Language Switch)
```
URL: /de/cart
Title: Warenkorb
Product: [NO] 10-tommers bærbar digital TV-spiller...  ❌ (still Norwegian!)
Status: ⚠️ Mixed languages
```

### A3. Recently Viewed (Shows Correct Behavior)
```
URL: /de/cart
Section: Kürzlich angesehen
Product: [DE] 10-Zoll tragbarer digitaler Fernseher...  ✅ (German!)
Status: ✅ Correct (translated dynamically)
```

This demonstrates that the system **CAN** translate product titles dynamically (as shown in Recently Viewed), but this feature is not applied to cart items.


