# Regression Test Report — REG-2026-05-04-1527

## Executive Summary

| Field | Value |
|-------|-------|
| Run ID | REG-2026-05-04-1527 |
| Date | 2026-05-04 |
| Environment | QA — https://vcst-qa-storefront.govirto.com |
| Backend | https://vcst-qa.govirto.com |
| Selection | frontend (42 suites, layer=frontend, exclude 080) |
| Build — Platform | 3.1025.0-pr-2987-eb8e-vcst-4710-eb8e622b (STALE — cached 2026-04-27) |
| Build — Theme | 2.48.0-pr-2219-d1d4-d1d4b74c (STALE — cached 2026-04-27) |
| Build State | STALE — GitHub MCP token expired; live fetch unavailable |
| Previous Run | REG-2026-05-04-0756 (sprint:26-08, APPROVED 85.3%) |
| Started | 2026-05-04T15:27:00Z |
| Blocked At | 2026-05-04T15:42:00Z |
| Total Runtime | ~15 minutes (aborted at infrastructure failure — no tests executed) |
| Total Suites Planned | 42 |
| Suites Completed | 0 |
| Suites Blocked | 42 (100%) |
| Total Test Cases Planned | ~1,315 |
| Test Cases Executed | 0 |
| Overall Pass Rate | N/A — infrastructure blocked |
| Quality Gate Verdict | **BLOCKED** |

## Infrastructure Failure — Root Cause

All three Playwright MCP browser contexts were closed before test execution began:

| Browser Server | Status | Error |
|----------------|--------|-------|
| playwright-chrome | CLOSED | `browserBackend.callTool: Target page, context or browser has been closed` |
| playwright-firefox | CLOSED | `browserBackend.callTool: Target page, context or browser has been closed` |
| playwright-edge | CLOSED | `browserBackend.callTool: Target page, context or browser has been closed` |

**Diagnosis:** The MCP server processes are alive (responding with errors, not timing out), but the underlying browser processes were terminated since the servers were last started. Navigation and tab-creation calls all fail with the same error. Standard recovery (direct `browser_navigate` on all three servers) did not trigger browser context re-creation.

**Recovery procedure:**
1. In the IDE: stop all three Playwright MCP servers (playwright-chrome, playwright-firefox, playwright-edge)
2. On Windows: close any open Chrome and Edge windows (user data directory lock conflict)
3. Restart all three MCP servers from the IDE MCP panel
4. Verify with `mcp__playwright-chrome__browser_tabs action=list` — should return an empty tab list, not an error
5. Re-trigger: `/qa-regression frontend` (or the specific selection needed)

**Retry strategy:** Per retry policy, all three servers failed on the same error class (browser crash/timeout). After 2 retry attempts (all failing identically), the run was marked BLOCKED and dispatch stopped. No suites were retried on alternative browsers because the failure is infrastructure-wide, not browser-specific.

## Payment Card Reference (for next run)

The coordinator provided verified canonical cards from `test-data/payment/test-cards.csv` (updated 2026-05-04). These are pre-resolved for payment suites:

| Suite | Processor | Card | CVV | Expiry | Notes |
|-------|-----------|------|-----|--------|-------|
| 039, 041 | CyberSource | 4622943127013705 | 838 | 09/2029 | Microform v2.0.2; MUST use playwright-chrome |
| 040 | Skyflow | 5424000000000015 | 900 | 12/2029 | Only routable card in QA vault |
| 040 | Authorize.Net | 4007000000027 | 900 | 12/2029 | 13-digit Visa primary |
| 040 | Datatrans | 5100001000000014 | 123 | 06/28 | Frictionless approval; no OTP for $299.99 sandbox |

Reference: `test-data/payment/test-cards.csv`, `test-data/payment/order-creation-matrix.txt`

## Suite Results

All 42 suites are BLOCKED — no test cases were executed.

| Suite | Name | Priority | Browser Assigned | Tests | Pass | Fail | Block | Status |
|-------|------|----------|-----------------|-------|------|------|-------|--------|
| 039 | Payment CyberSource | P0 | playwright-chrome (MANDATORY) | 23 | 0 | 0 | 23 | BLOCKED |
| 040 | Payment Processors | P0 | playwright-firefox | 28 | 0 | 0 | 28 | BLOCKED |
| 041 | Payment Cross-Cutting | P0 | playwright-chrome (MANDATORY) | 14 | 0 | 0 | 14 | BLOCKED |
| 042 | Smoke Tests | P0 | playwright-firefox | 26 | 0 | 0 | 26 | BLOCKED |
| 044 | Security Tests | P0 | playwright-edge | 33 | 0 | 0 | 33 | BLOCKED |
| 001 | Catalog Navigation | P1 | (not dispatched) | 19 | 0 | 0 | 19 | BLOCKED |
| 002 | Product Detail | P1 | (not dispatched) | 32 | 0 | 0 | 32 | BLOCKED |
| 003 | Catalog Filters | P1 | (not dispatched) | 29 | 0 | 0 | 29 | BLOCKED |
| 004 | Search Core | P1 | (not dispatched) | 27 | 0 | 0 | 27 | BLOCKED |
| 005 | Search Filters & Advanced | P1 | (not dispatched) | 33 | 0 | 0 | 33 | BLOCKED |
| 006 | B2C Organization | P1 | (not dispatched) | 39 | 0 | 0 | 39 | BLOCKED |
| 007 | B2C Lists & Shared | P1 | (not dispatched) | 29 | 0 | 0 | 29 | BLOCKED |
| 008 | B2C Members | P1 | (not dispatched) | 18 | 0 | 0 | 18 | BLOCKED |
| 009 | B2C Variations & Configs | P1 | (not dispatched) | 31 | 0 | 0 | 31 | BLOCKED |
| 010 | B2C Bulk Ship Dashboard | P1 | (not dispatched) | 52 | 0 | 0 | 52 | BLOCKED |
| 011 | Checkout Flow | P1 | (not dispatched) | 64 | 0 | 0 | 64 | BLOCKED |
| 012 | Checkout Guest | P1 | (not dispatched) | 12 | 0 | 0 | 12 | BLOCKED |
| 013 | Checkout B2B | P1 | (not dispatched) | 12 | 0 | 0 | 12 | BLOCKED |
| 014 | Orders Frontend | P1 | (not dispatched) | 67 | 0 | 0 | 67 | BLOCKED |
| 015 | Quotes | P1 | (not dispatched) | 30 | 0 | 0 | 30 | BLOCKED |
| 028 | Cart Core | P1 | (not dispatched) | 44 | 0 | 0 | 44 | BLOCKED |
| 029 | Cart Validation & Persistence | P1 | (not dispatched) | 32 | 0 | 0 | 32 | BLOCKED |
| 030 | Cart Merge | P1 | (not dispatched) | 14 | 0 | 0 | 14 | BLOCKED |
| 031 | Auth Login & Register | P1 | (not dispatched) | 33 | 0 | 0 | 33 | BLOCKED |
| 032 | Auth Session & RBAC | P1 | (not dispatched) | 21 | 0 | 0 | 21 | BLOCKED |
| 033 | Auth Company & Account Menu | P1 | (not dispatched) | 14 | 0 | 0 | 14 | BLOCKED |
| 036 | BOPIS Store Selector | P1 | (not dispatched) | 36 | 0 | 0 | 36 | BLOCKED |
| 037 | BOPIS Cart | P1 | (not dispatched) | 44 | 0 | 0 | 44 | BLOCKED |
| 038 | BOPIS Checkout | P1 | (not dispatched) | 8 | 0 | 0 | 8 | BLOCKED |
| 048 | Browser Compatibility | P1 | (not dispatched) | 21 | 0 | 0 | 21 | BLOCKED |
| 070 | Whitelabeling Storefront | P1 | (not dispatched) | 68 | 0 | 0 | 68 | BLOCKED |
| 071 | Whitelabeling Branding | P1 | (not dispatched) | 68 | 0 | 0 | 68 | BLOCKED |
| 072 | Configurable Products UI | P1 | (not dispatched) | 139 | 0 | 0 | 139 | BLOCKED |
| 072b | Configurable Products E2E | P1 | (not dispatched) | 139 | 0 | 0 | 139 | BLOCKED |
| 072c | Configurable Products Cross-Cutting | P1 | (not dispatched) | 139 | 0 | 0 | 139 | BLOCKED |
| 072d | Configurable Products File & Text Sections | P1 | (not dispatched) | 139 | 0 | 0 | 139 | BLOCKED |
| 077 | Coupons & Promotions Storefront | P1 | (not dispatched) | 54 | 0 | 0 | 54 | BLOCKED |
| 081 | Select Shipping Address Popup | P1 | (not dispatched) | — | 0 | 0 | — | BLOCKED |
| 043 | Google Analytics | P2 | (not dispatched) | 24 | 0 | 0 | 24 | BLOCKED |
| 045 | Accessibility Tests | P2 | (not dispatched) | 23 | 0 | 0 | 23 | BLOCKED |
| 046 | Localization Tests | P2 | (not dispatched) | 32 | 0 | 0 | 32 | BLOCKED |
| 047 | Performance Tests | P2 | (not dispatched) | 20 | 0 | 0 | 20 | BLOCKED |

## Bugs Found

None — no test cases executed.

## Retry Log

| Suite | Attempt | Browser | Outcome | Error |
|-------|---------|---------|---------|-------|
| 039 | 1 | playwright-chrome | BLOCKED | `Target page, context or browser has been closed` |
| 040 | 1 | playwright-firefox | BLOCKED | `Target page, context or browser has been closed` |
| 044 | 1 | playwright-edge | BLOCKED | `Target page, context or browser has been closed` |
| All browsers | Recovery | playwright-chrome → navigate | FAILED | Same error — browser context unrecoverable |
| All browsers | Recovery | playwright-firefox → navigate | FAILED | Same error — browser context unrecoverable |
| All browsers | Recovery | playwright-edge → navigate | FAILED | Same error — browser context unrecoverable |

Recovery attempts: 3 (one per server). All failed with identical error. No further retries possible without MCP server restart.

## Environment Health at Run Time

| Check | Result |
|-------|--------|
| Storefront (FRONT_URL) | UP (HTTP 200) |
| Admin SPA (BACK_URL) | UP (HTTP 200) |
| Platform Health (/health) | Healthy (Modules, Cache, Redis all green) |
| GraphQL (/graphql) | UP (HTTP 200) |
| Playwright MCP — playwright-chrome | FAILED (browser context closed) |
| Playwright MCP — playwright-firefox | FAILED (browser context closed) |
| Playwright MCP — playwright-edge | FAILED (browser context closed) |

The application environment itself is healthy. The failure is isolated to the test execution infrastructure (browser MCP contexts).

## Quality Gate Verdict

**BLOCKED — Infrastructure failure. No tests executed. Quality gate cannot be evaluated.**

Per quality gate rules: BLOCKED means no deployment decision can be made. The application environment is healthy, but the regression run could not execute due to Playwright MCP browser context closure. This does not indicate a product defect.

### Gate Calculation
- Pass rate: N/A (0/0 tests executed)
- P0 bug count: 0 (no tests run)
- Blocked rate: 100% (42/42 suites)
- Gate threshold: Frontend regression requires >80% pass rate — not calculable

### Recommended Action
1. Restart Playwright MCP servers (see recovery procedure above)
2. Re-trigger `/qa-regression frontend` immediately after server restart
3. Previous sprint run (REG-2026-05-04-0756) remains the last valid result at 85.3% APPROVED

## Pre-Run Notes for Next Execution

- Payment suites 039/041: MUST use playwright-chrome — CyberSource Microform v2 cross-origin iframes are inaccessible in Firefox MCP accessibility tree
- Payment suite 040: Use canonical cards from `test-data/payment/test-cards.csv` (Skyflow vault rejects non-canonical cards)
- Missing env vars: CYBERSOURCE_3DS_* cards absent — 3DS test cases (PAY-3DS-001/002) will BLOCK regardless of browser health
- Missing env vars: LOCKOUT_TEST_EMAIL/PASSWORD absent — SEC-AUTH-003 will BLOCK
- Missing env var: SKYFLOW_VISA — Skyflow Visa cases use Mastercard card only (SKYFLOW_MASTERCARD=5424000000000015 is set)
- Build state is stale (2026-04-27) — refresh deploy-state-cache.json if GitHub MCP token is renewed before next run
- BrowserStack credentials absent — suite 048 Browser Compatibility cases requiring BrowserStack will BLOCK; local browser fallback for remaining cases
