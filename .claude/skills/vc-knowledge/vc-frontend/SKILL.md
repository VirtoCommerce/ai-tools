---
description: "[VC Knowledge] Storefront reference: page URLs, navigation, product types, account structure, test data."
argument-hint: "page | URL | product type | account | menu | sitemap"
---

# /vc-frontend — VC Storefront Reference

Quick reference for the Virto Commerce B2B storefront (QA environment). Covers page URLs, navigation structure, product types, account sidebar, and test data useful for writing or executing tests.

## Usage
```
/vc-frontend sitemap                 # Full site structure and URL list
/vc-frontend account pages           # Account sidebar groups and URLs
/vc-frontend account menu            # Account dropdown design (authenticated)
/vc-frontend product types           # Configurable vs variation vs simple vs digital
/vc-frontend product fields          # xAPI ProductType object fields reference
/vc-frontend product properties      # Property levels (catalog/category/product/variation)
/vc-frontend configurable products   # Configurable sections: Product, Text, File types
/vc-frontend product availability    # AvailabilityData fields and test signals
/vc-frontend test products           # Sample product IDs and URLs for test data
/vc-frontend variation products      # Variation-based products with slug and count
/vc-frontend digital products        # Gift card / digital product UUIDs
/vc-frontend product filters         # Available filters and xAPI filter syntax
/vc-frontend navigation              # Header, nav bar, All Products dropdown
/vc-frontend company pages           # /company/info, /company/members URLs
```

## Supporting Files

- **sitemap.md** — Complete site map: all page URLs, navigation menus, product types with examples, account page structure, category hierarchy, test data (sample products, org names, category IDs). Updated March 4, 2026.
- **products.md** — Detailed product reference: all 4 product types with `productType` values, complete xAPI `ProductType` field list, `AvailabilityData` fields, property levels, `VariationType` behavior, configurable section types (Product/Text/File), description structure, full sample product tables (configurable + variation + digital), filter syntax, and QA testing notes.

## Execution

1. **Read the supporting file:**
   - Read `sitemap.md` for URL/navigation/site-structure questions
   - Read `products.md` for product types, fields, properties, configurations, or test data questions
   - Sections in `products.md`: Product Types, Product Object Fields, AvailabilityData, Property Levels, VariationType, Configurable Sections, Descriptions, Sample Products, Filters, xAPI Queries, QA Notes

2. **Answer the query:**
   - For URL questions: provide the exact route pattern and example
   - For product type questions: describe the CTA, URL pattern, and give concrete examples from the sitemap
   - For navigation/menu questions: describe the component structure (unauthenticated vs authenticated state)
   - For test data: provide sample product IDs, URLs, or organization names directly usable in tests

3. **Note environment specifics:**
   - Base URL: `FRONT_URL` (from `FRONT_URL` env var)
   - All URLs are relative unless a full URL is needed for testing
   - Platform version: `2.43.0-pr-2200-cbd4-cbd47d7f`

## Quick Reference

### Key URLs

| Page | URL |
|------|-----|
| Homepage | `/` |
| Sign In | `/sign-in` |
| Sign Up | `/sign-up` |
| Catalog | `/catalog` |
| Cart | `/cart` |
| Account Dashboard | `/account/dashboard` |
| Company Info | `/company/info` |
| Company Members | `/company/members` |
| Bulk Order | `/bulk-order` |
| Products with Options | `/products-with-options` |

### Account Sidebar Groups (authenticated)
| Group | Pages |
|-------|-------|
| **Purchasing** | Dashboard, Orders, Lists, Quote Requests, Saved for Later, Back-in-stock List |
| **Marketing** | Notifications, Points History |
| **Corporate** | Company Info (`/company/info`), Company Members (`/company/members`) |
| **User** | Profile, Change Password, Saved Credit Cards |

### Product Types
| Type | `productType` value | CTA on listing | URL pattern |
|------|--------------------|--------------------|-------------|
| **Simple** | `Physical` (no variations) | Quantity + "Add to cart" on listing card | `/{category}/{slug}` |
| **Variation-based** | `Physical` (with child variants) | "N variations" + "Show on a separate page" | `/{cat}/{sub}/{parent}/{variant-slug}` |
| **Configurable** | `Configurable` | "Customize" button | `/{category}/{slug}` |
| **Digital** | `Digital` | "Add to cart" (no shipping) | `/{category}/{slug}` |

See **products.md** for full field reference, configurable section types, availability fields, and QA notes.

### Sample Test Products (configurable)
| Product | URL | Price |
|---------|-----|-------|
| Configurable Hat | `/products-with-options/configurable-caps-shirts/configurable-hat` | $15 |
| Custom T-shirt | `/products-with-options/configurable-caps-shirts/custom-t-shirt` | $12 |
| Base product EN | `/products-with-options/configurable-caps-shirts/111111` | $1,999 |

### Sample Test Products (variation-based)
| Product | URL | Variations |
|---------|-----|-----------|
| Baggy Regular Jeans | `/products-with-options/variations-of-jeans/jeans/baggy-regular-jeans-grey` | 3 |
| High Waist Jeans | `/products-with-options/variations-of-jeans/jeans/high-waist-jeans-brown` | 6 |
| MAGCOMSEN T-Shirts | `/products-with-options/variations-of-jeans/jeans/magcomsen-...` | 9 |

### Account Menu (authenticated) — New design March 2026
Triggered by "OrgName / UserName" button (top-right header). Opens dropdown with:
1. User name (avatar + link to `/account/dashboard`) + Logout button
2. **Organizations** section: search box + radio-button list to switch active org

> Account page navigation is in the **Dashboard sidebar**, not the account menu dropdown.

## Rules
- Always refer to `sitemap.md` for URLs — do not guess routes
- All account pages require authentication
- Use `FRONT_URL` env var for the base URL, never hardcode `vcst-qa-storefront.govirto.com`
- `/company/info` and `/company/members` use a different URL prefix than `/account/` pages
- This skill is read-only and auto-invocable (no `disable-model-invocation`)
