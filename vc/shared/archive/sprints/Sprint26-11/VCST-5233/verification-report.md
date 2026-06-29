# VCST-5233 — Coupon case-insensitivity fix — G6 live verification

**Verdict: VERIFIED_WITH_NOTES — fix confirmed via the `QA` coupon path (2026-06-12).**

The fix is proven by the working "Simple QA Coupon" (`QA`, stored UPPERCASE) on a fresh account — NOT the broken "Agent Case Test" promotion from the first attempt. Lowercase/mixed/exact casings all apply identically; the loosened compare (`EqualsIgnoreCase`) works.

**Env:** vcst-qa-storefront.govirto.com, storeId `B2B-store`; storefront Ver. 2.51.0-pr-2325; backend **VirtoCommerce.XCart 3.1020.0-pr-123-f160 confirmed installed** (the fix PR #123). Browser: playwright-chrome.
**Fresh user:** `agent-test-vcst5233-kli53i@yopmail.com` (registered this session; userId 2ef9ed7d…; personal account).
**Coupon under test:** `QA` ("Simple QA Coupon", 5% off cart subtotal, stored UPPERCASE, active, exp 2026-12-31, unlimited, non-exclusive).

## STR result: 3/3 PASS (each from a fresh removeCart→new cartId, HP M577z so subtotal > $1000)
| Run | Entered | Stored | Result | Discount | Applied state |
|-----|---------|--------|--------|----------|---------------|
| 1 | `qa` (lowercase) | `QA` | **PASS** — no "not valid"; discount applied | −$266.89 | "Remove coupon" (applied) |
| 2 | `Qa` (mixed) | `QA` | **PASS** | −$266.89 | "Remove coupon" (applied) |
| 3 | `QA` (exact) | `QA` | **PASS** (baseline control) | −$266.89 | "Remove coupon" (applied) |

Cart: 1× HP Color LaserJet Enterprise Flow MFP M577z, **subtotal $5,337.84**. Pre-coupon baseline discount −$533.78 (auto promo only), total $5,764.87. **With `QA` coupon (any casing): discount −$266.89, total $6,085.14** — identical across all three casings.

## Checklist
| # | Item | Result | Evidence |
|---|------|--------|----------|
| STR | lowercase `qa` applies discount (prev. failing) | **PASS 3/3** | Run table above; screenshot `VCST-5233-qa-lowercase-applied-top.png` |
| Baseline | exact `QA` applies | **PASS** | Run 3, −$266.89 |
| **Case-equivalence (core)** | `qa`/`QA`/`Qa`/`qA` all apply, IDENTICAL discount | **PASS** | UI: `qa`,`Qa`,`QA` → all −$266.89 / total $6,085.14. GraphQL: all four casings `validateCoupon:true`, `isAppliedSuccessfully:true`, identical totals |
| Negative control | invalid `NOPE123` still rejected | **PASS** | UI alert "This code is not valid", Apply disabled, discount unchanged −$533.78 |
| Network (validateCoupon=true / addCoupon applied) | **PASS** | see below |
| Console: no new errors / no GraphQL `errors[]` | **PASS** | 0 console errors across the coupon session (2 benign warnings only) |
| BL-CART-003 (discount math consistent) | **PASS** | Same coupon → same discount regardless of casing |
| BL-CART-009 (applied flag; no phantom/dup; remove clears) | **PASS** | "Remove coupon" applied state; removing reverted discount to −$533.78 / total $5,764.87, no leftover entry |

## Network evidence (load-bearing fields, fresh user, cart > $1000)
- `validateCoupon(coupon: "qa"|"QA"|"Qa"|"qA", storeId:"B2B-store")` → **`true`** for all four casings (HTTP 200, no `errors[]`).
- `addCoupon(couponCode: each casing)` → `coupons:[{code, isAppliedSuccessfully:true}]`, `discountTotal 266.89`, `total 6085.14` — identical for all four.
- `validateCoupon("NOPE123")` → **`false`**; `addCoupon("NOPE123")` → `isAppliedSuccessfully:false`, no discount.

## Note — why the cart must exceed $1000 (and why the first attempt was BLOCKED)
The store has an **exclusive** automatic promotion **"[E2E Test] Cart subtotal specific discount"** (`isExclusive:true`, condition `cart subtotal ≤ $1000`, $10/item). On any cart ≤ $1000 it suppresses ALL coupon promotions → `validateCoupon` returns false for every code (incl. exact case). This is the same store-wide engine state that made the first attempt (Agent Case Test, ~$200 cart) BLOCKED — it was never the fix. Using a >$1000 cart removes the exclusive promo and lets the `QA` coupon evaluate normally, which is where the case-insensitivity behaviour is observable and PASSES.

## Recommendation
**Mark VCST-5233 VERIFIED (with note).** The deployed XCart 3.1020.0-pr-123-f160 applies coupons case-insensitively: lowercase/mixed `qa`/`Qa` apply identically to exact `QA`, while a genuinely invalid code is still rejected. Note for the test-data owner: the exclusive "[E2E Test] Cart subtotal specific discount" promo masks coupon behaviour on sub-$1000 carts — keep coupon regression carts above $1000 (or disable that exclusive promo) so coupon cases are observable.

## Evidence files (screenshots/)
- `VCST-5233-qa-lowercase-applied-top.png` — lowercase `qa` applied: cart subtotal $5,337.84, Discount −$266.89, Total $6,085.14 (the previously-failing entered-case≠stored-case scenario, now passing).
- `VCST-5233-qa-lowercase-applied.png` — Custom-code panel showing `qa` with green applied check + remove control.
