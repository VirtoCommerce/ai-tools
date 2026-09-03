# Platform Cart REST coupon endpoint is a silent no-op — `POST`/`DELETE …/coupons/{code}` return 204 and persist nothing `[P1]`

**Env:** vcst-qa @ Platform `3.1061.0`, Cart `3.1009.0` · confirmed live 2026-08-25
**Case:** `API-021` (suite `049`)
**Tracker:** not filed

## Summary
`POST /api/carts/{cartId}/coupons/{couponCode}` returns **204 No Content** and writes nothing — the follow-up `GET` still shows `coupons: []`, `coupon: null`. The sibling `DELETE` on the same route is equally inert: it cannot remove a coupon that a `PUT /api/carts` put there. The whole coupon sub-resource is dead, in **both** directions, while reporting success. An integrator has no signal that the call did nothing.

## Steps to Reproduce
Auth as a **context-free admin token** (no `storeId` / `organization_id` — a store-scoped token 401s on platform REST).

1. `GET /api/carts/{storeId}/{customerId}/{cartName}/USD/en-US/current` → note the cart id. Add one line item so the cart is non-empty and its subtotal is above the env's `≤$1000` exclusive-promo threshold (rules out the confound behind the rejected `BUG-xcart-vcst5101-…` report).
2. `POST /api/carts/{cartId}/coupons/@td(COUPON_10PCT.code)` → **204**, empty body.
3. `GET /api/carts/{cartId}` → `coupons: []`, `coupon: null`, `discountTotal: 0`.
4. `POST /api/carts/recalculate` with that cart, re-read → still `coupons: []`.

## Expected vs Actual
- **Expected:** the coupon code is persisted on the cart (`coupons: ["<code>"]`) and survives a re-read; an unknown or ineligible code is rejected with a 4xx and a reason, not a 204.
- **Actual:** `204` and no write, for **every** code. `DELETE` is likewise a no-op.

## Evidence — the two halves that make it conclusive

**Control (the entity layer is fine).** `PUT /api/carts` with the full cart body and `coupons: ["<code>"]` → **200**, and the re-read returns `coupons: ["<code>"]`, `coupon: "<code>"`. Setting it back to `[]` via `PUT` also works. So persistence, schema and DB mapping all support coupons — only the dedicated endpoint no-ops.

**Both directions are dead.** Against the cart the control had just populated:

| call | status | `coupons` after |
|---|---|---|
| `POST …/coupons/{validCode}` (empty cart state) | 204 | `[]` |
| `POST …/coupons/{nonexistentCode}` | 204 | `[]` |
| `PUT /api/carts` with `coupons:[code]` *(control)* | 200 | `["<code>"]` |
| `DELETE …/coupons/{code}` | 204 | `["<code>"]` — unchanged |
| `POST …/coupons/{code}` again | 204 | `["<code>"]` — unchanged |

A **nonexistent** code also returns 204, so the endpoint never reports a bad code either — it is not silently validating, it is not running.

Codes used: `@td(COUPON_10PCT.code)` (active, public, unlimited uses) and a literal never-seeded string. Note `SAVE10`/`SAVE20` have never existed on any environment — do not use them to probe this.

## Root cause
`vc-module-cart`. The controller writes the **legacy scalar**, the entity persists the **collection**, and the collection unconditionally wins.

- `CartModuleController.AddCartCoupon` → `cartBuilder.TakeCart(cart).AddCoupon(code).SaveAsync()`
- `ShoppingCartBuilder.AddCoupon(code)` → `Cart.Coupon = couponCode;` *(scalar only — never touches `Cart.Coupons`)*
- `ShoppingCart.Coupons` getter falls back to `Coupon` **only when the backing `_coupons` is null**
- `ShoppingCartEntity.ToModel()` always sets `model.Coupons = Coupons.Select(x => x.Code).ToList()` — so a cart loaded from the DB always has a non-null `_coupons`, even when empty
- `ShoppingCartEntity.FromModel()` writes `Coupons` from `model.Coupon` first, then **overwrites** it from `model.Coupons` — the already-materialised (empty) list

The controller always loads the cart from the DB before mutating it, so the backwards-compat scalar path is unreachable on save. `RemoveCoupon()` sets `Cart.Coupon = null` and is dropped the same way — which is why `DELETE` cannot clear what `PUT` wrote. `RemoveCartCoupon` additionally ignores its own `couponCode` argument entirely (`RemoveCoupon()` takes no parameter), a separate contract smell in the same route.

## Impact
Any integration driving carts through platform REST — ERP/CPQ connectors, order-import tooling, admin-side cart repair, `API-021` itself — believes it applied a discount and did not. Discount loss is silent on both sides of the wire. The storefront is unaffected: it uses the xAPI mutations, not this route.

**Discovered by a fix.** `API-021` previously failed on a hardcoded nonexistent coupon plus an over-strict status assertion. Replacing the literal with `@td(COUPON_10PCT.code)` and accepting 204 removed a *vacuous* failure and exposed this. Not covered by any existing draft — the open coupon reports (`BUG-coupon-invalid-replacement-drops-working-coupon-VCST-5518`, `BUG-invalid-coupon-removes-valid-coupon`) are storefront/xAPI `RemoveCoupon`-before-`ValidateCoupon` defects, a different layer and root cause.

## Fix Routing
**Repo:** `VirtoCommerce/vc-module-cart`
**Anchor:** `src/VirtoCommerce.CartModule.Data/Services/ShoppingCartBuilder.cs` — `AddCoupon` / `RemoveCoupon` must mutate `Cart.Coupons` (the collection the entity actually persists), not just the legacy `Cart.Coupon` scalar. Also give `RemoveCoupon` its `couponCode` argument so the route's path parameter means something.
