---
domain_slug: inventory
applicability: universal
rationale: |
  What "inventory & product availability" IS — the mechanism by which a product/variation becomes
  shown-as-available and purchasable, across Admin (Inventory + Catalog modules), storefront
  (vc-frontend), and the xAPI/REST contract layer — plus the xCart / xCatalog / xOrder error-code
  vocabulary (stock, quantity AND configurable-product validation) that the contract layer returns.
  Built because no BA deliverable in reports/ba/ was ever dedicated to this surface — six test models
  touch it at the fringe but none inventories the mechanism itself.
  Slug is `inventory`, not `cat`, by operator decision 2026-09-23: `cat` (BL-CAT "Catalog &
  Inventory") is already held by configurable-products.md and DOMAIN-004 forbids two maps on one slug.
  `inventory` is not a `bl:extract` domain, so it knowingly trips DOMAIN-005 exactly as
  page-builder.md already does; the nearest oracle token for BL lookup is `cat`.
generated: 2026-09-23
rev: 1
stale_after_days: 60
expires_after_days: 120
sources:
  - reports/ba/ — NONE dedicated to inventory (searched; the absence is itself a finding, §6)
  - reports/ba/test-models/VCST-3912-2026-09-10.md, VCST-4933-2026-09-17.md, VCST-5317-2026-09-09.md,
    VCST-5346-2026-08-28.md, VCST-5653-2026-09-10.md, VCST-5735-2026-09-03.md (fringe touches only;
    VCST-5735 is the most substantive — Compare page's `getAvailabilitySignature` /
    `MAX_DISPLAY_IN_STOCK_QUANTITY`)
  - .claude/knowledge/domain/products.md, catalog.md, store-settings.md (read in full)
  - .claude/knowledge/oracles/business-logic.md BL-CAT-001/007, BL-CART-001/002, BL-BOPIS-003 (orientation only)
  - .claude/knowledge/oracles/e-commerce-edge-cases-library.md §2 (Inventory & Stock Management)
  - .claude/knowledge/automation/storefront-selectors.md, .claude/knowledge/execution/module-suite-map.md
  - config/test-suites.json + regression/suites/** (056-inventory.csv read in full — 48 cases;
    keyword grep across 20 candidate suites; 010-b2b-bulk-ship-dashboard.csv and 028-cart-core.csv
    opened in full)
  - live enumeration on vcst-qa, 2026-09-23, playwright-edge lane — Admin SPA (Inventory root list,
    one FFC detail + its Products widget, Catalog product blade for two SKUs, full "More" menu:
    29 Browse + 9 Configuration entries) + storefront (PDP for a confirmed OOS SKU; category listing
    with "Show in stock") + read-only xAPI GraphQL queries across ~4,551 live products to find
    fixtures spanning isBuyable/isAvailable/isInStock/isTrackInventory combinations
  - GET /api/platform/modules, /api/platform/settings, POST /api/inventory/fulfillmentcenters/search
    (context-free admin token), 2026-09-23 — 37 FFCs
  - GitHub (read-only), 2026-09-23 — vc-module-x-cart `CartErrorDescriber.cs` (full file);
    vc-module-x-order `OrderErrorDescriber.cs` (full file); vc-module-x-catalog (searched for an
    error-describer file and for `available_in` — zero hits, both); vc-frontend `locales/en.json`
    (full file, 74,473 bytes, grepped for every backend code). **Read at `dev` HEAD, NOT pinned to the
    deployed tags** — every source citation is "mechanism as of `dev`", not byte-exact to the build
  - Deployed versions (2026-09-23): Inventory 3.1007.0, Catalog 3.1044.0, BackInStock 3.1002.0,
    Cart 3.1009.0, Orders 3.1015.0, Store 3.1007.0, Search 3.1008.0, ElasticSearch8 3.1007.0,
    Xapi 3.1022.0, XCatalog 3.1020.0, XCart 3.1034.0, XOrder 3.1012.0, XPickup 3.1006.0
  - Settings (2026-09-23): Order.AdjustInventory=true, Inventory.Search.EventBasedIndexation.Enable=true
    (default false), Inventory.LogInventoryChanges=false, BackInStock.Enable=true, XPickup.*AvailabilityNote=null
  - VirtoOZ (fetched by the orchestrator 2026-09-23, quoted verbatim in the dispatch brief):
    PlatformUserGuide inventory/overview, getting-started, inventory/managing-fulfillment-centers,
    catalog/setting-product-availability, back-in-stock/overview; StorefrontUserGuide
    shopping/back-in-stock-notifications, navigation/homepage-layout, navigation/brands-page;
    PlatformDeveloperGuide xAPI Catalog/objects/AvailabilityData, Catalog/examples/filtering
  - .claude/knowledge/api/graphql-schema.md (live introspection 2026-09-17)
excludes: >-
  BOPIS checkout mechanics (suites 036-038, 050k own them) and order fulfillment/shipment lifecycle —
  each gets a one-line existence note in §2 and is otherwise out of scope. XPickup and back-in-stock
  error vocabularies are covered only shallowly (optional extras in the error-code catalog).
---

# Inventory & product availability — domain map

> Refresh with `/qa-domain-map inventory`. This file answers **what the feature is and where its
> surfaces are**. It does **not** carry behavioural rules — those are `BL-*` in
> `oracles/business-logic.md` (nearest token `cat`) — and it can **never ground an assertion as `{DOC}`**.

**Every claim carries a verdict.** `CONFIRMED` = observed live or read at source this pass (the cell
says which) · `DRIFT` = prior art says otherwise and prior art is wrong · `MISSING` = documented, does
not exist · `UNVERIFIED` = not established, and **not** to be treated as true.

## §1 — Purpose and value chain

**Purpose: partially `UNDECLARED`.** The admin-side purpose is stated — PlatformUserGuide
inventory/overview: *"The **Inventory** module enables tracking the stock level and managing
fulfillment centers."* — `CONFIRMED` against live Admin structure. The **buyer-side** "why" is
`UNDECLARED`: neither PlatformUserGuide nor StorefrontUserGuide (pages listed in `sources`) says why
availability display exists beyond enumerating the UI it produces. The chain below is
**reconstructed** from source + live.

| # | Link, in the customer's words | Mechanism |
|---|---|---|
| 1 | Stock comes into existence | Catalog product blade → Fulfillment Centers widget (not opened live, G6) **or** `/api/inventory/*` batch — persisted as an `InventoryInfo` row keyed by (ProductId, FulfillmentCenterId). The FFC detail blade itself carries no stock-qty edit (§2a) |
| 2 | It is gated by three ADMIN TOGGLES | Catalog product blade: **Visible**, **Can be purchased**, **Track inventory** — `CONFIRMED` live (ALCOE2047, all three ON) |
| 3 | …and by a FOURTH, undocumented gate | **Price resolvability.** All three toggles ON and still `isBuyable:false`/`isAvailable:false` when the Price widget reads "N/A" — `CONFIRMED` live (ALCOE2047; D6). Link to `PRODUCT_PRICE_INVALID` on add-to-cart is inferred, not live-fired |
| 4 | It is computed into `availabilityData` | xAPI `AvailabilityData { availableQuantity, isBuyable, isAvailable, isInStock, isActive, isTrackInventory, inventories[] }` — `CONFIRMED` live field-for-field |
| 5 | It is (also) indexed | Search index carries a computed `availability` value (docs: `InStock`/`OutOfStock`/`SoldOut`). Listing/filter read the index (async, reindex lag), PDP/cart resolve live. A distinct `availability` line in the product blade's Index widget JSON was **not located** in the portion viewed — `UNVERIFIED` |
| 6 | The buyer sees it | PDP price/delivery sidebar (qty stepper + "Out of stock" chip), product-card qty stepper, "Show in stock" / "Available at branches" filters, BOPIS pickup-availability chip (excluded) — `CONFIRMED` live |
| 7 | It gates the cart | `addItem`/`changeCartItemQuantity` → xCart validators → codes in `CartErrorDescriber.cs` (§2c catalog) — **advisory**, attached to the response without blocking persistence (consistent with BL-CART-001) — `CONFIRMED` source |
| 8 | It is consumed at order placement | `Order.AdjustInventory=true` — decrements stock on order creation (`CONFIRMED` setting). **Which code fires, if any, when a line went out of stock between cart validation and order creation is UNESTABLISHED** — xOrder's `OrderErrorDescriber.cs` carries **zero** stock codes (D10, G1) |
| 9 | It is (maybe) reversed | Stock restore on cancel/return — not found in any source read, not live-tested (mutation) — `UNVERIFIED` (G2) |
| 10 | A depleted-stock buyer is offered a substitute path | Back-in-stock subscribe (`BackInStock.Enable=true`). Docs describe a "Notify me when in stock" button replacing Add-to-cart — **not observed** on the one OOS PDP tested (D11) |

### Actors

| Actor | Can do | Verdict |
|---|---|---|
| **Platform admin** | Inventory-module CRUD (FFCs, dynamic properties), Catalog toggles (Visible / Can be purchased / Track inventory, min/max/pack), Settings | `CONFIRMED` live |
| **Storefront customer (any)** | Read-only availability (badges, filters, PDP state), add-to-cart subject to xCart validation, back-in-stock subscribe | availability `CONFIRMED` live; back-in-stock `UNVERIFIED` live (Draft suite cases only) |
| **Order-adjustment process** | Decrements stock at order placement — no UI, setting-gated | setting `CONFIRMED`, mechanism `UNVERIFIED` (G1) |

## §2 — Surface inventory

### 2a. Admin back office (Admin SPA)

**Entry point:** main menu → **More** → **Inventory** (not a top-level item; the "More → Browse" flyout
has 29 entries plus a separate 9-entry "Configuration" group — both enumerated live). `CONFIRMED` live.

| Surface | What is there | Verdict |
|---|---|---|
| **Root list** `#!/workspace/Inventory` | "Fulfillment centers", 37 live (matches REST totalCount). Toolbar **Refresh, Add** only; keyword search + pagination | `CONFIRMED` live |
| **FFC detail blade** | Toolbar Save/Reset/Delete. Fields **Name*** , **Location** (lat,long text), **Outer ID**. Widgets: **Address** (or "No address"), **Products** (count badge), **Dynamic properties** (count badge) | `CONFIRMED` live (`AGENT-TEST-Central Hub`) |
| **Products widget (per FFC)** | Toolbar Refresh/Add; **"In stock only" checked by default**. Columns Image, Product, SKU, In stock quantity, Reserved quantity. On `AGENT-TEST-Central Hub` all 4 rows show quantities (30/20/15/8, reserved 0) but Product AND SKU read **"There is no product item with this ID"** (D4) | `CONFIRMED` live; cause `UNVERIFIED` (G8) |
| **Catalog product blade** | **Visible**, **Can be purchased**, **Track inventory** toggles; Minimum / Maximum quantity, Pack size; **Price** widget (read "N/A" on ALCOE2047); **Fulfillment Centers** widget (not opened, G6); **Indexed <date>** widget → raw index JSON panel | `CONFIRMED` live on ALCOE2047 |
| **Settings > Inventory** | Tooltips, Export/Import page size, Log inventory changes, event-based indexation (per 056 case titles + settings API) | `UNVERIFIED` live (blade not opened, G7); `CONFIRMED` via settings API |
| **Settings > Orders** `Order.AdjustInventory` | true | `CONFIRMED` via settings API |
| BOPIS pickup locations → FFC | one-line existence note; owned by `store-settings.md` + suites 036-038 | excluded |

**Not manageable from the Inventory module:**

| Not here | Lives instead at |
|---|---|
| Visible / Can be purchased / Track inventory | Catalog → product blade |
| Price (the 4th buyability gate) | Pricing module |
| Back-in-stock subscriptions | **No admin surface found** in the full "More" menu — contradicts docs (D3) |
| Order-time stock decrement | Orders module — no UI; xOrder has no stock-error vocabulary (D10) |
| Bulk index rebuild | only a per-product "Build index" button in that product's Index widget |

### 2b. Storefront (vc-frontend)

| Surface | What is there | Verdict |
|---|---|---|
| **Product card** (grid) | price, qty stepper (default 0), a leaf-icon numeric pill (very likely loyalty points — tooltip not hovered). **No numeric stock quantity on any card** in a 21-result `/printers` listing | `CONFIRMED` live (D2) |
| **PDP** `/{slug}` | "PRICE AND DELIVERY" sidebar: price, stepper (Decrease / spinbutton / Increase). On OOS SKU `568171770` (`isBuyable:true`, `isAvailable:false`, `isInStock:false`, `availableQuantity:0`) all three stepper controls are disabled and an **"Out of stock"** chip renders. No "Notify me when in stock" button | `CONFIRMED` live (D5, D11) |
| **"Show in stock" filter** | checkbox, **checked by default**, active chip + "Reset filters" | `CONFIRMED` live. Persistence across sessions not checked |
| **"Available at branches" filter** | present, not exercised | `CONFIRMED` exists; behaviour `UNVERIFIED` |
| **Cart line stock validation** | driven by the §2c xCart codes | `CONFIRMED` source; not live-fired (mutation) |
| **Back-in-stock** `/account/back-in-stock` | exists per suite 010 Draft cases | `UNVERIFIED` live |
| **Compare page** `/compare` | availability is a permanent row, `getAvailabilitySignature` bucketed at `MAX_DISPLAY_IN_STOCK_QUANTITY` (VCST-5735 test model) | `UNVERIFIED` live (prior art, source-grounded) |
| BOPIS pickup-availability chip | `[data-test-id="pickup-availability-chip"]`; tiers per BL-BOPIS-003; suites 036-038 | excluded — existence note only |

**Not manageable / not present on the storefront:** numeric stock quantity on cards (D2) · any control
for the admin toggles or the price gate (read-only by design) · a "Sold out" string distinct from
"Out of stock" (not reproduced, G5).

### 2c. API / contract surface

| Surface | What is there | Verdict |
|---|---|---|
| xAPI `AvailabilityData` | fields as §1 link 4; meanings diverge from prior art (D5, D6) | `CONFIRMED` live |
| `filter: "available_in:{warehouse}"` | documented (PlatformDeveloperGuide filtering); zero hits in `regression/suites/`; not implemented in `vc-module-x-catalog` (parsing likely in the search/index layer — not traced) | `UNVERIFIED` end to end (G9) |
| Platform REST `/api/inventory/fulfillmentcenters/search`, `/{id}`, batch | 37 FFCs returned, matching Admin | `CONFIRMED` live |
| Back-in-stock xAPI (`backInStockSubscriptions`, activate/deactivate mutations) | documented | `UNVERIFIED` (not exercised) |

**Not manageable from the storefront xAPI:** stock quantities, FFCs, and the three toggles — admin
REST only. xAPI is read-only for availability; its only availability *writes* are cart mutations,
which validate rather than change stock.

#### API error-code catalog — xCatalog / xCart / xOrder

**Localization model — `CONFIRMED` source.** No method in `CartErrorDescriber.cs` or
`OrderErrorDescriber.cs` takes a culture argument. The backend emits a fixed English message + a
stable `code` + (sometimes) `FormattedMessagePlaceholderValues` (the `errorParameters`). The storefront
re-translates **by code** from `locales/{lang}.json` → `validation_error.*`. **The code is the wire
contract; translation is entirely client-side.**

**xCatalog** (XCatalog 3.1020.0) — **no error-describer file exists** and no `available_in`
implementation in the repo. Availability is exposed as **data** (`AvailabilityData`), never as a coded
error. Not-found / inactive on `product(id:)` not tested live — `UNVERIFIED`.

**xCart** (XCart 3.1034.0, `src/VirtoCommerce.XCart.Core/Validators/CartErrorDescriber.cs`) — every
code below `CONFIRMED` at source (`dev` HEAD); none live-fired this pass (would need a cart mutation).
"Storefront text" = the `validation_error.<CODE>` value in `vc-frontend/locales/en.json`.

*Stock / availability / quantity:*

| Code | Backend message (verbatim) | Raised by | `errorParameters` | Storefront text (en) | Note |
|---|---|---|---|---|---|
| `CART_INVALID_PRODUCT` | `Product with SKU {sku} was not added to cart. This SKU doesn't exist.` | `ProductInvalidError` | — | `Invalid product` | shortened client-side |
| `CART_PRODUCT_UNAVAILABLE` | `The product is no longer available for purchase` / `Product with ID {id} was not added to cart. The product is not longer available for purchase.` | `ProductUnavailableError` (2 overloads) | — | `The product is no longer available for purchase` | matches |
| `CART_PRODUCT_INACTIVE` | `Product with ID {id} was not added to cart. The product is inactive.` | `ProductInactiveError` | — | `The product is inactive` | shortened |
| `PRODUCT_PRICE_INVALID` | `Product with ID {id} was not added to cart. Price is invalid.` | `ProductNoPriceError` | — | `Price is invalid` | likely what a Price "N/A" product fires (D6) — inferred |
| `PRODUCT_FFC_QTY` | `Product with Id {id} was not added to cart. Available quantity is {availableQty}.` / `Changed quantity is unavailable. Available quantity is {availableQty}.` | `ProductAvailableQuantityError` (2 overloads) | `qty`, `availableQty` | `The product is out of stock` | **drops the available number** (D8) |
| `PRODUCT_QTY_CHANGED` | `The product available qty is changed` | `ProductQtyChangedError` | `availQty` | `You can order maximum {availQty} item(s)` | **different meaning** (D7) |
| `PRODUCT_QTY_INSUFFICIENT` | `The product available quantity {availQty} is insufficient for requested {newQty}` | `ProductQtyInsufficientError` | `new_qty`, `availQty` | `The product available quantity {availQty} is insufficient for requested {new_qty}` | matches |
| `PRODUCT_MIN_MAX_QTY` | `You can order from {minQty} to {maxQty} items` | `ProductMinMaxQuantityError` | `qty`, `minQty`, `maxQty` | `You can order from {minQty} to {maxQty} item(s)` | matches |
| `PRODUCT_MIN_QTY` | `Product quantity {qty} is less than minimum {minQty}` | `ProductMinQuantityError` (2 overloads) | `qty`, `minQty` | `You can order minimum {minQty} item(s)` | reworded |
| `PRODUCT_MAX_QTY` | `Product quantity {qty} is greater than maximum {maxQty}` | `ProductMaxQuantityError` (2 overloads) | `qty`, `maxQty` | `You can order maximum {maxQty} item(s)` | reworded |
| `PRODUCT_MIN_QTY_NOT_AVAILABLE` | `Min order {minQty} items is not available in stock` | `ProductMinQuantityNotAvailableError` | `minQty` | `Min order {minQty} item(s) is not available in stock` | matches |
| `PRODUCT_EXACT_QTY` | `You can order {minQty} items` | `ProductExactQuantityError` | `qty`, `minQty` | `You can order {minQty} item(s)` | matches |
| `PRODUCT_PACK_SIZE_LIMIT` | ` Order in packs of {packSize}` (leading space in source) | `ProductPackSizeError` | `qty`, `packSize` | none under `validation_error.*`; a top-level `pack_size: "Order in packs of {0}"` exists | wiring `UNVERIFIED` |
| `LINE_ITEM_LIMIT` | `You can order maximum {limit} items.` | `ProductQuantityLimitError` | `limit` | **none** | D9 |
| `PRODUCT_DUPLICATE_SKU` | `Duplicate product {sku}` | `ProductDuplicateError` | `sku`, `productIds` | **none** | D9 |

*Other xCart codes (not stock-related, listed for completeness):*

| Code | Backend message / area | Storefront text (en) |
|---|---|---|
| `ALL_LINE_ITEMS_UNSELECTED` | `All line items unselected. Please select at least one line item.` | **none** |
| `PRODUCT_PRICE_CHANGED` | `The product price is changed the new price is {new_price}` (4 price params) | **none** |
| `SHIPMENT_METHOD_UNAVAILABLE`, `SHIPMENT_METHOD_PRICE_CHANGED` | shipping method | **none** |
| `PAYMENT_METHOD_UNAVAILABLE` | payment method | **none** under `validation_error.*` (a top-level `payment_unavailable` key exists — wiring `UNVERIFIED`) |
| `LINE_ITEM_NOT_FOUND`, `LINE_ITEM_IS_READ_ONLY`, `UNABLE_SET_LESS_PRICE` | line operations | present, matching |

*Configurable products* — all 13 in the same `CartErrorDescriber.cs`; xCatalog's
`productConfiguration` and xOrder carry no configuration codes of their own. **None of the 13 has any
entry in `locales/en.json`** (D9).

| Code | Backend message (verbatim) | Case |
|---|---|---|
| `CONFIGURATION_SECTION_REQUIRED` | `Required sections are missing` (param `sectionIds`) | required section not filled |
| `CONFIGURATION_SECTION_PRODUCT_REQUIRED` | `Configuration section requires to select a product` | Product section, nothing chosen |
| `CONFIGURATION_SECTION_CUSTOM_TEXT_REQUIRED` | `Configuration section requires to fill the CustomText field` | Text section empty when required |
| `CONFIGURATION_SECTION_CUSTOM_TEXT_MAX_LENGTH_EXCEEDED` | `Configuration section CustomText exceeds the maximum allowed length of {maxLength} characters` | Text section too long |
| `CONFIGURATION_SECTION_FILES_REQUIRED` | `Configuration section requires to add at list one file` (sic, "list") | File section, no upload |
| `CONFIGURATION_SECTION_FILE_LIMIT` | `You can add maximum {limit} files to the section.` | File section, too many files |
| `CONFIGURATION_SECTION_NOT_FOUND` | `Configuration section with ID {id} not found` | unknown section id |
| `CONFIGURATION_SECTION_UNKNOWN_TYPE` | `Unknown type {type} of section with ID {id}` | unknown section type |
| `CONFIGURATION_SECTION_TYPE_MISMATCH` | `Unknown type {type} of section with ID {id}` (**same text as the code above**) | section type mismatch |
| `CONFIGURATION_ITEM_NOT_FOUND` | `Configuration item with productId {productId}, sectionId {sectionId}, type {type} not found` | unknown option |
| `CONFIGURATION_SECTION_PRODUCT_UNAVAILABLE` | `Product with ID {id} does not belong to the section {sectionId}` | option not in section (NOT out-of-stock) |
| `CONFIGURATION_NOT_FOUND` | `Configuration for product with ID {productId} not found` | configuration gone / invalid |
| `CONFIGURED_LINE_ITEM_NOT_FOUND` | `Line item with ID {lineItemId} not found or is not configured` | configured line gone |

- **File type / size** has no code here — it likely goes through the generic `file_error.*` upload
  namespace instead — `UNVERIFIED`.
- **An out-of-stock or unbuyable configuration option** has no configuration-specific code: a Product
  option is its own catalog product and cart line (`products.md`), so it most likely fires the ordinary
  `PRODUCT_FFC_QTY` / `CART_PRODUCT_UNAVAILABLE` — `UNVERIFIED` live.
- **"Configuration changed" is two mechanisms:** the client-side `changed_notification` /
  `changed_confirmation` strings (a diff heuristic, no backend code) vs the server's
  `CONFIGURATION_NOT_FOUND` / `CONFIGURED_LINE_ITEM_NOT_FOUND` rejections. Keep them apart in test design.

**xOrder** (XOrder 3.1012.0, `src/VirtoCommerce.XOrder.Core/Validators/OrderErrorDescriber.cs`) — 8
methods, **none stock-related**: `InvalidStatus` (×2), `OrderNotFound`, `PaymentNotFound`,
`PaymentMethodNotFound`, `StoreNotFound`, `PaymentMethodUnavailable`, `PaymentMethodInactive`. A
repo-wide search for `insufficient` / `AvailableQuantity` / `OutOfStock` / `PRODUCT_FFC_QTY` returned
zero hits. `CONFIRMED` source (the absence); why is `UNVERIFIED` (D10, G1).

**Coverage of the catalog:** of ~36 xCart codes, 15 have a `validation_error.*` entry in `en.json`;
20 have none, and `PRODUCT_PACK_SIZE_LIMIT` is ambiguous. Non-English locales not checked (G4).

## §3 — Where the layers DISAGREE

| # | Disagreement | Verdict |
|---|---|---|
| D1 | PlatformUserGuide setting-product-availability: **Visible Off → "Sold out"**, **Can be purchased Off → "Out of stock"**. Live, stock-driven OOS (Track inventory On, qty 0) also renders **"Out of stock"**. Whether Visible Off renders a distinct "Sold out" was not tested (no fixture found; read-only) | "Out of stock" for stock-driven OOS `CONFIRMED` live; "Sold out" half `UNVERIFIED` (G5) |
| D2 | StorefrontUserGuide homepage-layout: each product card displays *"Its quantity in stock."* Live `/printers` grid: no card shows a stock number | `CONFIRMED` live — doc not reproduced |
| D3 | PlatformUserGuide back-in-stock/overview: *"Back office subscription management"*. Live full Admin "More" menu has no back-in-stock item ("Subscriptions" there is the recurring-order module) | `CONFIRMED` live contradiction |
| D4 | Admin FFC Products widget shows correct quantities but **"There is no product item with this ID"** for every row of `AGENT-TEST-Central Hub` — `InventoryInfo` rows whose ProductId no longer resolves in Catalog. Consistent with duplicate/orphaned products left by catalog re-seeding | `CONFIRMED` live; cause `UNVERIFIED` (G8) |
| D5 | `products.md` Test signals: *"`isBuyable: false` → "Add to cart" button disabled"*. Live SKU `568171770` is `isBuyable:true` yet the PDP stepper is disabled — gated by `isInStock`/`isAvailable`. `isBuyable` tracks the "Can be purchased" toggle (plus the price gate, D6), not stock | `DRIFT` in `products.md` |
| D6 | PlatformUserGuide presents the three toggles as the availability model. ALCOE2047 has all three ON yet is `isBuyable:false`/`isAvailable:false` with Price "N/A" and a null xAPI `slug` — a fourth gate (price resolvability, possibly slug) the docs omit | `CONFIRMED` live |
| D7 | `PRODUCT_QTY_CHANGED` backend "The product available qty is changed" vs storefront "You can order maximum {availQty} item(s)" — a changed-stock event shown as a cap message | `CONFIRMED` source |
| D8 | `PRODUCT_FFC_QTY` sends `availableQty`; storefront "The product is out of stock" drops it, while sibling `PRODUCT_QTY_INSUFFICIENT` keeps its numbers | `CONFIRMED` source |
| D9 | 20 of ~36 xCart codes — **all 13 configuration codes** plus `LINE_ITEM_LIMIT`, `PRODUCT_DUPLICATE_SKU`, `ALL_LINE_ITEMS_UNSELECTED`, `PRODUCT_PRICE_CHANGED`, both shipment codes, `PAYMENT_METHOD_UNAVAILABLE` — have no `validation_error.*` entry in `en.json` | `CONFIRMED` source; what the customer sees `UNVERIFIED` (G3) |
| D10 | `Order.AdjustInventory=true` mutates stock at order time, yet xOrder has no stock-related error code anywhere | `CONFIRMED` source (absence); mechanism `UNVERIFIED` (G1) |
| D11 | StorefrontUserGuide back-in-stock-notifications: OOS shows *"**Notify me when in stock**"* instead of Add to Cart. Live OOS PDP `568171770` (`isTrackInventory:true`, qty 0, `BackInStock.Enable=true`) shows only a static "Out of stock" chip | `CONFIRMED` live on this SKU; whether the SKU is ineligible for some reason or the feature is missing is **not settled** |

## §4 — Coverage shape

**Dedicated suite:** `056-inventory.csv` (Backend/inventory), 48 cases `INV-001`..`INV-048`, read in
full. Status split (basis: full-file scan, approximate — embedded commas defeat a naive split):
~5 Automated, ~6 Katalon (legacy tool, not run here), ~37 None/Draft. Shape: Admin FFC / address /
dynamic-property CRUD `INV-001`–`INV-017` = 17 of 48; the stock → cart → order chain `INV-018`–`INV-023`
= 6 of 48. The manifest gives it `envRiskGate: "staging"` + `requiresModules: ["inventory"]` — under
`ENV_RISK=test` (vcst) it is gated out of a default run.

**`078b` smoke** carries the `inventory` tag (31 cases total); the inventory subset was not isolated.

**Keyword-grep table is a weak proxy** (basis: `grep -ciE` over `in stock|out of stock|inventory|availab|backorder|preorder|InStockQuantity|availabilityData|fulfillment` — a LINE count). Top: 056 (140), 075d (78 — **confirmed false positive**: every hit is `availableChildren`, a promotion-engine key), 029 (60), 037 (55), 075f (50, unchecked), 095 (48), 014/014b (44/33), 049 (40), 036 (38), 034 (30), 002 (28), 009/010 (27/25), 046 (26), 072b (26), 078b (26), 028 (25), 051 (24), 003 (23). Read it as "suites to open", never "suites that cover inventory".

**Real coverage found by opening files:**
- `010-b2b-bulk-ship-dashboard.csv` holds the **entire back-in-stock surface** of the corpus — 5 cases (`B2C-STOCK-001/002/003`, `B2C-NOTIF-006/007`), all Draft.
- `028-cart-core.csv` has one Draft case hypothesising the OOS PDP stepper stays enabled; the PDP half is refuted by this pass's live check, the listing-card half was not re-tested — leave the case as is.

**Holes (not deliberate exclusions):**
- `available_in:{warehouse}` xAPI filter — zero cases anywhere.
- The Visible × Can be purchased × Track inventory matrix — `INV-024`/`INV-025` test Track inventory alone; no case combines toggles.
- The price-resolvability gate (D6) — no case.
- None of the §2c error codes is asserted by code systematically (a few appear only as prose citations in Draft rows).
- Configurable-product validation error display (D9) — no case observes what the customer is shown.

**Over-covered:** nothing clearly excessive; 056's CRUD-heavy shape is descriptive only.

## §5 — Open gaps

| # | Gap | Needs |
|---|---|---|
| G1 | What fires when a line goes OOS between cart validation and order creation | a source read of `vc-module-order`'s inventory-adjustment handler, or a live checkout on a disposable fixture |
| G2 | Whether stock is restored on cancel / return | source read of Orders / Returns for an inventory increment, or a live cancel on a disposable fixture |
| G3 | What the storefront shows for a code with no `en.json` entry (raw key, fallback, blank) | a live configurable-product validation failure, or a read of vc-frontend's vue-i18n missing/fallback config |
| G4 | Whether non-English locale files match `en.json`'s 15-of-36 coverage | a diff of `locales/*.json` `validation_error` blocks |
| G5 | Whether "Sold out" (Visible Off) exists as a distinct storefront string | a Visible-Off fixture |
| G6 | Product blade → Fulfillment Centers widget, field level | open it live (read-only) |
| G7 | Settings > Inventory blade, field level | open it live (read-only) |
| G8 | Why FFC Products rows show "There is no product item with this ID" (D4) | the raw ProductIds cross-checked against Catalog |
| G9 | `available_in:{warehouse}` behaviour, incl. an unknown warehouse code | a live xAPI query + locating the parser |
| G10 | Whether XPickup availability tiers respond to the same toggles | owners of suites 036-038 |
| G11 | Whether the error-code catalog matches the DEPLOYED tags (read at `dev` HEAD) | re-read `CartErrorDescriber.cs` / `OrderErrorDescriber.cs` at the XCart 3.1034.0 / XOrder 3.1012.0 tags |

## §6 — Prior-art verdicts

| Claim | Verdict |
|---|---|
| `products.md` "`isBuyable: false` → "Add to cart" button disabled" | **DRIFT** (D5) |
| `storefront-selectors.md` in-stock state for SKU `8033482` (stepper visible, no "Stock alert" button) | `CONFIRMED`-consistent; the OOS mirror case surfaces D11 |
| `module-suite-map.md` Inventory row (056 · Fulfillment Centers, Stock · `/api/inventory/`) | `CONFIRMED`, narrower than this map |
| `catalog.md` B2B-mixed virtual catalog description | `CONFIRMED`-consistent (used to locate ALCOE2047) |
| `store-settings.md` | no inventory claim contradicted |
| BL-CART-001 (backend does not refuse to persist an out-of-range quantity) | `CONFIRMED`-consistent with the advisory pattern in `CartErrorDescriber.cs` |
| `configurable-products.md` | not contradicted; the 13 configuration codes above are a pure addition it can cite |
| A dedicated inventory BA report | `MISSING` — none in `reports/ba/`; this map is the first |
