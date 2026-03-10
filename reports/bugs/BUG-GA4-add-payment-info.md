# BUG-GA4-add-payment-info: add_payment_info GA4 Event -- FALSE POSITIVE (Partially)

## Status: FALSE POSITIVE / RECLASSIFIED AS LOW SEVERITY DATA FORMAT ISSUE

## Summary

The original bug report stated that `add_payment_info` GA4 event does not fire when selecting a payment method during checkout. **Investigation shows the event DOES fire for all payment providers** (Skyflow, CyberSource, Authorize.Net, Manual, etc.).

The original tester likely used `window.dataLayer.filter(e => e.event === 'add_payment_info')` which returns empty results because the storefront uses **gtag() format** instead of standard GTM dataLayer push format.

## Root Cause of False Positive

The storefront pushes GA4 events via `gtag('event', 'add_payment_info', {...})` which results in dataLayer entries shaped as:
```json
{
  "0": "event",
  "1": "add_payment_info",
  "2": {
    "payment_type": "SkyflowPaymentMethod",
    "currency": "USD",
    "value": 537.6,
    "items": [...]
  }
}
```

Instead of the expected GTM format:
```json
{
  "event": "add_payment_info",
  "ecommerce": {
    "payment_type": "Skyflow",
    "currency": "USD",
    "value": 537.6,
    "items": [...]
  }
}
```

## Verified Behavior

| Payment Method | Event Fired | payment_type Value |
|---------------|-------------|-------------------|
| Bank card (Skyflow) | YES | SkyflowPaymentMethod |
| Bank card (CyberSource) | YES | CyberSourcePaymentMethod |
| Bank card (Authorize.Net) | YES | AuthorizeNetPaymentMethod |
| Manual | YES | DefaultManualPaymentMethod |

All payment method selections correctly push `add_payment_info` to the dataLayer.

## Remaining Issue (Low Severity)

**All GA4 e-commerce events use gtag() format** rather than the standard GTM dataLayer format. This includes:
- `view_cart`
- `begin_checkout`
- `add_shipping_info`
- `add_payment_info`
- `view_item_list`

While Google Tag Manager CAN process gtag-format events (since gtag.js and GTM share the same dataLayer), this format:
1. Makes manual dataLayer inspection harder (cannot use `e.event` filter)
2. May cause issues with third-party GTM tags that expect standard format
3. Does not follow the recommended GA4 implementation pattern for GTM

## Severity

**Low** -- Events are functional and data reaches GA4. Format is non-standard but technically works.

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/cart
- **Browser:** Chromium (Playwright)
- **Store Version:** 2.43.0-alpha.2254
- **Date:** 2026-03-10
- **User:** mutykovaelena@gmail.com (ACME Store 3)

## Steps to Reproduce (for verification)

1. Navigate to storefront, sign in
2. Have items in cart
3. Go to /cart page
4. Select shipping address and delivery method
5. Select any payment method
6. Check dataLayer with: `window.dataLayer.filter(e => e[1] === 'add_payment_info')`
7. Event IS present with correct data

## Incorrect Check (original bug report method)

```javascript
// This returns [] -- FALSE NEGATIVE
window.dataLayer.filter(e => e.event === 'add_payment_info')

// This returns the event correctly
window.dataLayer.filter(e => e[1] === 'add_payment_info')
```

## Evidence

- Screenshot: `reports/bugs/bug1-payment-method-selected.png`

## Decision

**FALSE POSITIVE** -- The `add_payment_info` event fires correctly for all payment providers. The original finding was based on an incorrect dataLayer query method.

**LOW SEVERITY SIDE FINDING** -- All e-commerce events use gtag() format instead of standard GTM dataLayer format. Recommend documenting the correct query method for future testing and evaluating whether to switch to standard format.
