# OBS-2 Investigation: Coupon-Based Promotion Replaces Automatic Promotions

**Date:** 2026-03-12
**Investigator:** qa-testing-expert (playwright-firefox)
**Environment:** QA (vcst-qa-storefront.govirto.com / vcst-qa.govirto.com)
**Severity:** P1 (High) -- potential revenue loss due to silent discount downgrade
**Status:** Confirmed behavior -- requires product decision

---

## 1. Executive Summary

When a customer applies a coupon code, the Virto Commerce promotion engine **replaces** all automatic (non-coupon) promotions with the coupon-based promotion, even when:
- All promotions are configured as "Valid with other offers" (non-exclusive)
- The coupon discount is **worse** than the automatic discount being replaced
- No warning is shown to the customer about the discount change

This is a **silent discount downgrade** that can cause customers to pay MORE after applying a coupon they expected would save them money.

---

## 2. Promotion Configuration (from Admin SPA)

| Promotion | Type | Exclusivity | Reward | Conditions |
|-----------|------|-------------|--------|------------|
| Cart more than $1000 | Automatic (no coupon) | Valid with other offers | 10% off subtotal, max $1000 cap | Subtotal >= $1000, Everyone + VIP group |
| 20% OFF (SUPER coupon) | Coupon-based | Valid with other offers | 20% off subtotal, no cap | Everyone, no conditions |
| QA COUPON TOP | Coupon-based | Valid with other offers | $20 flat off subtotal | Everyone, no conditions |

**Key finding:** All three promotions have Exclusivity = "Valid with other offers". The Admin SPA setting suggests they SHOULD stack, but they do NOT.

---

## 3. Test Scenarios and Results

### Test Cart
- Product: OREO COOKIES ORIGINAL BOX 20X66GR x 100 @ $10.20
- Subtotal: $1,020.00

### Scenario Matrix

| State | Discount | Tax | Shipping | Total | Active Promotion |
|-------|----------|-----|----------|-------|-----------------|
| **Baseline (no coupon)** | -$102.00 (10%) | +$183.60 | $0.00 | $1,101.60 | "Take 10% off for cart subtotal no more than $1000" |
| **SUPER coupon applied** | -$204.00 (20%) | +$163.20 | $0.00 | $979.20 | "Super 20% discount for exclusivity and priority testing" |
| **QA coupon applied** | -$20.00 (flat) | +$200.00 | $0.00 | $1,200.00 | "top 20 $" |
| **Coupon removed** | -$102.00 (10%) | +$183.60 | $0.00 | $1,101.60 | Auto promo restored |

### Key Observations

1. **Replacement, not stacking:** Applying ANY coupon drops ALL automatic promotions. Only the coupon-based promotion applies.
2. **No "best deal" logic:** The engine does not compare coupon vs auto discount to pick the better one. It always replaces.
3. **QA coupon causes WORSE deal:** Applying QA coupon ($20 off) replaces auto promo ($102 off), making the customer pay **$98.40 MORE** ($1,200 vs $1,101.60).
4. **SUPER coupon gives BETTER deal:** SUPER coupon ($204 off) is better than auto promo ($102 off), so replacement is acceptable here -- but only by coincidence.
5. **Removal restores auto promo:** Removing the coupon always restores the automatic promotion correctly.
6. **BL-CHK-006 PASS:** Order total formula (subtotal - discounts + shipping + tax = total) is mathematically correct in all states.

---

## 4. GraphQL API Analysis

### AddCoupon Mutation Response (SUPER coupon)

```json
{
  "discounts": [
    {
      "description": "Super 20% discount for exclusivity and priority testing",
      "amount": 204,
      "coupon": "SUPER"
    }
  ],
  "coupons": [
    {
      "code": "SUPER",
      "isAppliedSuccessfully": true
    }
  ],
  "validationErrors": [],
  "discountTotal": { "amount": 204 },
  "total": { "amount": 979.2 }
}
```

### API-Level Findings

- **Single discount returned:** The `discounts` array contains ONLY the coupon-based discount. The automatic promo is completely absent.
- **No validation errors:** `validationErrors` is empty -- no warning that an automatic promo was dropped.
- **No promotion metadata:** The cart response does not include fields like `isExclusive`, `priority`, `combinable`, or `replacedPromotions` that would explain the replacement logic.
- **Server-side decision:** The replacement happens in the promotion evaluation engine on the server, not in the frontend.

---

## 5. UX Impact Assessment

### Customer Impact (P0 UX Issue)

| Scenario | Customer Expectation | Actual Result | Impact |
|----------|---------------------|---------------|--------|
| Apply worse coupon ($20) | "I'll save $20 on top of my existing $102 discount" | Loses $102 auto discount, gets only $20 off. Pays $98.40 MORE. | **Revenue loss for customer, trust violation** |
| Apply better coupon (20%) | "I'll get a better deal" | Gets $204 off (good), but loses $102 auto discount silently | Acceptable outcome, but process is opaque |

### Missing UX Safeguards

1. **No pre-application warning:** The system does not warn "Applying this coupon will remove your current $102 discount"
2. **No comparison display:** No side-by-side showing "Current discount: $102 vs Coupon discount: $20"
3. **No "worse deal" prevention:** The system allows applying a coupon that makes the total HIGHER
4. **No notification on replacement:** After applying, no toast/alert says "Your automatic discount was replaced"
5. **"Something went wrong" error:** When applying QA coupon, an error message "Something went wrong. Please try again later." appeared in addition to the discount downgrade -- suggesting a secondary issue

---

## 6. Root Cause Analysis

### Hypothesis: Promotion Engine Evaluation Order

The Virto Commerce promotion engine appears to follow this logic:
1. When no coupon is applied: evaluate all automatic promotions, apply matching ones
2. When a coupon is applied: evaluate ONLY coupon-based promotions, drop ALL automatic promotions
3. The "Valid with other offers" exclusivity setting appears to control stacking between promotions of the SAME type (coupon+coupon or auto+auto), NOT between coupon and auto promotions
4. This is likely by-design in the VC Marketing module's `BestRewardPromotionPolicy` or similar policy class

### Evidence Supporting This Hypothesis
- All three promotions are "Valid with other offers" yet don't stack across types
- The behavior is consistent: ANY coupon replaces ALL auto promos
- The server returns clean data with no errors -- this is intentional engine behavior

---

## 7. Recommendations

### P0 -- Immediate (UX Safeguard)
1. **Add a pre-application warning** when applying a coupon would result in a higher total: "Warning: Applying this coupon will remove your current discount of $102.00. Your new discount will be $20.00. Continue?"
2. **Block worse-deal coupons** or at minimum require explicit confirmation

### P1 -- Short Term (Product Decision)
3. **Clarify the exclusivity model:** If coupon vs. auto mutual exclusion is by-design, document it. If not, fix the stacking logic.
4. **Add promotion metadata to API:** Include `replacedPromotions`, `isExclusive`, `combinableWith` in the cart GraphQL response so the frontend can build better UX.

### P2 -- Long Term (Engine Enhancement)
5. **Implement "best deal" logic:** Automatically apply whichever combination (auto, coupon, or both) gives the customer the lowest total.
6. **Support true stacking:** If "Valid with other offers" means stackable, make it work across coupon and auto promotion types.

---

## 8. Evidence Index

| File | Description |
|------|-------------|
| `screenshots/obs2-investigation/admin-marketing-blade.png` | Admin promotions list page 1 |
| `screenshots/obs2-investigation/admin-promotions-page2.png` | Admin promotions list page 2 |
| `screenshots/obs2-investigation/admin-cart-more-1000-promo.png` | "Cart more than $1000" promotion config |
| `screenshots/obs2-investigation/admin-qa-coupon-top-config.png` | "QA COUPON TOP" promotion config |
| `screenshots/obs2-investigation/baseline-cart-auto-discount.png` | Cart with auto promo: -$102, total $1,101.60 |
| `screenshots/obs2-investigation/super-coupon-applied-cart.png` | Cart with SUPER coupon: -$204, total $979.20 |
| `screenshots/obs2-investigation/super-coupon-discount-breakdown.png` | Discount breakdown showing only SUPER promo |
| `screenshots/obs2-investigation/coupon-removed-auto-restored.png` | Cart after coupon removal: auto promo restored |
| `screenshots/obs2-investigation/qa-coupon-worse-deal-no-warning.png` | **KEY:** QA coupon causes WORSE deal: -$20, total $1,200 |

---

## 9. Sign-Off

**Investigation Result:** CONFIRMED -- Coupon application replaces automatic promotions without stacking, regardless of exclusivity settings. No customer-facing warning exists for worse-deal scenarios.

**Recommended JIRA Actions:**
- Create P1 bug: "Coupon application silently drops better automatic discount without warning"
- Create P2 enhancement: "Add promotion stacking support across coupon and automatic promotion types"
- Link to OBS-2 in SBTM session report

**Tested by:** qa-testing-expert | **Date:** 2026-03-12 | **Browser:** Firefox (playwright-firefox)
