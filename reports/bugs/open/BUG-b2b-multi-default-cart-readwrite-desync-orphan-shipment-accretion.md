# [XCart] B2B user accrues multiple "default" carts → read/write desync + orphan shipment/payment accretion on every cart-page load

## Status: CONFIRMED

**Severity:** High (functional — cart becomes effectively non-mutable for the user; checkout state corrupts)
**Env:** vcst-qa — Platform `3.1035.0`, XCart `3.1019.0-pr-124-89a6`, store B2B-store
**Owning layer:** GraphQL xAPI / Cart aggregate → `VirtoCommerce/vc-module-x-cart` (cart resolution + shipment) ± `vc-module-cart` (duplicate-cart creation)
**Reproduced:** 2026-06-11 live (REG-2026-06-11-1423, slot-1 B2B user John Mitchell / TechFlow)

## Summary

A single B2B user/store ends up with **multiple carts all named "default"**. GraphQL cart **reads** resolve to one cart row while **writes** (`addItem`, `changeCartItemQuantity`, `addOrUpdateCartShipment`) hit a *different* row — so the storefront shows one state but mutations appear to "not commit". Worse, **every `/cart` page load auto-appends a fresh orphan shipment + payment** to the write-target cart (observed 5→6 shipments live), a runaway accretion. The net user-visible effect is a cart where Clear/Remove/qty changes all silently no-op and a stale phantom (13 items, 4 coupons, frozen $1,266.99) persists.

## Steps to Reproduce

GraphQL xAPI (`POST {BACK_URL}/graphql`) and storefront `/cart`, as a B2B user who has interacted with the cart across multiple sessions.

1. As the B2B user, query the cart: `cart(storeId, userId, cartName:"default", currencyCode, cultureName){ id itemsCount shipments{ id } }` — note the returned cart `id` (read-target).
2. Perform a write that creates a shipment, e.g. load `/cart` (the page issues `addOrUpdateCartShipment`) or `changeCartItemQuantity`.
3. Search carts for that user+store+name="default" (admin/REST `POST /api/cart/search` by `customerId`+`storeId`, or inspect server-side): **multiple "default" carts exist** for the one user/store.
4. Re-load `/cart` repeatedly and re-query the write-target cart's `shipments[]`: the **shipment count increments on each load** (orphan shipment + payment appended every visit).
5. Observe that storefront cart mutations (Clear cart, Remove, qty ±) **no-op** — reads hit the empty/stale read-target cart while writes land on the accreting write-target cart.

**Live evidence (2026-06-11):** read-target `d129292b` resolved empty; writes hit `5b5fc440` which accreted shipments 5→6 on consecutive cart-page loads; **5 carts named "default"** existed for the one user/store. `removeCart` of all 5 + a logout/login (to clear the Apollo SPA phantom) restored a single clean, mutable cart.

## Expected vs Actual

- **Expected:** exactly **one** active "default" cart per user/store; reads and writes target the same cart; loading `/cart` does not create additional shipments; Clear/Remove/qty changes commit.
- **Actual:** multiple "default" carts; reads and writes diverge; `/cart` load appends an orphan shipment+payment each visit; cart mutations silently no-op.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL (inherited) | Clear/Remove/qty no-op; stale phantom cart; "broken cart" UX |
| 2. Backend Admin | N/A | not the surface |
| 3. GraphQL xAPI | **FAIL** | read vs write resolve to different "default" cart rows; `addOrUpdateCartShipment` appends orphan shipment each `/cart` load |
| 4. Platform REST / Cart store | **FAIL (root)** | multiple persisted carts named "default" for one customer+store — duplicate-cart creation + non-deduped resolution |

**Owning layer:** L3/L4 — cart resolution & shipment handling in `vc-module-x-cart`; the duplicate-cart *creation* may originate in `vc-module-cart`.

## Root Cause (hypothesis — needs dev confirm)

Cart resolution-by-name is not idempotent: under concurrent/cross-session access the "get-or-create default cart" path creates a new cart instead of resolving the existing one (no unique constraint / race), leaving several "default" rows. Reads and writes then pick different rows. Separately, the cart-page shipment initialization (`addOrUpdateCartShipment` on load) appends rather than upserts when the cart already has a default shipment, accreting orphans.

## Impact

- B2B users can reach a state where the cart is effectively non-functional (mutations no-op) and checkout state is corrupted (multiplying shipments/payments).
- Likely the underlying mechanism behind sporadic "broken cart" / "frozen total" reports.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3/4 — xAPI cart resolution + shipment (root may be Cart-module cart creation)
- **Suggested repo:** `VirtoCommerce/vc-module-x-cart` (primary) — possibly also `VirtoCommerce/vc-module-cart`
- **repoKind:** module
- **Component / module:** xCart cart aggregate — get-or-create-default-cart resolution + `addOrUpdateCartShipment` upsert-vs-append
- **RCA anchor:** cart-by-name resolution (`GetCartAsync`/cart search by `name`), `CartAggregate` shipment add path; confirm via `search_code` in vc-module-x-cart / vc-module-cart
- **Routing confidence:** MEDIUM — resolution + shipment accretion are clearly xCart; the duplicate-cart *creation* may span vc-module-cart (so possibly 2 repos). Reproduce-first to localize before a fix.

## References
- REG-2026-06-11-1423 recovery (Group A-retry); evidence in `reports/regression/REG-2026-06-11-1423/screenshots/`
- Related (distinct) cache-side symptom: VCST-5238 (Apollo `currencyCode` stale total) — different layer (vc-frontend), do not conflate.
