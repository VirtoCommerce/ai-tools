# Exploratory Session: Language Switching

**Date:** 2026-03-05
**Duration:** ~20 minutes
**Charter:** Explore language switching in the store to find issues with localization, UI rendering, data integrity, and UX
**Browser:** Firefox (playwright-firefox)
**Environment:** https://vcst-qa-storefront.govirto.com
**Tester:** QA Testing Expert (automated)
**Store Version:** 2.43.0-pr-2200-24c5-24c519f3

## Languages Available

14 languages found in the language selector dropdown:

| # | Language | Locale Code | URL Prefix |
|---|----------|-------------|------------|
| 1 | polski (Polish) | pl | /pl/ |
| 2 | svenska (Swedish) | sv | /sv/ |
| 3 | norsk (Norwegian) | no | /no/ |
| 4 | Deutsch (German) | de | /de/ |
| 5 | francais (French) | fr | /fr/ |
| 6 | italiano (Italian) | it | /it/ |
| 7 | English (UK) | en-GB | /en-GB/ |
| 8 | Chinese (China) | zh | /zh/ |
| 9 | portugues (Portuguese) | pt | /pt/ |
| 10 | Japanese | ja | /ja/ |
| 11 | suomi (Finnish) | fi | /fi/ |
| 12 | English (US) -- DEFAULT | en-US | / (no prefix) |
| 13 | Russian | ru | /ru/ |
| 14 | espanol (Spanish) | es | /es/ |

**Default language:** English (United States) -- no URL prefix for default locale.

## Findings

### Bugs Found

| # | Severity | Title | Evidence |
|---|----------|-------|----------|
| 1 | Medium | Language selector shows wrong flag for all options -- always displays the current language's flag instead of each language's own flag | `screenshots/02-language-dropdown-open.png` -- All options show "English (United States)" flag icon. When on German page, all show "Deutsch (Deutschland)" flag. |
| 2 | Low | Two "English" entries in language list with no distinguishing labels | `screenshots/02-language-dropdown-open.png` -- Both show as "English" but one is en-US and the other is en-GB. Users cannot tell which is which without clicking. |
| 3 | Medium | Homepage banner heading "Gifts for sweetheart. Sale" not translated in any language | `screenshots/03-homepage-deutsch.png` -- Builder.io/CMS content remains in English when switching to German, Japanese, etc. |
| 4 | Medium | Homepage section headings not translated: "Discounts. Loyalty cards", "Popular categories", "Might be interesting", "Favorable delivery" | `screenshots/04-homepage-deutsch-scrolled.png` -- Static CMS content blocks remain English in all tested languages |
| 5 | High | Navigation menu categories drastically reduced in non-English languages. EN: 14+ categories, DE: 3 categories ("Printers", "TV de", "ALLE PRODUKTE ANZEIGEN"), JA: 0 categories | `screenshots/03-homepage-deutsch.png`, `screenshots/06-cart-japanese.png` -- Major loss of navigation when switching languages |
| 6 | Low | Product names and descriptions remain in English (expected for catalog data but inconsistent -- some products have DE-prefixed names) | `screenshots/09-catalog-deutsch-url-slugs.png` -- Mix of localized and non-localized product names |
| 7 | Medium | Footer section headers not translated: "Account details", "Customer support", "Online resources", "External links", "Popular categories" remain in English across all languages | `screenshots/04-homepage-deutsch-scrolled.png` -- Footer links have /de/ prefix but headers stay English |
| 8 | Medium | Homepage "Popular categories" and "Might be interesting" links use absolute URLs without language prefix, breaking locale context when clicked | Snapshot analysis: URLs like `https://vcst-qa-storefront.govirto.com/category/...` instead of `/de/category/...` |
| 9 | Medium | Payment card form labels not translated in Japanese: "Card number*", "Cardholder name*", "Expiration date*", "Security code*" remain English. Legal text also untranslated. | `screenshots/07-cart-japanese-payment-untranslated.png` -- Skyflow/CyberSource iframe labels stay English. In German (DE) these same fields ARE translated. |
| 10 | Medium | Catalog filter facet names not translated: "PRICE", "CATEGORIES", "BRAND", "ORIGIN", "SUGAR", "WEIGHT" remain English on German catalog page | `screenshots/09-catalog-deutsch-url-slugs.png` |
| 11 | Low | Breadcrumb partially untranslated: shows "Startseite / Catalog / Soft drinks" -- "Catalog" should be "Katalog" in German | `screenshots/09-catalog-deutsch-url-slugs.png` |
| 12 | Low | Category banner heading "Freshness / In every sip" not translated on German catalog page | `screenshots/09-catalog-deutsch-url-slugs.png` |

### Working Correctly

- **URL localization**: Language prefix correctly added to URLs (/de/, /ja/, /en-GB/)
- **html lang attribute**: Correctly updates (de-DE, ja-JP, en-GB)
- **UI framework labels**: Header, navigation, cart, checkout labels translate well (Sprache, Wahrung, Warenkorb, Bestellungen, etc.)
- **Cart page**: Extensively translated -- product table headers, shipping details, payment details, order summary, all buttons and labels
- **Number/price formatting**: German uses correct locale (15.554,00 $), Japanese uses standard ($15,554.00)
- **Cart state preservation**: Items, quantities, and totals preserved across language switches
- **Language preference storage**: Stored in localStorage as `pinnedLocale`
- **Category URL slugs**: Some categories have localized slugs (soft-drinks -> limonade-de)
- **Skip links**: Translated ("Zum Hauptinhalt springen", "Zum Footer springen")
- **No console errors**: Zero JS errors throughout entire session -- only benign warnings
- **German cart page (cart labels)**: Payment card labels translated to German ("Kartennummer", "Name des Karteninhabers", "Ablaufdatum", "Sicherheitscode") and legal text translated
- **Page title**: Translates correctly ("QA & Warenkorb", "QA & Cart")

### Risk Areas

1. **Navigation menu collapse (BUG #5 -- HIGH)**: The drastic reduction in navigation categories when switching languages is a serious UX and business issue. Users lose access to most product categories when browsing in non-English languages. This likely means menu items are configured per-language in the CMS and most languages are missing menu entries.

2. **CMS/Builder.io content**: Homepage sections (banners, promotional blocks, category descriptions) are not internationalized. This suggests Builder.io content pages are not configured with multi-language variants.

3. **Payment form translation inconsistency**: German (DE) has translated payment card labels while Japanese (JA) does not. This suggests translation coverage is uneven across languages -- some got more attention than others.

4. **Footer links with absolute URLs**: Some homepage content blocks use absolute URLs without the language prefix, which would drop users back to English when clicking.

5. **en-GB vs en-US confusion**: Two "English" entries with identical labels but different behaviors (different navigation menus, different payment methods "Bank card (CyberSource) - GB" vs "Bank card (CyberSource)"). No visual indicator to distinguish them.

### Observations

- Language switching triggers a full page navigation (URL change), not a client-side swap. This means each switch causes a network request and page reload.
- The `pinnedLocale` localStorage key persists the preference. After switching and refreshing, the locale is maintained.
- Product URL slugs can be localized per language (e.g., `/soft-drinks` becomes `/limonade-de`), indicating proper SEO slug support exists in the platform.
- The search box context correctly updates when on a category page (shows "Suche in Soft Drinks DE name" in German).
- Boolean property values translate ("Yes" -> "Ja", "No" -> "Nein" in German; "Yes" -> "Hai" in Japanese).
- The en-GB locale has different navigation categories than en-US (includes "Courses and audio books", "Fake"; missing "Home appliance").
- German payment card form shows localized placeholder "MM / JJJJ" instead of "MM / YYYY".

### Questions

1. **Is the navigation menu reduction intentional?** Are categories supposed to be configured per language, or should all en-US categories also appear in other languages? This seems like a configuration gap rather than intentional design.
2. **Should Builder.io content blocks be translated?** The homepage banners and promotional sections remain in English. Is there a plan to create language-specific versions in Builder.io?
3. **What is the expected behavior for untranslated product names?** Should they fall back to English, or should there be a visual indicator that translation is unavailable?
4. **Should footer section headers be translated?** They appear to be CMS-managed content that was not localized.
5. **Are filter facet names (PRICE, BRAND, etc.) supposed to be translated?** These come from product properties and may require platform-level localization configuration.
6. **Why are there two "English" entries?** Is en-GB intentionally exposed to users, and if so, should the labels differentiate them (e.g., "English (US)" and "English (UK)")?

## Test Coverage Summary

| Area | Tested | Result |
|------|--------|--------|
| Language selector discovery | Yes | Working -- 14 languages found |
| Language switching (homepage) | Yes | Partial -- UI labels translate, CMS content does not |
| Language switching (cart) | Yes | Good -- cart labels extensively translated |
| Language switching (catalog) | Yes | Partial -- filter facets and some content untranslated |
| URL localization | Yes | Working -- /de/, /ja/, /en-GB/ prefixes |
| html lang attribute | Yes | Working -- correctly updates |
| Cart state during switch | Yes | Working -- items and totals preserved |
| Number/price formatting | Yes | Working -- locale-appropriate formatting |
| Navigation menu per language | Yes | BUG -- categories drastically reduced |
| Footer translation | Yes | Partial -- links localized, headers not |
| Payment form translation | Yes | Inconsistent -- DE translated, JA not |
| Console errors | Yes | None -- 0 errors across all switches |
| Language preference persistence | Yes | Working -- localStorage pinnedLocale |
| Breadcrumb translation | Yes | Partial -- some segments untranslated |
| Rapid language switching | Not tested | Time constraint |
| Browser back after switch | Not tested | Time constraint |
| Sign-out/sign-in persistence | Not tested | Time constraint |

## Session Metrics

- **Total bugs found:** 12
- **Severity breakdown:** 1 High, 6 Medium, 5 Low
- **Critical bugs:** 0
- **Languages tested in depth:** English (US), German (DE), Japanese (JA), English (GB)
- **Pages tested:** Homepage, Cart (with items), Catalog (Soft Drinks category)
- **Screenshots captured:** 9

## Evidence Files

All screenshots saved to: `reports/exploratory/screenshots/`

| File | Description |
|------|-------------|
| `01-homepage-default-en.png` | Homepage in default English (US) |
| `02-language-dropdown-open.png` | Language selector dropdown showing all 14 options |
| `03-homepage-deutsch.png` | Homepage after switching to German |
| `04-homepage-deutsch-scrolled.png` | Full-page screenshot of German homepage |
| `05-cart-deutsch.png` | Cart page in German (well-translated) |
| `06-cart-japanese.png` | Cart page in Japanese |
| `07-cart-japanese-payment-untranslated.png` | Payment card form untranslated in Japanese |
| `08-cart-english-gb.png` | Cart page in English (UK) |
| `09-catalog-deutsch-url-slugs.png` | Catalog page in German showing localized URL slugs |
