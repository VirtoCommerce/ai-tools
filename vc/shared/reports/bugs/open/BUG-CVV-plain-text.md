# BUG-PAY-001: CyberSource CVV Field Displays Plain Text Instead of Masked Input

## Status: CONFIRMED

## Summary

The CVV/Security code field in the CyberSource Flex Microform payment iframe uses `input type="text"` instead of `type="password"`, causing the CVV digits to be displayed in plain text ("838") rather than masked with dots or bullets. No CSS `-webkit-text-security` masking is applied either. This is a shoulder-surfing security risk during checkout.

## Severity: High

- **Category:** Security / PCI Compliance
- **Priority:** P1
- **Impact:** CVV values are visible on screen during entry, creating a shoulder-surfing risk. While the CyberSource Flex Microform iframe handles tokenization securely (the actual CVV never reaches the merchant server), the visual exposure of the CVV during input contradicts standard payment UI security practices and PCI DSS best practices for cardholder data display.

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/cart (checkout with CyberSource payment)
- **Browser:** Microsoft Edge (via Playwright)
- **Store Version:** 2.43.0-alpha.2254
- **Account:** ACME Store 3 / Elena Mutykova (mutykovaelena@gmail.com)
- **CyberSource Flex Microform:** Cross-origin iframe (secure payment field)
- **Date:** 2026-03-10

## Steps to Reproduce

1. Sign in to storefront with valid account
2. Add a product to cart
3. Navigate to `/cart` page
4. In Shipping Details, select "Shipping" delivery option
5. Ensure a shipping address is set
6. In Payment Details, check "Same as shipping address" for billing
7. Select "Bank card (CyberSource)" as payment method
8. Wait for the CyberSource Flex Microform iframe to load (~2-3 seconds)
9. Fill in: Card number = `4622943127013705`, Cardholder name = `Test User`, Expiration = `09/2029`
10. Click the "Security code" field
11. Type `838` in the Security code field
12. Observe: the digits "838" are displayed in plain text, not masked

## Expected Result

The CVV field should mask entered digits, displaying dots/bullets (e.g., "***" or "...") instead of the actual numbers. Standard behavior is to use `input type="password"` or CSS `-webkit-text-security: disc` to mask sensitive security codes.

## Actual Result

The CVV field displays "838" in plain, readable text. Technical inspection confirms:

| Property | Expected | Actual |
|----------|----------|--------|
| `input.type` | `"password"` | `"text"` |
| `input.id` | -- | `"securityCode"` |
| `input.inputMode` | `"numeric"` | `"numeric"` (correct) |
| `input.autocomplete` | `"off"` | `"off"` (correct) |
| `-webkit-text-security` | `"disc"` | `"none"` |
| `aria-label` | -- | `"Card security code"` |
| Visual display | `***` or `...` | `838` (plain text) |

## Root Cause Analysis

The CyberSource Flex Microform library renders the security code field as a standard `<input type="text" id="securityCode" inputMode="numeric">` inside a cross-origin iframe. The field configuration passed to CyberSource's `Microform.setup()` likely does not specify password masking for the security code field.

This is a configuration issue in the CyberSource Flex Microform integration, not a CyberSource library bug. The Flex Microform API supports field styling and type configuration -- the integration should specify `type: "password"` or equivalent masking for the CVV field.

**Note:** The card number field also displays in plain text (`type="text"`), but this is more commonly accepted in payment forms for usability (users need to verify the card number). The CVV field, however, should always be masked as it is a security verification code.

## Comparison with Other Payment Providers

For reference, when "Bank card (Skyflow)" is selected as the payment method, the Skyflow integration may handle CVV masking differently. This bug is specific to the CyberSource integration.

## Suggested Fix

In the CyberSource Flex Microform initialization code, configure the security code field to use password masking. Example approaches:

1. **CyberSource Flex Microform v2 configuration:**
   ```javascript
   flex.microform({
     styles: { /* ... */ },
     fields: {
       number: { /* ... */ },
       securityCode: {
         // Add masking
         type: 'password'  // or use CSS styling for masking
       }
     }
   });
   ```

2. **CSS-based masking via Flex Microform styles:**
   ```javascript
   styles: {
     input: {
       '-webkit-text-security': 'disc',
       'text-security': 'disc'
     }
   }
   ```

3. Verify CyberSource Flex Microform documentation for the correct method to enable CVV masking in the current SDK version being used.

## Evidence

| File | Description |
|------|-------------|
| `screenshots/BUG-PAY-001-cvv-field.png` | Full cart/checkout page showing CVV "838" in plain text |
| `screenshots/BUG-PAY-001-cvv-closeup.png` | Closeup of the Security code iframe showing "838" unmasked |

## References

- Original bug ID: BUG-PAY-001
- PCI DSS Requirement 6.5: Secure coding practices for payment applications
- CyberSource Flex Microform documentation: field type configuration
