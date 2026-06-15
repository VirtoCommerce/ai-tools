# BUG — All coupon redemption broken on the VCST-5101 build (`validateCoupon` returns false for every coupon)

## Disposition: REJECTED — NOT A BUG (by-design exclusive promotion + cross-env A/B confound) · 2026-06-12

**Re-classified from High/Release-blocker → not-a-bug after live re-test on the same VCST-5101 build.** The symptom is not a coupon-evaluation regression; it is an **exclusive automatic promotion suppressing all other promotions on small carts**, present only in vcst-qa's promotion *data*.

- **Real cause:** promotion **`[E2E Test] Cart subtotal specific discount`** (Marketing API, vcst-qa): `isExclusive: true`, condition `ConditionCartSubtotalLeast { subTotal: 1000, compareCondition: "IsLessThanOrEqual" }`, customer `ConditionIsEveryone`, reward `$10`, active. An **exclusive** promotion, when it matches, suppresses every other promotion — including all coupon-backed ones — so `validateCoupon` returns `false` for **every** coupon while "only the automatic discount applies" (that automatic discount *is* this exclusive $10 promo). This is the exact reported signature.
- **Threshold A/B on the SAME build (XCart 3.1019/3.1020-pr-123, vcst-qa), same env:** coupons FAIL on carts ≤ $1000 ($232, $549 → `validateCoupon:false` for all) and WORK on carts > $1000 ($5,337 / $7,518 / $13,755 → `QA`, `agent1`, `FriDAY`, VALID-class all apply with `validateCoupon:true` and correct discounts). The only discriminator is the $1000 threshold, matching the exclusive promo's condition — **not** the build. (Verified during VCST-5233 G6 verification, 2026-06-12.)
- **Why the original A/B misattributed it:** the "decisive A/B" compared **two different environments** (vcptcore-qa vs vcst-qa), which have different promotion data. The `[E2E Test]` exclusive promo lives on vcst-qa, not vcptcore-qa — so the changed variable was env data + small test carts, not the VCST-5101 / PR #120 mixed-currency code. Cross-env confound.
- **Consequences corrected:** VCST-5101 / PR #120 is NOT implicated; **VCST-5233 is NOT blocked** (verified live on a >$1000 cart — see `reports/bugs/fixed/BUG-account-coupons-copy-uppercases-code-rejected-on-apply.md`).
- **Test-data note:** keep coupon regression carts above $1000 (or disable / scope this exclusive promo) so coupon behaviour stays observable. No JIRA ticket was filed for this report; no further action required beyond the test-data hygiene note.

> Original report retained below for the record.

---

**Severity:** ~~High / Release-blocker~~ → **Rejected (not a bug)** — see Disposition above.

**Env:** vcst-qa @ Platform `3.1035.0`, **XCart `3.1019.0-pr-123-fcd6` (VCST-5101)**, Cart `3.1005.0-pr-188`, Marketing `3.1005.0-pr-268`, MarketingExperienceApi `3.1003.0`

## Summary
On the VCST-5101 (mixed-currency) build, the storefront `validateCoupon` query returns `false` for **every** coupon code, so no coupon applies a discount ("This code is not valid"). **Automatic** catalog promotions are unaffected. The same coupons apply normally on a pre-VCST-5101 build, so this is a regression in the VCST-5101 promotion-evaluation path — not env data, not the platform, not the storefront.

## Steps to Reproduce
1. vcst-qa storefront, signed-in or guest, add item(s) to cart (subtotal > 0; items are `selectedForCheckout`, currency USD = cart USD).
2. On `/cart`, apply any active coupon — tried `VALID10` (10% cart), `SUPER` (20% cart), `agent`/`lowercase` (25% cart), `air1` (10% shipping).
3. Each → `POST /graphql ValidateCoupon` returns **HTTP 200 `{"data":{"validateCoupon":false}}`**, UI shows "This code is not valid", total unchanged.

## Expected vs Actual
- **Expected:** valid coupons apply their discount (as they do on the pre-VCST-5101 stack).
- **Actual:** every coupon rejected; only automatic catalog discounts apply.

## Decisive A/B (same store/catalog shape, both envs have working automatic discounts)
| Coupon | vcptcore-qa — XCart `3.1017.0` (pre-VCST-5101) | vcst-qa — XCart `3.1019.0-pr-123` (VCST-5101) |
|---|---|---|
| `VALID10` (10%) | ✅ `validateCoupon:true`, −10% applied | ❌ `false` |
| `SUPER` (20%) | ✅ `true`, −20% applied | ❌ `false` |
| lowercase `super`/`agent` | ❌ `false` (case-sensitive, pre-fix) | ❌ `false` |
| Automatic catalog discount | ✅ works | ✅ works |

→ Coupons work on the pre-VCST-5101 release stack and fail uniformly on the VCST-5101 stack.

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| Storefront | PASS (not cause) | Happens at the GraphQL/API layer; same theme behavior |
| GraphQL xAPI / Cart | **FAIL (root cause)** | `validateCoupon` 200+`false` for all coupons; automatic rewards still produced |
| Marketing promotion engine | PASS | `vc-module-marketing` `CouponSearchService`/`DynamicPromotion` untouched by any deployed PR (Marketing pr-268 is Admin-SPA `ng-pattern` only) |
| Platform / data | PASS | Pre-VCST-5101 env with same data shape works |

## Root Cause (analysis — needs backend repro to pin the exact line)
Coupon-backed promotions require a found+valid coupon (`validCoupons.Count > 0`); automatic promotions don't. The symptom (automatic OK, **all** coupon rewards fail) means VCST-5101 broke the coupon branch of promotion evaluation. VCST-5101 / **PR #120** modified `src/VirtoCommerce.XCart.Data/Mapping/CartMappingProfile.cs` — the `CartAggregate → PromotionEvaluationContext` mapper that feeds coupons (`promoEvalcontext.Coupons`, L229) and per-currency line items (`CartCurrencySelectedLineItems`, L214) to the engine — plus `CartAggregate.cs`. Verified live that line items are selected + currency-matched (so the `HasSelectedLineItems` gate is satisfied) and coupons are mapped, yet no coupon reward is produced — the defect is in how VCST-5101 builds/scopes the eval context for the coupon path.

## Fix Routing
- **Owning layer:** Layer 3 — xAPI / Cart
- **Suggested repo:** VirtoCommerce/vc-module-x-cart · **repoKind:** module
- **RCA anchor:** VCST-5101 / PR #120 changes to `CartMappingProfile.cs` + `CartAggregate.cs` (promotion-eval-context build for the coupon branch)
- **Routing confidence:** HIGH (build attribution); exact line MEDIUM (needs backend repro)
- **NOT auto-fix eligible** — complex regression inside a large feature (mixed-currency); hand to the VCST-5101 author (ksavosteev) / backend team. (`/qa-fix` would G0-BAIL.)

## Relationships
- **Caused by:** VCST-5101 (mixed-currency line items; PR #120, merged to `dev` 2026-06-11)
- **Blocks:** VCST-5233 (coupon case-insensitivity fix — correct + deployed + CI green, but un-verifiable live until coupon redemption works)
