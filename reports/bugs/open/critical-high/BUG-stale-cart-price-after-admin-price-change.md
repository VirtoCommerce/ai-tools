# Cart line item serves a stale price after an admin price change until an explicit cart mutation `[P1 — price integrity]`

**Env:** vcst-qa @ Platform `3.1048.0`, Theme `2.54.0-pr-2395-fd70`, XCart `3.1028.0`, Pricing `3.1004.0`
**Owning layer:** L3 xAPI / XCart (request-scoped cart pricing cache) — `getCart` returns cached line-item money fields
**Reproduced:** 2026-07-24 (`REG-2026-07-24-2121`, exclusive-access rerun; 6 cases, both price directions)
**Tracker:** not filed
**Was:** `BUG_029_005` in the run report's cross-cutting patterns

## Summary

After an admin changes a product's price, a cart already containing that product keeps serving the **old** price indefinitely across page reloads. `getCart` returns stale `listPrice`, `salePrice`, `placedPrice` and `extendedPrice`, and subtotal/total are computed from them. Only an explicit cart **mutation** (e.g. a quantity change) forces a reprice. The cart API call itself succeeds — no 4xx/5xx, no console error — so the stale figure is indistinguishable from a correct one to the shopper.

## Steps to reproduce

1. Sign in to `{{FRONT_URL}}` and add product **WH-001** to the cart (observed at `$109.99`).
2. In Admin, change WH-001's price list entry to `$129.99`.
3. Wait ~50s (well past any short-TTL cache), then reload `{{FRONT_URL}}/cart` in the **same session** (no re-login).
4. Inspect the `getCart` response for the line item's money fields.

**Expected:** the cart line reprices to `$129.99`, or the shopper is warned the price changed.
**Actual:** `listPrice` / `salePrice` / `placedPrice` / `extendedPrice` are **all still `$109.99`**; subtotal and total are computed off the stale price. No warning of any kind.

Then: increment and decrement the line-item quantity → the line correctly reprices to `$129.99`.

## The isolating detail

In the **same response cycle** as the stale cart line, `product.availabilityData` and the page's own "Recently browsed" catalog widget already show the **new** price. So the catalog read path is current and only the **cached cart line item** is stale — this is not a general indexing or propagation lag.

## Both directions confirmed

| Direction | Before | After | Cart line after reload |
|---|---|---|---|
| Increase | $109.99 | $129.99 | $109.99 (stale) |
| Decrease | $129.99 | $89.99 | $129.99 (stale) |

The decrease case matters commercially: the shopper does **not** receive the lower price without an extra interaction they have no reason to perform.

## Impact

Price integrity on the revenue path. A shopper can check out at a price the merchant no longer offers — under-charging on an increase, over-charging on a decrease. It needs no unusual timing: any cart older than a price change is affected, and a reload (the natural "refresh to see current prices" gesture) does not fix it.

`BL-PRICE-*` / `BL-CART-*` — cart money fields must reflect current effective pricing at read time.

## Evidence

- `reports/regression/REG-2026-07-24-2121/screenshots/CART-024-FAIL-stale-cart-price.png`
- Failing cases: `CART-024`, `CART-028`, `CART-029`, `CART-043`, `CART-044`, `CART-076` (suite 029) — one root cause, six cases
- Notably **no** network failure and **no** console error on any of the six: the cart call succeeds and returns cached figures

## Not part of this bug

**No price-change indicator exists anywhere in the cart UI** (raised by `CART-044`, whose assertion expects a toast/badge/strikethrough). Verified independently on 2026-07-25: across ~10 `/cart` renders the line-item row exposes only Product / Price per item / Quantity / Total, with no such element in any state. That is a **missing feature, not a regression** — the surface has never existed, matching the pattern in `project_storefront_no_tracking_number_ui`. Confirm design intent before filing it (`feedback_verify_design_intent_before_bug`); `CART-044`'s indicator assertion is likely asserting a nonexistent surface and should be re-scoped rather than treated as a defect.

## Note on the failing cases

Independently of this defect, all six cases name **no product** (`[ACT] add product to cart`, no `@td()`) and carry hardcoded before/after prices that contradict each other across cases ($10→$15, $20→$15, $25→$18) — the runner had to pick WH-001 itself. They also mutate a shared fixture from a suite the runner batches 3-wide. Fixing the product bug will not make them deterministic; they need `@td()` fixtures and serialisation. Route: `/qa-review-tests suite 029 --fix`.

## Re-verification attempt 2026-08-26 — NOT re-verified (price-write path unresolved)

Backlog triage. The STR needs an admin price change, and the pricing write path could not be established on
Platform `3.1061.0` within this pass:

| Probe | Result |
|---|---|
| `GET /api/products/{id}/prices` (fixture `CF-001`, live price **$49.99**) | `200 []` — no rows, though the product is priced |
| `POST /api/pricing/prices/search` (`productIds` / `ProductIds` / no filter) | **404** |
| `POST /api/pricing/pricelists/search` | **405** |

So the product's effective price is served from a pricelist this pass could not locate or write through.
The repo's own seeders use `PUT /api/products/prices` with a `{productId, prices:[{pricelistId, …}]}` shape,
which needs the owning `pricelistId` — and that is what the failing lookups were for.

**Nothing was changed on the environment** — no price was written, so no restore was needed.

**Status: still open, re-verification outstanding.** Neither re-confirmed nor cleared. This one is worth
finishing: it is P1 on the revenue path, both price directions were confirmed originally, and the draft's
isolating detail (catalog read path current while only the cached cart line is stale) makes it a narrow,
checkable claim once a price can be written. Resolve the pricelist lookup first — likely
`GET /api/pricing/pricelists` (the seeders use the `GET …?keyword=` form, not a `search` POST).
