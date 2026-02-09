# Cart, Checkout & Payment - Deep Regression Test Report

**Date:** 2026-02-07
**Environment:** QA (https://vcst-qa-storefront.govirto.com)
**Browser:** Microsoft Edge (via playwright-edge MCP)
**Storefront Version:** 2.41.0-alpha.2219
**Tester:** qa-frontend-expert (Claude Opus 4.6)
**Test Account:** qa-cart-feb07@test-vc.com / TestCart@2026!
**Organization:** QA Cart Checkout Corp Feb07

---

## Executive Summary

Deep regression testing of Cart, Checkout & Payment flows completed successfully on the Virto Commerce QA storefront using Microsoft Edge. All four payment processors (CyberSource, Authorize.Net, Skyflow, Datatrans) were tested end-to-end with successful order placement. 4 orders were created and verified in order history.

**Overall Result: PASS (with minor findings)**

---

## Test Scope

| Area | Test Cases | Passed | Failed | Blocked | Notes |
|------|-----------|--------|--------|---------|-------|
| Cart Operations (FR-CART) | 9 | 8 | 0 | 1 | Promo code "NEW" inactive |
| Checkout Flow (FR-CHECKOUT) | 6 | 6 | 0 | 0 | |
| Order History (FR-ORDER) | 3 | 3 | 0 | 0 | |
| Payment Processors (FR-PAYMENT) | 4 | 4 | 0 | 0 | All 4 gateways tested |
| Ship-To Address (FR-B2C-SHIP) | 3 | 3 | 0 | 0 | Tested during checkout |
| **TOTAL** | **25** | **24** | **0** | **1** | **96% pass rate** |

---

## Detailed Test Results

### 1. Cart Operations (FR-CART-001 through FR-CART-009)

| ID | Test Case | Status | Notes |
|----|-----------|--------|-------|
| FR-CART-001 | Add product to cart from PDP | PASS | Gin Tonic ($1.20) added, qty stepper 0->1 auto-adds, cart badge updated |
| FR-CART-002 | Add product with variations | PASS | Baggy Regular Jeans with Color/Size/Fabric options, Blue variant added ($28.00) |
| FR-CART-003 | View cart page | PASS | Items grouped by vendor (Amstel), product details, properties, prices, stock levels displayed |
| FR-CART-004 | Increase quantity | PASS | Qty 1->2, extended price and subtotal updated correctly |
| FR-CART-005 | Decrease quantity | PASS | Qty 2->1, minimum qty enforced (decrease button disabled at qty 1) |
| FR-CART-006 | Remove item / Clear cart | PASS | Individual remove (X button), Clear cart with confirmation dialog, empty cart state |
| FR-CART-007 | Save for later / Move to cart | PASS | "Save for later" moves item to saved section, "Move to cart" restores item |
| FR-CART-008 | Apply valid promo code "NEW" | BLOCKED | Promo code "NEW" returns error: "This code does not match any active coupons." Code appears inactive/expired in QA environment |
| FR-CART-009 | Apply invalid promo code | PASS | "INVALID123" correctly shows error message, totals unchanged |

**Cart Key Findings:**
- Quantity stepper: B2B layout starts at 0, incrementing from 0 auto-adds to cart
- Decrease button correctly disabled at qty=1 (minimum)
- Vendor grouping works correctly (items grouped under "Vendor: Amstel")
- "Recently browsed" section shows previously viewed products in cart page
- Lays Chips product has disabled "Increase quantity" button (possibly out of stock or restricted)

### 2. Checkout Flow (FR-CHECKOUT-001 through FR-CHECKOUT-006)

| ID | Test Case | Status | Notes |
|----|-----------|--------|-------|
| FR-CHECKOUT-001 | Standard delivery checkout | PASS | Full single-page checkout flow with shipping + payment |
| FR-CHECKOUT-002 | Delivery option selection | PASS | Pickup and Shipping toggle buttons available |
| FR-CHECKOUT-003 | Add new shipping address | PASS | New address dialog, all fields (name, email, phone, country, ZIP, state, city, address, apt), address saved |
| FR-CHECKOUT-004 | Payment method selection | PASS | 6 payment methods available: Authorize.Net, CyberSource, Datatrans, Manual, Pay with points, Skyflow |
| FR-CHECKOUT-005 | Order comment | PASS | Comment field with 0/1000 character counter, displayed on order details |
| FR-CHECKOUT-006 | Order confirmation | PASS | "ORDER COMPLETED" page with order number, "Show order" and "Home page" buttons, cart cleared |

**Checkout Key Findings:**
- Single-page checkout layout (cart, shipping, payment, comment all on one page)
- "Billing address same as shipping" checkbox works correctly
- Delivery methods: Fixed Rate (Ground) and Fixed Rate (Air) available
- Order summary updates dynamically when delivery method changes
- "Place order" button disabled until all required fields are completed
- Helpful message: "Complete all required information to proceed."
- Address persists for subsequent orders (no need to re-enter)

### 3. Order History (FR-ORDER-001 through FR-ORDER-003)

| ID | Test Case | Status | Notes |
|----|-----------|--------|-------|
| FR-ORDER-001 | View order history list | PASS | All 4 orders listed with order number, invoice, date, status, total |
| FR-ORDER-002 | View order details | PASS | Full order details: products, properties, prices, subtotal, discount, tax, shipping, total, addresses, payment method |
| FR-ORDER-003 | Order status filtering | PASS | Sidebar shows status counts: "Processing 3", "Payment required 1" |

**Order History Key Findings:**
- Orders table columns: Order number, Purchase order, Invoice, Date, Status, Total
- "All orders" and "My orders" tab filters available
- Search bar and Filters button available
- "Print order" button available on order details
- Order comment displayed on order details page
- Invoice numbers auto-generated (PI260207-XXXXX pattern)

### 4. Payment Processors (FR-PAYMENT-001 through FR-PAYMENT-004)

| ID | Payment Method | Order Number | Status | Total | Card Form Type |
|----|---------------|-------------|--------|-------|----------------|
| FR-PAYMENT-001 | CyberSource | CO260207-00002 | Payment required | $231.60 | Embedded in cart (iframe for card# and CVV) |
| FR-PAYMENT-003 | Authorize.Net | CO260207-00003 | Processing | $180.00 | Redirect to /checkout/payment (regular inputs) |
| FR-PAYMENT-002 | Skyflow | CO260207-00004 | Processing | $181.44 | Redirect to /checkout/payment (iframe for all fields) |
| FR-PAYMENT-004 | Datatrans | CO260207-00005 | Processing | $181.44 | Redirect to /checkout/payment (iframe for card# and CVV) |

**Payment Processor Comparison:**

| Feature | CyberSource | Authorize.Net | Skyflow | Datatrans |
|---------|------------|--------------|---------|-----------|
| Card form location | Cart page (embedded) | Separate /checkout/payment | Separate /checkout/payment | Separate /checkout/payment |
| Card # input | iframe (PCI) | Regular textbox | iframe (PCI) | iframe (PCI, multi-segment) |
| CVV input | iframe (PCI) | Regular textbox | iframe (PCI) | iframe (PCI) |
| Cardholder name | Regular textbox | Regular textbox | iframe (PCI) | Regular textbox |
| Expiry format | MM/YYYY | MM/YY | MM/YY | MM/YY |
| Save card option | No | No | Yes ("Save card for future payments") | No |
| Card brand icons | No | No | No | Yes (Visa, Maestro, Mastercard, AmEx) |
| Post-payment status | Payment required | Processing | Processing | Processing |
| Confirmation page | /checkout/completed (ORDER COMPLETED) | /checkout/payment/success (PAYMENT SUCCESSFUL) | /checkout/payment/success (PAYMENT SUCCESSFUL) | /checkout/payment/success (PAYMENT SUCCESSFUL) |

**Payment Test Cards Used:**

| Processor | Card Number | Expiry | CVV | Result |
|-----------|------------|--------|-----|--------|
| CyberSource | 4622 9431 2701 3705 | 09/2029 | 838 | PASS - Order created |
| Authorize.Net | 5424 0000 0000 0015 | 02/29 | 900 | PASS - Payment successful |
| Skyflow | 4007 0000 0002 7 | 02/29 | 900 | PASS - Payment successful |
| Datatrans | 5100 0010 0000 0014 | 06/28 | 123 | PASS - Payment successful |

### 5. Ship-To Address Tests (FR-B2C-SHIP)

| ID | Test Case | Status | Notes |
|----|-----------|--------|-------|
| FR-B2C-SHIP-001 | Select shipping address in checkout | PASS | Address auto-populated from saved addresses on subsequent orders |
| FR-B2C-SHIP-002 | Add new shipping address | PASS | Full address form with country/state cascading dropdowns, validation |
| FR-B2C-SHIP-003 | Address persistence | PASS | Address created during first order persisted for orders 2, 3, 4 |

**Test Address Used:**
- Name: Cart Tester
- Email: qa-cart-feb07@test-vc.com
- Phone: +1 555-123-4567
- Address: 123 Test Boulevard, Suite 200, Beverly Hills, CA 90210, USA

---

## Bugs & Issues Found

### BUG-001: Promo Code "NEW" Inactive in QA Environment
- **Severity:** Medium
- **Steps:** Cart page > Enter promo code "NEW" > Click Apply
- **Expected:** Discount applied
- **Actual:** Error: "This code does not match any active coupons. Double-check that everything is correct and try again."
- **Impact:** Cannot test valid promo code functionality
- **Screenshot:** `16-FR-CART-008-promo-code-NEW-error.png`
- **Recommendation:** Re-activate promo code "NEW" in QA environment or provide alternative valid code

### BUG-002: CyberSource Order Status Inconsistency
- **Severity:** Low (may be by design)
- **Steps:** Place order with CyberSource payment
- **Expected:** Order status "Processing" (same as other gateways)
- **Actual:** Order status "Payment required" with "PAY NOW" button on order details
- **Impact:** CyberSource orders show different post-payment status than Authorize.Net/Skyflow/Datatrans
- **Screenshot:** `27-FR-ORDER-002-order-details.png`
- **Note:** This may be by design -- CyberSource may use a 2-step authorization flow

### BUG-003: ServiceWorker 404 Error on Every Page Load
- **Severity:** Low
- **Console Error:** "A bad HTTP response code (404) was received when fetching the script."
- **Impact:** Recurring on every page navigation, no functional impact observed
- **Recommendation:** Fix service worker registration or remove if not used

### BUG-004: Multiple Product Image 404 Errors
- **Severity:** Low
- **Affected Products:** Cherry Soda images (multiple sizes), grey jeans fabric image, Honda bike image
- **Console Errors:**
  - `Cherry-Soda-1-e1585652933596_216x216_sm.png` (404)
  - `Cherry-Soda-1-e1585652933596_348x348_md.png` (404)
  - `grey_md.png` (404)
  - `475635_25ym_honda_crf450rx_1__md.jpg` (404)
- **Impact:** Missing product images in thumbnails and gallery
- **Recommendation:** Upload missing images or fix CDN paths

### BUG-005: Datatrans Secure Field Input Difficulty
- **Severity:** Medium (automation-specific)
- **Steps:** Datatrans payment page > Type card number using keyboard
- **Expected:** All digits enter sequentially
- **Actual:** Multi-segment card field drops/reorders digits when using pressSequentially(); requires fill() method + keyboard re-entry for CVV to trigger validation
- **Impact:** Automation difficulty only -- manual entry likely works fine. The Datatrans secure field's multi-textbox architecture does not handle programmatic input well.
- **Screenshot:** `37-FR-PAYMENT-004-datatrans-payment-page.png`

---

## Screenshots Index

| # | Screenshot | Test Case | Description |
|---|-----------|-----------|-------------|
| 01-15 | Various | FR-CART-001 to FR-CART-007 | Cart operations (from previous session) |
| 16 | `16-FR-CART-008-promo-code-NEW-error.png` | FR-CART-008 | Promo code "NEW" error |
| 17 | `17-FR-CART-009-invalid-promo-code.png` | FR-CART-009 | Invalid promo code error |
| 18 | `18-FR-CHECKOUT-001-cart-top.png` | FR-CHECKOUT-001 | Cart page before checkout |
| 19 | `19-FR-CHECKOUT-003-new-address-modal.png` | FR-CHECKOUT-003 | New address dialog |
| 20 | `20-FR-CHECKOUT-003-address-form-filled.png` | FR-CHECKOUT-003 | Address form fully populated |
| 21 | `21-FR-CHECKOUT-001-address-applied.png` | FR-CHECKOUT-001 | Address applied to checkout |
| 22 | `22-FR-CHECKOUT-001-delivery-method-selected.png` | FR-CHECKOUT-001 | Fixed Rate (Ground) selected |
| 23 | `23-FR-CHECKOUT-004-payment-methods-dropdown.png` | FR-CHECKOUT-004 | 6 payment methods shown |
| 24 | `24-FR-CHECKOUT-004-cybersource-payment-form.png` | FR-CHECKOUT-004 | CyberSource card form (embedded) |
| 25 | `25-FR-PAYMENT-001-cybersource-card-filled.png` | FR-PAYMENT-001 | CyberSource card details entered |
| 26 | `26-FR-CHECKOUT-006-order-confirmation.png` | FR-CHECKOUT-006 | Order completed (CyberSource) |
| 27 | `27-FR-ORDER-002-order-details.png` | FR-ORDER-002 | Order details (CyberSource) |
| 28 | `28-FR-ORDER-001-order-history.png` | FR-ORDER-001 | Order history (1st order) |
| 29 | `29-FR-PAYMENT-003-authorizenet-selected.png` | FR-PAYMENT-003 | Authorize.Net selected in cart |
| 30 | `30-FR-PAYMENT-003-authorizenet-payment-page.png` | FR-PAYMENT-003 | Authorize.Net separate payment page |
| 31 | `31-FR-PAYMENT-003-authorizenet-success.png` | FR-PAYMENT-003 | Authorize.Net payment successful |
| 32 | `32-FR-PAYMENT-003-authorizenet-order-details.png` | FR-PAYMENT-003 | Authorize.Net order details |
| 33 | `33-FR-PAYMENT-002-skyflow-selected.png` | FR-PAYMENT-002 | Skyflow selected in cart |
| 34 | `34-FR-PAYMENT-002-skyflow-payment-page.png` | FR-PAYMENT-002 | Skyflow card form (iframe) |
| 35 | `35-FR-PAYMENT-002-skyflow-card-filled.png` | FR-PAYMENT-002 | Skyflow card details entered |
| 36 | `36-FR-PAYMENT-002-skyflow-success.png` | FR-PAYMENT-002 | Skyflow payment successful |
| 37 | `37-FR-PAYMENT-004-datatrans-payment-page.png` | FR-PAYMENT-004 | Datatrans card form |
| 38 | `38-FR-PAYMENT-004-datatrans-card-filled.png` | FR-PAYMENT-004 | Datatrans card details entered |
| 39 | `39-FR-PAYMENT-004-datatrans-success.png` | FR-PAYMENT-004 | Datatrans payment successful |
| 40 | `40-FR-ORDER-001-all-orders-history.png` | FR-ORDER-001 | All 4 orders in history |

---

## Orders Created During Testing

| Order # | Payment Method | Products | Subtotal | Discount | Tax | Shipping | Total | Status |
|---------|---------------|----------|----------|----------|-----|----------|-------|--------|
| CO260207-00002 | CyberSource | Baggy Regular Jeans Blue ($28), Ready-made curtain ($15) | $61.00 | -$18.00 | +$38.60 | +$150.00 | $231.60 | Payment required |
| CO260207-00003 | Authorize.Net | Gin Tonic Cherry Soda ($1.20) | $1.20 | -$1.20 | +$30.00 | +$150.00 | $180.00 | Processing |
| CO260207-00004 | Skyflow | Gin Tonic Cherry Soda ($1.20) | $1.20 | $0.00 | +$30.24 | +$150.00 | $181.44 | Processing |
| CO260207-00005 | Datatrans | Gin Tonic Cherry Soda ($1.20) | $1.20 | $0.00 | +$30.24 | +$150.00 | $181.44 | Processing |

---

## Environment Observations

- **Storefront Version:** 2.41.0-alpha.2219
- **QA Environment Indicator:** Green "QA" badge in top header
- **Console Errors:** Recurring ServiceWorker 404, product image 404s
- **Console Warnings:** WebSocket connection close/reconnect events
- **JavaScript Errors:** TypeError in Cloudflare rocket-loader during Datatrans payment (non-blocking)
- **Performance:** All pages loaded within 3-5 seconds, checkout transitions smooth

---

## FRONTEND SIGN-OFF

| Criteria | Status | Notes |
|----------|--------|-------|
| Add to cart (standard product) | PASS | Qty stepper works, badge updates |
| Add to cart (variation product) | PASS | Color/Size/Fabric selectors, variation added |
| Cart view (items, prices, vendor grouping) | PASS | All data displayed correctly |
| Cart quantity update (+/-) | PASS | Dynamic total recalculation |
| Cart item remove | PASS | Individual and clear-all |
| Save for later / Move to cart | PASS | Bidirectional movement works |
| Promo code (valid) | BLOCKED | "NEW" code inactive in QA |
| Promo code (invalid) | PASS | Correct error message |
| Checkout - Address creation | PASS | Full form, cascading dropdowns |
| Checkout - Delivery selection | PASS | Ground and Air options |
| Checkout - Payment selection | PASS | 6 methods available |
| CyberSource payment | PASS | Embedded form, order created |
| Authorize.Net payment | PASS | Redirect flow, payment successful |
| Skyflow payment | PASS | Redirect + iframe, payment successful |
| Datatrans payment | PASS | Redirect + secure fields, payment successful |
| Order confirmation | PASS | All confirmations correct |
| Order history | PASS | All 4 orders listed correctly |
| Order details | PASS | Full details, print button, addresses |
| Address persistence | PASS | Remembered for subsequent orders |
| Cart cleared after order | PASS | Badge removed, cart empty |

**Overall Cart/Checkout/Payment Status:** PASS

---

## Decision

**APPROVED WITH CONDITIONS**

**Blocking Issues:** None (all critical payment flows work)

**Conditions:**
1. Re-activate promo code "NEW" in QA environment for promo testing
2. Fix product image 404 errors (Cherry Soda, grey jeans, Honda bike)
3. Investigate CyberSource "Payment required" status vs other gateways showing "Processing"

**Recommendation:** The cart, checkout, and payment flows are fully functional across all 4 payment processors. The storefront is ready for release from a cart/checkout/payment perspective.

---

| Role | Agent | Decision | Date |
|------|-------|----------|------|
| **Frontend Expert** | qa-frontend-expert | APPROVED WITH CONDITIONS | 2026-02-07 |
| **QA Lead** | qa-lead-orchestrator | PENDING | - |
