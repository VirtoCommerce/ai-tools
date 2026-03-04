# VC Product Reference

**Source:** Virto Commerce xAPI docs (Context7 `/virtocommerce/vc-docs`) + QA storefront observation
**Updated:** March 4, 2026

---

## 1. Product Types (Storefront Perspective)

The storefront supports three display modes, all visible in `/products-with-options`:

| Type | Storefront CTA | URL pattern | Admin `productType` value |
|------|---------------|-------------|--------------------------|
| **Simple** | Quantity selector + "Add to cart" directly on listing card | `/{category}/{slug}` | `Physical` |
| **Variation-based** | "N variations" link + "Show on a separate page" icon | `/{cat}/{sub}/{parent}/{variant-slug}` | `Physical` (with child variations) |
| **Configurable** | "Customize" button | `/{category}/{slug}` | `Configurable` |
| **Digital** | "Add to cart" (no shipping step) | `/{category}/{slug}` | `Digital` |

> **Rule:** Always check `productType` field in xAPI response to confirm the correct type — do not rely on CTA text alone.

---

## 2. Product Object Fields (GraphQL xAPI — `ProductType`)

Source: `xAPI/Catalog/objects/ProductType.md`

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Product UUID |
| `code` | String | SKU |
| `catalogId` | String | Parent catalog ID |
| `productType` | String | `Physical`, `Digital`, `Configurable`, `BillOfMaterials` |
| `minQuantity` | Int | Minimum order quantity |
| `maxQuantity` | Int | Maximum order quantity (0 = unlimited) |
| `outline` | String | Hierarchical category path (e.g. `Catalog/Category/Sub`) |
| `slug` | String | URL-friendly slug |
| `name` | String | Display name |
| `seoInfo` | SeoInfo | Page title, meta description, image alt |
| `descriptions` | DescriptionType[] | Long/short descriptions (by culture) |
| `description` | DescriptionType | Single description for current culture |
| `category` | Category | Parent category object |
| `imgSrc` | String | Main image URL |
| `outerId` | String | External/ERP ID |
| `gtin` | String | Global Trade Item Number (barcode) |
| `brandName` | String | Brand label |
| `masterVariation` | VariationType | Default/active variation |
| `variations` | VariationType[] | All child variations |
| `hasVariations` | Boolean | `true` if product has any variations |
| `availabilityData` | AvailabilityData | Stock and purchase eligibility |
| `images` | ImageType[] | All product images |
| `price` | PriceType | Current price (sale or list) |
| `prices` | PriceType[] | All applicable prices (multi-currency, tier) |
| `minVariationPrice` | PriceType | Lowest price across all variations (shown as "From $X") |
| `properties` | Property[] | All product-level properties |

---

## 3. AvailabilityData Object

Source: `xAPI/Catalog/objects/AvailabilityData.md`

| Field | Type | Description |
|-------|------|-------------|
| `availableQuantity` | Long | Units available for purchase |
| `isBuyable` | Boolean | Can be added to cart |
| `isAvailable` | Boolean | Visible/selectable on storefront |
| `isInStock` | Boolean | Has stock > 0 |
| `isActive` | Boolean | Not deactivated in admin |
| `isTrackInventory` | Boolean | Inventory tracking enabled |
| `inventories` | InventoryInfo[] | Per-fulfillment-center breakdown |

**Test signals:**
- `isBuyable: false` → "Add to cart" button disabled
- `isAvailable: false` → Product hidden from listing
- `isInStock: false` + `isTrackInventory: true` → "Out of stock" badge

---

## 4. Property Levels

Properties can be set at four levels in the catalog hierarchy:

| Level | Scope | Use cases |
|-------|-------|-----------|
| **Catalog** | All products in a catalog | Brand, manufacturer, global attributes |
| **Category** | All products in a category | Category-specific filters (e.g., GPU memory for Graphics Cards) |
| **Product** | Single product | Model number, unique specifications |
| **Variation** | Specific variant of a product | Color, Size, Material |

Properties are returned in the `properties` array on both `ProductType` and `VariationType`.

**Property object fields:**
- `name` (String) — property name (e.g., `Color`, `Size`, `Custom1`)
- `value` (String) — current value
- `type` (String) — `Product`, `Variation`, `Catalog`, `Category`
- `id` (String) — unique property ID
- `multivalue` (Boolean) — supports multiple selected values
- `propertyDictItems` — predefined value list (if dictionary property)

---

## 5. Variation Type

Variants share the same parent product. Each `VariationType` has the same fields as `ProductType` plus:
- `id` — variant UUID (different from parent)
- `code` — variant SKU
- `properties` — variation-level properties only (e.g., Color: Red, Size: M)
- `availabilityData` — per-variant stock
- `price` / `prices` — per-variant pricing

**Storefront behavior:**
- Selecting a property value (e.g., Color: Blue) filters remaining options to valid combinations
- Unavailable combinations are **visibly disabled** (greyed out)
- Single available value is **auto-selected**
- Multi-color products show a **multicolor selector** (all colors in one swatch)
- URL updates to variant slug on selection

---

## 6. Configurable Product Sections

Configurable products use `productConfiguration` xAPI query. Structure:

```
Product
  └── configurationSections[]
        ├── id, name, description
        ├── type: "Product" | "Text" | "File"
        ├── isRequired: Boolean
        └── options[]
              ├── id, quantity
              ├── listPrice, salePrice, extendedPrice
              └── product { id, name, code, properties[] }
```

### Section Types

| Type | Admin setup | Storefront behavior |
|------|-------------|---------------------|
| **Product** | Select a product as option | User picks from product option list; adds to cart with parent |
| **Text** | Custom text field or predefined values list | User types custom message or selects predefined text (used for engravings, greetings, monograms) |
| **File** | File upload field (accepts configurable MIME types) | User uploads file (logo, image, PDF) for print-on-demand use cases |

**Required vs optional:**
- `isRequired: true` → User must select/fill this section before adding to cart
- `isRequired: false` → Section shows a **"None"** option to skip it

**Post-cart behavior:** After adding a configured product to cart, the configuration remains editable (Edit configuration button in cart line item).

---

## 7. Product Descriptions (DescriptionType)

Each product can have multiple description entries:

| Field | Type | Notes |
|-------|------|-------|
| `id` | String | Description entry ID |
| `reviewType` | String | `FullReview` (long), `QuickReview` (short) |
| `content` | String | HTML or plain text body |
| `languageCode` | String | Culture code (e.g., `en-US`, `de-DE`) |

On the storefront: Full description shown in the "Description" tab; Quick Review shown as card excerpt.

---

## 8. Sample Products in QA Environment

### Configurable Products (`/products-with-options/configurable-caps-shirts/`)

| Product | URL slug | Price | Notable properties |
|---------|----------|-------|-------------------|
| Configurable Hat | `configurable-hat` | $15 | Configurable sections |
| Custom T-shirt | `custom-t-shirt` | $12 | Configurable sections |
| Vintage Colorado Hoodie | `hoodie` | $54 | Color: Malachite, stock 2333 |
| Hoodie Base (File optional) | `physical` | $300 | File upload section (not required) |
| Hoodie Base (File required) | `physical-1703` | $250 ~~$300~~ | File upload required |
| Base product EN | `111111` | $1,999 ~~$2,000~~ | Text properties: Custom1, Custom2, Custom3 |
| Product No variations | `product-no-variations` | $900 ~~$1,000~~ | Color: Beige, stock 9999+ |
| Product No B2C Layout | `product-no-b2c-layout-master` | From $300 | 2 variations |

### Variation-based Products (`/products-with-options/variations-of-jeans/jeans/`)

| Product | URL slug | Price | Variations | Notable |
|---------|----------|-------|-----------|---------|
| Black CA Beach Pullover Hoodie | `vintage-california-beach-pullover-hoodie` | From $19 | 7 | |
| Men's Adjustable Hat | `hat` | From $4 | 3 | Color: Steel Blue |
| Men's Flannel Shirts | `mens-flannel-shirts-*` | From $6 | 5 | |
| High Waist Jeans Brown | `high-waist-jeans-brown` | From $35 | 6 | Rating 4/5 |
| Baggy Regular Jeans | `baggy-regular-jeans-grey` | From $28 | 3 | Rating 5/5, -26% |
| Skinny High Jeans Blue | `skinny-high-jeans-blue` | From $25 | 2 | |
| MAGCOMSEN Women's T-Shirts | `magcomsen-*` | From $14.99 | 9 | -30% |

### Gift Card / Digital Products (Homepage — "Discounts. Loyalty cards")

| Product | UUID |
|---------|------|
| UNTUCKit eGift Card | `bee0d93a-cd70-4313-bc6c-716cb415b43a` |
| Eddie Bauer Gift Cards | `e91d8f7c-35fa-41a2-b6d1-dfbfa980f5c0` |
| Athleta eGift Cards | `adc1ea7a-04cb-456c-bb71-eb696a1ee546` |
| Best of Cities eGift Card | `d1a0f4b1-a634-4d94-bab5-8dc7b5342596` |

---

## 9. Available Filters on `/products-with-options`

`price` | `Size` | `Categories` | `Color` | `Type` | `Product color` | `Size chart`

**Filter syntax (xAPI):**
```
color:Black,Blue
price.usd:[100 TO 200)
name:"ASUS ZenFone 2*"
productType:Physical
```

---

## 10. Key xAPI Queries for Product Testing

| Query | Purpose |
|-------|---------|
| `products(filter: "...")` | List/filter products |
| `product(id: "...")` | Single product details |
| `productConfiguration(configurableProductId: "...", storeId: "...")` | Get configurable sections & options |
| `properties(storeId: "...", types: [PRODUCT, VARIATION])` | List catalog property metadata |

---

## Notes for QA

- `productType` in xAPI is admin-level; storefront CTA is derived from it
- A product with `hasVariations: true` but only 1 variation still shows variation selector
- `minVariationPrice` drives the "From $X" label — test with products that have price spread across variants
- Configurable product configurations persist in cart; test "Edit" flow
- File upload sections: test required vs optional, accepted file types (PDF, image), max file size
- Digital products skip the shipping step in checkout — verify no address required
