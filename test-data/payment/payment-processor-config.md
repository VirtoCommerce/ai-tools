# Payment Processor Configuration & Test Guide

**Last Updated:** 2026-02-06

---

## Overview

Virto Commerce supports 4 payment processors in test environments. This guide provides configuration details and test card information for each processor.

---

## Payment Processors

### 1. Skyflow (Primary)

**Environment:** QA, Staging
**Priority:** P0 - Critical
**Market Share:** 40% of transactions

**Configuration:**
```bash
# .env variables
SKYFLOW_VISA=4242424242424242
SKYFLOW_MASTERCARD=5555555555554444
SKYFLOW_EXPIRY=12/2029
SKYFLOW_CVV=123
```

**Test Cards:**

| Card Type | Number | Expiry | CVV | Result |
|-----------|--------|--------|-----|--------|
| Visa | 4242424242424242 | 12/2029 | 123 | Success |
| Visa (alt) | 4111111111111111 | 12/2029 | 123 | Success |
| Mastercard | 5555555555554444 | 12/2029 | 123 | Success |
| Mastercard (alt) | 5200828282828210 | 10/2028 | 100 | Success |
| Amex | 378282246310005 | 06/2030 | 1234 | Success (4-digit CVV) |
| Discover | 6011111111111117 | 03/2027 | 456 | Success |
| Declined | 4000000000000002 | 12/2029 | 123 | Decline |
| CVV Fail | 4000000000000127 | 12/2029 | 123 | CVV Error |
| Processing Error | 4000000000000119 | 12/2029 | 123 | Generic Error |

**Features:**
- Iframe-based card entry (PCI compliant)
- Tokenization (no plain text card storage)
- Real-time validation
- Support for all major card brands

**API Endpoints:**
- Production: `https://api.skyflow.com/v1/`
- Test: `https://sandbox.skyflow.com/v1/`

**Known Issues:**
- None currently

---

### 2. CyberSource (Secondary)

**Environment:** QA, Staging
**Priority:** P0 - Critical
**Market Share:** 30% of transactions

**Configuration:**
```bash
# .env variables
CYBERSOURCE_CARD=4622943127013705
CYBERSOURCE_EXPIRY=09/2029
CYBERSOURCE_CVV=838
```

**Test Cards:**

| Card Type | Number | Expiry | CVV | Result |
|-----------|--------|--------|-----|--------|
| Visa (primary) | 4622943127013705 | 09/2029 | 838 | Success |
| Visa (alt) | 4111111111111111 | 12/2029 | 123 | Success |
| Mastercard | 5555555555554444 | 12/2029 | 123 | Success |
| Amex | 378282246310005 | 06/2030 | 1234 | Success (4-digit CVV) |
| Declined | 4000000000000002 | 12/2029 | 123 | Decline |
| Invalid | 1234567890123456 | 12/2029 | 123 | Invalid (Luhn fail) |

**Features:**
- Secure Acceptance Web/Mobile
- Tokenization via iframe
- 3D Secure support (optional)
- Fraud detection built-in

**API Endpoints:**
- Production: `https://api.cybersource.com/`
- Test: `https://apitest.cybersource.com/`

**Known Issues:**
- VCST-3387: Special characters in cardholder name may require encoding

---

### 3. Authorize.Net (Tertiary)

**Environment:** QA, Staging
**Priority:** P1 - High
**Market Share:** 20% of transactions

**Configuration:**
```bash
# .env variables
AUTHORIZNET_CARD=4007000000027
AUTHORIZNET_EXPIRY=12/2029
AUTHORIZNET_CVV=123
```

**Test Cards:**

| Card Type | Number | Expiry | CVV | Result |
|-----------|--------|--------|-----|--------|
| Visa (primary) | 4007000000027 | 12/2029 | 123 | Success |
| Visa (alt) | 4012888818888 | 12/2029 | 123 | Success |
| Mastercard | 5424000000000015 | 10/2028 | 900 | Success |
| Amex | 370000000000002 | 06/2030 | 1234 | Success (4-digit CVV) |
| Discover | 6011000000000012 | 03/2027 | 456 | Success |
| Declined | 4000000000000002 | 12/2029 | 123 | Decline |

**Features:**
- Accept.js for secure payment
- Customer Information Manager (CIM) for stored cards
- Fraud Detection Suite

**API Endpoints:**
- Production: `https://api.authorize.net/xml/v1/request.api`
- Test: `https://apitest.authorize.net/xml/v1/request.api`

**Known Issues:**
- None currently

---

### 4. Datatrance (3D Secure Testing)

**Environment:** QA only
**Priority:** P1 - High
**Market Share:** 10% of transactions
**Special:** 3D Secure authentication with OTP

**Configuration:**
```bash
# .env variables
DATATRANCE_MASTERCARD=5123456789012346
DATATRANCE_EXPIRY=12/2029
DATATRANCE_CVV=100
DATATRANCE_OTP=112233
```

**Test Cards:**

| Card Type | Number | Expiry | CVV | OTP | Result |
|-----------|--------|--------|-----|-----|--------|
| Mastercard (3DS) | 5123456789012346 | 12/2029 | 100 | 112233 | Success with OTP |
| Visa | 4111111111111111 | 12/2029 | 123 | N/A | Success (no 3DS) |
| Mastercard (alt) | 5200000000000007 | 10/2028 | 200 | N/A | Success (no 3DS) |
| Declined | 4000000000000002 | 12/2029 | 123 | N/A | Decline |

**Features:**
- 3D Secure (3DS) authentication
- OTP verification flow
- SMS/Email OTP delivery simulation
- Fallback to non-3DS cards

**OTP Testing:**
- **Test OTP:** 112233 (always works in test mode)
- **OTP Timeout:** 5 minutes
- **Invalid OTP:** Any value other than 112233 will fail

**API Endpoints:**
- Test: `https://sandbox.datatrance.com/api/v1/`

**Known Issues:**
- OTP modal may timeout if network is slow (increase timeout to 60s)

---

## Test Scenarios by Processor

### Priority P0 (Critical) - Must Test Before Release

| Scenario | Skyflow | CyberSource | Authorize.Net | Datatrance |
|----------|---------|-------------|---------------|------------|
| Happy Path Visa | ✅ MUST | ✅ MUST | ✅ MUST | ✅ MUST |
| Happy Path Mastercard | ✅ MUST | ✅ MUST | ✅ MUST | ✅ MUST |
| Declined Card | ✅ MUST | ✅ MUST | ✅ MUST | ✅ MUST |
| 3D Secure/OTP | N/A | Optional | Optional | ✅ MUST |
| Special Chars in Name | ✅ MUST | ✅ MUST | ✅ MUST | ⚠️ Optional |

### Priority P1 (High) - Regression Testing

| Scenario | Skyflow | CyberSource | Authorize.Net | Datatrance |
|----------|---------|-------------|---------------|------------|
| Amex (4-digit CVV) | ✅ Test | ✅ Test | ✅ Test | N/A |
| Invalid Card Number | ✅ Test | ✅ Test | ✅ Test | ⚠️ Optional |
| Incorrect CVV | ✅ Test | ✅ Test | ⚠️ Optional | ⚠️ Optional |
| Expired Card | ✅ Test | ⚠️ Optional | ⚠️ Optional | ⚠️ Optional |
| Unicode in Name | ✅ Test | ⚠️ Optional | ⚠️ Optional | ⚠️ Optional |

---

## Environment-Specific Details

### QA Environment
- **URL:** https://vcst-qa-storefront.govirto.com
- **Admin:** https://vcst-qa.govirto.com
- **All 4 processors:** Skyflow, CyberSource, Authorize.Net, Datatrance
- **Test mode:** All cards in test mode
- **Email notifications:** Sent to Mailhog (not real emails)

### Staging Environment
- **URL:** https://virtostart-demo-store.govirto.com
- **Admin:** https://virtostart-demo-admin.govirto.com
- **3 processors:** Skyflow, CyberSource, Authorize.Net (NO Datatrance)
- **Test mode:** Yes
- **Email notifications:** Real emails sent

### Production Environment
- **Processors:** Skyflow, CyberSource, Authorize.Net
- **Test cards:** NOT ALLOWED - Real cards only
- **PCI compliance:** Enforced

---

## Security & PCI Compliance

### Payment Form Security Checklist

- [ ] All payment fields in secure iframe (not plain HTML inputs)
- [ ] HTTPS enforced (no HTTP allowed)
- [ ] Card number never sent to backend in plain text
- [ ] Tokenization used for all card storage
- [ ] CVV never stored (even tokenized)
- [ ] PCI SAQ-A compliance (if using iframe tokenization)
- [ ] Browser console does not log card data
- [ ] Network requests do not contain plain text card data
- [ ] Saved cards show last 4 digits only
- [ ] Session timeout after 15 minutes of inactivity

### Testing Security

**Verify with Browser DevTools:**

1. Open DevTools → Network tab
2. Enter test card and submit
3. Inspect all XHR/Fetch requests
4. **Verify:** Card number appears only as token (e.g., `tok_1A2B3C...`)
5. **Verify:** CVV never appears in any request
6. **Verify:** All requests use HTTPS

**Console Log Check:**
```javascript
// Should NOT see any of these in console:
4242424242424242  // ❌ Full card number
123               // ❌ CVV
12/2029           // ⚠️ Expiry (less critical but avoid)
```

---

## Troubleshooting

### Common Issues

**Issue:** Payment form doesn't load
**Solution:** Check network for iframe blocking, verify processor is configured

**Issue:** Declined card shows generic error
**Solution:** Check processor-specific error codes, improve error message mapping

**Issue:** Payment succeeds but order not created
**Solution:** Check webhook configuration, verify order creation API

**Issue:** 3D Secure OTP modal doesn't appear (Datatrance)
**Solution:** Verify 3DS-enabled card, check popup blocker settings

**Issue:** Saved payment methods not displaying
**Solution:** Check tokenization service, verify user has saved cards

---

## Analytics Events

### Google Analytics 4 Events

Payment-related events to track:

| Event | Trigger | Properties |
|-------|---------|------------|
| `begin_checkout` | Checkout page load | items, value, currency |
| `add_payment_info` | Payment method selected | payment_type |
| `purchase` | Payment successful | transaction_id, value, items, tax, shipping |
| `payment_error` | Payment failed | error_code, error_message, payment_type |

**Testing Analytics:**
1. Open browser console
2. Filter network by `google-analytics` or `gtag`
3. Trigger payment flow
4. Verify events fire with correct properties

---

## Test Data References

- **Test Cards:** `test-data/payment/test-cards.csv`
- **Test Scenarios:** `test-data/payment/payment-scenarios.csv`
- **Test Users:** `test-data/users/test-users.csv`
- **Test Addresses:** `test-data/addresses/us-addresses.csv`

---

## Contact

**Payment Integration Issues:** Contact DevOps team
**Test Data Questions:** See `.claude/agents/test-management-specialist`
**Processor Support:** See processor-specific documentation links above

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-06 | test-management-specialist | Initial payment processor guide created |
