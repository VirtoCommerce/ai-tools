# CyberSource PCI/Security Compliance — Test Execution Report

## Summary

| Field | Value |
|-------|-------|
| **Date** | 2026-03-05 |
| **Environment** | https://vcst-qa-storefront.govirto.com |
| **Browser** | Firefox (playwright-firefox) |
| **Payment Method** | Bank card (CyberSource) — Flex Microform v2.0.2 |
| **Results** | 6 passed, 0 failed, 0 blocked / 6 total — **100% pass rate** |

## Test Results

| Test ID | Title | Status | Severity |
|---------|-------|--------|----------|
| PAY-SEC-001 | Card Number Iframe — Cross-origin isolation | PASS | Critical |
| PAY-SEC-002 | CVV Iframe — Cross-origin isolation | PASS | Critical |
| PAY-SEC-003 | No Card Data in Network Requests | PASS | Critical |
| PAY-SEC-004 | No Card Data in Browser Storage | PASS | Critical |
| PAY-SEC-005 | HTTPS Only — No Mixed Content | PASS | Critical |
| PAY-SEC-006 | JWT Token Auth — Dynamic Per Session | PASS | High |

## Detailed Findings

### PAY-SEC-001: Card Number Iframe — PASS

**Objective:** Verify card number field is in an iframe from testflex.cybersource.com with cross-origin enforcement.

**Evidence:**
- Iframe source: `https://testflex.cybersource.com/microform/bundle/v2.0.2/iframe.html`
- Iframe domain: `testflex.cybersource.com`
- Iframe title: `"secure payment field"`
- Field type: `number`
- `contentDocument` access: Returns `null` (blocked by cross-origin policy)
- `contentWindow.document` access: Throws `"Permission denied to access property 'document' on cross-origin object"`
- `postMessage` send: Can send (expected for one-way communication from parent)

**Verdict:** Card number input is fully isolated in a CyberSource-hosted iframe. Parent page JavaScript cannot read the card number value.

### PAY-SEC-002: CVV Iframe — PASS

**Objective:** Verify CVV field is in an iframe with proper sandboxing.

**Evidence:**
- Same domain and structure as card number iframe
- Field type: `securityCode`
- `maxLength`: 4
- Placeholder: Bullet characters (masked)
- Cross-origin access tests: Identical results to PAY-SEC-001 — all blocked

**Verdict:** CVV field is properly isolated in its own CyberSource iframe with identical cross-origin protections.

### PAY-SEC-003: No Card Data in Network Requests — PASS

**Objective:** After filling and submitting card data, verify no raw card numbers or CVV appear in network traffic.

**Evidence:**
- Total network requests inspected: 179
- Requests containing card number `4622943127013705` or formatted `4622 9431 2701 3705`: 0
- Requests containing CVV `838`: 0
- CyberSource resources loaded:
  - `flex-microform.min.js` (client library)
  - `iframe.html` x2 (card number and CVV iframes)
  - `iframe.min.js` x2 (iframe scripts)
- Tokenization endpoint configured: `https://testflex.cybersource.com/flex/v2/tokens`
- All GraphQL requests to `/graphql` contain no card data

**Verdict:** Card data stays within the CyberSource iframe context and is tokenized before any network transmission. No PCI data leakage detected.

### PAY-SEC-004: No Card Data in Browser Storage — PASS

**Objective:** After filling card form, verify localStorage, sessionStorage, and cookies contain no card data.

**Evidence:**
- localStorage: 23 keys inspected, 0 contain card data
- sessionStorage: 4 keys inspected, 0 contain card data
- Cookies: 6 cookies inspected (`ai_user`, `_ga_*`, `_ga`, `ai_session`, `builderSessionId`), none contain card number or CVV
- Search patterns: `4622943127013705`, `4622 9431 2701 3705`, `838`

**Verdict:** No card data persisted to any browser storage mechanism. Card data exists only transiently within the CyberSource iframe's isolated context.

### PAY-SEC-005: HTTPS Only — No Mixed Content — PASS

**Objective:** Verify all resources use HTTPS with no mixed content.

**Evidence:**
- Page URL: `https://vcst-qa-storefront.govirto.com/cart` (HTTPS)
- Total resources loaded: 176
- Non-HTTPS resources: 0
- Both iframes: `https://testflex.cybersource.com`
- All 12 domains in use serve exclusively over HTTPS

**Verdict:** 100% HTTPS enforcement. Zero mixed content. All API calls, assets, and third-party resources use encrypted connections.

### PAY-SEC-006: JWT Token Auth — Dynamic Per Session — PASS

**Objective:** Verify iframe source URLs contain JWT tokens in three-part format that are dynamic per session.

**Evidence:**
- JWT format: Three-part (header.payload.signature) — RS256 algorithm
- Session 1 JWT: JTI `ydakeEjV3Iw4ofWh`, MicroformId `a624c927-a00b-4d64-a943-bf6de173a2ad`
- Session 2 JWT: JTI `X00YhVum2SAP9qxA`, MicroformId `4f15bcaa-b19d-482a-8f26-cbb504b57161`
- JTI changed between sessions: Yes
- MicroformId changed: Yes
- Token lifetime: 15 minutes
- `targetOrigins`: Restricts to `["https://vcst-qa-storefront.govirto.com"]`
- `allowedCardNetworks`: VISA, MASTERCARD, AMEX, DISCOVER, DINERSCLUB, JCB, CARTESBANCAIRES, MAESTRO, CUP
- Client library integrity hash (SHA-256) for tamper detection

**Verdict:** JWT tokens are fully dynamic — both the JTI and microform session ID regenerate on each page load. 15-minute expiry limits token replay window. Origin restriction prevents token use from unauthorized domains.

## Console Errors

Zero console errors during the entire test session.

## Decision

**APPROVED** — All 6 PCI security test cases passed. CyberSource Flex Microform v2.0.2 implementation correctly isolates card data, prevents leakage, enforces HTTPS, and uses dynamic JWT tokens.
