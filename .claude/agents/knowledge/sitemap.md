# Sitemap: FRONT_URL

**Generated:** May 20, 2026 (rev 4)
**Base URL:** FRONT_URL (from `FRONT_URL` env var) — vcst-qa
**Platform version:** 2.49.0 *(was 2.43.0 in March)*

## Overview

B2B e-commerce storefront on Virto Commerce. Tests are signed in as user **John Mitchell** (org `AGENT-TEST-Org-TechFlow-20260310`). Catalog content was **fully restored from another environment on 2026-05-15** (vcst-qa catalog wipe + restore — see `project_vcstqa_restore_2026_05_15.md` memory); category and product inventory below reflects the post-restore state and differs substantially from the March 2026 sitemap.

## Available Languages

The site supports **15 languages** with locale-specific URLs:
- **English (en)** - `/` or `/en/`
- **English (United States) (en-US)** - `/en-US/`
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
- **español (es)** - `/es/`
- **Ελληνικά (el)** - `/el/` *(new since March 2026)*

**Note:** All pages listed below are available in each language by prefixing with the language code.

---

## 1. Main Pages

### Homepage
- **URL:** `/`
- **Title:** QA & Main page
- **Sections (unchanged from March):**
  - Hero banner ("Gifts for sweetheart. Sale") → first slider CTA should link to `/soft-drinks` (corrected target), second to `/catalog`. *Live site still points the first slider at `/soda` → 404 (SMK-001 / BUG_042_001), pending dev fix.*
  - "Discounts. Loyalty cards" — featured gift card products (Vintage Colorado Hoodie + 3 Apple/Retail Therapy gift cards)
  - "Popular categories" — category tiles (Consumer Electronics, Home Appliances, Phones & Accessories, Computer Office & Education, Medical goods)
  - "Might be interesting" — promotional banners (Drinks & Food → `/soft-drinks`, Security & Protection, Digital products)
  - "Favorable delivery" — banner links to `/new-home` and `/kitchen-supplies/everything-for-kitchen`

### Static Pages
| Page | URL | Description |
|------|-----|-------------|
| Sign In | `/sign-in` | User login page |
| Sign Up | `/sign-up` | User registration page |
| Forgot Password | `/forgot-password` | Password recovery page |
| Contacts | `/contacts` | Contact information page |
| Catalog | `/catalog` | Main catalog landing (lists all top-level categories with counts) |
| Demo Landing | `/demo-landing` | Demo landing page |
| Brands | `/brands` | All popular brands page *(URL is lowercase — was `/Brands` in older docs)* |
| News | `/news` | News landing (linked from footer) |
| Find a Branch | `/branch/vendor-fulfillment` | Branch locator |
| Bulk Order | `/bulk-order` | Bulk order entry |
| Compare | `/compare` | Product comparison page |
| Cart | `/cart` | Shopping cart / checkout page (combined — `/checkout` redirects here) |
| Checkout Payment | `/checkout/payment` | Checkout payment step (non-CyberSource processors only) |
| Soft-drinks (hero target) | `/soft-drinks` | Correct homepage hero first-slider target. *Live site still links to `/soda` → 404 (SMK-001 / BUG_042_001).* |

---

## 2. Account Pages

All account pages require authentication. Account sidebar is organized into **4 groups** (unchanged from March):

### Purchasing
| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/account/dashboard` | Latest orders + monthly spend report |
| Orders | `/account/orders` (alias `All orders`) | Order history |
| Lists | `/account/lists` | Organization lists |
| Quote Requests | `/account/quotes` | Quote requests management |
| Saved for Later | `/account/saved-for-later` | Saved items list |
| Back-in-stock List | `/account/back-in-stock` | Back-in-stock notifications |

### Marketing
| Page | URL | Description |
|------|-----|-------------|
| Coupons & promotions | `/account/coupons` | All coupons & promotions (coupon cards with code, description, expiry) |
| Notifications | `/account/notifications` | User notifications |
| Points History | `/account/points-history` | Loyalty points history |

### Corporate
| Page | URL | Description |
|------|-----|-------------|
| Company Info | `/company/info` | Company information |
| Company Members | `/company/members` | Company members management |

### User
| Page | URL | Description |
|------|-----|-------------|
| Profile | `/account/profile` | User profile settings |
| Change Password | `/account/change-password` | Password management |
| Saved Credit Cards | `/account/saved-credit-cards` | Saved payment methods |

> The Addresses sidebar entry is only visible for personal accounts (without an org); B2B users like John Mitchell / TechFlow do NOT see it — by design.

---

## 3. Main Categories

> **2026-05-15 catalog restore:** Top-level inventory below reflects the post-restore state. Several categories present in March (Bolts top-level, NewTest2, Car Covers EN, Coming Soon, Coffee and tea was minimal, etc.) were replaced or dropped. **~4,537 products and 422 categories were swapped out**; only ~5 of 28 configurable products survived (with rebuilt sections).

### Top-Level Categories (from `/catalog`)

Counts are live product totals as of 2026-05-20.

| Category | URL | Count | Notes |
|----------|-----|-------|-------|
| [en-US] TV | `/tv` | 37 | Locale-tagged TV category |
| Accessories | `/accessories` | 3,087 | Largest top-level category |
| Alcoholic drinks | `/alcoholic-drinks` | 37 | |
| Carriage Bolts | `/bolts/carriage-bolts` | — | Only this subcategory exists; no `/bolts` top-level page |
| Coffee and tea | `/coffee-and-tea` | 2 | |
| Computer, Office, Education | `/computer-office-education` | 379 | Friendly URL; ID-based form below |
| Conditional Parents | `/seed-20260519-cond-parents` | 8 | *(new — seed category)* |
| Configurable Parents | `/seed-20260518-cfg-parents` | 2 | *(new — seed category)* |
| Consumer Electronics | `/consumer-electronics` | 413 | Friendly URL; ID-based form below |
| Craft | `/craft` | 38 | *(new since March)* |
| Drinks And Food | `/drinks-and-food` | 27 | *(new since March)* |
| Evergreen Wholesale | `/evergreen-wholesale` | 54 | *(new since March)* |
| For women | `/for-women` | 4 | *(new since March)* |
| Home Appliances | `/home-appliances` | 351 | Friendly URL; ID-based form below |
| Home supplies | `/kitchen-supplies` | 14 | URL still `kitchen-supplies` but display name is now "Home supplies" |
| Jewelry and Gems | `/jewelry-and-gems` | 133 | |
| Juice | `/juice` | 2 | |
| Mall of America | `/mall-of-america` | 9 | *(new since March — hosts Apple Store and gift card products)* |
| Meiertobler Demo | `/meiertobler-demo` | 5 | *(new since March)* |
| New home | `/new-home` | 3 | |
| Office furniture | `/office-furniture` | 335 | *(new since March)* |
| Phones and Accessories | `/phones-and-accessories` | 463 | Friendly URL; ID-based form below |
| Printers | `/printers` | 22 | |
| Products with options | `/products-with-options` | 11 | Configurable/variation products (restructured — see §5) |
| Rental home | `/homes` | 19 | URL is `/homes` (not `/rental-home`) |
| Seasonal | `/evergreen-wholesale/seasonal` | — | Subcategory of Evergreen Wholesale |
| Security And Protection | `/security-and-protection` | 552 | Friendly URL; ID-based form below |
| SEED-20260518-Electronics | `/seed-electronics` | 12 | *(new — seed category)* |
| SEED-20260518-Industrial Supplies | `/seed-industrial-supplies` | 8 | *(new — seed category)* |
| SEED-20260518-Office Supplies | `/seed-office-supplies` | 7 | *(new — seed category)* |
| Services | `/services` | 4 | *(new since March)* |
| Snacks | `/snacks` | 4 | |
| Soft Drinks | `/soft-drinks` | 16 | |
| Sports | `/evergreen-wholesale/sports` | — | Subcategory of Evergreen Wholesale |
| Standard Test Products | `/seed-20260519-std-cat` | 5 | *(new — seed category)* |
| TV & Multimedia | `/tv-multimedia` | 9 | *(new since March)* |
| Tyres | `/tyres` | 7 | *(new since March)* |
| WIPO | `/wipo` | 8 | *(new since March)* |
| Wireless Accessory World | `/wireless-accessory-world` | 4 | *(new since March)* |

### Categories Removed Since March 2026
- `/car-covers` (Car Covers EN)
- `/online-courses` (Online Courses)
- `/coming-soon` (Coming Soon)
- `/bolts` (top-level Bolts — subcategory `bolts/carriage-bolts` remains)
- `/newtest2` (NewTest2)
- `/new-catalog-item` (New Catalog Item)
- `/category1` (Category 1)
- `/soda` as top-level (404 — homepage hero first-slider still links here; correct target is `/soft-drinks` — SMK-001 / BUG_042_001)
- `/jewelry-and-gems` subcategories from March (preserved category, but children changed)
- Alcoholic-drinks subcategories from March (Beer, Cider, Distilled, Wine, etc. — verify each before use)
- Snacks subcategories from March (Chips, Cookie, Crackers, Nachos — verify)
- Soft-drinks subcategories from March (Mineral Water, Soda — verify)
- Printers subcategories from March (All-in-One, Multifunction — verify)

### Subcategories (sampled live, May 2026)

| Subcategory | URL | Parent |
|-------------|-----|--------|
| Seasonal | `/evergreen-wholesale/seasonal` | Evergreen Wholesale |
| Sports | `/evergreen-wholesale/sports` | Evergreen Wholesale |
| Everything for Kitchen | `/kitchen-supplies/everything-for-kitchen` | Home supplies |
| Carriage Bolts | `/bolts/carriage-bolts` | Bolts (no top-level page) |
| Apple Store Top | `/mall-of-america/apple-store-top/` | Mall of America |
| Digital / Gift Cards | `/accessories/digital/gift-cards/` | Accessories |
| Aliexpress / Phones-and-Accessories / Holders-Stands | `/accessories/aliexpress/phones-and-accessories/holders-stands` | Accessories |
| Digital products / Subscriptions | `/courses-and-digital-products/digital-products/subscriptions/` | Courses & digital products |

### Category by ID (stable URLs — homepage tiles)

| Category | URL |
|----------|-----|
| Consumer Electronics | `/category/36b507a9-0bdf-4cd9-821e-4dcbb6e1d578` |
| Medical goods | `/category/61b05fae-0ea6-45e7-ae4f-8bdc5c043847` *(label was "Allbiz" — footer still says "Allbiz")* |
| Computer, Office, Education | `/category/b3a3f328-cc99-4d88-a8f1-08fb02f43c8e` |
| Phones and Accessories | `/category/ab8be45e-3ff6-4b8c-80a3-1d3ef2dfa0ac` |
| Home Appliances | `/category/7f965eeb-a5d7-42a3-89c9-7c7237e43f9d` |
| Security & Protection | `/category/eee07117-dbbf-4713-b2be-8c9a96d81192` |
| Digital products | `/category/03b70abf-a428-4049-957c-230783952ea9` |

> Storefront resolves these category IDs against the **B2B virtual catalog root** — resolve via `@td(VIRTUAL_CATALOG_B2B.id)` (see `aliases.json` for the value on the active env). The vcst-qa value is `fc596540864a41bf8ab78734ee7353a3`; customers will see their own GUID. Products seeded into the physical catalog without a virtual-catalog link return 404 on storefront. See memory `feedback_storefront_virtual_catalog_link` for the failure mode.

---

## 4. E2E / Test / Seed Categories

| Category | URL | Notes |
|----------|-----|-------|
| Standard Test Products | `/seed-20260519-std-cat` | Active — 5 products |
| Configurable Parents | `/seed-20260518-cfg-parents` | Active — 2 products |
| Conditional Parents | `/seed-20260519-cond-parents` | Active — 8 products |
| SEED-20260518-Electronics | `/seed-electronics` | Active — 12 products |
| SEED-20260518-Industrial Supplies | `/seed-industrial-supplies` | Active — 8 products |
| SEED-20260518-Office Supplies | `/seed-office-supplies` | Active — 7 products |
| [E2E Test] RAM | `/e2e-test-ram` | Verify before use (was in March nav) |
| [E2E Test] Notebooks | `/e2e-test-notebooks` | Verify before use |
| [E2E Test] SSD | `/e2e-test-ssd` | Verify before use |
| [E2E] Catalog | `/e2e-catalog` | Verify before use |

---

## 5. Product Pages

### Product URL Structures

| Pattern | Example | Notes |
|---------|---------|-------|
| `/product/{uuid}` | `/product/fa1c0921-9f2f-4053-b8d0-d7822a4293b6` | Standard UUID-based product URL — works regardless of category nesting |
| `/{category}/{slug}` | `/products-with-options/configurable-products/hoodie` | SEO-friendly product URL under category (post-restore path) |
| `/{category}/{sub}/{slug}` | `/accessories/digital/gift-cards/` | Deeply nested category path |

### `/products-with-options` Subcategories (RESTRUCTURED post-restore)

The March 2026 layout (`configurable-caps-shirts`, `variations-of-jeans`, `configurations`) is gone. Current subcategories:

| Subcategory | URL | Count | Notes |
|-------------|-----|-------|-------|
| Build the bike of your dreams | `/products-with-options/build-the-bike-of-your-dreams` | 3 | bike-with-options, off-road-bike, off-road-bike-configurable-product-text |
| Cakes | `/products-with-options/cakes` | 1 | vintage-wedding-cake |
| Configurable products | `/products-with-options/configurable-products` | 5 | configurable-hat, hoodie, vintage-california-beach-pullover-hoodie, hat, custom-t-shirt |
| Shirts, jeans and more | `/products-with-options/shirts-jeans-and-more` | 1 | mens-flannel-shirts-… (variation product) |
| Wonderful beds | `/products-with-options/wonderful-beds` | 1 | bed-with-additional-options |

### Configurable Products (post-restore canonical paths)

| Product | URL | Notes |
|---------|-----|-------|
| Configurable Hat | `/products-with-options/configurable-products/configurable-hat` | Survived restore — sections rebuilt |
| Custom T-shirt | `/products-with-options/configurable-products/custom-t-shirt` | Survived restore — sections rebuilt |
| Vintage Colorado Hoodie | `/products-with-options/configurable-products/hoodie` | *Path changed* — was `/configurable-caps-shirts/hoodie` in March |
| Black California Beach Pullover Hoodie | `/products-with-options/configurable-products/vintage-california-beach-pullover-hoodie` | Now under configurable-products |
| Hat | `/products-with-options/configurable-products/hat` | |
| Bike with options | `/products-with-options/build-the-bike-of-your-dreams/bike-with-options` | New path |
| Off-Road Bike | `/products-with-options/build-the-bike-of-your-dreams/off-road-bike` | New path |
| Off-Road Bike (text-only variant) | `/products-with-options/build-the-bike-of-your-dreams/off-road-bike-configurable-product-text` | *(new)* |
| Vintage Wedding Cake | `/products-with-options/cakes/vintage-wedding-cake` | *(new — cake category)* |
| Bed with Additional Options | `/products-with-options/wonderful-beds/bed-with-additional-options` | *(new)* |
| Men's Flannel Shirts | `/products-with-options/shirts-jeans-and-more/mens-flannel-shirts-lightweight-cotton-button-down-…/b2c` | Variation product |

> **Do not assert exact prices or section IDs against these products.** The restore rebuilt configuration sections for surviving CFG products (Hat / T-shirt / Hoodie); verify section composition at runtime via xAPI or live discovery. See `feedback_env_resilience` and `live-discovery.md`.

### Product Display Types

Unchanged from March — 3 types: Configurable ("Customize" CTA + accordion widget), Variations ("N variations" link + "From $X"), Simple (direct quantity stepper / add-to-cart).

> **B2B-store has NO "Add to Cart" button on PDP** — the **Increase quantity (+)** stepper IS the add-to-cart entry point (both guest and authenticated). See `feedback_qty_stepper_as_add_to_cart`.

### Sample Product UUIDs (live May 2026 — verify before asserting)

| Product | Product ID | Source |
|---------|------------|--------|
| Aubess GPS Car Tracker | `fa1c0921-9f2f-4053-b8d0-d7822a4293b6` | Catalog listing |
| Audio Cassette Tape 60 Min | `41a44e18-1444-44e5-846e-90513f3649fa` | Catalog listing |
| Auto Hematology Analyzer (SB 22 TS) | `15677764-a195-490a-a1a2-da06bce7fa8a` | Catalog listing |

> The March homepage gift-card products (UNTUCKit / Eddie Bauer / Athleta) are replaced by Apple Gift Cards from `/mall-of-america/apple-store-top/`.

---

## 6. Search & Filtering

- **Search URL:** `/search?q={query}` (e.g., `/search?q=juicer`)
- **Compare:** `/compare`
- **Barcode scan:** button next to main search box (icon button — no dedicated page)

---

## 7. Admin SPA (BACK_URL)

Admin SPA is an Angular SPA with blade navigation. Routes use hash-based URLs (`#!/`). No change from March in route structure.

### System Pages

| Page | URL |
|------|-----|
| Login | `{BACK_URL}` |
| Dashboard | `{BACK_URL}/#!/workspace` |
| System Info | `{BACK_URL}/#!/workspace/systeminfo` |
| Modules | `{BACK_URL}/#!/workspace/modules` |
| Swagger | `{BACK_URL}/docs/index.html` |
| GraphiQL | `{BACK_URL}/ui/graphiql` |
| Hangfire | `{BACK_URL}/hangfire` |
| Platform health | `{BACK_URL}/health` *(NOT `/api/platform/healthcheck`)* |

### Module Admin Pages (blade-based)

| Module | Menu Path | Key Blades | Suite |
|--------|-----------|-----------|-------|
| **Catalog** | Catalog → Categories / Products / Properties | Category list, Product detail, Properties | 051, 053 |
| **Pricing** | Pricing → Price Lists / Assignments | Price list grid, Price assignment blade | 054, 055 |
| **Orders** | Orders → All Orders / Payment Requests | Order list, Order detail, Payment blade | 017–019 |
| **Customers** | Contacts → Organizations / Members | Org list, Member detail, Roles | 026, 027 |
| **Inventory** | Inventory → Fulfillment Centers / Stock | FC list, Stock blade | 056 |
| **Marketing** | Marketing → Promotions / Coupons / Content | Promo list, Coupon detail, Content items | 023–025 |
| **Notifications** | Notifications → Templates / Layouts / Push | Template editor, Layout grid, Push messages | 057, 058 |
| **CMS** | Content → Pages / Menus / Blog | Page list, Menu editor, Blog posts | 059, 060 |
| **Search** | Search → Indexing / Configuration | Index status, Config blade | 061 |
| **Assets** | Assets → Blob Storage | Asset browser, Upload blade | — |
| **Platform** | Settings → Users / Roles / Permissions / Languages | User grid, Role editor, Permission matrix | 020, 021, 063 |
| **Store** | Stores → Store detail | Store settings blade (payments, shipping, SEO) | 034, 035 |
| **Configurable Products** | Catalog → Products → Configuration | Section editor (Product/Text/File) | 052 |
| **White Labeling** | Settings → Branding / Themes | Theme editor, Logo upload | 067 |
| **Security** | Settings → Security / OAuth | Security settings, OAuth clients | — |

### Admin UI Patterns

- **Blade navigation**: panels slide in from right, stack horizontally; close with X or toolbar button
- **Grid pattern**: searchable, sortable, paginated grids (toolbar: Add, Delete, Export, Refresh)
- **Form pattern**: detail blade with fields, toolbar (Save, Cancel), validation errors inline
- **Notifications**: toast messages (success green, error red) top-right after save/delete

---

## 8. REST API Endpoints (BACK_URL)

| Module | Base Path | Key Operations |
|--------|-----------|---------------|
| **Auth** | `/connect/token` | `POST` — OAuth2 token (password, refresh_token grants) |
| **Platform** | `/api/platform/` | `GET modules`, `GET settings`, `POST pushnotifications` |
| **Platform health** | `/health` | `GET` — JSON status (Modules, Cache, Redis, SQL Server) |
| **Catalog** | `/api/catalog/` | `GET/POST products`, `GET/POST categories`, `GET properties`, `POST products/configurations` |
| **Pricing** | `/api/pricing/` | `POST evaluate`, `GET/POST pricelists`, `GET/POST assignments` |
| **Orders** | `/api/order/` | `GET/POST customerOrders`, `GET customerOrders/{id}`, `POST payments` |
| **Members** | `/api/members/` | `GET/POST organizations`, `GET/POST contacts`, `GET {id}` *(NOT `/api/customer/members/{id}`)* |
| **Inventory** | `/api/inventory/` | `GET products/{id}/availability`, `PATCH {id}` (JsonPatch), `POST reserve`, `POST release` |
| **Marketing** | `/api/marketing/` | `GET/POST promotions`, `GET/POST coupons` |
| **Notifications** | `/api/notifications/` | `GET/POST templates`, `POST send` |
| **Content** | `/api/content/` | `GET/POST pages`, `GET/POST menus` |
| **Search** | `/api/search/` | `POST index`, `GET status` |
| **Assets** | `/api/assets/` | `POST upload`, `GET blob`, `DELETE` |
| **Shipping** | `/api/shipping/` | `GET methods`, `POST evaluate` |
| **SEO** | `/api/seo/` | `GET slugs`, `POST redirects` |

**Common patterns:** Pagination via `skip/take` + `totalCount`. Auth via Bearer token. Errors: 400 validation, 401 unauth, 403 forbidden, 404 not found.

---

## 9. GraphQL xAPI Endpoints

- **Runtime endpoint:** `{BACK_URL}/graphql` (POST)
- **GraphiQL UI:** `{BACK_URL}/ui/graphiql`
- `/xapi/graphql` is NOT valid in this project (see `reference_graphql_endpoints`)

| Module | Key Queries | Key Mutations |
|--------|-----------|--------------|
| **xCatalog** | `products`, `product`, `categories`, `properties` | — (read-only) |
| **xCart** | `cart` | `addItem`, `removeCartItem`, `changeCartItemQuantity`, `addCoupon`, `removeCoupon`, `addOrUpdateCartShipment`, `addOrUpdateCartPayment`, `validateCoupon`, `mergeCart` (uses `secondCartId`) |
| **xOrder** | `orders`, `order` | `createOrderFromCart`, `changeOrderStatus` |
| **xProfile** | `me`, `organization`, `contact` | `createContact`, `updateContact`, `createOrganization`, `inviteUser` |
| **xCMS** | `pages`, `menus` | — (read-only from storefront) |
| **Quote** | `quoteRequest`, `quoteRequests` | `createQuoteFromCart`, `changeQuoteComment`, `approveQuoteRequest` |

**Critical rules:**
- HTTP 200 ≠ success — always check `response.data.errors[]`
- All `products` queries require `category.subtree:@td(VIRTUAL_CATALOG_B2B.id)` (B2B virtual catalog root) — storefront base filter
- All queries require `storeId`, `cultureName`, `currencyCode` context
- `addItem` mutation response has empty `data.addItem.items[]` due to async cart-projection settle; capture cart state via follow-up mutation (e.g. `unSelectAllCartItems`), not addItem response

See `graphql-test-cases-runner.md` and `graphql-schema.md` for authoring contracts.

---

## 10. External Links

| Platform | URL | Description |
|----------|-----|-------------|
| Virto Commerce Admin | `{BACK_URL}` | Admin platform (from env var) |
| Virto-start (demo store) | https://virtostart-demo-store.govirto.com/ | Linked from footer External links |
| Virto Commerce | https://virtocommerce.com | Main marketing website |
| Builder.io | https://www.builder.io/ | Linked from footer (Builder I.O) |

---

## 11. Menu Structure

### Top Header Bar

**Unauthenticated:**
- Language selector | Currency selector | Ship to | Theme toggle | Call us | Contacts | Sign in | Sign up now

**Authenticated:**
- Language selector | Currency selector | Ship to | Theme toggle | Call us | **Dashboard** (link → `/account/dashboard`) | Contacts | **Account menu** button (shows "OrgName / UserName"; e.g. "John Mitchell" for TechFlow user)

### Account Menu Dropdown
Triggered by the "OrgName / UserName" button in the top-right header. Opens a dropdown panel with:

1. **User section:** User name (avatar + full name, links to `/account/dashboard`) + **Logout** button — selector `data-testid="main-layout.top-header.account-menu.sign-out-button"`
2. **Organizations section:** "Organizations" label + Search box + scrollable list of organizations with radio buttons (click to switch active organization)

> The Account menu does NOT contain account page navigation links. Account pages are accessed via the sidebar on the Dashboard page, or via the **Dashboard** link in the top header.

> **GOLDEN RULE — storefront logout:** There is **no `/sign-out` page**, **no `/logout` page**, and **no standalone logout icon in the header**. The only correct logout sequence is: (1) click the user name / avatar in the top header to open this popup, (2) click the **Logout** button inside it. Agents and test-case authors MUST use this sequence.

### Main Nav Icon Bar (authenticated)
Icons in the middle navigation row (right side):
- **Org name** label (shows active org, e.g. `AGENT-TEST-Org-TechFlow-20260310`)
- Search box (+ Barcode scan icon)
- Bulk order → `/bulk-order`
- Compare → `/compare`
- Lists → `/account/lists`
- Orders → `/account/orders`
- **Notifications** (button — opens notifications dropdown, no dedicated page link, shows unread count badge)
- Cart → `/cart` (shows item count badge)

### All Products Dropdown *(refreshed May 2026)*
Available via the **"All products"** button. Top entries:
- Shop all categories
- Shop by brand
- New & Trending
- Holders & Stands

Plus all top-level categories listed in §3 (live order may vary): Home Appliances, Soft Drinks, Books, For women, Courses and audio books, Speeds Medical, Configurable Parents, New home, TV & Multimedia, Products with options, Craft, Carriage Bolts, Coffee and tea, Tyres, Alcoholic drinks, Accessories, Consumer Electronics, Conditional Parents, Medical goods, SEED-20260518-Office Supplies, SEED-20260518-Industrial Supplies, Juice, Snacks, SEED-20260518-Electronics, [en-US] TV, Services, Jewelry and Gems, Evergreen Wholesale, Meiertobler Demo, Generatation-en, Sports, Office furniture, Standard Test Products, Rental home, Seasonal, Phones and Accessories, Home supplies, Security And Protection, Printers, Drinks And Food, Mall of America, WIPO, Wireless Accessory World, Computer Office Education.

> "Configurable Parents" appears multiple times in the dropdown (likely a seed-data duplication artifact — verify before relying on it for tests).

### Main Navigation Bar (inline subcategory navigation, May 2026)
- Alcoholic Drinks
- Accessories
- Jewelry and gems
- Tyres *(new since March)*
- Home appliance *(new since March)*
- Juice
- Home supplies *(renamed from "Kitchen Supplies")*
- Products with options
- Soft drinks
- Snacks
- Printers
- Rental home
- TV new *(renamed from "TV")*
- All BRANDS
- SEE ALL PRODUCTS

---

## 12. Site Features

### User Features
- Multi-language support (15 languages — added Ελληνικά/Greek)
- Multi-currency support (USD primary)
- Theme toggle: Light / Dark / Auto
- Delivery address / Ship-to selection
- Account management
- Organization/Corporate accounts
- Quote management
- Bulk ordering
- Product comparison
- Wishlist/Lists
- Saved for Later
- Back-in-stock notifications
- Loyalty points history
- Coupons & promotions
- Product reviews and ratings
- Notifications system
- Barcode scanning

### Product Features
- Configurable product sections (Product / Text / File) — accordion widget on CFG products
- Product variations (size, color, material)
- Real-time inventory status
- Product ratings
- Multiple images per product
- Detailed specifications
- Price ranges (from/to)
- Sale/Discount indicators
- Gift card products

### B2B Features
- Corporate account management (Company Info / Company Members)
- Org switching via Account menu (radio button list)
- Quote management and price negotiation
- Multiple stores, channels, and locations
- Organization lists
- Bulk order processing
- B2B virtual catalog root: `@td(VIRTUAL_CATALOG_B2B.id)` — vcst-qa value is `fc596540864a41bf8ab78734ee7353a3`, customer value differs
- Same product added twice consolidates into one line item with summed quantity (B2B-store behavior — see `reference_b2b_lineitem_consolidation`)

---

## 13. Technical Information

### Platform
- **Platform:** Virto Commerce (ASP.NET)
- **Version:** **2.49.0** *(was 2.43.0 in March)*
- **Environment:** QA (vcst-qa)
- **Storefront:** vc-frontend (Coffee theme)
- **GraphQL:** WebSocket connection available for subscriptions

### URL Patterns

#### Localized URLs
- Default (English): `/{page}`
- Localized: `/{language-code}/{page}`

#### Category URLs
- Friendly URL: `/{category-slug}` (e.g., `/consumer-electronics`, `/computer-office-education`)
- ID-based: `/category/{category-id}` (used by homepage Popular Categories tiles)

#### Product URLs
- UUID: `/product/{product-uuid}`
- SEO path: `/{category}/.../{product-slug}` (path depends on virtual-catalog nesting)

---

## 14. Total Page Count Estimate (May 2026)

| Type | Count | Notes |
|------|-------|-------|
| **Storefront** | | |
| Static Pages | ~14 | Homepage, sign-in/up, contacts, catalog, cart, brands, news, etc. |
| Account Pages | 13 | Dashboard, orders, lists, profile, company info/members, etc. |
| Main Categories (live) | ~38 | Including SEED-* test categories and renamed/restructured ones |
| Category IDs | 7 | Named ID-based categories |
| Products | ~5,500+ | Live counts: Accessories 3,087 + Security 552 + Phones 463 + Consumer Electronics 413 + Home Appliances 351 + Office furniture 335 + Computer 379 + others |
| Languages | 15 | All pages × 15 languages |
| **Admin SPA** | | |
| System Pages | 8 | Login, dashboard, system info, modules, Swagger, GraphiQL, Hangfire, health |
| Module Pages | ~18 | Catalog, Pricing, Orders, Customers, Inventory, Marketing, etc. |
| **API Layer** | | |
| REST Endpoints | ~14 modules | Auth, platform, catalog, pricing, orders, members, etc. |
| GraphQL Modules | 6 | xCatalog, xCart, xOrder, xProfile, xCMS, Quote |

**Estimated Storefront Pages (English only):** ~80+
**Estimated with All Languages:** ~1,200+ (80 × 15)
**Estimated Admin Pages:** ~26
**Estimated API Surface:** ~80+ endpoints across 14 REST modules + 6 GraphQL modules

---

## Notes

1. **Catalog content is unstable** — 2026-05-15 wipe + restore replaced thousands of products and categories. Treat any IDs/slugs/SKUs in test data as drift candidates; resolve via `@td()` or `live-discover` (see `.claude/rules/test-data.md`).
2. **Dynamic content:** Many pages contain content loaded via GraphQL / WebSocket
3. **Authentication required** for all `/account/*` and `/company/*` pages
4. **Product variations** may have additional sub-pages
5. **SEO URLs** used in multiple languages
6. **No `/sitemap.xml`** — site does not expose an XML sitemap
7. **SEED-20260518/19-*** categories are test fixtures — they MAY be removed by future cleanup; don't rely on exact counts
8. **`Configurable Parents` appears multiple times** in the All Products dropdown (seed-data duplication artifact — verify before testing)
9. **Footer Popular Categories link** says "Allbiz" but resolves to Medical goods (label-vs-link drift)

---

## Changelog (vs. March 21, 2026 rev 3)

| Change | Details |
|--------|---------|
| Platform version | 2.43.0 → **2.49.0** |
| Catalog wipe + restore | 2026-05-15 restore replaced ~4,537 products and 422 categories; only ~5 of 28 CFG products survived (Hat / T-shirt / Hoodie + Bike/Off-Road kept GUIDs but sections rebuilt). See memory `project_vcstqa_restore_2026_05_15` |
| Language added | Ελληνικά (Greek, `el`) — 14 → **15** languages |
| New top-level categories | Tyres, Home appliance (display label), TV & Multimedia, Office furniture, Sports, Services, Books, For women, Craft, Seasonal, WIPO, Wireless Accessory World, Mall of America, Evergreen Wholesale, Meiertobler Demo, Drinks And Food, Standard Test Products |
| New seed categories | Configurable Parents, Conditional Parents, SEED-20260518-Electronics / Industrial Supplies / Office Supplies |
| Categories removed | Car Covers EN, Online Courses, Coming Soon, NewTest2, New Catalog Item, Category 1, Bolts (top-level), Soda (top-level — hero slider still links to `/soda` → 404; correct target `/soft-drinks`, SMK-001 / BUG_042_001) |
| Renames in nav | "Kitchen Supplies" → "Home supplies", "TV" → "TV new", "Coffee and Tea" → "Coffee and tea" |
| `/products-with-options` restructured | Old: configurable-caps-shirts, variations-of-jeans, configurations. New: build-the-bike-of-your-dreams, cakes, configurable-products, shirts-jeans-and-more, wonderful-beds |
| New CFG product paths | Hoodie/T-shirt/Hat now under `/products-with-options/configurable-products/...`; bikes under `/products-with-options/build-the-bike-of-your-dreams/...` |
| Homepage gift cards | Apple Gift Cards + Retail Therapy replaced UNTUCKit/Eddie Bauer/Athleta |
| Brands URL | `/Brands` (capital B in March) → `/brands` (lowercase, per footer link) |
| Rental home URL | `/new-home` (also `/homes` for Rental home entry in /catalog) |
| Account sidebar | Unchanged — 4 groups, 13 links |
| Top header / footer | Unchanged from March layout |

## Changelog (vs. March 4, 2026 rev 1 / 2)

See git history of this file for prior revisions.

---

**Last Updated:** May 20, 2026 (rev 4)
**Tool Used:** Playwright (Chrome) MCP — live crawl
**Coverage:** Homepage, top header, all-products dropdown, language selector, /catalog top-level inventory with counts, /products-with-options subcategories, account sidebar (Purchasing/Marketing/Corporate/User), footer, platform version (2.49.0)
