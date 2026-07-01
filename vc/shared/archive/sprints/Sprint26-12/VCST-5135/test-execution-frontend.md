# VCST-5135 — Storefront earned-points UI (AC10) — Frontend execution

**Env:** vcst-qa storefront @ theme 2.52.0-pr-2335-f5b1 · Browser: playwright-chrome · 2026-06-24
**Scope:** AC10 — does the customer SEE the loyalty points they EARN (ProductPoints)? Earned ≠ the
PTS redemption price shown in `/loyalty-catalog`. Oracle (backend): `cart.items[].loyaltyPoints`.

## Verdict: AC10 = NOT-FOUND (storefront renders NO earned-points indicator anywhere)

The customer earns ProductPoints server-side (per the VCST-5135 program/factor model), but the
storefront theme 2.52.0-pr-2335 never queries or displays earned points — not on the PDP, not on the
cart line item, not in the order summary. Recorded for design reconciliation; NOT filed as a defect.

## Where earned points render

| Surface | Earned-points shown? | Evidence |
|---------|---------------------|----------|
| PDP — LT-001 (ORG_USER, 500× override) | **No** | `01-pdp-lt001-orguser-no-earn-indicator.png` |
| Cart line item — LT-001 (ORG_USER) | **No** | `02-cart-orguser-no-earned-points.png` |
| Cart order summary (ORG_USER) | **No** (only Subtotal/Discount/Tax/Shipping/Total) | `02-...png` |
| PDP — WH-001 (VIP, 100× override) | **No** | `03-pdp-wh001-vip-no-earn-indicator.png` |

## Override-vs-default & VIP-override visibility
- **Not visible to the shopper.** Since nothing is rendered for ANY product, the 500× override on
  LT-001 vs the default factor on WH-001 (ORG_USER) is indistinguishable in the UI. Likewise the VIP
  override on WH-001 is invisible. Relative-check moot — no figure exists to compare.

## Decisive root-cause evidence (GraphQL fragment, request body)
The storefront `fullCart` / `fullLineItem` query fragments (captured live from the `/cart` GraphQL
POST, op `AddOrUpdateCartShipment`) select name, all price fields, product, vendor, validationErrors,
configurationItems, and `cartTotals` — but **NO `loyaltyPoints` field on the line item and NO
earned-points field on the cart/totals**. The theme simply does not request the data, so it cannot
render it. (Cart fragment is theme-global, not per-user → VIP cart behaves identically.)

## Steps
1. Sign in @td(ORG_USER) (Emily Johnson / TechFlow). Open LT-001 PDP (`/product/bce99323-…`,
   SKU #LT-001, $1,299.99, in stock 10) → no earn indicator in "Price and delivery" panel.
2. Add LT-001 (qty 1) → cart badge 4, "in Cart 1"; no earn hint on add.
3. `/cart`: LT-001 ($1,299.99) + pre-existing WH-001 (×3) line items show only price/qty/total;
   order summary = Subtotal $1,599.96 / Discount $0 / Tax $319.99 / Shipping $0 / Total $1,919.95.
   No earned-points anywhere.
4. Sign out → sign in @td(LOYALTY_VIP_USER). Open WH-001 PDP (SKU #WH-001, $99.99) → no VIP
   earn indicator (same panel as ORG_USER).

## Incidental observations (no defects filed)
- `/loyalty-catalog` is the **redemption** catalog (products priced PTS50–PTS150) — correctly
  separate from earning; not confused with AC10.
- Console: one benign external-CDN 404 (`cdn-tp1.mozu_md.com` CMS image, ERR_NAME_NOT_RESOLVED) on
  the loyalty-catalog page — pre-existing demo-data image, not a regression. No JS exceptions.
- All `/graphql` requests 200; GA4 view_cart/begin_checkout/view_item_list fire with correct payloads.
- "LT-001" keyword search returns 0 product cards (search indexes name, not SKU code) — by-design
  search behavior, products reachable by id/slug.

HAR: `test-results/chrome/har/` (auto-captured).
