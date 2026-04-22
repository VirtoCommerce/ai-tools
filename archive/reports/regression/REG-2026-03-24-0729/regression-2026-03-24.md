# Regression Report: REG-2026-03-24-0729

**Date:** 2026-03-24
**Selection:** Suite 072b — Configurable Products E2E
**Trigger:** Manual `/qa-regression 072b`

## Environment

| Property | Value |
|----------|-------|
| Frontend | https://vcst-qa-storefront.govirto.com |
| Backend | https://vcst-qa.govirto.com |
| Health | All Healthy (Modules, Cache, Redis, SQL Server) |

## Executive Summary

| Metric | Value |
|--------|-------|
| Suites Run | 1 |
| Total Cases | 54 |
| Passed | 4 (7.4%) |
| Failed | 0 |
| Blocked | 50 (92.6%) |
| Verdict | **BLOCKED** |

**Root Cause:** 50 of 54 test cases were blocked due to missing pre-seeded test data. Suite 072b is an E2E suite where early tests (CFG-E2E-001, 004, 010, etc.) create configurable products in admin that subsequent tests depend on. The agent was unable to complete the multi-step admin product creation workflow (blade navigation, section/option configuration), which cascaded to block all dependent tests.

## Suite Results

### 072b — Configurable Products E2E (54 cases)

**Browser:** playwright-chrome | **Pass Rate:** 7.4% (4/54)

#### Passed (4)

| ID | Title | Notes |
|----|-------|-------|
| CFG-E2E-047 | Configuration Widget State After Page Refresh | Widget renders after F5, selection retained |
| CFG-E2E-048 | Configuration Widget NOT Shown for Non-Configurable Product | Widget absent on standard PDP — correct |
| CFG-E2E-049 | Configuration Section Order Matches Admin | Section order preserved on storefront |
| CFG-E2E-050 | Edit Option Name in Admin -- Verify on Storefront | Name change reflected within 15s |

These 4 tests passed because they use **existing** configurable products in the QA environment (Bike with options, Off-Road Bike) rather than requiring fresh product creation.

#### Blocked (50)

Tests CFG-E2E-001 through CFG-E2E-046 and CFG-E2E-051 through CFG-E2E-054 were blocked due to:

1. **Missing test products (46 tests):** 10 products need to be created from scratch: Test Config Bike, Laptop, Sale Bike, OOS Bike, Checkout Bike, Engraved Ring, Custom Jersey, Gift Box, Phone Case, Custom Bike
2. **Test data drift (4 tests):** Configuration/pricing data in CSV doesn't match current environment state

## Bugs Found

None — no test failures detected. All non-passing tests were BLOCKED, not FAIL.

## Retry Log

No retries needed.

## Cleanup Notes

- CFG-E2E-050 changed option name from "new" to "Premium Seat V2" in Bike with options > Test section. Manual restoration recommended.

## Recommendations

1. **Pre-seed test data:** Run `/qa-seed-data catalog` to create the 10 required configurable products before re-running this suite
2. **Refactor CSV:** Consider splitting suite 072b into:
   - Tests using existing products (currently passing — tests 047-050)
   - Tests requiring fresh product creation (need seeding or dedicated admin setup agent)
3. **Update stale test data:** Tests 051-054 reference prices/options that have drifted from QA environment state — run `/qa-sync-tests suite 072b` to align

## Artifacts

- Results JSON: `reports/regression/REG-2026-03-24-0729/suite-072b-results.json`
- Status tracker: `reports/regression/test-run-status.json`
