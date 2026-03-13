# BUG: Applying coupon silently replaces better automatic discount

| Field | Value |
|-------|-------|
| **ID** | BUG-UI-coupon-replaces-better-discount |
| **Severity** | P2 / Medium |
| **Type** | UI Bug |
| **Component** | Storefront Cart / Promotions |
| **Found** | 2026-03-13 (Exploratory session SBTM-PROMO-2026-03-13) |
| **Environment** | QA — vcst-qa-storefront.govirto.com |
| **Build** | Storefront v2.44.0-pr-2198-6327 / Platform v3.1007.0 |
| **Browser** | Firefox (Playwright MCP) |
| **Reproducibility** | 100% |

---

## Summary

When a customer applies a coupon code, the storefront silently replaces a larger auto-applied cart subtotal discount with the smaller coupon discount. No warning or confirmation is shown. The customer's total **increases** after applying a "discount" coupon.

---

## Steps to Reproduce

1. Login to storefront (vcst-qa-storefront.govirto.com)
2. Add items to cart with subtotal > $50 (e.g., $1,220.00)
3. Observe auto-applied discount: **-$122.02** ("Take 10% off for cart subtotal") → Total: **$1,317.58**
4. Enter coupon code `E2E-COUPON` ($5 fixed dollar off) and click Apply
5. Observe discount changes to: **-$5.02** → Total: **$1,457.98**

## Expected Result

- A warning is displayed before replacing a better discount, e.g.: *"Applying this coupon will replace your current discount of $122.00. Your new discount will be $5.00. Continue?"*
- OR both discounts stack (both are configured as "Valid with other offers")

## Actual Result

- The $122 automatic discount is silently removed and replaced by the $5 coupon
- Customer pays **$140.40 MORE** after applying a "discount" coupon
- No warning, no confirmation, no indication that the previous discount was removed

---

## Root Cause

**`BestRewardPromotionPolicy.cs` lines 79-80** in `vc-module-marketing`:

```csharp
var cartSubtotalReward = cartSubtotalRewards
    .FirstOrDefault(x => !x.Coupon.IsNullOrEmpty())   // coupon ALWAYS preferred
    ?? cartSubtotalRewards.FirstOrDefault();            // automatic only if no coupon
```

The policy explicitly prefers coupon-backed `CartSubtotalReward` over automatic rewards **regardless of discount amount**. This is by design in the engine — the UI bug is that the storefront provides no warning to the customer.

---

## API Evidence

**Before coupon:**
```json
{ "discountTotal": 122.02, "total": 1317.58,
  "discounts": [{ "description": "Take 10% off...", "amount": 121.998, "coupon": null }] }
```

**After coupon:**
```json
{ "discountTotal": 5.02, "total": 1457.98,
  "discounts": [{ "description": "E2E test coupon — $5 fixed dollar off cart", "amount": 5.00, "coupon": "E2E-COUPON" }] }
```

The 10% discount is completely absent from the API response — server-side removal, not a UI rendering issue.

---

## Impact

| Factor | Assessment |
|--------|------------|
| Revenue | Customer loses $122 discount, pays $140.40 more |
| Trust | Applying a coupon that increases total is counter-intuitive |
| Scope | Any cart with auto-applied coupon-backed promotion + BestRewardPromotionPolicy |
| Workaround | Customer must NOT enter any coupon to keep the better discount |

---

## Acceptance Criteria

1. When applying a coupon would result in a higher total than the current automatic discount, show a warning dialog before proceeding
2. OR display both discounts so the customer can compare before confirming
3. Document `BestRewardPromotionPolicy` coupon preference behavior in admin promotion configuration

---

## Evidence

- Full report: `reports/exploratory/SBTM-promotions-2026-03-13.md`
- Screenshots: `test-results/firefox/invest-05-cart-with-coupon.png`, `invest-06-cart-no-coupon-baseline.png`
- API data: `test-results/firefox/invest-api-comparison.json`

---

## Labels

`promotions` `pricing` `ux` `coupon-stacking` `revenue-impact`
