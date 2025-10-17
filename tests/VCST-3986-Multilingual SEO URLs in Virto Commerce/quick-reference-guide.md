# Quick Reference Guide - Multilingual SEO URL Testing

**🎯 Keep this open while testing for quick access to key information**

---

## 🌍 Language Configuration

| Language | Code | URL Format | Default |
|----------|------|------------|---------|
| Norwegian | `no` | No prefix (/) | ✅ Yes |
| German | `de` | `/de/` prefix | No |
| French | `fr` | `/fr/` prefix | No |

---

## 🔗 Sample URLs (Replace example.com with your URL)

### Static Pages
```
Norwegian: https://example.com/about-us
German:    https://example.com/de/about-us
French:    https://example.com/fr/about-us
```

### Products
```
Norwegian: https://example.com/products/product-slug
German:    https://example.com/de/products/product-slug
French:    https://example.com/fr/products/product-slug
```

### Cart
```
Norwegian: https://example.com/cart
German:    https://example.com/de/cart
French:    https://example.com/fr/cart
```

### Invalid (Should 404)
```
https://example.com/wr-WR/about-us
https://example.com/xx/products
https://example.com/123/cart
```

---

## ✅ What to Check on Every Page

### 1. URL Structure
- [ ] Contains correct language prefix (or no prefix for Norwegian)
- [ ] Clean, SEO-friendly format
- [ ] No broken paths or extra slashes

### 2. Page Content
- [ ] Content displayed in correct language
- [ ] All text translated (headings, buttons, labels)
- [ ] Images display correctly
- [ ] No mixed-language content

### 3. Navigation
- [ ] Language switcher shows correct selection
- [ ] Menu items in correct language
- [ ] Links include language prefix
- [ ] Breadcrumbs translated

### 4. Developer Tools Checks
- [ ] No console errors (F12 → Console)
- [ ] HTTP 200 status (F12 → Network)
- [ ] Local storage has language key (F12 → Application)

---

## 🛠️ Browser DevTools Shortcuts

### Open DevTools
- **Windows/Linux:** `F12` or `Ctrl + Shift + I`
- **Mac:** `Cmd + Option + I`

### View Page Source
- **Windows/Linux:** `Ctrl + U`
- **Mac:** `Cmd + Option + U`

### Inspect Local Storage
1. Open DevTools (F12)
2. Go to **Application** tab (Chrome/Edge) or **Storage** tab (Firefox)
3. Click **Local Storage** → Your domain
4. Look for language/cultureName/locale keys

### Check Network Request
1. Open DevTools (F12)
2. Go to **Network** tab
3. Reload page
4. Click on the page request
5. Check **Status** (should be 200 for valid pages, 404 for invalid)

---

## 🔍 SEO Metadata Checklist

### In Page Source (Right-click → View Page Source)

#### Must Have:
```html
<!-- HTML lang attribute -->
<html lang="de">

<!-- Canonical tag -->
<link rel="canonical" href="https://example.com/de/about-us" />

<!-- Hreflang tags (all languages) -->
<link rel="alternate" hreflang="no" href="https://example.com/about-us" />
<link rel="alternate" hreflang="de" href="https://example.com/de/about-us" />
<link rel="alternate" hreflang="fr" href="https://example.com/fr/about-us" />
<link rel="alternate" hreflang="x-default" href="https://example.com/about-us" />

<!-- Open Graph locale -->
<meta property="og:locale" content="de_DE" />
<meta property="og:url" content="https://example.com/de/about-us" />
```

#### Search For:
- `<link rel="canonical"` → Should match current page URL
- `<link rel="alternate" hreflang=` → Should have all 3 languages + x-default
- `<html lang=` → Should match page language
- `<meta property="og:locale"` → Should match page language

---

## 📝 Common Test Scenarios

### Scenario 1: Language Switching
1. Start on Norwegian page: `/about-us`
2. Click language switcher
3. Select German
4. ✅ URL changes to: `/de/about-us`
5. ✅ Content changes to German
6. ✅ No errors in console

### Scenario 2: Direct URL Access
1. Clear cache and cookies
2. Paste URL: `https://example.com/de/products/test-product`
3. ✅ Page loads in German
4. ✅ Language switcher shows German selected
5. ✅ Navigation maintains `/de/` prefix

### Scenario 3: Language Persistence
1. Select German language
2. Close browser completely
3. Reopen and navigate to site
4. ✅ Site opens in German
5. ✅ Local storage has "de" saved

### Scenario 4: Link Sharing
1. Navigate to: `https://example.com/fr/products/test-product`
2. Copy URL from address bar
3. Open in incognito/new browser
4. ✅ Page opens in French
5. ✅ URL preserved with `/fr/`

### Scenario 5: Error Handling
1. Enter invalid URL: `https://example.com/wr-WR/about-us`
2. ✅ 404 page displayed
3. ✅ URL shows `/404/` or error page
4. ✅ HTTP status code is 404

---

## 🚨 Red Flags (Immediate Issues)

Look out for these critical problems:

❌ Language switch breaks navigation (white screen, errors)  
❌ Invalid language codes don't return 404  
❌ Language preference not saved after browser restart  
❌ URL loses language code during navigation  
❌ Mixed languages on same page  
❌ Missing hreflang tags in page source  
❌ Console errors during language switching  
❌ Cart contents lost when switching language  
❌ Checkout process breaks with language prefix  

---

## 📊 Quick Test Priority

### Must Test First (Critical)
1. ✅ RT-001: Default Language URL
2. ✅ RT-002: German Language URL
3. ✅ RT-003: French Language URL
4. ✅ LS-001: Language Switching (NO→DE)
5. ✅ EH-001: Invalid Language Code
6. ✅ SR-001: Cart with Language Prefix
7. ✅ SR-002: Checkout with Language Prefix
8. ✅ SEO-002: Hreflang Tags

### Test Second (High Priority)
9. ✅ RT-004: Product Page Routing
10. ✅ LP-001: Local Storage Persistence
11. ✅ LP-002: Default Language on Return
12. ✅ LS-001: Share Link with Language Code

---

## 🎯 Expected Local Storage Keys

Check Application → Local Storage for one of these keys:

| Key | Value Examples |
|-----|----------------|
| `language` | `no`, `de`, `fr` |
| `cultureName` | `no`, `de`, `fr` |
| `locale` | `no_NO`, `de_DE`, `fr_FR` |
| `preferredLanguage` | `no`, `de`, `fr` |

**Note:** Actual key name may vary. Document what you find!

---

## 🌐 Sitemap Quick Check

1. Navigate to: `https://example.com/sitemap.xml`
2. Search (Ctrl+F) for each language:
   - Search: `>https://example.com/about-us<`
   - Search: `>https://example.com/de/about-us<`
   - Search: `>https://example.com/fr/about-us<`
3. ✅ All three should be present

---

## 🔤 Common Translations Quick Reference

| English | Norwegian | German | French |
|---------|-----------|--------|--------|
| Home | Hjem | Startseite | Accueil |
| Cart | Handlekurv | Warenkorb | Panier |
| Checkout | Kasse | Kasse | Caisse |
| Products | Produkter | Produkte | Produits |
| Search | Søk | Suche | Recherche |
| Account | Konto | Konto | Compte |

---

## 📸 Screenshot Checklist

Capture screenshots for:
- [ ] Language switcher component
- [ ] URL structure in address bar (each language)
- [ ] Local storage with language key
- [ ] Page source showing hreflang tags
- [ ] Any errors or issues found
- [ ] 404 error page for invalid language codes

---

## 🐛 Bug Report Quick Template

```
BUG-XXX: [Brief Title]
Test Case: [Test ID]
Severity: Critical/High/Medium/Low

What I Did:
1. [Step 1]
2. [Step 2]

Expected: [What should happen]
Actual: [What happened]

Screenshot: [Attach]
```

---

## 🎓 Testing Tips

✅ **DO:**
- Clear cache between test sessions
- Test in both logged-in and logged-out states
- Check console for errors every time
- View page source to verify SEO tags
- Test on multiple browsers
- Document everything

❌ **DON'T:**
- Skip preconditions
- Test multiple things at once
- Ignore console warnings
- Assume behavior without checking
- Skip failed test documentation

---

## 📱 Mobile Testing Notes

### Mobile-Specific Checks
- [ ] Language switcher accessible on small screen
- [ ] Touch interactions work smoothly
- [ ] URLs display correctly in mobile browser
- [ ] Share functionality preserves language codes
- [ ] Local storage persists on mobile

### Device Emulation in Chrome
1. Open DevTools (F12)
2. Click device toolbar icon (Ctrl+Shift+M)
3. Select device (iPhone, Pixel, etc.)
4. Test as normal

---

## 🔧 Troubleshooting

### Issue: Language switcher not working
- Check console for JavaScript errors
- Verify language switcher element is clickable
- Check if page reloads after selection

### Issue: URL doesn't include language prefix
- Verify you're not on default language (Norwegian)
- Check if redirect occurred
- Inspect network tab for actual request

### Issue: Local storage empty
- Ensure cookies/storage not disabled
- Check if incognito mode (storage may not persist)
- Verify correct domain in DevTools

### Issue: 404 not showing for invalid language
- Verify the language code is truly invalid
- Check network tab for actual HTTP status
- Clear cache and try again

---

## 📞 Quick Help

**Test Plan:** `multilingual-seo-urls-test-plan.md`  
**Test Data:** `test-data.md`  
**Tracker:** `test-execution-tracker.md`  
**README:** `README.md`

---

## ✏️ Quick Notes Space

Use this space for quick notes during testing:

```
Date: __________

Browser: __________

Notes:
_________________________________________________
_________________________________________________
_________________________________________________
_________________________________________________
_________________________________________________
```

---

**Happy Testing! 🚀**

*Print or keep this guide open on a second screen while testing*

