# Frontend Smoke — Cross-Layer Consistency Checklist

> **Purpose:** UI-vs-backend parity only. Each item confirms the storefront agrees with the underlying layer (GraphQL xAPI, Platform REST, Admin SPA). UI behavior itself is in `SMOKE-CHECKLIST.md`; both green = GO.
>
> **Source:** `042-smoke-tests.csv`, `Cross_Layer_Checks` column. GraphQL mutations are healthy when HTTP 200 + `errors[]` empty.
> **Data:** `{{FRONT_URL}}`, `{{USER_EMAIL}}`, `{{ORG_USER_EMAIL}}`, `@td(BUYABLE_NO_MIN_QTY.*)`, `@td(ADDR_NY.*)`, `@td(CFG_LAPTOP.url)`, `@td(CFG_RING.url)`. No hardcoded IDs, SKUs, prices, or credentials.

## Summary

| # | Consistency Area | Items | SMK cases |
|---|-----------------|-------|-----------|
| 1 | Auth / Session | 3 | SMK-002, SMK-004, SMK-005 |
| 2 | Registration → Admin | 2 | SMK-002, SMK-003 |
| 3 | Catalog & PDP — xAPI product | 2 | SMK-007, SMK-019 |
| 4 | Cart — UI vs `cart()` | 4 | SMK-008–011, SMK-023 |
| 5 | Checkout — shipment & address | 2 | SMK-012, SMK-029 |
| 6 | Order — storefront vs REST/Admin | 3 | SMK-013, SMK-014, SMK-016 |
| 7 | Configurable Products — xAPI config | 4 | SMK-018, SMK-031, SMK-032 |
| 8 | B2B — org context & members | 3 | SMK-020, SMK-021, SMK-022 |
| 9 | BOPIS — fulfillment center | 2 | SMK-024, SMK-030 |
| 10 | Addresses — xAPI contact | 2 | SMK-017, SMK-025 |
| 11 | GA4 — dataLayer vs network | 2 | SMK-015 |
| 12 | Orders — filter vs xAPI query | 1 | SMK-033 |
| 13 | Health — network layer | 1 | SMK-026 |

---

## 1. Auth / Session
- [ ] `me` query `userId`/`email` match the user shown in the header — SMK-004
- [ ] B2B: `me.organization.id` non-null matches header org name — SMK-005
- [ ] No 401/auth errors in console or network after authenticated loads — SMK-004, SMK-005

## 2. Registration → Admin
- [ ] New personal user appears in Admin SPA Customers; token grant succeeds with new credentials — SMK-002
- [ ] New org appears in Admin SPA Organizations; user assigned org-admin role — SMK-003

## 3. Catalog & PDP — xAPI Product
- [ ] PDP price matches `product` query `price` (non-null); category `products` returns non-empty `items[]` — SMK-007
- [ ] Each option switch matches per-option price in `productConfiguration` — SMK-019

## 4. Cart — UI vs cart()
- [ ] After (+), `addItem` ok; `cart.items` contains the product, matching badge/list — SMK-008
- [ ] After qty change, `changeCartItemQuantity` ok; `cart.items[].quantity` matches the stepper — SMK-009, SMK-010
- [ ] `cart.total` matches displayed grand total; subtotal = Σ line totals (BL-PRICE-008) — SMK-010
- [ ] After `removeCartItem` ok, product gone from `cart.items`; UI empty — SMK-011

## 5. Checkout — Shipment & Address
- [ ] `addOrUpdateCartShipment` ok; `cart.shipments[0]` `deliveryAddress` + `shipmentMethodCode` match the UI summary — SMK-012
- [ ] Ship-To change reflected in `cart` shipping context + `me.addresses[]`; matches header label — SMK-029

## 6. Order — Storefront vs REST/Admin
- [ ] `createOrderFromCart` returns non-null `orderId`; Admin shows order "New"; confirmation number matches Admin — SMK-013
- [ ] Admin order payment status = Authorized/Paid; processor webhook received — SMK-014
- [ ] `orders` query top order `orderId` + detail `items[]` + totals match the confirmation (BL-ORD-005) — SMK-016

## 7. Configurable Products — xAPI Config
- [ ] `productConfiguration` has a section `isRequired=true`; UI blocks Add-to-Cart until filled (BL-CAT-006) — SMK-018
- [ ] After add, `cart.items[].selectedConfiguration` non-null matches the selected option — SMK-018
- [ ] Guest `addItem` (configured Laptop) ok; post-sign-in `cart.items[].selectedConfiguration` non-null (BL-CART-010 after merge) — SMK-031
- [ ] `moveToSavedForLater` ok; `getSavedForLater` `configurationItems` non-empty; `moveFromSavedForLater` ok; restored cart `selectedConfiguration` non-null (VCST-4205) — SMK-032

## 8. B2B — Org Context & Members
- [ ] After org switch, `cart.items` empty under new context; `me.organization.id` = new org (BL-B2B-001) — SMK-020
- [ ] `organization` query `members[]`/`name` match `/company/members` + `/company/info` — SMK-021
- [ ] Bulk pad: `product` query resolves `@td(BUYABLE_NO_MIN_QTY.sku)`; no 4xx on load — SMK-022

## 9. BOPIS — Fulfillment Center
- [ ] `addOrUpdateCartShipment` with `fulfillmentCenterId` ok; `cart.shipments[0].fulfillmentCenter` matches the picked location — SMK-024
- [ ] Order: `fulfillmentCenter` set + `deliveryAddress` null + `shippingTotal=0` (BL-BOPIS-001); Admin shows pickup FFC — SMK-030

## 10. Addresses — xAPI Contact
- [ ] After save, `updateContact`/`addAddress` ok; `me.addresses[]` includes it; UI list matches — SMK-017
- [ ] Profile save ok; no XSS payload in API response or DOM — SMK-025

## 11. GA4 — dataLayer vs Network
- [ ] Confirmation: 1 `purchase` event, `transaction_id` = order number = `createOrderFromCart` `orderId`; GA4 collect request fired with matching id — SMK-015
- [ ] Refresh fires no second `purchase` / no duplicate GA4 collect (ECL-11.1) — SMK-015

## 12. Orders — Filter vs xAPI Query
- [ ] After status filter applied + Apply clicked, `orders` query with status filter returns HTTP 200, `errors[]` empty; UI rows match filtered status — SMK-033
- [ ] After clear, unfiltered `orders` query returns full result set; UI count matches pre-filter total — SMK-033

## 13. Health — Network Layer
- [ ] `/account/dashboard`, `/account/orders`, `/catalog`, `/cart`: no 5xx, no layout-breaking 404, no console TypeError/ReferenceError — SMK-026

---

## GO / NO-GO

| Status | Criteria |
|--------|----------|
| **GO** | All items checked |
| **GO WITH RISK** | ≤1 unchecked in §13 (health); all parity sections (§1–12) pass; risk logged |
| **NO-GO** | Any item in §1–12 fails |
