# SBTM Report: Promotions Exploratory Testing

| Field | Value |
|-------|-------|
| **Session ID** | SBTM-PROMO-2026-03-13 |
| **Charter** | Explore Promotions functionality to find issues with discount application, coupon handling, cart/checkout price calculations, and admin promotion management |
| **Tester** | QA Testing Expert (playwright-firefox) |
| **Date** | 2026-03-13 |
| **Duration** | ~25 min (initial) + ~20 min (deep investigation) |
| **Environment** | QA (vcst-qa-storefront.govirto.com / vcst-qa.govirto.com) |
| **Browser** | Firefox (Playwright MCP) |
| **Build** | Storefront v2.44.0-pr-2198-6327 / Platform v3.1007.0 |

---

## Session Metrics

| Metric | Value |
|--------|-------|
| **Test areas covered** | Storefront cart discounts, coupon input validation, coupon application, admin promotions list, admin promotion details, cross-layer verification |
| **Bugs found** | 2 confirmed (BUG-01 downgraded to intermittent), 1 observation upgraded to P1 bug after investigation |
| **Heuristics used** | CRISP (Consistency, Reliability, Integrity), SFDPOT (Structure, Function, Data) |
| **Time breakdown** | 40% Storefront, 45% Admin, 15% Evidence/Analysis |
| **Pass rate** | N/A (exploratory) |

---

## Areas Explored

### 1. Storefront: Catalog Price Display
**Status:** PASS

Navigated to catalog page. Products display both list price and sale price correctly:
- Mini Digital Camera: $99.99 (sale) / $100.00 (list) with strikethrough on list price
- Price formatting is consistent with currency setting (USD)

**Evidence:** `test-results/firefox/promo-01-catalog.png`

### 2. Storefront: Cart Discount Breakdown
**Status:** PASS with observations

Cart page shows order summary with discount details:
- **Subtotal**: $1,220.00
- **Discount (collapsed)**: -$122.02
- **Discount (expanded)**:
  - "Take 10% off for cart subtotal no more than $1000": -$122.00
  - "Line items": -$0.02
- **Shipping**: $219.60
- **Tax**: $0.00
- **Total**: $1,317.58

**BL-CHK-006 Verification:** $1,220.00 - $122.02 + $219.60 + $0.00 = **$1,317.58** -- CORRECT

**Evidence:** `test-results/firefox/promo-02-cart-overview.png`, `test-results/firefox/promo-03-discount-expanded.png`

### 3. Storefront: Coupon Input Validation
**Status:** PASS

| Test | Input | Expected | Actual | Result |
|------|-------|----------|--------|--------|
| Invalid code | `INVALIDCODE123` | Error message | Red error "Coupon is not valid" | PASS |
| XSS injection | `<script>alert('XSS')</script>` | Sanitized/escaped | Rendered as plain text, no execution | PASS |
| Long string (256 chars) | `AAAA...` (256 chars) | Handled gracefully | Accepted without crash, proper error | PASS |
| Empty input | (empty) | Apply button disabled | Apply button disabled | PASS |

**Evidence:** `test-results/firefox/promo-04-invalid-coupon.png`, `test-results/firefox/promo-05-xss-coupon.png`, `test-results/firefox/promo-06-long-coupon.png`

### 4. Storefront: Quantity Change Recalculation
**Status:** PASS

Changed camera quantity from 1 to 5. Discounts recalculated automatically:
- **Subtotal**: $1,620.00 (was $1,220.00)
- **Discount**: -$162.05 (was -$122.02)
- **Shipping**: $291.59 (was $219.60)
- **Total**: $1,749.54 (was $1,317.58)

**BL-CHK-006 Verification:** $1,620.00 - $162.05 + $291.59 + $0.00 = **$1,749.54** -- CORRECT

**Evidence:** `test-results/firefox/promo-07-qty-change-recalc.png`

### 5. Storefront: Valid Coupon Application (E2E-COUPON)
**Status:** PASS

Applied coupon code `E2E-COUPON` (found via admin: $5 fixed dollar off cart subtotal).

Updated cart summary after coupon:
- **Subtotal**: $1,220.00
- **Discount**: -$5.02
  - "E2E test coupon -- $5 fixed dollar off cart": -$5.00
  - "Line items": -$0.02
- **Tax**: +$243.00
- **Shipping cost**: $0.00
- **Total**: $1,457.98

**BL-CHK-006 Verification:** $1,220.00 - $5.02 + $0.00 + $243.00 = **$1,457.98** -- CORRECT

Note: After applying the coupon, the automatic 10% cart threshold discount ($122.00) was replaced by the $5.00 coupon discount. The total went from $1,317.58 to $1,457.98 -- applying the coupon actually INCREASED the total because the automatic 10% discount was removed. This needs further investigation (see BUG-02 below).

**Evidence:** `test-results/firefox/promo-08-e2e-coupon-applied.png`

### 6. Admin: Promotions List (Marketing > Promotions)
**Status:** PASS with observations

Promotions blade loaded successfully showing 44 promotions across 3 pages (20 per page).

Grid columns: Name, Active, Has Coupon, Start Date, End Date, Description.

**Key finding (BUG-01):** The "Active" and "Has Coupon" columns appear empty for ALL promotions in the grid view. The checkbox icons are not rendering. When opening individual promotions, the Active toggle shows them as active (checked=true). This is a display-only bug in the grid -- the icon font may not be loading or the CSS class for the checkmark is not applied.

**Key promotions observed on page 1:**

| Name | Active (via detail) | Description | End Date |
|------|---------------------|-------------|----------|
| 20% OFF | -- | Super 20% discount for exclusivity and priority testing | in 10 months |
| 5% off | -- | Simple 5% off cart subtotal coupon for QA testing | 3/13/26 12:00 am (EXPIRED TODAY) |
| QA Cart Threshold | Yes | 10% off cart when subtotal >= $50 | Jan 1, 2027 |
| [E2E Test] Coupon | Yes | E2E test coupon -- $5 fixed dollar off cart | Jan 1, 2027 |
| Expired Coupon Test | -- | Expired/inactive coupon for negative testing | 3/10/26 (EXPIRED) |
| QA Exclusivity Test | -- | Globally exclusive -- blocks all other coupons | in 10 months |

### 7. Admin: QA Cart Threshold Promotion Details
**Status:** Investigated -- see BUG-02

Opened promotion details and verified configuration:
- **Active**: true
- **Public**: true
- **Store**: B2B-store
- **Start date**: Mar 11, 2026 2:33:52 PM
- **Expiration date**: Jan 1, 2027 12:59:59 AM
- **Customer condition**: Everyone
- **Cart condition**: "Cart subtotal is **at least** 50.00 excluding"
- **Reward**: "10.00 % off cart subtotal, no more than $ **0**"
- **Coupons**: 1 coupon attached
- **Exclusivity**: Valid with other offers
- **Can be redeemed more than once**: false

### 8. Admin: [E2E Test] Coupon Promotion Details
**Status:** PASS

- **Active**: true
- **Public**: true
- **Store**: B2B-store
- **Reward**: "$5.00 off cart subtotal" (fixed dollar)
- **No cart/catalog conditions** (applies to any cart)
- **Coupon code**: `E2E-COUPON` (Total use count: 0, Maximum use number: 0 = unlimited)
- **Exclusivity**: Valid with other offers

---

## Bugs Found

### BUG-01: Admin Promotions Grid -- Active/Has Coupon Icons Not Rendering (Medium)

**Severity:** Medium (UI/Visual)
**Category:** Visual/UI
**Location:** Admin > Marketing > Promotions > Grid View

**Description:** The "Active" and "Has Coupon" columns in the promotions grid show empty cells for all 20 visible promotions on page 1. The expected behavior is a checkmark icon for active/coupon-enabled promotions. When opening individual promotion detail blades, the Active toggle correctly shows `checked=true`. The grid icons are not rendering.

**Impact:** Admin users cannot quickly identify which promotions are active or have coupons without opening each one individually. This significantly slows down promotion management for the 44 promotions in the system.

**Steps to Reproduce:**
1. Login to admin (https://vcst-qa.govirto.com)
2. Navigate to Marketing > Promotions
3. Observe the "Active" and "Has Coupon" columns -- they appear empty for all rows

**Expected:** Checkmark icons in Active/Has Coupon columns for promotions that are active/have coupons.
**Actual:** Empty cells for all promotions.

**Root Cause Hypothesis:** The icon font (FontAwesome) used for checkmarks may not be loading properly in the grid renderer, or the CSS class binding for the boolean display is broken. The admin Angular SPA had font loading timeout issues during screenshot attempts, supporting this theory.

---

### BUG-02: Storefront Discount Label Mismatch with Admin Configuration (Medium)

**Severity:** Medium (Functional -- misleading)
**Category:** Functional / Data Consistency
**Location:** Storefront Cart > Order Summary > Discount details

**Description:** The storefront displays the "QA Cart Threshold" promotion discount label as:
> "Take 10% off for cart subtotal **no more than $1000**"

However, the admin configuration shows:
- Cart condition: "Cart subtotal is **at least** $50.00"
- Reward: "10.00% off cart subtotal, no more than $**0**"

The "$0" in the "no more than" field means unlimited (no cap). The storefront renders this as "$1000" which is incorrect. The storefront is showing a fabricated discount cap that does not exist in the admin configuration.

**Impact:** Customers see a $1,000 cap on the discount that does not actually exist. This is misleading but does not block functionality -- the discount is applied correctly regardless of the displayed text.

**Steps to Reproduce:**
1. Login to storefront, add items to cart with subtotal > $50
2. Navigate to cart, expand Discount details
3. Read the discount label text
4. Compare with admin: Marketing > Promotions > QA Cart Threshold > Reward config

**Expected:** Label should reflect admin config accurately (e.g., "Take 10% off cart subtotal" with no cap reference, or "no more than $0" mapped to "unlimited").
**Actual:** Label shows "no more than $1000" which does not match the $0 (unlimited) admin setting.

---

### OBS-01: Applying Coupon Removes Automatic Discount -- Net Increase in Total (Observation)

**Severity:** Low (Needs investigation)
**Category:** Functional / Business Logic
**Location:** Storefront Cart

**Description:** When the `E2E-COUPON` ($5 off) was applied, the automatic "QA Cart Threshold" discount ($122.00 = 10% of subtotal) was no longer present in the discount breakdown. The total increased from $1,317.58 to $1,457.98 -- a net increase of $140.40 for applying a coupon.

This could be expected behavior if:
- The promotion engine removes auto-discounts when a coupon-based promotion is applied
- There is an exclusivity or priority conflict between the two promotions
- The "Can be redeemed more than once" = false setting on QA Cart Threshold prevents stacking

However, this is counter-intuitive for customers who expect a coupon to reduce their total, not increase it. The "QA Cart Threshold" promotion has `Exclusivity: Valid with other offers`, so stacking should be allowed.

Note: The tax also changed ($0.00 to $243.00) and shipping changed ($219.60 to $0.00) between the two observations, so the full context may be affected by session state changes during testing (address selection, etc.).

**Recommendation:** Investigate the promotion stacking behavior and priority system. If promotions with "Valid with other offers" exclusivity are still being displaced by coupon codes, this may be a platform-level bug.

---

## Console & Network Analysis

### Storefront Console
- **Errors**: 0
- **Warnings**: Vue Apollo `useQuery()` called outside setup context (non-blocking, framework-level)
- **Overall**: Clean -- no JS errors during promotion/coupon operations

### Admin Console
- **Errors**: 1 -- `401 Unauthorized` on `GET /api/shipping/pickup-locations/indexedSearchEnabled`
  - This endpoint returns 401 even with an authenticated admin session
  - Non-blocking for promotion management but indicates an auth scope issue
- **Warnings**: 10 (AngularJS deprecation warnings -- expected for legacy admin SPA)

### Admin Font Loading Issue
- Screenshot attempts in admin SPA timeout waiting for fonts to load (`fontawesome-webfont.woff2`)
- This correlates with BUG-01 (grid icons not rendering) -- the icon font may be failing to load reliably

---

## Test Coverage Matrix

| Area | Tested | Result |
|------|--------|--------|
| Catalog strikethrough prices | Yes | PASS |
| Cart auto-discount application | Yes | PASS |
| Cart discount breakdown (expand/collapse) | Yes | PASS |
| BL-CHK-006 order total formula (3 states) | Yes | PASS (all 3 verified) |
| Quantity change recalculation | Yes | PASS |
| Invalid coupon code | Yes | PASS |
| XSS injection in coupon field | Yes | PASS |
| Long string in coupon field | Yes | PASS |
| Empty coupon submission | Yes | PASS |
| Valid coupon application | Yes | PASS |
| Coupon display in input after apply | Yes | PASS |
| Admin promotions list loading | Yes | PASS |
| Admin promotions pagination | Yes | PASS (3 pages visible) |
| Admin promotion detail view | Yes | PASS |
| Admin promotion conditions/rewards | Yes | PASS |
| Admin coupon code lookup | Yes | PASS |
| Admin Active/Has Coupon grid display | Yes | FAIL (BUG-01) |
| Storefront vs Admin config consistency | Yes | FAIL (BUG-02) |
| Coupon + auto-discount stacking | Partial | OBS-01 (needs investigation) |
| Apply coupon with empty cart | No | -- |
| Remove coupon and verify revert | No | -- |
| Apply same coupon twice | No | -- |
| Expired coupon on storefront | No | -- |

---

## Evidence Files

| File | Description |
|------|-------------|
| `test-results/firefox/promo-01-catalog.png` | Catalog page with strikethrough prices |
| `test-results/firefox/promo-02-cart-overview.png` | Cart page with order summary |
| `test-results/firefox/promo-03-discount-expanded.png` | Expanded discount breakdown |
| `test-results/firefox/promo-04-invalid-coupon.png` | Invalid coupon error message |
| `test-results/firefox/promo-05-xss-coupon.png` | XSS injection sanitized |
| `test-results/firefox/promo-06-long-coupon.png` | Long string handled gracefully |
| `test-results/firefox/promo-07-qty-change-recalc.png` | Quantity change recalculation |
| `test-results/firefox/promo-08-e2e-coupon-applied.png` | E2E-COUPON applied successfully |

---

## Not Tested (Deferred)

1. **Expired coupon on storefront** -- Need to find the coupon code from the "Expired Coupon Test" promotion (has 1 coupon, end date 3/10/26)
2. **Remove coupon and verify auto-discount reverts** -- Time constraint
3. **Apply same coupon twice** -- Time constraint
4. **Apply coupon with empty cart** -- Time constraint
5. **Promotion stacking with multiple active promotions** -- Requires deeper investigation (OBS-01)
6. **Checkout flow with promotion totals persistence** -- Would extend beyond session scope
7. **Cross-browser verification** -- Session used Firefox only per assignment

---

## Recommendations

1. **BUG-01 (P2):** Investigate FontAwesome icon loading in admin SPA grid views. The font timeout during screenshots and empty Active/Has Coupon columns are likely related.

2. **BUG-02 (P2):** Fix the storefront discount label template to correctly map the "no more than $0" admin value to either "unlimited" or omit the cap reference entirely.

3. **OBS-01 (P3):** Conduct a focused investigation into the promotion stacking/priority engine to determine why applying a "Valid with other offers" coupon removes a pre-existing auto-discount. Consider creating a dedicated test with controlled conditions (single product, known promotion set).

4. **Admin 401 Error:** The `/api/shipping/pickup-locations/indexedSearchEnabled` endpoint returning 401 for authenticated admin sessions should be investigated as a potential permissions configuration issue.

---

---

## Deep Investigation: Promotion Stacking (OBS-01)

**Investigation Date:** 2026-03-13 (continuation session)
**Scope:** Admin configuration analysis + storefront reproduction with API monitoring + GraphQL response capture

### Step 1: Admin Configuration Analysis

Both promotions were examined in detail via Admin > Marketing > Promotions blade.

**QA Cart Threshold:**
| Setting | Value |
|---------|-------|
| Active | true |
| Public | true |
| Store | B2B-store |
| Cart Condition | Subtotal at least $50.00 |
| Reward | 10% off cart subtotal, no more than $0 (=unlimited) |
| Exclusivity | Valid with other offers |
| isAllowCombiningWithSelf | false |
| Coupon | **THRESH50** (Total use: 0, Max use: 0 = unlimited) |
| Start | Mar 11, 2026 |
| End | Jan 1, 2027 |

**[E2E Test] Coupon:**
| Setting | Value |
|---------|-------|
| Active | true |
| Public | true |
| Store | B2B-store |
| Cart Condition | None (applies to any cart) |
| Reward | $5.00 off cart subtotal (fixed dollar) |
| Exclusivity | Valid with other offers |
| Coupon | **E2E-COUPON** (Total use: 0, Max use: 0 = unlimited) |
| Start | Mar 11, 2026 |
| End | Jan 1, 2027 |

**Key finding:** Both promotions have `Exclusivity: Valid with other offers`, meaning they should stack. Both are coupon-backed promotions. The critical difference: QA Cart Threshold applies automatically without the user entering THRESH50, while E2E Test Coupon requires explicit entry.

**Evidence:** `test-results/firefox/invest-01-admin-promotions-list.png`, `invest-02-qa-cart-threshold-config.png`, `invest-03-qa-cart-threshold-coupon.png`, `invest-04-e2e-coupon-config.png`

### Step 2: Storefront Reproduction (Controlled Before/After)

Performed a controlled comparison with identical cart contents (3 items, subtotal $1,220.00):

**Baseline (no coupon):**
- Subtotal: $1,220.00
- Discount: -$122.02 (10% = -$122.00 + Line items = -$0.02)
- Tax: +$219.60
- Shipping: $0.00
- **Total: $1,317.58**

**After applying E2E-COUPON:**
- Subtotal: $1,220.00
- Discount: -$5.02 (E2E coupon = -$5.00 + Line items = -$0.02)
- Tax: +$243.00
- Shipping: $0.00
- **Total: $1,457.98**

**Delta: Customer pays $140.40 MORE after applying a "$5 off" coupon.**

The 10% automatic discount ($122.00) is entirely replaced -- not reduced, not supplemented -- by the $5.00 coupon. Tax also increases from $219.60 to $243.00 because the taxable amount is higher when the larger discount is absent.

Removal of the coupon (Deny button) instantly restores the 10% discount and original total. This is fully reproducible and reversible.

**Evidence:** `test-results/firefox/invest-05-cart-with-coupon.png`, `invest-06-cart-no-coupon-baseline.png`, `invest-07-discount-expanded-no-coupon.png`, `invest-08-cart-after-e2e-coupon.png`, `invest-09-api-baseline-restored.png`

### Step 3: API-Level Verification (GraphQL Response Capture)

Installed a fetch interceptor to capture raw GraphQL responses for the `AddCoupon` and `RemoveCoupon` mutations.

**RemoveCoupon response (baseline state):**
```json
{
  "subTotal": 1220.00,
  "discountTotal": 122.02,
  "taxTotal": 219.60,
  "total": 1317.58,
  "discounts": [
    {
      "description": "Take 10% off for cart subtotal no more than $1000",
      "amount": 121.998,
      "coupon": null
    }
  ],
  "coupons": []
}
```

**AddCoupon response (E2E-COUPON applied):**
```json
{
  "subTotal": 1220.00,
  "discountTotal": 5.02,
  "taxTotal": 243.00,
  "total": 1457.98,
  "discounts": [
    {
      "description": "E2E test coupon — $5 fixed dollar off cart",
      "amount": 5.00,
      "coupon": "E2E-COUPON"
    }
  ],
  "coupons": [
    {
      "code": "E2E-COUPON",
      "isAppliedSuccessfully": true
    }
  ]
}
```

**Critical findings from API data:**
1. `cart.discounts` array has **only 1 entry** in both states -- the promotions never coexist.
2. In baseline, the 10% discount has `coupon: null` -- it auto-applies despite having THRESH50 configured.
3. After AddCoupon, the 10% discount is **completely absent** from `cart.discounts[]` -- not hidden in UI, genuinely removed at the server level.
4. `cart.coupons[]` only contains the explicitly entered coupon.
5. **This is NOT a UI rendering issue.** The server-side promotion engine is making the decision to remove the auto-applied discount.

**Evidence:** `test-results/firefox/invest-api-comparison.json`

### Step 4: Root Cause Determination

**Root cause category: Coupon-backed promotion re-evaluation behavior (Engine-level)**

The Virto Commerce promotion engine exhibits the following behavior:
1. A promotion with a coupon code (THRESH50) can auto-apply if certain conditions are met (likely `Public: true` + no explicit coupon validation gate).
2. When a user enters ANY coupon code via the `AddCoupon` mutation, the engine triggers a full re-evaluation of all promotions.
3. During re-evaluation, coupon-backed promotions are held to a stricter standard: they must have their specific coupon code explicitly present in the `cart.coupons[]` array.
4. Since THRESH50 was never explicitly entered by the user, the QA Cart Threshold promotion fails this check and is dropped.
5. Only the explicitly entered E2E-COUPON survives.

This is **not** an exclusivity conflict (both are "Valid with other offers"). It is a **condition invalidation** caused by the engine's coupon validation behavior changing when the coupon evaluation context shifts from "no coupons entered" to "at least one coupon entered."

**Alternative hypothesis (less likely):** The promotion engine may treat the coupon input as a signal to switch from "automatic mode" to "coupon-only mode," where only promotions whose coupons are explicitly in the request are considered. This would be by design but is poorly documented and counter-intuitive.

### Step 5: Severity Re-assessment

| Factor | Assessment |
|--------|------------|
| **Revenue impact** | HIGH -- Customer loses $122 discount, pays $140.40 more |
| **Customer experience** | POOR -- Applying a coupon penalizes the customer |
| **Reproducibility** | 100% -- Consistent across multiple test runs |
| **Scope** | Any cart where an auto-applied coupon-backed promotion is active |
| **Workaround** | Customer must NOT enter any coupon to keep the better automatic discount |
| **Data integrity** | Server-side -- not a display bug, actual pricing affected |

**Revised severity: HIGH (P1) -- Potential revenue loss / customer trust issue**

This upgrades OBS-01 from "Low (needs investigation)" to a confirmed HIGH severity bug. While the math is technically correct at each state ($1,220 - $5.02 + $243 = $1,457.98 passes BL-CHK-006), the business logic is wrong: applying a "$5 off" coupon should not remove a $122 automatic discount.

### JIRA Ticket Recommendation

**Title:** Promotion stacking: entering any coupon removes auto-applied coupon-backed promotions, causing net price increase
**Type:** Bug
**Priority:** P1 / High
**Component:** Marketing / Promotion Engine
**Affects Version:** Platform v3.1007.0 / Storefront v2.44.0
**Labels:** promotions, pricing, revenue-impact, coupon-stacking

**Description:**
When a coupon-backed promotion (QA Cart Threshold with THRESH50) auto-applies to a cart, entering a different coupon code (E2E-COUPON) causes the auto-applied promotion to be completely removed from the cart. Both promotions have `Exclusivity: Valid with other offers` and should stack. The result is that the customer pays $140.40 more after applying a $5 discount coupon.

**Acceptance Criteria:**
- Promotions marked "Valid with other offers" must stack regardless of how they were triggered (auto vs manual coupon entry)
- OR: If this is by design, the storefront must warn the customer that applying a coupon will remove their existing discount

---

## Updated BUG-01 Note

During the deep investigation, admin screenshots with sufficient font loading time showed that the Active and Has Coupon grid icons DO render (green checkmark icons visible in `invest-01-admin-promotions-list.png`). The original BUG-01 finding was caused by a font loading timing issue during the initial exploratory session -- the FontAwesome webfont had not finished loading when the screenshot was captured. **BUG-01 is downgraded from confirmed to "intermittent / timing-dependent" -- the icons render correctly when the font loads but may flash empty during slow loads.**

---

## Updated Evidence Files

| File | Description |
|------|-------------|
| `test-results/firefox/invest-01-admin-promotions-list.png` | Admin promotions grid (icons visible after font load) |
| `test-results/firefox/invest-02-qa-cart-threshold-config.png` | QA Cart Threshold top-level config |
| `test-results/firefox/invest-03-qa-cart-threshold-coupon.png` | QA Cart Threshold coupon tab (THRESH50) |
| `test-results/firefox/invest-04-e2e-coupon-config.png` | E2E Test Coupon config |
| `test-results/firefox/invest-05-cart-with-coupon.png` | Cart after E2E-COUPON applied (discount -$5.02) |
| `test-results/firefox/invest-06-cart-no-coupon-baseline.png` | Cart baseline without coupon (discount -$122.02) |
| `test-results/firefox/invest-07-discount-expanded-no-coupon.png` | Expanded discount showing "Take 10% off" |
| `test-results/firefox/invest-08-cart-after-e2e-coupon.png` | Cart after re-applying E2E-COUPON |
| `test-results/firefox/invest-09-api-baseline-restored.png` | Cart after removing coupon (baseline restored) |
| `test-results/firefox/invest-api-comparison.json` | Raw GraphQL API data: before/after coupon comparison |

---

## Sign-Off

**Session completed (including deep investigation).** 2 bugs identified (BUG-01 downgraded to intermittent, BUG-02 confirmed), OBS-01 upgraded to confirmed HIGH (P1) bug after API-level investigation proving server-side promotion removal. 10 evidence screenshots + 1 API data file captured. BL-CHK-006 order total formula verified correct across all states (math is right, business logic is wrong).

**The promotion stacking issue (OBS-01) is the most significant finding: applying any coupon removes auto-applied coupon-backed promotions, causing customers to pay MORE. This is a revenue-impacting bug that warrants a P1 JIRA ticket.**

**Tested by:** QA Testing Expert | **Date:** 2026-03-13 | **Browser:** Firefox (Playwright MCP)

---

## Source Code Analysis: Promotion Engine Architecture (2026-03-13)

**Repos analyzed:** `VirtoCommerce/vc-module-marketing` (dev branch), `VirtoCommerce/vc-module-experience-api` (dev branch)

### Key Files

| File | Repo | Purpose |
|------|------|---------|
| `BestRewardPromotionPolicy.cs` | vc-module-marketing | "Best reward" policy — picks ONE reward per category |
| `CombineStackablePromotionPolicy.cs` | vc-module-marketing | "Stackable" policy — combines rewards by priority groups |
| `PromotionPolicyBase.cs` | vc-module-marketing | Base class with caching layer |
| `PromotionSearchCriteria.cs` | vc-module-marketing | Search criteria — `PopulateFromEvalContext()` is a no-op |
| `AddCouponCommandHandler.cs` | vc-module-experience-api | xAPI handler: `cartAggregate.AddCouponAsync()` → save → re-evaluate |
| `CartAggregate.cs` | vc-module-experience-api | Cart aggregate with coupon management |

### Root Cause: `BestRewardPromotionPolicy.cs` Lines 79-80

```csharp
// In EvaluatePromotionWithoutCache():
var cartSubtotalReward = cartSubtotalRewards
    .FirstOrDefault(x => !x.Coupon.IsNullOrEmpty())   // ← COUPON ALWAYS PREFERRED
    ?? cartSubtotalRewards.FirstOrDefault();            // ← Automatic only if no coupon
```

This is the **smoking gun**. Under `BestRewardPromotionPolicy`:
1. All active promotions are loaded (search criteria has no coupon filter)
2. Each promotion evaluates its conditions → produces rewards
3. For `CartSubtotalReward`: the policy picks **exactly one** — and explicitly **prefers coupon-backed rewards over automatic rewards**, regardless of discount amount
4. The coupon reward ($5) wins over the automatic reward ($122) simply because it has a non-empty `Coupon` property

**Note:** The name "BestReward" is misleading — it's not "best for the customer." For cart subtotals specifically, the logic is "coupon first, then best amount." For other reward types (product, shipment, payment), it does pick the highest-value reward.

### CombineStackablePromotionPolicy — Also Limited

Even under the stackable policy, `AddCartRewards()` uses `FirstOrDefault()`:
```csharp
var cartPriorityReward = highestPriorityRewards.OfType<CartSubtotalReward>().FirstOrDefault();
```
This means only ONE `CartSubtotalReward` is added per priority group. If both promotions have the same priority, only one survives. Stacking multiple cart subtotal rewards would require different priority values.

### AddCoupon Flow (xAPI)

```
User enters coupon → GraphQL addCoupon mutation
  → AddCouponCommandHandler.Handle()
    → cartAggregate.AddCouponAsync(couponCode)
    → SaveCartAsync(cartAggregate)
      → Full promotion re-evaluation triggered
      → Policy selects rewards (BestReward or Stackable)
      → Cart state updated with new discounts
```

`PromotionSearchCriteria.PopulateFromEvalContext()` is a **no-op** — it does NOT filter promotions by coupon codes. All active store promotions are always loaded and evaluated. The filtering happens at the **policy level** (which rewards survive), not the search level.

### Conclusion: By Design, Not a Code Bug

The behavior is **intentional** in the `BestRewardPromotionPolicy`:
- Coupon-backed `CartSubtotalReward` is explicitly preferred over automatic ones
- This is a **product/architecture decision**, not a code defect
- The real issues are:
  1. **UX gap (P2):** No warning to customer that their coupon replaces a better automatic discount
  2. **Config question:** Should the QA store use `CombineStackablePromotionPolicy` instead?
  3. **Misleading name:** "BestReward" doesn't mean best for the customer on cart subtotals

### Revised Severity Assessment

| Issue | Original | Revised | Reason |
|-------|----------|---------|--------|
| OBS-01 promotion stacking | P1 (bug) | **P2 (UX/config)** | Engine works as designed; issue is missing UX safeguards |
| Missing coupon replacement warning | N/A | **P2 (UX)** | Customer should be warned before losing a better discount |
| Store policy configuration | N/A | **Config review** | Determine if Stackable policy is more appropriate |

### JIRA Ticket Recommendation (Revised)

**Title:** UX: Applying coupon silently replaces better automatic discount without warning
**Type:** Improvement (not Bug)
**Priority:** P2 / Medium
**Component:** Storefront UX / Marketing
**Labels:** promotions, pricing, ux, coupon-stacking

**Description:**
When a store uses `BestRewardPromotionPolicy`, applying a coupon code silently replaces an auto-applied cart subtotal discount even when the coupon provides a smaller discount. Both promotions are configured as "Valid with other offers." The customer sees their total increase after applying a coupon (e.g., $5 off coupon replaces $122 automatic discount). The engine behavior is by design (coupon-backed rewards preferred in `BestRewardPromotionPolicy.cs:79-80`), but the storefront provides no warning.

**Acceptance Criteria:**
1. When a coupon would result in a higher total than the current automatic discount, show a warning: "Applying this coupon will replace your current discount of $X. Your new discount will be $Y. Continue?"
2. OR: Switch store to `CombineStackablePromotionPolicy` if promotions should stack
3. Document the `BestRewardPromotionPolicy` coupon preference behavior in admin promotion configuration UI
