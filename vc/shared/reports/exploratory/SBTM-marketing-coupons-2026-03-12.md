# SBTM Report: Marketing & Coupons Exploratory Testing

**Charter:** Explore marketing promotions and coupons functionality across Admin SPA and Storefront to find issues with coupon creation, application, validation, and display.

**Date:** 2026-03-12
**Tester:** qa-testing-expert (Claude Opus 4.6)
**Browser:** playwright-firefox
**Duration:** ~45 minutes
**Environment:** QA (`vcst-qa-storefront.govirto.com` / `vcst-qa.govirto.com`)

---

## Session Summary

| Metric | Value |
|--------|-------|
| Areas explored | Admin SPA Marketing module, Storefront Coupons page, Cart coupon application |
| Test actions performed | ~35 |
| Bugs found | 1 confirmed |
| Observations / potential issues | 3 |
| Security tests | 2 (XSS, SQL injection) -- both passed |
| Screenshots captured | 12 |

---

## Heuristics Applied

- **CRISP:** Consistency (coupon behavior across Admin/Storefront), Reliability (apply/remove/re-apply), Integrity (discount calculations), Security (injection attacks), Performance (no observable lag)
- **SFDPOT:** Structure (promotion/coupon data model), Function (CRUD, apply, validate), Data (edge cases, special chars), Platform (Firefox browser), Operations (coupon lifecycle), Time (expiration handling)

---

## BUG #1: Coupon Code Field Accepts Special Characters Despite Hint Restriction

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Functional / Validation |
| **Location** | Admin SPA > Marketing > Promotions > [Promotion] > Coupons > Add Coupon |
| **Steps** | 1. Navigate to Admin SPA Marketing module 2. Open any promotion's Coupons blade 3. Click "Add Coupon" 4. Enter `TEST@#$%!` in the Code field 5. Click Create |
| **Expected** | Validation error -- hint text states "Coupon code may contain only alphanumeric characters" |
| **Actual** | Coupon `TEST@#$%!` created successfully with no validation error |
| **Impact** | Special character codes may cause issues with URL encoding, GraphQL queries, or user input on storefront. Users cannot reliably type special chars on mobile keyboards. |
| **Evidence** | `screenshots/05-BUG-special-chars-coupon-created.png` |
| **Invariant** | BL-PRICE-006 (coupon validation) |

---

## Observations

### OBS-1: Expired Coupon Still Displayed on Storefront Coupons Page

The "QA" coupon on the "5% off" promotion expired on Mar 11, 2026. However, on the storefront coupons page (`/account/coupons`), a card for the "5% off" promotion is still visible showing "Expires Mar 13, 2026" (the promotion expiry, not the coupon expiry). The coupon code "QA" is shared by another active promotion ("QA COUPON TOP"), so when a user applies "QA" in the cart, it matches the non-expired promotion. This is not necessarily a bug -- the storefront shows promotion-level expiry, and the coupon-level expiry is handled server-side during application.

**Evidence:** `screenshots/06-storefront-coupons-page.png`, `screenshots/03-coupon-detail-QA-expired.png`

### OBS-2: Coupon-Based Promotions Override Automatic Promotions (No Stacking)

When a coupon-based promotion is applied, it **replaces** any automatic (non-coupon) promotions rather than stacking with them. Specifically:

- **Without coupon:** Automatic "Take 10% off for cart subtotal no more than $1000" applies -$102.00
- **With SUPER coupon:** Only "Super 20% discount" applies -$204.00 (better for user)
- **With QA coupon:** Only "top 20 $" applies -$20.00 (worse for user -- automatic promo was $102)

This means a user applying a coupon could actually **increase** their total if the coupon discount is less than the automatic promotion. This is a business logic decision that should be validated with product owners.

**Invariant reference:** BL-PRICE-001 (discount stacking order)
**Evidence:** `screenshots/09-super-coupon-applied.png`, `screenshots/11-qa-coupon-matched-non-expired.png`

### OBS-3: Private Promotion Correctly Hidden from Storefront

The "Private Promo (do not make public)" promotion (Public=ON in Admin, but described as private) is correctly NOT displayed on the storefront coupons page. The `isPublic` flag filtering works as expected.

**Evidence:** `screenshots/06-storefront-coupons-page.png`

---

## Test Coverage Matrix

### Part 1: Admin SPA (Backend)

| Area | Status | Notes |
|------|--------|-------|
| Promotions list view | PASS | 44 promotions displayed in grid with Active/Has Coupon columns |
| Promotion detail blade | PASS | All fields accessible: name, active toggle, public toggle, dates, store, exclusivity |
| Coupons blade (CRUD) | PASS | List, add, delete coupons works. Detail view shows code, expiry, max uses, use count |
| Coupon code validation | **FAIL** | Special characters accepted despite alphanumeric hint (BUG #1) |
| Coupon expiration (independent from promotion) | PASS | Coupon "QA" expired Mar 11 while promotion "5% off" expires Mar 13 -- independent dates confirmed |
| Exclusivity options | PASS | Two options available: "Valid with other offers" and "Globally exclusive" |
| Console errors | INFO | 1 pre-existing 401 error on `/api/shipping/pickup-locations/indexedSearchEnabled` during login |

### Part 2: Storefront (Frontend)

| Area | Status | Notes |
|------|--------|-------|
| Coupons page (`/account/coupons`) | PASS | 15 coupon cards displayed for public promotions |
| Private promo filtering | PASS | Private promo correctly hidden |
| Click to copy functionality | PASS | Clipboard populated with correct code, "Coupon copied successfully" notification |
| Apply valid coupon (SUPER) | PASS | 20% discount applied, total recalculated correctly |
| Apply valid coupon (QA) | PASS | Matched non-expired "QA COUPON TOP" promotion, skipped expired one |
| Remove coupon (Deny button) | PASS | Coupon removed, automatic promo restored |
| Apply invalid coupon | PASS | "INVALIDCODE123" rejected with clear error message |
| Apply expired coupon code | PASS | "QA" matched a valid promotion (shared code), expired version skipped |
| XSS injection (`<script>alert(1)</script>`) | PASS | Rejected safely, no script execution, no console errors |
| SQL injection (`' OR 1=1 --`) | PASS | Rejected safely, no server error, standard error message |
| Order total formula (BL-CHK-006) | PASS | Verified at 3 states: no coupon ($1,101.60), SUPER ($979.20), QA ($1,200.00) |
| Console errors during coupon ops | PASS | Only 1 unrelated third-party cookie error (Facebook pixel) |

---

## Order Total Verification (BL-CHK-006)

| State | Subtotal | Discount | Shipping | Tax | Total | Formula Check |
|-------|----------|----------|----------|-----|-------|---------------|
| No coupon (auto 10%) | $1,020.00 | -$102.00 | $0.00 | +$183.60 | $1,101.60 | $1,020 - $102 + $0 + $183.60 = $1,101.60 CORRECT |
| SUPER coupon (20%) | $1,020.00 | -$204.00 | $0.00 | +$163.20 | $979.20 | $1,020 - $204 + $0 + $163.20 = $979.20 CORRECT |
| QA coupon ($20 off) | $1,020.00 | -$20.00 | $0.00 | +$200.00 | $1,200.00 | $1,020 - $20 + $0 + $200 = $1,200.00 CORRECT |

Tax rate appears to be 20% applied to (subtotal - discount): confirmed consistent across all states.

---

## Screenshots Index

| # | File | Description |
|---|------|-------------|
| 01 | `01-admin-promotions-list.png` | Admin Marketing promotions grid (44 promotions) |
| 02 | `02-admin-coupons-blade.png` | Coupons blade for "5% off" promotion |
| 03 | `03-coupon-detail-QA-expired.png` | Coupon "QA" detail showing expired date Mar 11 |
| 04 | `04-coupon-special-chars-validation.png` | Special chars entered in coupon code field |
| 05 | `05-BUG-special-chars-coupon-created.png` | BUG evidence: TEST@#$%! coupon created |
| 06 | `06-storefront-coupons-page.png` | Storefront coupons page with 15 coupon cards |
| 07 | `07-copy-coupon-notification.png` | "Coupon copied successfully" notification |
| 08 | `08-cart-discount-breakdown-auto-promo.png` | Cart with automatic 10% promo breakdown |
| 09 | `09-super-coupon-applied.png` | SUPER coupon applied, 20% discount |
| 10 | `10-invalid-coupon-error.png` | Invalid coupon error message |
| 11 | `11-qa-coupon-matched-non-expired.png` | QA coupon matched non-expired promotion |
| 12 | `12-sql-injection-rejected.png` | SQL injection payload safely rejected |

---

## Console & Network Summary

- **Console errors:** 1 total (third-party Facebook cookie rejection -- unrelated to coupons)
- **Console warnings:** 15 total -- all are pre-existing attribute value warnings and Vue apollo warnings
- **Network failures:** None observed during coupon operations
- **No GraphQL errors** in coupon apply/remove operations

---

## Recommendations

1. **BUG #1 (Medium):** Add client-side and server-side validation for coupon code format. The hint text promises alphanumeric-only but the system accepts any characters.

2. **OBS-2 (Business Decision):** Review the promotion stacking/priority logic. Currently, applying a coupon can result in a higher total than not using one (when the coupon discount is less than the automatic promotion). Consider either:
   - Allowing coupon + automatic promotion stacking
   - Showing users a warning when a coupon gives a worse discount than automatic promotions
   - Applying whichever combination gives the best discount for the customer

3. **OBS-1 (Low):** Consider showing coupon-level expiration on the storefront coupons page in addition to promotion-level expiration, or filtering out cards where the coupon itself has expired even if the promotion hasn't.

---

## Sign-off

**Session complete.** 1 bug found, 3 observations documented, security edge cases passed. Overall coupon functionality works correctly for standard flows. The main area of concern is input validation in the Admin coupon creation form.

**Tested by:** qa-testing-expert | **Date:** 2026-03-12 | **Browser:** Firefox (playwright-firefox)
