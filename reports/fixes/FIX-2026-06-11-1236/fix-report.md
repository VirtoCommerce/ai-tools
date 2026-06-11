# FIX-2026-06-11-1236 — VCST-5233

**Bug:** Cart rejects coupons whose stored case differs from the entered case ("This code is not valid").
**Repo:** VirtoCommerce/vc-module-x-cart (kind: module) · **Branch:** `claude/qa-autofix/VCST-5233` · **Base:** `dev`
**PR:** https://github.com/VirtoCommerce/vc-module-x-cart/pull/123 — *open, not merged*
**Commit:** `b3693555` (author *Elena Mutykova* + Claude co-author; CLA ✅)

## Re-route (key finding)
Originally filed against `vc-frontend` (`coupon-item.vue` uppercasing). Backend source trace showed the
real root cause is in **`vc-module-x-cart`**: the promotion engine + DB already match coupons
case-insensitively (SQL `*_CI_AS`) and `DynamicPromotion` stamps the reward with the stored canonical
code, but the cart re-checked the entered code **ordinally**. The frontend uppercasing only made it
trivial to hit (manual entry of a differently-cased code fails too). Ticket re-routed; frontend
uppercasing downgraded to optional cosmetic follow-up.

## Fix
`src/VirtoCommerce.XCart.Core/CartAggregate.cs` — 2 comparison sites, reusing the file's existing
`EqualsIgnoreCase` helper (already used by `AddCouponAsync`/`RemoveCouponAsync`):
- `Coupons` getter (~L130): `allAppliedCoupons.Contains(coupon)` → `allAppliedCoupons.Any(c => c.EqualsIgnoreCase(coupon))`
- `ValidateCouponAsync` (~L1008): `x.Coupon == coupon` → `x.Coupon.EqualsIgnoreCase(coupon)`

No public signature / DTO / GraphQL / DB / migration change. Marketing module untouched. BL preserved.

## Gates
| Gate | Result |
|------|--------|
| G0 eligibility | PASS — simple, low-risk, localized, non-breaking |
| G1 single repo | PASS — vc-module-x-cart (module) |
| G2 reproduce RED | PASS — 2 new xUnit tests fail on current code |
| G3 fix GREEN | PASS — 203/203 tests, pre-existing unmodified |
| G4 review | APPROVE (backend-reviewer, HIGH) |
| G5 CI | PASS — ci, SonarCloud QG, auto-tests (mysql/postgres/sqlserver), CLA |
| G6 E2E | DEFERRED — backend static-only; closes post-deploy via /qa-verify-fix |
| G7 human review | OPEN PR, not merged |

## Tests added
`tests/VirtoCommerce.XCart.Tests/Aggregates/CartAggregateTests.cs`:
`ValidateCouponAsync_CaseInsensitiveMatch_CouponValidated`, `Coupons_CaseInsensitiveMatch_ReportsAppliedSuccessfully`

## Next
Human review + merge → deploy to QA → `/qa-verify-fix VCST-5233` (live storefront re-confirm + G6).
