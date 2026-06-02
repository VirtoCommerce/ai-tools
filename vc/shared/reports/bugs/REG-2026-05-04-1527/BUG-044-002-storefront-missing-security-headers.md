# BUG-044-002 — Storefront SPA root response missing HSTS / CSP / X-Frame-Options

**Run:** REG-2026-05-04-1527 (Suite 044 — Security Tests)
**Test cases:** SEC-PCI-006 (HTTPS Enforcement), SEC-CORS-001 (API Security > Headers)
**Severity:** Medium
**Priority:** P2
**Date filed:** 2026-05-04
**Reporter:** qa-backend-expert
**Environment:** vcst-qa-storefront

## Summary

The storefront SPA root (`https://vcst-qa-storefront.govirto.com/`) returns a response with no security headers. The backend GraphQL endpoint at the same host (`/graphql`) correctly returns HSTS, CSP, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy. The difference is observable to any unauthenticated client.

## Steps to Reproduce

1. Curl the storefront root: `curl -skI https://vcst-qa-storefront.govirto.com/`
2. Curl the GraphQL endpoint: `curl -skI -X POST https://vcst-qa-storefront.govirto.com/graphql`
3. Compare response headers.

## Actual Result

**Storefront root (`/`):**
```
content-type: text/html
cf-cache-status: DYNAMIC
cross-origin-resource-policy: cross-origin, cross-origin
cross-origin-embedder-policy: unsafe-none
access-control-allow-origin: *
server: cloudflare
```
Missing: `strict-transport-security`, `content-security-policy`, `x-frame-options`, `x-content-type-options`, `referrer-policy`.

**GraphQL endpoint (`/graphql`):**
```
strict-transport-security: max-age=31536000; includeSubDomains
content-security-policy: object-src 'none'; form-action 'self'; frame-ancestors localhost:8080 vcst-qa.govirto.com
x-frame-options: ALLOW-FROM localhost:8080 vcst-qa.govirto.com
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
```

## Expected Result

The SPA root should at minimum return:
- `strict-transport-security: max-age=31536000; includeSubDomains` (HSTS — protects against SSL stripping)
- `x-content-type-options: nosniff` (MIME sniffing protection)
- A reasonable CSP for the SPA shell
- `x-frame-options: SAMEORIGIN` or `DENY` (clickjacking protection)
- `referrer-policy: strict-origin-when-cross-origin`

## Risk Assessment

- **HSTS missing:** Without HSTS, a first-time visitor on an untrusted network is vulnerable to SSL-stripping (HTTP downgrade). All subsequent loads (including login, JWT exposure, payment) inherit this risk.
- **X-Frame-Options missing:** SPA root could be embedded in an attacker iframe for clickjacking attacks against authenticated users.
- **X-Content-Type-Options missing:** Less critical since responses are typed correctly, but defense-in-depth.
- **CSP missing:** No mitigation against reflected/stored XSS in SPA bundles or third-party scripts.

This is **infrastructure-level configuration** likely controlled at the SPA static-host (Cloudflare, nginx, or hosting provider). The backend already proves that the platform is configured correctly; the storefront origin needs the same hardening.

## Suggested Fix

Add header injection to the static-host configuration (Cloudflare Workers, nginx `add_header`, or the hosting platform's response-header policy). Recommended baseline:

```
strict-transport-security: max-age=31536000; includeSubDomains; preload
content-security-policy: default-src 'self' https://*.govirto.com; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.google-analytics.com https://testflex.cybersource.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https://testflex.cybersource.com https://*.cybersource.com https://*.skyflow.com https://*.datatrans.com; connect-src 'self' https://*.govirto.com https://*.google-analytics.com wss://*.govirto.com; frame-ancestors 'self'
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: geolocation=(), microphone=(), camera=()
```

(CSP must be tested carefully — the storefront integrates with CyberSource Microform, GA4, Builder.io, and other third parties.)

## Evidence

- `reports/regression/REG-2026-05-04-1527/044-results.json` (test run)
- Headers observed at request indices 22 (graphql) and 126 (storefront root) in the run's network capture.

## Cross-Reference

- SEC-PCI-006 (HTTPS Enforcement)
- BL-SEC-001
- OWASP Secure Headers Project
