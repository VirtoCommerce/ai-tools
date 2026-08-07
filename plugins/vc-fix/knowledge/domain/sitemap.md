---
applicability: reference
applicability_rationale: "Full storefront URL map. Customer's sitemap differs by storefront customizations. @td(VIRTUAL_CATALOG_B2B.id) already used in some entries."
---

# Sitemap: FRONT_URL

**Generated:** August 7, 2026 (rev 6 — deterministic axis; body carried from rev 5, July 20 2026)
**Base URL:** FRONT_URL (from `FRONT_URL` env var) — vcst-qa
**Storefront (theme) version:** **2.54.0-pr-2382** (footer "Ver.") *(was 2.49.0 in May)*
**Platform assembly line:** VC 3.10xx (max module-required `platformVersion` = 3.1057.0; 87 modules loaded) *(rev 6, 2026-08-07 deterministic re-crawl: was 3.1039.0 / 86 modules)*
**Store total products:** 4,523 *(was 4,519 at rev 5)* · nav categories 49 · `/products-with-options` subcategories 7

> **Note on the version fields:** the storefront footer "Ver." (`2.54.0-pr-2382`) is the **vc-frontend theme** version — earlier revs of this doc mislabeled it "Platform version". The actual VirtoCommerce **platform** runs on the `3.10xx` assembly line (resolved from `/api/platform/modules`).

## Overview

B2B e-commerce storefront on Virto Commerce. **This rev was crawled as a guest** (unauthenticated) — the catalog is store-level so the top-level inventory/counts match the B2B signed-in view; the authenticated-only §2 Account and §7 Admin sections carry forward from rev 4 and were **not** re-verified this pass. Catalog content has been **re-seeded again since the May 2026 rev** — top-level inventory below reflects the current (guest, 2026-07-20) state and differs substantially from rev 4: a new family of `/seed-*` categories replaced the May `SEED-20260518/19-*` fixtures, `Products with options` grew 11→48, `Rental home` moved `/homes`→`/sweet-home`, `Bolts` is a top-level category again, and `[en-US] TV` was dropped. Treat all IDs/slugs/counts as drift candidates; resolve via `@td()` / `live-discover` (see `.claude/rules/test-data.md`).

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

> **Ongoing re-seeding:** Top-level inventory has drifted again since the May 2026 rev. This is incremental re-seeding (not a full wipe like 2026-05-15) — existing categories' counts shifted down slightly (Accessories 3,087→2,985, Consumer Electronics 413→391, etc.) and a **new `/seed-*` category family** was added, replacing the May `SEED-20260518/19-*` fixtures.

### Top-Level Categories (from the `/catalog` grid)

Counts are live product totals from the `/catalog` category grid as of **2026-07-20** (guest crawl). This grid is the authoritative top-level list; the "All products" nav dropdown (§11) carries some extra legacy/CMS-managed entries not in this grid (Coffee and tea, Juice, Mall of America, Wireless Accessory World, Speeds Medical).

| Category | URL | Count | Notes |
|----------|-----|-------|-------|
| Accessories | `/accessories` | 2,985 | Largest top-level category *(was 3,087)* |
| AGENT-TEST-Accessories | `/seed-agent-test-accessories` | 11 | *(new — seed fixture)* |
| Alcoholic drinks | `/alcoholic-drinks` | 37 | |
| Beauty | `/seed-beauty` | 3 | *(new — seed fixture)* |
| Bolts | `/bolts` | 29 | **Top-level again** (was demoted to `/bolts/carriage-bolts`-only in May) |
| Books | `/seed-books` | 1 | *(new — seed fixture; was un-seeded in May)* |
| Clothing | `/seed-clothing` | 4 | *(new — seed fixture)* |
| Computer, Office, Education | `/computer-office-education` | 291 | Friendly URL; ID-based form below *(was 379)* |
| Consumer Electronics | `/consumer-electronics` | 391 | Friendly URL; ID-based form below *(was 413)* |
| Craft | `/craft` | 34 | *(was 38)* |
| destinations | `/destinations` | 20 | *(new — lowercase slug + label)* |
| Drinks And Food | `/drinks-and-food` | 23 | *(was 27)* |
| Electronics | `/seed-electronics` | 16 | *(seed fixture — replaces May "SEED-20260518-Electronics", was 12)* |
| Evergreen Wholesale | `/evergreen-wholesale` | 54 | |
| For women | `/for-women` | 2 | *(was 4)* |
| Furniture | `/seed-furniture` | 2 | *(new — seed fixture)* |
| Home | `/seed-home` | 48 | *(new — seed fixture)* |
| Home Appliances | `/home-appliances` | 326 | Friendly URL; ID-based form below *(was 351)* |
| Home Improvement | `/seed-home-improvement` | 2 | *(new — seed fixture)* |
| Home supplies | `/kitchen-supplies` | 11 | URL still `kitchen-supplies`, display name "Home supplies" *(was 14)* |
| Jewelry and Gems | `/jewelry-and-gems` | 135 | *(was 133)* |
| Loyalty products | `/loyalty-products` | 27 | *(new — loyalty fixture family)* |
| New home | `/new-home` | 3 | |
| Office furniture | `/office-furniture` | 335 | |
| Personal Care | `/seed-personal-care` | 2 | *(new — seed fixture)* |
| Phones and Accessories | `/phones-and-accessories` | 446 | Friendly URL; ID-based form below *(was 463)* |
| Printers | `/printers` | 21 | *(was 22)* |
| Products with options | `/products-with-options` | 48 | Configurable/variation products — **restructured & grown 11→48**, see §5 |
| Rental home | `/sweet-home` | 19 | **URL changed** `/homes` → `/sweet-home` |
| Security And Protection | `/security-and-protection` | 551 | Friendly URL; ID-based form below *(was 552)* |
| Snacks | `/snacks` | 4 | |
| Soft Drinks | `/soft-drinks` | 13 | *(was 16)* |
| Sports | `/seed-sports` | 4 | *(new — seed fixture; distinct from Evergreen Wholesale/Sports subcat)* |
| Test Fixtures | `/seed-test-fixtures` | 9 | *(new — seed fixture)* |
| Tools | `/seed-tools` | 7 | *(new — seed fixture)* |
| TV & Multimedia | `/tv-multimedia` | 6 | *(was 9)* |
| Tyres | `/tyres` | 4 | *(was 7)* |

### Categories Dropped From the Grid Since May 2026
- `/tv` — [en-US] TV (was 37) — no longer a top-level grid tile
- `/coffee-and-tea`, `/juice`, `/mall-of-america`, `/wireless-accessory-world`, `/speeds-medical` — still in the "All products" nav dropdown but **absent from the `/catalog` grid** (verify before use)
- `/meiertobler-demo` (Meiertobler Demo), `/services` (Services), `/wipo` (WIPO) — gone from the grid
- May seed fixtures replaced: `/seed-20260518-cfg-parents` (→ now `/products-with-options/cfg-parents`), `/seed-20260519-cond-parents`, `/seed-20260519-std-cat`, `/seed-industrial-supplies`, `/seed-office-supplies`
- Still bad from earlier revs — homepage hero first-slider `/soda` target (SMK-001 / BUG_042_001): `/soda` is not a top-level grid category; correct target `/soft-drinks`. (Storefront is an SPA — every path returns the 200 shell, so a 404 is rendered client-side; existence must be judged from the `/catalog` grid, not HTTP status.)

### Subcategories (sampled live, July 2026)

| Subcategory | URL | Parent |
|-------------|-----|--------|
| Carriage Bolts | `/bolts/carriage-bolts` | Bolts |
| Ever green sports | `/evergreen-wholesale/ev-green-sports` | Evergreen Wholesale |
| Seasonal | `/evergreen-wholesale/seasonal` | Evergreen Wholesale |
| Everything for Kitchen | `/kitchen-supplies/everything-for-kitchen` | Home supplies |
| Holders & Stands | `/accessories/aliexpress/phones-and-accessories/holders-stands` | Accessories |
| Home appliance | `/accessories/aliexpress/home-appliences` | Accessories *(note the `home-appliences` spelling in the slug)* |
| Digital / Gift Cards | `/accessories/digital/gift-cards/` | Accessories |

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

The May `SEED-20260518/19-*` fixtures are gone; the current seed family uses friendly `/seed-<domain>` slugs (all in the §3 grid, listed here together). Treat as disposable — counts/existence drift with each re-seed.

| Category | URL | Notes |
|----------|-----|-------|
| AGENT-TEST-Accessories | `/seed-agent-test-accessories` | Active — 11 |
| Beauty | `/seed-beauty` | Active — 3 |
| Books | `/seed-books` | Active — 1 |
| Clothing | `/seed-clothing` | Active — 4 |
| Electronics | `/seed-electronics` | Active — 16 |
| Furniture | `/seed-furniture` | Active — 2 |
| Home | `/seed-home` | Active — 48 |
| Home Improvement | `/seed-home-improvement` | Active — 2 |
| Loyalty Fixtures | `/seed-loyalty-fixtures` | In nav (loyalty fixture family; see also `/loyalty-products`, `/loyalty-catalog`) |
| Personal Care | `/seed-personal-care` | Active — 2 |
| Sports | `/seed-sports` | Active — 4 |
| Test Fixtures | `/seed-test-fixtures` | Active — 9 |
| Tools | `/seed-tools` | Active — 7 |
| Configurable Parents | `/products-with-options/cfg-parents` | Active — 24 (moved under Products with options; see §5) |

---

## 5. Product Pages

### Product URL Structures

| Pattern | Example | Notes |
|---------|---------|-------|
| `/product/{uuid}` | `/product/fa1c0921-9f2f-4053-b8d0-d7822a4293b6` | Standard UUID-based product URL — works regardless of category nesting |
| `/{category}/{slug}` | `/products-with-options/configurable-caps-shirts/hoodie` | SEO-friendly product URL under category |
| `/{category}/{sub}/{slug}` | `/accessories/digital/gift-cards/` | Deeply nested category path |

### `/products-with-options` Subcategories (RESTRUCTURED again — July 2026, 48 results)

The May layout (`configurable-products`, `cakes`) is gone; the CFG products moved **back** under `configurable-caps-shirts`, `cakes`→`dreamy-cakes` (now a full variation family), and the seed `cfg-parents` category folded in here (24 products). Current subcategories:

| Subcategory | URL | Count | Notes |
|-------------|-----|-------|-------|
| Build the bike of your dreams | `/products-with-options/build-the-bike-of-your-dreams` | 3 | bike-with-options, off-road-bike, off-road-bike-configurable-product-text |
| Configurable caps & shirts | `/products-with-options/configurable-caps-shirts` | 5 | hoodie, custom-t-shirt, hat, vintage-california-beach-pullover-hoodie *(back to this slug — was `configurable-products` in May)* |
| Configurable Parents | `/products-with-options/cfg-parents` | 24 | seed cfg-parents family (see `project_configurable_parents_url_segment_cfg_parents` memory) |
| Dreamy cakes | `/products-with-options/dreamy-cakes` | 14 | *(was "cakes" / 1 — now a full variation set: buttercreme styles, filings, flowers)* |
| Shirts, jeans and more | `/products-with-options/shirts-jeans-and-more` | 1 | mens-flannel-shirts-… (variation product) |
| Wonderful beds | `/products-with-options/wonderful-beds` | 1 | bed-with-additional-options |

### Configurable Products (canonical paths — July 2026)

| Product | URL | Notes |
|---------|-----|-------|
| Vintage Colorado Hoodie | `/products-with-options/configurable-caps-shirts/hoodie` | *Path changed* — was `/configurable-products/hoodie` in May |
| Custom T-shirt | `/products-with-options/configurable-caps-shirts/custom-t-shirt` | "Customize" CTA |
| Men's Adjustable Scholarship Hat (Team Color) | `/products-with-options/configurable-caps-shirts/hat` | 6 variations |
| Black California Beach Pullover Hoodie | `/products-with-options/configurable-caps-shirts/vintage-california-beach-pullover-hoodie` | 5 variations |
| Bike with options | `/products-with-options/build-the-bike-of-your-dreams/bike-with-options` | "Customize" CTA |
| Off-Road Bike | `/products-with-options/build-the-bike-of-your-dreams/off-road-bike` | |
| Off-Road Bike (text-only variant) | `/products-with-options/build-the-bike-of-your-dreams/off-road-bike-configurable-product-text` | |
| Vintage Wedding Cake (Dreamy cakes) | `/products-with-options/dreamy-cakes/top-white-bottom-white` (+ variants) | Variation family: buttercreme-style-*, filing-*, flowers-* |
| Bed with Additional Options | `/products-with-options/wonderful-beds/bed-with-additional-options` | "Customize" CTA |
| Men's Flannel Shirts | `/products-with-options/shirts-jeans-and-more/mens-flannel-shirts-…` | Variation product |

> **Do not assert exact prices or section IDs against these products.** Configuration sections drift with each re-seed; verify section composition at runtime via xAPI or live discovery. See `feedback_env_resilience` and `live-discovery.md`.

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

### All Products Dropdown *(refreshed July 2026)*
Available via the **"All products"** button. Top entries:
- Shop all categories → `/catalog`
- Shop by brand → `/Brands`
- New & Trending → `/search?q=juicer`
- Holders & Stands → `/accessories/aliexpress/phones-and-accessories/holders-stands`

Plus top-level categories (live order varies). **The dropdown is a CMS-managed menu and does NOT match the `/catalog` grid 1:1** — it still carries legacy entries not in the grid: Bolts, Test Fixtures, Home Improvement, Home, Courses and audio books (`/online-courses`), Speeds Medical, Generatation-en (`/new-catalog-item`), Juice, Coffee and tea, Mall of America, Wireless Accessory World, Loyalty (`/loyalty-catalog`), Loyalty Fixtures (`/seed-loyalty-fixtures`). Verify any entry against the §3 grid before relying on it.

### Main Navigation Bar (inline subcategory navigation, July 2026)
- Alcoholic Drinks
- Accessories
- Jewelry and gems
- Tyres
- Home appliance → `/accessories/aliexpress/home-appliences`
- Juice
- Home supplies
- Products with options
- Soft drinks
- Snacks
- Printers
- Rental home → `/sweet-home` *(URL changed from `/homes`)*
- TV new → `/tv-multimedia`
- All brands → `/brands`
- Loyalty → `/loyalty-catalog` *(new)*
- SEE ALL PRODUCTS → `/catalog`

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
- **Platform:** Virto Commerce (ASP.NET) — assembly line **3.10xx** (max module-required `platformVersion` 3.1039.0; 86 modules loaded)
- **Storefront (theme) version:** **2.54.0-pr-2382** (footer "Ver."; a PR-preview theme build) *(was 2.49.0 in May)*
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
| Main Categories (live grid) | ~37 | `/catalog` grid tiles, incl. `/seed-*` fixtures (nav dropdown lists more) |
| Category IDs | 7 | Named ID-based categories |
| Products | ~5,000+ | Live counts: Accessories 2,985 + Security 551 + Phones 446 + Consumer Electronics 391 + Office furniture 335 + Home Appliances 326 + Computer 291 + others |
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
7. **`/seed-*` categories** are test fixtures (current family replaced the May `SEED-20260518/19-*` set) — they MAY be removed/re-created by future cleanup; don't rely on exact counts
8. **`/catalog` grid ≠ "All products" nav dropdown** — the CMS-managed dropdown carries legacy entries not present in the grid; treat the grid (§3) as authoritative
9. **Footer Popular Categories link** says "Allbiz" but resolves to Medical goods (label-vs-link drift)
10. **Storefront is an SPA** — every path returns the 200 shell and renders 404s client-side, so HTTP status can't confirm a category/product exists; judge existence from the `/catalog` grid or live discovery

---

## Changelog (vs. July 20, 2026 rev 5)

| Change | Details |
|--------|---------|
| Platform assembly line | max module-required `platformVersion` 3.1039.0 → **3.1057.0**; modules loaded 86 → **87** (Sprint 26-15 deploys) |
| Store total products | 4,519 → **4,523** (nav categories unchanged at 49) |
| Scope of this rev | **Deterministic xAPI crawl only** (`npm run sitemap:refresh`, 2026-08-07, `/qa-test-plan` Step 0). Storefront theme "Ver." is SPA-rendered and was **not** resolved this pass — the rev-5 value stands. §§2–9 body content carried forward, not re-verified. |

---

## Changelog (vs. May 20, 2026 rev 4)

| Change | Details |
|--------|---------|
| Storefront theme version | 2.49.0 → **2.54.0-pr-2382** (footer "Ver."); doc now separates this from the VC **platform** assembly line (3.10xx) — earlier revs mislabeled the footer version as "Platform version" |
| Catalog re-seeded (incremental) | Not a full wipe — existing category counts drifted down slightly (Accessories 3,087→2,985, Consumer Electronics 413→391, Home Appliances 351→326, Phones 463→446, Computer 379→291, Soft Drinks 16→13, Tyres 7→4, etc.) |
| New `/seed-*` category family | AGENT-TEST-Accessories, Beauty, Books, Clothing, Electronics, Furniture, Home, Home Improvement, Personal Care, Sports, Test Fixtures, Tools, Loyalty products, destinations — replacing the May `SEED-20260518/19-*` fixtures |
| Bolts | Back as a **top-level** category (`/bolts`, 29) — was demoted to `/bolts/carriage-bolts`-only in May |
| Rental home URL | `/homes` → **`/sweet-home`** (19) |
| Dropped from `/catalog` grid | `[en-US] TV` (`/tv`), Meiertobler Demo, Services, WIPO; and (in dropdown only, not grid) Coffee and tea, Juice, Mall of America, Wireless Accessory World, Speeds Medical |
| `/products-with-options` restructured & grown 11 → 48 | CFG products moved **back** to `configurable-caps-shirts` (was `configurable-products` in May); `cakes`→**`dreamy-cakes`** (1→14, full variation family); seed **`cfg-parents`** folded in (24) |
| CFG product paths | Hoodie/T-shirt/Hat/Beach-hoodie now under `/products-with-options/configurable-caps-shirts/...` |
| Nav / Loyalty | "Loyalty" (`/loyalty-catalog`) added to inline nav; loyalty fixture categories (`/loyalty-products`, `/seed-loyalty-fixtures`) present |
| Crawl scope | Guest (unauthenticated); §2 Account + §7 Admin carried forward from rev 4 (not re-verified) |
| Not re-verified this rev | Languages (still 15 assumed), homepage hero copy, account sidebar, admin blades, REST/GraphQL surface — unchanged from rev 4 unless noted |

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

**Last Updated:** August 7, 2026 (rev 6)
**Tool Used:** Playwright (Chrome) MCP — live crawl (guest) + `/api/platform/modules` (authed) for platform version
**Coverage this rev:** `/catalog` top-level grid with live counts, `/products-with-options` subcategories + CFG product paths, homepage footer theme version, "All products" dropdown + inline nav, platform assembly line. **Carried forward from rev 4 (not re-verified):** §2 Account pages, §7 Admin SPA, §8 REST + §9 GraphQL surface, language list (15), homepage hero copy.
