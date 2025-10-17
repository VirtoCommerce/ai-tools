# Sitemap: https://vcst-qa-storefront.govirto.com/

**Generated:** October 14, 2025  
**Base URL:** https://vcst-qa-storefront.govirto.com/

## Overview

This is a B2B e-commerce platform built on Virto Commerce. The site supports multiple languages and features a comprehensive product catalog organized into various categories.

## Available Languages

The site supports 13 languages with locale-specific URLs:
- **English (en)** - `/` or `/en/`
- **Deutsch (de)** - `/de/`
- **français (fr)** - `/fr/`
- **italiano (it)** - `/it/`
- **polski (pl)** - `/pl/`
- **svenska (sv)** - `/sv/`
- **norsk (no)** - `/no/`
- **中文（中国）(zh)** - `/zh/`
- **português (pt)** - `/pt/`
- **日本語 (ja)** - `/ja/`
- **suomi (fi)** - `/fi/`
- **русский (ru)** - `/ru/`

**Note:** All pages listed below are available in each language by prefixing with the language code (e.g., `/de/catalog`, `/fr/catalog`, etc.)

---

## 1. Main Pages

### Homepage
- **URL:** `/`
- **Description:** Main landing page with featured products ("Daily Deals") and commercial management highlights

### Static Pages
| Page | URL | Description |
|------|-----|-------------|
| Sign Up | `/sign-up` | User registration page |
| Contacts | `/contacts` | Contact information page |
| Catalog | `/catalog` | Main catalog page |
| Demo Landing | `/demo-landing` | Demo landing page |
| News | `/news` | News section |
| Brands | `/brands` | All popular brands page |
| Find a Branch | `/branch/vendor-fulfillment` | Branch locator |
| Bulk Order | `/bulk-order` | Bulk order page |
| Compare | `/compare` | Product comparison page |
| Cart | `/cart` | Shopping cart page |
| Forgot password | `/forgot-password` | Reset password page |

---

## 2. Account Pages

All account pages require authentication:

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/account/dashboard` | User account dashboard |
| Orders | `/account/orders` | Order history |
| Lists | `/account/lists` | Organization lists |
| Notifications | `/account/notifications` | User notifications |
| Quote Requests | `/account/quotes` | Quote requests management |
| Saved credit cards | `/account/saved-credit-cards` | Saved credit cards|


---

## 3. Main Categories

### Top-Level Categories

| Category | URL | Description |
|----------|-----|-------------|
| Alcoholic Drinks | `/alcoholic-drinks` | Alcoholic beverages category |
| Accessories | `/accessories` | Accessories category |
| Jewelry and Gems | `/jewelry-and-gems` | Jewelry products |
| Car Covers | `/car-covers` | Car covers category |
| Online Courses | `/online-courses` | Courses and audiobooks |
| Juice | `/juice` | Juice products |
| Kitchen Supplies | `/kitchen-supplies` | Kitchen supplies |
| Products with Options | `/products-with-options` | Configurable products |
| Soft Drinks | `/soft-drinks` | Soft drink category |
| Snacks | `/snacks` | Snack products |
| Printers | `/printers` | Printer products |
| New Home / Rental Home | `/new-home` | Home furnishings |
| TV | `/tv` | Television products |
| NewTest2 | `/newtest2` | Test category |
| Fake | `/fake1` | Test category |
| Coffee and Tea | `/coffee-and-tea` | Coffee and tea products |
| Coming Soon | `/coming-soon` | Coming soon category |
| Bolts | `/bolts` | Bolts category |
| New Catalog Item | `/new-catalog-item` | New catalog items |
| Category 1 | `/category1` | Generic category |

### Subcategories

| Subcategory | URL | Parent Category |
|-------------|-----|-----------------|
| Juice Syrup | `/juice/juice-syrup` | Juice |
| Holders & Stands | `/accessories/aliexpress/phones-and-accessories/holders-stands` | Accessories |
| Car Covers (NewTest2) | `/newtest2/car-covers` | NewTest2 |

### Category by ID
The site also uses category IDs for navigation:

| Category | URL |
|----------|-----|
| Consumer Electronics | `/category/36b507a9-0bdf-4cd9-821e-4dcbb6e1d578` |
| Allbiz | `/category/61b05fae-0ea6-45e7-ae4f-8bdc5c043847` |
| Computer, Office, Education | `/category/b3a3f328-cc99-4d88-a8f1-08fb02f43c8e` |
| Phones and Accessories | `/category/ab8be45e-3ff6-4b8c-80a3-1d3ef2dfa0ac` |
| Home Appliances | `/category/7f965eeb-a5d7-42a3-89c9-7c7237e43f9d` |

---

## 4. E2E Test Categories

Testing categories for automated testing:

| Category | URL |
|----------|-----|
| E2E Test RAM | `/e2e-test-ram` |
| E2E Test Notebooks | `/e2e-test-notebooks` |
| E2E Test SSD | `/e2e-test-ssd` |
| E2E Catalog | `/e2e-catalog` |

---

## 5. Product Pages

### Product URL Structure
Products use a UUID-based URL structure:
- Pattern: `/product/{product-id}`

### Sample Product Pages (from Homepage)

| Product | Product ID | URL |
|---------|------------|-----|
| Samsung Galaxy Tab S9 FE Case | 46b43d0a-c608-4ddd-87f7-dbf63316e7c7 | `/product/46b43d0a-c608-4ddd-87f7-dbf63316e7c7` |
| JIANWU Pencil Case | bc2654d3-fdba-4657-a83b-28141696b054 | `/product/bc2654d3-fdba-4657-a83b-28141696b054` |
| Kawaii Pencil Case (3 Compartment) | 8425ba69-3c7a-4ea3-ae48-eeec63d2ab3d | `/product/8425ba69-3c7a-4ea3-ae48-eeec63d2ab3d` |
| Kawaii Pencil Case (Large Capacity) | dd4867c1-b104-481e-a08c-aca4d92a34ff | `/product/dd4867c1-b104-481e-a08c-aca4d92a34ff` |
| Laptop Bag (Xiaomi Lenovo HP Dell) | a6c72cdc-5bee-4739-ade3-4be9df03e6b8 | `/product/a6c72cdc-5bee-4739-ade3-4be9df03e6b8` |
| MacBook Sleeve | dc914bd5-442d-45d6-ba84-edd0d4ea9bba | `/product/dc914bd5-442d-45d6-ba84-edd0d4ea9bba` |
| Laptop Bag (Xiaomi HP Dell) | d79debf1-95c7-410b-b1c2-4d272ccfc4b7 | `/product/d79debf1-95c7-410b-b1c2-4d272ccfc4b7` |
| Laptop Bag Women 2023 | b38c173e-9a8a-4283-aba6-74ad986c8edc | `/product/b38c173e-9a8a-4283-aba6-74ad986c8edc` |
| MacBook Air Case M2 | 58d69c3a-75eb-4a3d-bf88-150d6f90c448 | `/product/58d69c3a-75eb-4a3d-bf88-150d6f90c448` |
| Laptop Charger Storage Bag | 5024db78-f53a-43d3-8088-de73fd4daba9 | `/product/5024db78-f53a-43d3-8088-de73fd4daba9` |
| Laptop Sleeve Bag | 65c15800-8b9d-43d5-9c1f-b546ae460e6f | `/product/65c15800-8b9d-43d5-9c1f-b546ae460e6f` |
| Large Capacity Pencil Bag | bcac3195-24ff-40ec-ac36-3f1a0d1fc447 | `/product/bcac3195-24ff-40ec-ac36-3f1a0d1fc447` |
| Multi Layer Pencil Case | d3bbdd46-a866-4446-80e2-40c70f3e30be | `/product/d3bbdd46-a866-4446-80e2-40c70f3e30be` |
| Pen Storage Bag | fe6ac5c3-ea37-4f90-89e0-85abe91c5881 | `/product/fe6ac5c3-ea37-4f90-89e0-85abe91c5881` |
| Electronic Accessories Travel Case | 0fa6c0b6-6ef0-43fb-b754-b533fd7fbebc | `/product/0fa6c0b6-6ef0-43fb-b754-b533fd7fbebc` |
| iPad Silicone Case | 79a4d40d-1f22-4e16-a661-5cfb660919fa | `/product/79a4d40d-1f22-4e16-a661-5cfb660919fa` |
| Tablet Sleeve Case | 0abf0884-726a-4fa6-a378-43d8d7fc7fca | `/product/0abf0884-726a-4fa6-a378-43d8d7fc7fca` |
| Samsung Galaxy Tab Sleeve (raugee) | 69d61550-ea8e-4eee-9e61-75ed2c728212 | `/product/69d61550-ea8e-4eee-9e61-75ed2c728212` |
| Samsung Galaxy Tab Sleeve (hacrin) | 2a0ec218-132c-4933-a208-e872e6c68654 | `/product/2a0ec218-132c-4933-a208-e872e6c68654` |
| Tablet Sleeve (OPUYYM) | 464557e0-48b9-4e1e-967a-9f0681ae46df | `/product/464557e0-48b9-4e1e-967a-9f0681ae46df` |

**Note:** The site contains thousands of products. The above list represents a sample from the homepage.

---

## 6. Search & Filtering

### Search
- **URL Pattern:** `/search?q={query}`
- **Example:** `/search?q=juicer`

### Compare Products
- **URL:** `/compare`
- **Description:** Product comparison feature

---

## 7. External Links

The site includes links to related platforms:

| Platform | URL | Description |
|----------|-----|-------------|
| Virto Commerce Admin | https://vcst-qa.govirto.com/ | Admin platform |
| Virto Start Demo | https://virtostart-demo-store.govirto.com/ | Demo store |
| Virto Commerce | https://virtocommerce.com | Main website |
| About Virto | https://virtocommerce.com/about-us | About page |
| Partners | https://virtocommerce.com/our-partners | Partners page |
| Manufacturer Partners | https://virtocommerce.com/solutions/b2b-portal-for-manufacturers | B2B solutions |
| News/Blog | https://virtocommerce.com/blog/category/news | Blog |
| Careers | https://virtocommerce.com/career | Careers page |
| Builder.io | https://www.builder.io/ | Visual development platform |

---

## 8. Menu Structure

### All Products Menu
Available via the "All products" dropdown, includes:

- Shop all categories
- Shop by brand
- New & Trending
- Holders & Stands
- Bolts Name EN
- Soft Drinks
- Coming soon
- Courses and audio books
- Kitchen supplies
- [E2E Test] RAM
- [E2E] Products
- Coffee and tea
- Products with options
- Car covers EN
- Notebooks. New edition
- Juice
- Snacks
- [en-US] TV
- Jewelry and Gems
- Generatation-en
- Rental home
- Accessories
- Alcoholic drinks
- NewTest2
- Printers
- [E2E Test] Notebooks
- [E2E Test] SSD

### Main Navigation Bar
- Alcoholic Drinks
- Accessories
- Jewelry and gems
- Car covers
- Courses and audio books
- Juice
- Kitchen supplies
- Products with options
- Soft drinks
- Snacks
- Printers
- Rental home
- TV new
- Fake
- All BRANDS
- SEE ALL PRODUCTS

---

## 9. Site Features

### User Features
- Multi-language support (13 languages)
- Multi-currency support (USD primary)
- Delivery address selection
- Account management
- Organization/Corporate accounts
- Quote management
- Bulk ordering
- Product comparison
- Wishlist/Lists
- Product reviews and ratings
- Notifications system
- Barcode scanning

### Product Features
- Product variations
- Real-time inventory status
- Product ratings
- Multiple images per product
- Detailed specifications
- Price ranges (from/to)
- Sale/Discount indicators
- Gift options

### B2B Features
- Corporate account management
- Quote management and price negotiation
- Multiple stores, channels, and locations
- B2B customization and price management
- Checkout defaults
- Organization lists
- Bulk order processing

---

## 10. Technical Information

### Platform
- **Platform:** Virto Commerce (ASP.NET)
- **Version:** 2.33.0-pr-1976-d87f-d87f2cb6
- **Environment:** QA
- **GraphQL:** WebSocket connection available

### URL Patterns

#### Localized URLs
All pages support localization:
- Default (English): `/{page}`
- Localized: `/{language-code}/{page}`

Examples:
- English Homepage: `/` or `/en/`
- German Homepage: `/de/`
- French Products: `/fr/products-with-options`

#### Category URLs
- Friendly URL: `/{category-slug}`
- ID-based: `/category/{category-id}`

#### Product URLs
- Pattern: `/product/{product-uuid}`
- Example: `/product/46b43d0a-c608-4ddd-87f7-dbf63316e7c7`

---

## 11. Total Page Count Estimate

Based on the discovered structure:

| Type | Count | Notes |
|------|-------|-------|
| Static Pages | ~15 | Homepage, sign-up, contacts, catalog, etc. |
| Account Pages | 6 | Dashboard, orders, lists, etc. |
| Main Categories | ~30 | Including test categories |
| Products | 20+ visible | Thousands more in catalog |
| Languages | 13 | All pages × 13 languages |

**Estimated Total Unique Pages (English only):** 70+  
**Estimated Total with All Languages:** 900+ (70 × 13)  
**Estimated Product Pages:** 5,000+ (based on typical B2B catalog size)

**Grand Total Estimate:** 6,000+ unique URLs

---

## Notes

1. **Dynamic Content:** Many pages contain dynamic content loaded via GraphQL/WebSocket
2. **Authentication Required:** Account pages require login
3. **Product Variations:** Products with variations may have additional sub-pages
4. **SEO URLs:** The site uses SEO-friendly URLs in multiple languages
5. **No Sitemap.xml:** The site does not provide a `/sitemap.xml` file
6. **Test Categories:** Several E2E test categories exist for automated testing purposes

---

## How to Use This Sitemap

### For Testing
- Use language codes to test multilingual functionality
- Account pages require authentication
- Product IDs are UUIDs for direct access

### For Development
- URL patterns follow consistent structure
- Categories support both slug and UUID access
- All main pages are localizable

### For SEO
- Each language has dedicated URL structure
- Friendly URLs for categories and products
- Multiple entry points per language

---

**Last Updated:** October 14, 2025  
**Tool Used:** Playwright Browser Automation  
**Coverage:** Main pages, categories, and sample products

