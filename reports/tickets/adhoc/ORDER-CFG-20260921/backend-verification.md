# Backend verification — order CO260921-00001 (configurable line item)

**Env** vcst-qa (`https://vcst-qa.govirto.com`), store `B2B-store`, USD · **Date** 2026-09-21
**Method** HTTP only, no browser. Admin OAuth2 password grant. Two independent reads: xAPI `order(number:)`
(`xapi-order.json`) and Platform REST `GET /api/order/customerOrders/number/CO260921-00001` (`rest-order.json`).
Backend was read and recorded FIRST; comparison against the storefront claim came after.

**VERDICT: PASS** (items 1–6 all pass; items 7–8 answered, 2 advisory observations)

## 1. Line count — PASS
`items.length = 1` in **both** sources. REST line `isGift: false`. REST top-level arrays:
`items=1, inPayments=1, shipments=1, addresses=2, discounts=0, feeDetails=0, taxDetails=0, dynamicProperties=0`.
No second line, gift or otherwise, reached the order. The raw `CustomerOrder` (which does not hide gifts) confirms it.

Line: id `3c76815d-74c3-4a19-8e0e-bdde2700d43b`, productId `71385ee0-d17b-44eb-9bd7-6b0190ae1b9f`,
sku `Configuration-AGENT-TEST-CFG-020`, name `AGENT-TEST-Config-Phone-Case`, qty 1, productType Physical.

## 2. Configuration completeness — PASS
Exactly **3** `configurationItems`. Every requested field present in both sources:

| sectionName | sectionId | type | name | productId | sku | qty | customText | price / salePrice / extendedPrice |
|---|---|---|---|---|---|---|---|---|
| Accessories | `e76ff9e1-…ae51` | Product | AGENT-TEST-CFG-020-Ring | `2e4b334c-…dd269` | AGENT-TEST-CFG-020-OPT-RING | 1 | null | 10 / 10 / 10 |
| Custom Name | `1b96bcd0-…7fd6d` | Text | null | null | null | 1 | `QA-CFG-0921` | 0 / 0 / 0 |
| Case Style | `5bc08228-…a5a9e0` | Product | AGENT-TEST-CFG-020-Matte | `794c4c76-…f3408` | AGENT-TEST-CFG-020-OPT-MATTE | 1 | null | 5 / 5 / 5 |

`files: []` on all three. `null` name/productId/sku on the Text item is correct for `type: Text`.

## 3. Configuration correctness — PASS
- **Case Style (Product, REQUIRED)** — definition (`xapi-product-configuration.json`) offers
  `OPT-GLOSS, OPT-MATTE, OPT-CLEAR` in that order; **GLOSS is first/default**. The order stores **MATTE**.
  The non-default option was transmitted and persisted — this is a positive proof, not a surviving default.
- **Accessories (Product, optional, `isRequired:false`)** — definition offers `OPT-RING, OPT-STAND`; order stores **RING**.
- **Custom Name (Text, optional)** — `customText` round-trip verified **byte-for-byte**:
  xAPI `51412d4346472d30393231` (11 bytes) == REST `51412d4346472d30393231` == `QA-CFG-0921`. No trim, no re-encode.

## 4. Catalog cross-check — PASS (no denormalization drift)
`GET /api/catalog/products/{id}` for each Product-type option (`catalog-products.json`):

| config item `productId` | catalog `name` | catalog `code` (SKU) | matches config item `name`/`sku`? |
|---|---|---|---|
| `2e4b334c-55e1-41e5-9a23-1edc90ddf269` | AGENT-TEST-CFG-020-Ring | AGENT-TEST-CFG-020-OPT-RING | YES / YES |
| `794c4c76-e233-4bc1-9d2c-97a235ff3408` | AGENT-TEST-CFG-020-Matte | AGENT-TEST-CFG-020-OPT-MATTE | YES / YES |

Base product `71385ee0-…` resolves to `AGENT-TEST-Config-Phone-Case` / code `AGENT-TEST-CFG-020`; all three `isActive: true`.
Note the order line's own `sku` is `Configuration-AGENT-TEST-CFG-020` — a `Configuration-` prefix the platform adds to the
configurable line; the underlying catalog `code` is `AGENT-TEST-CFG-020`. Expected, not drift.

## 5. Price math — PASS
Money fields used (identical in both sources):

| Source | Field | Value |
|---|---|---|
| catalog xAPI `product.price` | base list / sale / actual | 30.00 / 30.00 / 30.00 |
| config item | Case Style price | 5.00 |
| config item | Accessories price | 10.00 |
| config item | Custom Name price | 0.00 |
| order line | `price` / `placedPrice` / `extendedPrice` | 45.00 / 45.00 / 45.00 |
| order line | `discountAmount`, qty | 0.00, 1 |
| order | `subTotal` / `shippingTotal` / `taxTotal` / `discountTotal` / `total` | 45 / 150 / 39 / 0 / 234 |
| order | `subTotalWithTax` | 54.00 |

- 30 + 5 + 10 + 0 = **45** = `placedPrice` = `extendedPrice` (qty 1, no discount). ✔
- `subTotal` 45 = sum of line `extendedPrice`. ✔
- `total` 234 = 45 + 150 + 39. ✔ Tax 39 = 20% of (45 + 150); `subTotalWithTax` 54 = 45 × 1.20. ✔
- **Advisory:** the base $30 is **not stored anywhere on the order**. The line's `price`/`placedPrice` is the
  rolled-up 45. Base is only recoverable as `45 − Σ(configurationItems.price)`, i.e. by inference. Auditability note, not a defect.

## 6. Two independent sources — NO DIVERGENCE
Field-by-field diff of all 3 config items across xAPI and REST, on
`id, sectionId, sectionName, name, type, productId, sku, quantity, customText` + all three money fields:
**zero differences**. Order/line/total money fields likewise identical. Shape differs only as expected (xAPI wraps money
in `MoneyType {amount}`, REST returns bare decimals); REST additionally carries `imageUrl, catalogId, categoryId,
lineItemId, customerOrderId, createdDate/By, modifiedDate/By` — supersets, not conflicts. Both re-read; stable.

## 7. `sectionName` / `extendedPrice` — POPULATED. This is a STOREFRONT QUERY GAP, not an xAPI gap.
Live values from `OrderConfigurationItemType` on this order, all **non-null**:
`sectionName` = `"Accessories"`, `"Custom Name"`, `"Case Style"`; `extendedPrice.amount` = `10`, `0`, `5`.
REST confirms `sectionName` is persisted on the `ConfigurationItem` entity itself — it is stored data, not a resolver default.

Corroborated in storefront source (`.fix-workspace/vc-frontend` @ `985c9cf2`, 2026-07-31 — an older checkout than the
deployed build, so corroborating rather than decisive):
- ORDER `client-app/core/api/graphql/fragments/orderLineItemFields.graphql` selects only
  `id, name, customText, type, files` — **no section name, no price**.
- CART `client-app/core/api/graphql/cart/fragments/fullLineItem.graphql` selects those **plus**
  `extendedPrice { ...money }` and `configurationSection { name }`.

That difference alone explains the rendering difference. A likely contributing cause: the two schema types are **asymmetric** —
`CartConfigurationItemType` exposes both `sectionName` **and** `configurationSection` (plus `listPrice`), while
`OrderConfigurationItemType` exposes flat `sectionName` only and **no** `configurationSection`. Copying the cart fragment
verbatim onto the order would fail validation; the flat `sectionName` the order type does expose was simply never requested.

## 8. Section ordering — backend defines NO canonical order
Backend returns: **Accessories → Custom Name → Case Style**. Identical in xAPI and REST, stable across 3 xAPI + 3 REST reads.

What that order is, and is not:
- **Is not** the configuration definition's order — `productConfiguration` returns sections
  `[0] Case Style, [1] Accessories, [2] Custom Name`.
- **Is not** `createdDate` order — that would be Accessories → Case Style → Custom Name
  (`…2343921`, `…2344248`, `…2344352`).
- **Is** exactly ascending sort of the config item's own `id` GUID
  (`94cfd09e…` < `9580cdba…` < `edf4eff9…`), i.e. primary-key order.

No ordering field exists to appeal to: `OrderConfigurationItemType` has no `sortOrder`/`displayOrder`
(fields are `id, sectionId, sectionName, name, productId, sku, imageUrl, quantity, type, customText, price,
salePrice, extendedPrice, files, product`), the REST `ConfigurationItem` entity carries none either, and
`ConfigurationSectionType` itself has no explicit order field — only its own list position.

**Conclusion, asserted narrowly:** the order payload's sequence is deterministic but semantically arbitrary
(random-GUID primary-key order). The backend does not define an expected order for order configuration items,
so PDP/cart/order disagreeing is **not contradicted by any backend contract**. Whether the definition's section
order *should* be preserved onto the order is a product question, not something this payload settles. Not filed as a bug.

## Provenance
`xapi-order.json` · `rest-order.json` · `xapi-product-configuration.json` · `catalog-products.json` · `xapi-base-product-price.json`

## Limitations
Both reads are **admin**-authenticated. No customer-scoped xAPI read: on `TEST_ENV=vcst` `B2B_USER_PASSWORD`
resolves only as `B2B_USER_PASSWORD_LOCALHOST` (no vcst-promoted value), and `ORG_USER_PASSWORD` is known-rejected
for this account — retrying risked lockout for no new information. xAPI applies no field-level authorization to
`OrderConfigurationItemType`, so item 7 is not expected to be principal-dependent; stated as unverified for the customer principal.
