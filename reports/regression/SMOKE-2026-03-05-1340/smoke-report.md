# Smoke Test Report — SMOKE-2026-03-05-1340

## Verdict: GO

| Field | Value |
|-------|-------|
| Run ID | SMOKE-2026-03-05-1340 |
| Date | 2026-03-05 |
| Environment | https://vcst-qa-storefront.govirto.com |
| Backend | https://vcst-qa.govirto.com |
| Platform Version | v3.1007.0 |
| Duration | ~15 min |

## Track A — Storefront Results (12/12 PASS)

| # | Test Case | Status | Notes |
|---|-----------|--------|-------|
| SMK-001 | User Registration - Personal Account | PASS | Registered test account successfully |
| SMK-002 | User Registration - Organization Account | PASS | Org account + company created |
| SMK-003 | Sign In - Personal User | PASS | Auth OK, user name in header |
| SMK-004 | Sign In - Organization User | PASS | Org context visible |
| SMK-005 | Catalog Browsing - Category Navigation | PASS | Categories, breadcrumbs, facets OK |
| SMK-006 | Product Search - Basic Query | PASS | Results, filters, count displayed |
| SMK-007 | Add to Cart - Single Product | PASS | Cart count updated, notification shown |
| SMK-008 | Cart Operations - View and Update | PASS | Quantity update, remove, totals OK |
| SMK-009 | Checkout - Standard Delivery | PASS | Order CO260305-00004 created |
| SMK-010 | Checkout - BOPIS Pickup | PASS | Order CO260305-00005 created |
| SMK-011 | Payment Processing - Credit Card | PASS | Order CO260305-00006 via Skyflow |
| SMK-012 | Order Confirmation - Verify Details | PASS | Confirmation page, order history OK |

## Track B — Admin Health (5/5 PASS)

| Check | Status | Notes |
|-------|--------|-------|
| Admin SPA loads and key blades open | PASS | Catalog (23), Orders (7,370), Contacts (548) — all OK |
| Platform modules show Active status | PASS | 76 modules installed, 0 errors, 0 updates |
| API health check (GET /api/platform/modules) | PASS | HTTP 200, 76 modules returned |
| GraphQL endpoint accepts introspection | PASS | 400 types, Query + Mutations types |
| OAuth token endpoint works | PASS | Bearer token, expires_in 1799s |

## Bugs Found

None

## Observations

- **Known console errors** (not new): 404 on `/api/shipping/pickup-locations/indexedSearchEnabled`, unhandled rejection in `error.js` — pre-existing, not regressions.
- **License notice**: "Your license has expired on Jan 1, 2026, please renew" — informational only.
- **Test data created** (cleanup needed): 2 test accounts, 3 orders (CO260305-00004, CO260305-00005, CO260305-00006).

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 17 (12 storefront + 5 admin) |
| Passed | 17 |
| Failed | 0 |
| Pass Rate | **100.0%** |
| Checkout Tests | ALL PASS |
| Payment Tests | ALL PASS |
| Admin Health | ALL PASS |
