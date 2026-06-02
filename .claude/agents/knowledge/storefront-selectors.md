---
applicability: reference
applicability_rationale: "vc-frontend stable selectors (data-test-id / role / aria-label). Customer with custom theme adapts selector strategy."
---

# Storefront Selectors — Live-Verified DOM Reference

**Captured:** 2026-05-14 against `FRONT_URL=https://vcst-qa-storefront.govirto.com` (Coffee theme, B2B-store)
**Browser:** `playwright-chrome` (chromium 1920×1080), authenticated as `USER_EMAIL` from `.env`
**Purpose:** Source of truth for selectors used by `regression/suites/Frontend/cross-cutting/048b-layout-stability.csv` and other layout/shift tests. Every selector below was verified live with `document.querySelectorAll(...).length` returning the documented `matched` count.

## Selector Conventions (Apply Globally)

- **Test-attribute name is `data-test-id`** (singular, with hyphen). NOT `data-testid`, NOT `data-test`, NOT `data-cy`, NOT `data-qa`. Confirmed only `data-test-id` is in use.
- Layer-1 (most stable): `[data-test-id="..."]` — present on most checkout/cart/header/account controls.
- Layer-2 (stable BEM-ish): `.vc-*` Vue component classes (`vc-product-card`, `vc-line-item`, `vc-quantity-stepper`, `vc-product-price`, `vc-input`, `vc-button`). These come from `@vc-shell/framework` and `vc-frontend`.
- Layer-3 (page-scoped BEM): page-specific classes like `product-price-block__*`, `category-products__list--grid`, `image-gallery__*`, `top-header-link`, `slider-block`. Stable across renders, may differ per theme/store.
- Layer-4 (avoid): Tailwind utility chains (`flex h-10 items-center gap-1 …`) and Vue scoped attrs (`data-v-6f040c9d`) — unstable across builds.

---

## 1. Home Page (`{{FRONT_URL}}/`)

| Element | Selector | matched | Stability |
|---|---|---|---|
| Hero / banner block | `.slider-block` | 1 | Stable (page-scoped) |
| Hero active slide | `.slider-block .swiper-slide-active` | 1 | Stable (Swiper class) |
| Header root | `header[data-test-id="top-header"]` | 1 | Stable (data-test-id) |
| Top header link (e.g. Dashboard) | `a.top-header-link` | 2 | Stable |
| Cart icon link in nav | `header a[href="/cart"]` | 1 | Stable |
| Cart count badge | _no dedicated class_ — read text of cart link (`"10 Cart"` pattern); a `<span class="relative">` wraps the icon | n/a | Use text content / aria-label |
| Search input | `input[data-test-id="global-search-query-input"]` | 1 | Stable (data-test-id) |
| Search submit | `button[data-test-id="global-search-apply-button"]` | 1 | Stable |
| Account button | `button[data-test-id="account-button"]` | 1 | Stable |
| Customer name in header | `[data-test-id="customer-name-label"]` | 1 | Stable |
| Featured products section | `.products-block` | 1 | Stable |
| Products grid (home) | `.vc-products-grid` | 1 | Stable |
| Product card (home grid) | `.vc-products-grid .vc-product-card` | 20 | Stable |
| Nav-bottom container (cart sibling parent) | `nav.relative.z-\[2\]` (or look up by chain: `header + div nav`) | 1 | Stable structure; prefer `header a[href="/cart"]` closest `nav` |
| Neighbor of cart icon | `header a[href="/cart"] + a`, or pick `a.top-header-link` (top bar) — top header has Dashboard/Lists/Orders next to language/currency selectors | 2 | Stable |

**Note:** No `.vc-banner` or `.vc-hero` exists. The "hero" is a Swiper slider inside `.slider-block`. Two `<h2>` headings on home (`Daily Deals`, `Commercial management has never been that easy`) both render as `h1`-variant typography (`<h2 class="vc-typography vc-typography--variant--h1">`).

---

## 2. Catalog / Category Page

**Landing URL:** `{{FRONT_URL}}/catalog` (NOT `/category/all`). Individual categories: `/category/{guid}` (e.g. `/category/b3a3f328-cc99-4d88-a8f1-08fb02f43c8e`). Search results: `/search?q=...`.

| Element | Selector | matched | Stability |
|---|---|---|---|
| Page H1 (catalog title + count) | `h1.vc-typography--variant--h1` | 1 | Stable |
| Product grid container | `.category-products__list--grid` | 1 | Stable (page-scoped BEM) |
| Product grid parent | `.category-products` | 1 | Stable |
| Product card root | `.category-products__list .vc-product-card` | 16 (default page size) | Stable |
| Card title | `.vc-product-card .vc-product-title` | 16 | Stable |
| Card title link | `.vc-product-card .vc-product-title a` | 16 | Stable |
| Card price | `.vc-product-card .vc-product-price` | 16 | Stable |
| Card "actual" price text | `.vc-product-card .vc-product-price__actual` | 16 | Stable |
| Card image | `.vc-product-card .vc-product-image img` | 16+ | Stable |
| Card SKU attr | `.vc-product-card[data-product-sku]` | 16 | **Recommended — every card exposes its SKU** |
| First N cards | `.category-products__list .vc-product-card:nth-child(-n+4)` | 4 | Use for "first 4" tests |
| Filter group (price) | `[data-test-id="filter-price"]` | 1 | Stable (data-test-id pattern: `filter-{Property}`) |
| Filter option (e.g. brand) | `[data-test-id^="filter-BRAND-"]` | many | Stable |
| Products count label | `[data-test-id="products-count-label"]` | 1 | Stable |
| View switcher | `[data-test-id="view-switcher"]`, `[data-test-id="grid-view-tab"]`, `[data-test-id="list-view-tab"]` | 1 each | Stable |
| Endless-scroll loader | `[data-test-id="category-endless-scroll-loader"]` | 1 | Stable |
| Variations button (on grouped cards) | `[data-test-id^="variations-"]` (suffix is SKU) | several | Stable |
| "Purchased before" checkbox filter | `[data-test-id="purchased-before-checkbox-filter"]` | 1 | Stable |

---

## 3. Product Detail Page (PDP)

**Example URL captured:** `/kitchen-supplies/everything-for-kitchen/BENDING-STRAWS-PAPER-STRIPED-ASSORTED-22CM-6MM-PACK-500PCS` (SKU `8033482`, in-stock).
**SEO-friendly URL pattern:** PDP URLs are SEO slugs, NOT `/product/{sku}`. Resolve via catalog link click (see `@td(BOPIS.testProductName)` for stable links) or via `/search?q={sku}` then click first card.

| Element | Selector | matched | Stability |
|---|---|---|---|
| Product title (H1) | `h1.vc-typography--variant--h1` | 1 | Stable |
| Main gallery container | `.image-gallery` | 1 | Stable |
| Gallery images viewport | `.image-gallery__images` | 1 | Stable |
| Active main image | `.image-gallery__img--active` (or `.image-gallery img.image-gallery__img--active`) | 1 | Stable |
| Thumbnails strip | `.image-gallery .swiper-wrapper` | 1 | Stable |
| Thumbnail | `.image-gallery__thumb` | N (per product) | Stable |
| Price (top of buy block) | `.product-price-block .vc-product-price__actual` | 1 | Stable |
| Quantity stepper container | `.vc-quantity-stepper` | 1 | Stable |
| Decrease (−) button | `.vc-quantity-stepper button[aria-label="Decrease quantity"]` | 1 | Stable (aria-label) |
| Increase (+) button | `.vc-quantity-stepper button[aria-label="Increase quantity"]` | 1 | Stable (aria-label) |
| Qty input | `.vc-quantity-stepper input.vc-input__input` (or `input[type=number]` scoped to stepper) | 1 | Stable |
| Add-to-cart entry | **On B2B-store, the `+` (Increase quantity) button IS the add-to-cart action** — there is no separate "Add to Cart" button on the PDP. Once qty ≥ 1, the View Cart button appears: `a.product-price__cart-button` (text `"View cart"`, links to `/cart`). |  | Documented per memory `feedback_qty_stepper_as_add_to_cart` |
| "Stock alert" button (out-of-stock SKUs) | `.product-price-block button[aria-label="Stock alert"]` | varies | Stable |
| Add-to-list (wishlist) | `button.product-price-block__add-to-list` (aria-label `"Add to list"`) | 1 | Stable |
| Add-to-compare | `button.product-price-block__add-to-compare` | 1 | Stable |
| Share | `button.product-price-block__share-button` | 1 | Stable |
| Print | `button.product-price-block__print-button` | 1 | Stable |
| Buy block root | `.product-price-block` (Vue widget) | 1 | Stable |

---

## 4. Cart Page (`{{FRONT_URL}}/cart`) — Single-Page Checkout

**Important:** vc-frontend uses a **single-page cart + checkout flow** on `/cart`. The cart page renders products, shipping, payment, AND a Place Order CTA all in one view. There is no dedicated `/checkout` route in this build (see Section 5 note).

| Element | Selector | matched | Stability |
|---|---|---|---|
| Products section | `[data-test-id="cart.products-section"]` | 1 | Stable |
| Line item row | `.vc-line-item` | N (1 per cart line) | Stable |
| Line item SKU attr | `.vc-line-item[data-product-sku]` | N | Stable |
| Line item title link | `.vc-line-item a.vc-product-title__text` | N | Stable |
| Line item image | `.vc-line-item img.vc-image` | N | Stable |
| Line item price (per-item) | `.vc-line-item .vc-line-item__property-price` | N | Stable |
| Line item subtotal (qty × price) | `.vc-line-item .vc-line-item__total` (also `.vc-product-price--align--end`) | N | Stable |
| Line item qty stepper | `.vc-line-item .vc-quantity-stepper` | N | Stable |
| Remove from cart button | `.vc-line-item [data-test-id="remove-item-button"]` | N | Stable |
| Line item checkbox | `[data-test-id="vc-line-item-checkbox"]` | N | Stable |
| Header (select-all) checkbox | `[data-test-id="vc-line-items-head-checkbox"]` | 1 | Stable |
| Save for later button | `[data-test-id="save-for-later-button"]` | 1+ | Stable |
| Clear cart button | `[data-test-id="clear-cart-button"]` | 1 | Stable |
| Empty cart state | `.vc-empty-page` (with `.vc-empty-page__title`, `.vc-empty-page__wrapper`, `.vc-empty-page__breadcrumbs`) | 0 (when non-empty) / 1 (when empty) | Stable. Render condition not directly verified live (cart was non-empty during capture); selector confirmed in stylesheet definitions. |

### Cart Totals / Order Summary

| Element | Selector | matched | Stability |
|---|---|---|---|
| Order summary widget | `[data-test-id="order-summary-widget"]` | 1 | Stable |
| Subtotal label | `[data-test-id="cart-subtotal-label"]` | 1 | Stable |
| Discount label | `[data-test-id="cart-discount-total-label"]` | 1 | Stable |
| Tax label | `[data-test-id="cart-tax-total-label"]` | 1 | Stable |
| Shipping cost label | `[data-test-id="shipping-cost-label"]` | 1 | Stable |
| Total label | `[data-test-id="cart-total-label"]` | 1 | Stable |

---

## 5. Checkout (`/checkout` does NOT exist as separate route)

**Critical:** Storefront does not navigate to `/checkout`. All checkout fields live on `/cart` (single-page checkout). The selectors below are all on `/cart`.

| Element | Selector | matched | Stability |
|---|---|---|---|
| Shipping details section | `[data-test-id="shipping-details-section"]` | 1 | Stable |
| Pickup/Shipping switcher (BOPIS) | `[data-test-id="pickup-switcher"]`, `[data-test-id="shipping-switcher"]` | 1 each | Stable |
| Shipping address section | `[data-test-id="shipping-address-section"]` | 1 | Stable |
| Selected address label | `[data-test-id="selected-address-label"]` | 2 (shipping + billing copy) | Stable |
| Select-address button | `[data-test-id="select-address-button"]` | 1 | Stable |
| Shipping method selector | `[data-test-id="shipping-method-selector"]` | 1 | Stable |
| Payment details section | `[data-test-id="payment-details-section"]` | 1 | Stable |
| Billing-equals-shipping checkbox | `[data-test-id="billing-address-equals-shipping-checkbox"]` | 1 | Stable |
| Payment method selector | `[data-test-id="payment-method-selector"]` | 1 | Stable |
| Place Order CTA (primary) | `[data-test-id="place-order-button"]` | 1 | Stable. **BL-CHK-003** — must disable after first click. |
| Sticky Place Order (scroll-pinned duplicate) | `[data-test-id="sticked-place-order-button"]` | 1 | Stable |

**Note:** A separate `/checkout/review` route exists but is gated by store config `checkout_multistep_enabled` (off by default in vcst-qa) per memory `project_checkout_multistep_gate`. CyberSource payments embed a form on `/cart`; Skyflow/Authorize.Net/Datatrance redirect to `/checkout/payment` after clicking Place Order.

---

## 6. Sign-Up Form (`{{FRONT_URL}}/sign-up`)

**BLOCKER:** `/sign-up` and `/sign-in` BOTH redirect to `/catalog` when the browser session is authenticated, and the storefront has no UI-accessible sign-out (per memory `feedback_no_signout_page`; `/sign-out` returns 404, POST to `/logout` returns 405). Live selector capture of the sign-up form was NOT possible in this session.

**Documented from prior regression suite knowledge (`regression/suites/Frontend/auth/031-*.csv`) — needs live re-verification in a fresh incognito context before use in layout-shift tests:**

| Element | Selector (TENTATIVE) | Notes |
|---|---|---|
| Email input | `input[type="email"]`, or `input[name="email"]`, or scoped form: `form input[type="email"]:first-of-type` | Sign-up form lives under a `<form>` element on `/sign-up`. The reusable `.vc-input` wrapper means input is `.vc-input__input` inside `.vc-input__container`. |
| Password input | `input[type="password"]` | Tracked with `.vc-input__input`. |
| Confirm password | `input[type="password"]:nth-of-type(2)` or named `confirmPassword` | |
| Submit button | `form button[type="submit"]` (likely class `vc-button--solid--primary`) | |
| Validation error placement | `.vc-input-details` (sibling of `.vc-input__container` inside `.vc-input` wrapper). For an input in error state, parent gains `.vc-input--error`; the message renders in `.vc-input-details:not(.vc-input-details--hide-empty)`. NO `aria-describedby`; messages are conventional Vue component slots. |
| Field-level error class on wrapper | `.vc-input--error`, `.vc-input__input` gains red border via parent state | |
| Toast / form-level error | `.notifications-host__wrapper:not(:empty)` (top-level toast container) | Notification system. |

**Action item:** Re-run live capture against `/sign-up` from a fresh `playwright-chrome` context (no cookies). Update this section once verified.

---

## 7. Loading / Skeleton States

Captured via stylesheet introspection (`document.styleSheets` rule search). DOM presence varies by route + network speed; selectors below are defined in compiled CSS and will be present in DOM during their respective component's loading phase.

| Skeleton | Selector | Where it appears | Final-content selector |
|---|---|---|---|
| Widget skeleton (generic) | `.vc-widget-skeleton` (sizes: `--size--xs/sm/md/lg`) | Wraps `.vc-widget` (e.g. order summary, mini-cart popover, product price block) | `.vc-widget` (with final children populated) |
| Table mobile skeleton | `.vc-table__mobile-skeleton` (with `__block`, `__label`, `__item` children) | Mobile data tables (orders list, transactions) | `.vc-table` rendered rows |
| Table desktop skeleton | `.vc-table__skeleton`, `.vc-table__skeleton-cell` | Desktop data tables before data arrives | `.vc-table tbody tr` |
| Credit card skeleton | `.credit-card-skeleton` (`__number`, `__expire`, `__action`, `__placeholder`) | Saved-cards list during fetch (account profile) | `.credit-card` rendered list items |
| Wishlist skeleton | `.wishlist-products-skeleton` (`--mobile`, `--desktop`, `__item`) | `/account/lists/{id}` while items load | `.vc-product-card` inside list |
| Ship-to placeholder | `.ship-to-selector__placeholder` | Header ship-to selector before address resolves | `.ship-to-selector` with selected address label |
| Shipping method image placeholder | `.shipping-details-section__method-image--placeholder` | Per-shipping-method icon while loading | `.shipping-details-section__method-image` (real img) |
| Input placeholder (text) | `.vc-input__input::placeholder` | Empty form fields | N/A (CSS placeholder pseudo-element) |

**Skeleton-→-content shift test recipe:**
1. Throttle network (Slow 3G), navigate to `/account/orders` or `/account/lists`.
2. Wait for `.vc-table__skeleton` (or `.wishlist-products-skeleton`) to appear (`document.querySelector(...).matches(':visible')`).
3. Measure bounding rect of a fixed reference (e.g. `header` or `[data-test-id="order-summary-widget"]`) before content swap.
4. Wait for `.vc-table tbody tr` (or `.vc-product-card`) to render and skeleton to be removed.
5. Re-measure reference rect — CLS = top-shift contribution.

---

## 8. Long-Title Product (Stress Test)

**Verified live (2026-05-14):**

| Field | Value |
|---|---|
| SKU | `8033482` |
| Title length | 179 characters |
| Title | `Christmas paper straws, striped dot drink straws, decorative straws with Christmas tree, star, snowflake, gift jar pattern. Christmas party supplies, 22cm-6mm, pack of 500 pieces.` |
| URL (slug-based) | `/kitchen-supplies/everything-for-kitchen/BENDING-STRAWS-PAPER-STRIPED-ASSORTED-22CM-6MM-PACK-500PCS` |
| Discoverability | `/search?q=Christmas%20paper%20straws` — first card match |
| Stock status | In-stock (qty stepper visible, no "Stock alert" button) |
| Variants | Yes — `[data-test-id="variations-8033482-button"]` exists on catalog grid |

**Other long-title candidates found on catalog page 1 (less recommended — `8033482` is most realistic):**
- SKU `JM-343434554` — 60 chars (`TEST min < stock CAPRI-SUN MULTIVITAMIN POUCH BOX 4X10X0,20L`) — borderline
- SKU `96239997` — 329 chars (Erdinger beer, **repetitive synthetic test data**, not realistic) — only use for pathological stress tests

**Recommended `test-data/aliases.json` entry:**
```json
"STRESS": {
  "longTitleSku": "8033482",
  "longTitleSlug": "/kitchen-supplies/everything-for-kitchen/BENDING-STRAWS-PAPER-STRIPED-ASSORTED-22CM-6MM-PACK-500PCS",
  "longTitleChars": 179
}
```
(NOTE: this entry was NOT added by this capture session — write task is selector documentation only. Suggest adding via a separate `/qa-seed-data` or manual `test-data/` update, then run `npx tsx scripts/validate-td-refs.ts`.)

---

## 9. Data-Attribute Convention

| Attribute | Status | Notes |
|---|---|---|
| `data-test-id` | **In use, widespread** | Singular, hyphenated. Examples: `place-order-button`, `quantity-stepper`, `account-button`, `global-search-query-input`, `desktop-main-menu-cart-link`, `filter-BRAND-3DR`. PRIMARY selector layer when present. |
| `data-testid` | Not in use | Confirmed absent. |
| `data-test` | Not in use | Confirmed absent. |
| `data-cy` | Not in use | Confirmed absent (no Cypress). |
| `data-qa` | Not in use | Confirmed absent. |
| `data-product-sku` | In use | On `.vc-product-card` and `.vc-line-item`. **Use for SKU-targeted assertions and per-card scoping.** |
| `data-v-{hash}` | In use (Vue scoped CSS) | **DO NOT use as a selector** — these regenerate per build. |

**Naming patterns observed:**
- Buttons: kebab-case ending `-button` (e.g. `place-order-button`, `select-address-button`, `clear-cart-button`)
- Sections: kebab-case ending `-section` (e.g. `shipping-details-section`, `cart.products-section` — note one uses a dot)
- Selectors / inputs: descriptive (`global-search-query-input`, `vc-line-item-checkbox`)
- Filter facets: pattern `filter-{PropertyName}` and `filter-{PropertyName}-{Value}` (e.g. `filter-BRAND-3DR`, `filter-Color-Black`)
- Variations: pattern `variations-{SKU}-button`
- Ship-to favorites: pattern `ship-to-favorite-icon-{UUID}`

---

## 10. Theme Switch UI

**Theme toggle exists in storefront header (Coffee theme):**

| Element | Selector | matched | Notes |
|---|---|---|---|
| Dark mode toggle button | `button[data-test-id="dark-mode-toggle"]` | 1 | aria-label cycles: `"Theme: auto"` → `"Theme: dark"` → `"Theme: light"` |
| Toggle class | `.dark-mode-toggle__button` | 1 | Alternative selector |

**Important — scope of toggle:**
- This is **dark/light/auto mode toggle only** — it flips a CSS-variable color scheme on the active theme.
- It is **NOT** a full theme preset switcher (e.g. Coffee → Velvet → Ocean). Theme presets are configured per-store in Admin SPA (Store → Settings → Theme) at build/deploy time, not via user UI.
- Per memory `reference_theme_presets`, vc-frontend exposes 6 light + 3 dark presets; users only switch dark/light/auto within the active preset.
- **FOUC test:** click `[data-test-id="dark-mode-toggle"]`, observe CSS variable swap (`--header-top-bg-color` etc. on `<header>`). No DOM unmount/remount expected; only computed styles change. Layout shift should be near-zero unless a theme alters `font-size`, padding, or border-width tokens.

---

## Appendix — Header `data-test-id` Inventory (always present)

For navigation/header layout-shift baselines, these IDs are present on every authenticated page:

```
top-header, language-selector, language-selector-button, current-language-label,
currency-selector, currency-selector-button, current-currency-label,
ship-to-selector, select-address-label, ship-to-search-field, shipping-addresses-list,
ship-to-favorite-icon-{UUID}, ship-to-more-button,
dark-mode-toggle, support-phone-link,
dashboard-link, contacts-link, operator-name-label,
account-button, customer-name-label,
global-search-query-input, global-search-apply-button,
desktop-main-menu-cart-link
```

NOTE: `desktop-main-menu-cart-link` IS present (the data-test-id is on the parent `<a>` element); it just wasn't unique-matchable in early probes because the PDP "View cart" button ALSO links to `/cart`. **Always scope the cart selector to header**: `header [data-test-id="desktop-main-menu-cart-link"]` or `header a[href="/cart"]`.

---

## 11. BOPIS Modal (Pickup Locations Picker)

**Trigger flow:** `/cart` → click `[data-test-id="pickup-switcher"]` to switch from Shipping to Pickup → `[data-test-id="pickup-location-section"]` renders → click pencil/edit icon `[data-test-id="select-address-button"]` → modal opens.

**Modal title (visible):** `Pick points` (h2 inside `.vc-dialog-header__title`, ID `headlessui-dialog-title-v-N-N`).

**Modal architecture:** Headless UI dialog (`@headlessui/vue`) portalled to `#popover-host` (`body > div#popover-host`, `z-index: 9999`). Modal root is **the same element** for both `[role="dialog"]` and `[data-test-id="pickup-locations-modal"]`. Mobile gets fullscreen modifier `.vc-modal--mobile-fullscreen`. The dedicated component class is `.select-address-map-modal`.

### Trigger (on /cart)

| Element | Selector | matched | Stability |
|---|---|---|---|
| Pickup/Shipping switcher tabs | `[data-test-id="pickup-switcher"]`, `[data-test-id="shipping-switcher"]` | 1 each | Stable (data-test-id) |
| Pickup location section (renders only when Pickup tab active) | `[data-test-id="pickup-location-section"]` | 1 (after pickup tab active) | Stable |
| **Selected pickup location label** (display only — NOT clickable; it's a `<span>`) | `[data-test-id="pickup-location-section"] [data-test-id="selected-address-label"]` | 1 | Stable (also class `.vc-address-selection__address`) |
| **Pencil/edit trigger (opens modal)** | `[data-test-id="pickup-location-section"] [data-test-id="select-address-button"]` | 1 | Stable. Class `.vc-address-selection__button` with pencil SVG; aria-label not set. The shipping-address section also has a `[data-test-id="select-address-button"]` — **always scope it** by `[data-test-id="pickup-location-section"]` prefix. |
| Address-row wrapper | `[data-test-id="pickup-location-section"] .vc-address-selection` | 1 | Stable (page-scoped BEM) |

### Modal — root & chrome

| Element | Selector | matched | Stability |
|---|---|---|---|
| **Modal root** | `[data-test-id="pickup-locations-modal"]` | 1 (open) / 0 (closed) | Stable (Layer 1). Equivalent: `[role="dialog"][data-test-id="pickup-locations-modal"]`. Also matches `.vc-modal.select-address-map-modal`. |
| Modal backdrop | `[data-test-id="pickup-locations-modal"] .vc-modal__backdrop` | 1 | Stable (Layer 2). Click-outside-to-close behavior. |
| Modal panel | `[data-test-id="pickup-locations-modal"] .vc-modal__panel` | 1 | Stable |
| Dialog wrapper inside modal | `[data-test-id="pickup-locations-modal"] .vc-dialog` | 1 | Stable |
| Modal header | `[data-test-id="pickup-locations-modal"] .vc-dialog-header` | 1 | Stable |
| Modal title (`h2 "Pick points"`) | `[data-test-id="pickup-locations-modal"] .vc-dialog-header__title h2` | 1 | Stable. ID is `headlessui-dialog-title-v-{N}-{N}` (dynamic — do NOT use ID selector). |
| **Close (X) button** | `[data-test-id="pickup-locations-modal"] button.vc-dialog-header__close` | 1 (main) — note: TOTAL 2 across modal because the `pickup-location-card` panel also has one. Scope to **direct** child header: `[data-test-id="pickup-locations-modal"] > .vc-modal__wrapper > .vc-modal__panel > .vc-dialog > .vc-dialog-header button.vc-dialog-header__close`, or just use the first match. | Stable. `aria-label="Close"`. **No `data-test-id`** on close — file gap if needed. |
| Escape key | Press `Escape` | n/a | Headless UI dialog handles ESC to close — confirmed via standard Headless UI behavior. |

### Search & Filters (top of modal)

| Element | Selector | matched | Stability |
|---|---|---|---|
| Search keyword input | `[data-test-id="search-keyword-input"]` | 1 | Stable. `placeholder="Search "`, `aria-label="Search pickup locations"`, class `.vc-input__input`. |
| Search submit button | `[data-test-id="search-button"]` | 1 | Stable. Icon-only, `aria-label="Search "`. |
| Country filter (dropdown trigger) | `[data-test-id="filter-country"]` | 1 | Stable. Component class `.facet-filter-dropdown` (wraps a `.vc-popover.vc-dropdown-menu`). Trigger: `[data-test-id="filter-country"] .vc-popover__trigger button`. |
| Region/State filter | `[data-test-id="filter-region"]` | 1 | Stable |
| City filter | `[data-test-id="filter-city"]` | 1 | Stable |

### Location list

| Element | Selector | matched | Stability |
|---|---|---|---|
| List scroll container | `[data-test-id="pickup-locations-modal"] .select-address-map-list` | 1 | Stable. Has `.vc-scrollbar.vc-scrollbar--vertical`. **No pagination component** — list virtualizes / shows filtered subset (captured 50 rows visible out of `BOPIS.locationCount=102`; needs scroll or filtered query to access remainder). |
| **List of locations (rows wrapper)** | `[data-test-id="pickup-locations-list"]` | 1 | Stable (Layer 1) |
| **Single location row** | `[data-test-id="pickup-locations-list"] > .select-address-map-list__item` | 50 (visible) | Stable. The row is a `<div>` (not a button); the entire row contains a `.vc-radio-button` whose `<label>` is the click target. Row carries data attributes: `data-address-id`, `data-country`, `data-city`, `data-line1`, `data-pickup-point-name`, `data-coords` — useful for scoping assertions. |
| Row radio input | `[data-test-id="pickup-locations-list"] input[type="radio"][name="pickup-location"]` | 50 | Stable. `value` = location UUID. |
| Row clickable label (wraps name+address) | `[data-test-id="pickup-locations-list"] .vc-radio-button__container` | 50 | Stable. **This is the click target** to select a location. |
| **Location name** (per row) | `[data-test-id="pickup-locations-list"] [data-test-id="pickup-location-name"]` | 50 | Stable (Layer 1). Also class `.select-address-map-list__label`. |
| **Location address** (per row) | `[data-test-id="pickup-locations-list"] [data-test-id="pickup-location-address"]` | 50 | Stable (Layer 1). Also class `.select-address-map-list__address`. |
| Availability chip (per row) | `[data-test-id="pickup-availability-chip"]` | 51 (50 in list + 1 in card) | Stable. Tooltip via `.vc-popover.vc-tool*`. |
| **Selected-state indicator** (per row) | `[data-test-id="pickup-locations-list"] .vc-radio-button--checked` | 1 (the currently-selected row) | Stable. Selection state lives on the `.vc-radio-button` wrapper; the row container does NOT get a separate `--selected` modifier (verified — `.select-address-map-list__item--selected` returns 0). |
| Row by location UUID | `[data-test-id="pickup-locations-list"] [data-address-id="{UUID}"]` | varies | Stable. Use with `@td(BOPIS.location50Id)` etc. |
| Pagination controls | **NONE present** (list is scroll-only) | 0 | Documented gap. No `[data-test-id*="pagination"]`, no `aria-label="Next"` / `"Previous"`, no `.vc-pagination`, no `load-more` button. Visible 50 rows < total 102 — remainder must be reached via filter/search or by scrolling within `.select-address-map-list` scroll container. **Recommend** filing data-test-id gap if pagination/virtualization is added in future. |

### Map column (right side of modal on desktop)

| Element | Selector | matched | Stability |
|---|---|---|---|
| Map column wrapper | `[data-test-id="select-address-map-desktop"]` | 1 | Stable (Layer 1) |
| Map canvas | `[data-test-id="pickup-locations-map"]` | 1 | Stable |
| **Pickup location card** (overlay shown when a location is selected/highlighted) | `[data-test-id="pickup-location-card"]` | 1 | Stable. Class `.pickup-location-card.select-address-map-desktop__card`. Renders inside the map column as a `.vc-dialog`. |
| Card title (`"Pick point info"`) | `[data-test-id="pickup-location-card"] .pickup-location-card__header` | 1 | Stable (Layer 3). No `data-test-id` on the card title. |
| Card close (X) | `[data-test-id="pickup-location-card"] button.vc-dialog-header__close` | 1 | Stable (Layer 2). aria-label `"Close"`. **No data-test-id** — file gap if needed. |
| Card location name | `[data-test-id="pickup-location-card-name"]` | 1 | Stable |
| Card location info (address/details body) | `[data-test-id="pickup-location-card-info"]` | 1 | Stable |
| **Card "Pick up here" CTA (confirm selection)** | `[data-test-id="pickup-location-card-select"]` | 1 | Stable. Button text `"Pick up here"`. **This is the primary confirm-and-close action.** |
| Card "Cancel" CTA | `[data-test-id="pickup-location-card-cancel"]` | 1 | Stable. Closes the card overlay (does NOT close the parent modal). |

### Verification protocol used

Captured live 2026-05-14 by signing in as `USER_EMAIL`, navigating `/cart` with 2 line items in cart, clicking `[data-test-id="pickup-switcher"]`, then clicking the pencil `[data-test-id="pickup-location-section"] [data-test-id="select-address-button"]`. Currently selected pickup point (pre-test) was `405 Lexington Ave, New York`. After modal opened, ran `document.querySelectorAll(<sel>).length` for each selector above and recorded the counts. Screenshot: `tests/Sprint-current/SELECTORS-2026-05-14/bopis-modal-open.png`.

**Note:** The BOPIS modal triggers on /cart **without** needing a specific BOPIS-eligible product in the cart — the cart had `[data-test-id="pickup-switcher"]` because at least one of the 2 line items supports pickup (canonical BOPIS SKU `@td(BOPIS.testSku) = ALCOE2300` is no longer searchable on storefront as of capture date; if Pickup tab is missing on /cart in a future session, fall back to verifying via `xapi pickupLocations` query first, then seed/find another pickup-eligible product).

---

## 12. Configurable PDP (Product with Configuration Sections)

**Test fixture:** SKU `@td(CONFIGURABLE.testSku) = YOC-85609878`, slug `@td(CONFIGURABLE.testSlug) = /products-with-options/wedding-cakes/sections-with-conditions-wedding-cake`. Product title: `Sections with conditions Wedding cake`. Captured 2026-05-14.

**Page layout:** Two-column desktop — content column (`[data-test-id="content"]`) holds the configuration sections; sidebar (`[data-test-id="sidebar"]`) holds the dynamic price + Add-to-cart widget. On mobile, sidebar reflows below content.

**Conditional sections:** The fixture defines 7 sections (Base*, Filling, Creme, Layers, Message, Custom-text-required, Image) — only sections whose `dependsOnSectionId` parent is satisfied render in DOM. On initial load with default selections, **2 sections** rendered: `Base *` (required, open) and `Creme` (collapsed). Sections gated by `Message` (Custom text + File) were absent from DOM — this is the **conditional sections** pattern. Test cases should NOT assume a fixed section count without first selecting required options.

### Page-level scoping

| Element | Selector | matched | Stability |
|---|---|---|---|
| Content column (configuration lives here) | `[data-test-id="content"]` | 1 | Stable (Layer 1) |
| Sidebar column (price/add-to-cart lives here) | `[data-test-id="sidebar"]` | 1 | Stable. Class `.vc-layout__sidebar`, has sticky positioning. |
| Product title (H1) | `h1.vc-typography--variant--h1` | 1 | Stable (same as standard PDP) |

### Configuration block

| Element | Selector | matched | Stability |
|---|---|---|---|
| **Configurable section root (wrapper for all sections)** | `.product-configuration` | 1 | Stable (Layer 2/3 hybrid — `.vc-widget` + `.product-configuration`). Tag is `<section>`. |
| **Single configurable section** | `.product-configuration [data-test-id="section"]` | 2 (varies — see Conditional sections note above) | Stable (Layer 1). Tag is `<section class="vc-widget vc-widget--collapsible">`. |
| **Section accordion header (clickable to expand/collapse)** | `.product-configuration [data-test-id="section"] > button.vc-widget__header-container` | 2 | Stable. **Note: `aria-expanded` is NOT set** on this button — collapse state is signaled via the parent's `.vc-widget--collapsed` class instead. File a11y gap if needed. |
| **Section accordion body (panel)** | `.product-configuration [data-test-id="section"] .vc-widget__slot-container` | 2 | Stable (Layer 2). Has no `role="region"`. |
| Section collapsed-state modifier | `.product-configuration [data-test-id="section"].vc-widget--collapsed` | 1 (Creme) | Stable. Open sections lack this class. |
| **Section title** | `[data-test-id="section-title"]` | 2 | Stable (Layer 1). Tag `<div>`, NOT a heading (file a11y gap if needed). Text includes the asterisk for required: `Base *`. |
| Required-asterisk indicator | `span.product-configuration__required` | 1 | Stable (Layer 3). Sits inside the title text. |
| Section subtitle (currently-selected summary text) | `[data-test-id="section-subtitle"]` | 2 | Stable (Layer 1). Also has class `.product-configuration__value`; if a value is chosen, also `.product-configuration__value--selected`; for required sections also `.product-configuration__value--required`. Example value: `"Top: White / Bottom: White"`. |
| Section description wrapper | `[data-test-id="section-description"]` | 2 | Stable (Layer 1). Contains the subtitle (and tooltip/help if present). |
| **Option group container (within a section)** | `.product-configuration [data-test-id="section"] [role="radiogroup"].product-configuration__items` | 2 (one per section with chooseable options) | Stable. |
| **Preset option (chooseable card)** | `[data-test-id="product-option"]` | 6 | Stable (Layer 1). Rendered as `.vc-product-card.option-product` with a `.vc-radio-button` inside. Each option includes its own per-option qty stepper (verified — 6 quantity inputs on this fixture, one per preset option that supports quantity selection). |
| **"None" option** (opt-out for non-required sections) | `[data-test-id="none-option"]` | 1 | Stable. Class `.vc-product-card.option-product-none`. Present only on optional (non-required) sections — confirmed absent from `Base *` (required). |
| **Selected-option indicator** | `[data-test-id="section"] .vc-radio-button--checked` | 1 per section with a selection | Stable (Layer 2). The selected option's `.vc-radio-button` wrapper gains `--checked`. |
| Option radio input | `[data-test-id="product-option"] input.vc-radio-button__input` | 6 | Stable. `name` is the section UUID, `value` is the option UUID. |
| Per-option qty input | `[data-test-id="product-option"] input.vc-input__input[type="number"]` (aria-label `"Product quantity"`) | up to 6 | Stable. |

### Text-input section (NOT rendered in this fixture's default state)

| Element | Selector (anticipated, NOT live-verified) | Notes |
|---|---|---|
| Text-input section field | `.product-configuration [data-test-id="section"] input[type="text"].vc-input__input` OR `textarea.vc-input__input` (scoped to the Text section) | Per fixture `CFG_WEDDING_CAKE_CONDITIONS`, section `Custom text required` is `type=Text`, `maxLength=50`, gated by `Message` (Text type). **Did NOT render in initial DOM** — to live-verify, first select the `Message` option whose value enables Custom-text-required, then re-query. Per memory `project_configurable_text_section_validation`, the `maxLength` applies to Custom-input only; presets in a text section don't enforce it. |
| File-input section field | `[data-test-id="section"] input[type="file"]` | Section `Image` (`type=File`) also gated by `Message`; not in DOM. |
| Validation error message | `[data-test-id="section"] .vc-input-details:not(.vc-input-details--hide-empty)` | Same `.vc-input-details` convention as standard inputs (Section 6). 15 `.vc-input-details` nodes present on initial DOM but all empty / hidden. No `.vc-input--error` present in default-valid state. |

### Sidebar — Price & Add-to-cart

| Element | Selector | matched | Stability |
|---|---|---|---|
| Price/add-to-cart widget root | `[data-test-id="sidebar"] .product-price-block` | 1 | Stable (Layer 2/3). Tag `<section class="vc-widget product-price-block">`. |
| Widget title (`"Price and delivery"`) | `[data-test-id="sidebar"] .product-price-block .vc-widget__title` | 1 | Stable. ID `title1` (verified, but treat ID as non-stable). |
| **List price (was-price, strikethrough)** | `[data-test-id="sidebar"] .product-price-block .price__list` | 1 | Stable. Example `$88.00`. |
| **Actual price (current price — updates as options change)** | `[data-test-id="sidebar"] .product-price-block .price__actual` | 1 | Stable. Example `$85.00`. **Use this selector for dynamic-price assertions during configuration changes.** |
| Price-actions container | `[data-test-id="sidebar"] .product-price-block .product-price__actions` | 1 | Stable (Layer 3) |
| **Add-to-cart CTA** | `[data-test-id="sidebar"] .product-price-block button[aria-label="Add to cart"]` | 1 | Stable. Button text `"Add to cart"`, `title="Add to cart"`. **No `data-test-id`** on this button — file gap. For configurable products this IS a dedicated Add-to-Cart button (NOT the qty-stepper-as-add-to-cart pattern that B2B-store uses for standard PDPs per `feedback_qty_stepper_as_add_to_cart`). The button is enabled by default with no quantity stepper visible at the buy-block level. |
| In-stock chip | `[data-test-id="sidebar"] .product-price-block .vc-chip.vc-chip--color--success` | 1 | Stable |

### What does NOT exist on this configurable PDP

| Element | Notes |
|---|---|
| Quantity stepper at buy-block level | **Absent.** `.vc-quantity-stepper` count = 0 inside `.product-price-block`. Each preset option may have its own qty input (`input[type=number][aria-label="Product quantity"]`), but the overall product qty is **not selectable** — single-unit add. |
| Configuration summary / "Your selections" panel | **Absent.** No `.product-configuration__summary`, no `[data-test-id*="summary"]`. Each section's subtitle (`[data-test-id="section-subtitle"]`) shows that section's current selection. No aggregate summary block. |
| "Add another section" / "Add engraving" CTA | **Absent on this fixture.** No `button[class*="add-section"]` matched. Sections are dynamically rendered by `dependsOnSectionId` conditions, not by user-initiated "add another". |
| Per-section validation message (in default state) | None visible. `.vc-input--error` count = 0; `.vc-input-details:not(.vc-input-details--hide-empty)` count = 0 in valid default state. |

### B2B variations alongside configuration?

Not present on this fixture. No `[data-test-id^="variations-"]` matches. The wedding cake renders as a single configurable item with no variant axis. **Config + variations is a known pattern** elsewhere (e.g., apparel SKUs with size variants + configurable monogram), but is not exercised by this fixture.

### Verification protocol used

Captured live 2026-05-14 by navigating `/search?q=YOC-85609878` (logged in as `USER_EMAIL`), clicking the single matching card to land on `/products-with-options/wedding-cakes/sections-with-conditions-wedding-cake`, then running `document.querySelectorAll(<sel>).length` for each candidate. The captured slug was written back to `test-data/aliases.json` `CONFIGURABLE.testSlug`. Screenshot: `tests/Sprint-current/SELECTORS-2026-05-14/configurable-pdp-wedding-cake.png` (full page).

---

## Verification Summary

All selectors above were verified with `document.querySelectorAll(<sel>).length` on:
- Home: `https://vcst-qa-storefront.govirto.com/` (logged in)
- Catalog: `https://vcst-qa-storefront.govirto.com/catalog`
- PDP: `/kitchen-supplies/everything-for-kitchen/BENDING-STRAWS-PAPER-STRIPED-ASSORTED-22CM-6MM-PACK-500PCS` (SKU 8033482, in-stock)
- Cart: `https://vcst-qa-storefront.govirto.com/cart` (with 2 line items, BOPIS modal opened 2026-05-14)
- Search: `https://vcst-qa-storefront.govirto.com/search?q=Christmas%20paper%20straws`
- Configurable PDP: `/products-with-options/wedding-cakes/sections-with-conditions-wedding-cake` (SKU `YOC-85609878`, captured 2026-05-14)
- BOPIS modal: triggered from `/cart` → pickup-switcher → pencil; modal element `[data-test-id="pickup-locations-modal"]` (captured 2026-05-14)

Skeleton selectors verified by stylesheet introspection (rules present in compiled CSS). Sign-up form selectors NOT live-verified (auth redirect blocker — see Section 6).
