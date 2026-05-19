# Regression Test Report — REG-2026-05-19-1400

## Executive Summary

| Field | Value |
|-------|-------|
| Run ID | REG-2026-05-19-1400 |
| Date | 2026-05-19 |
| Environment | vcst-qa (https://vcst-qa-storefront.govirto.com) |
| Selection | `009` — explicit suite ID (post-.env.vcst rebind verification) |
| Env Rebind Reference | `test-data/b2b/_seed-results-suite-009-restore.json` |
| Total Suites | 1 |
| Passed Suites | 0 |
| Failed Suites | 0 |
| Blocked Suites | 1 (MCP infra failure) |
| Total Cases | 31 |
| Passed | 0 |
| Failed | 0 |
| Blocked — Fixture | 3 (pre-declared, independent of infra) |
| Blocked — MCP Infra | 28 |
| Skipped | 0 |
| Overall Pass Rate | 0.0% |
| Pass Rate (executable cases only) | N/A — no cases executed |
| Platform | 3.1026.0 |
| Theme | vc-theme-b2b-vue-2.49.0-pr-2292-f131d346 |

## Blocking Issue: MCP Browser Infrastructure Failure

**All 31 cases blocked. Root cause: Playwright MCP server browser contexts closed on all 3 slots.**

| Attempt | Browser Slot | Error |
|---------|-------------|-------|
| 1 | playwright-chrome | `Target page, context or browser has been closed` |
| 2 (30s) | playwright-firefox | `Target page, context or browser has been closed` |
| 3 (30s) | playwright-edge | `Target page, context or browser has been closed` |

**Important distinction:** This is NOT a repeat of BUG-009-ENV from REG-2026-05-19-1201. The env rebind was successful — all 8 SKU vars confirmed live via `node -e` probe before dispatch. The vcst-qa application is UP (confirmed env:check). The failure is MCP process state only.

**Remedy:** Close any open Chrome/Firefox/Edge browser windows, then restart the Playwright MCP server processes (or restart Claude Code), then re-run `009`.

## Suite Results

| Suite | Name | Browser | Tests | Pass | Fail | Blocked | Rate | Attempts |
|-------|------|---------|-------|------|------|---------|------|----------|
| 009 | B2C Variations & Configs | chrome→firefox→edge | 31 | 0 | 0 | 31 | 0.0% | 3 |

## Pre-Declared Fixture Blocks (independent of MCP state)

These 3 cases are BLOCKED-FIXTURE regardless of browser availability. They require catalog fixtures that do not exist on vcst-qa post-2026-05-15 restore:

| Case | Title | Reason |
|------|-------|--------|
| B2C-VAR-004 | Product Variations - Out of Stock Variant | No intra-variant OOS parent product. QA-OOS-001 is fully OOS (whole product), not a parent with mixed in-stock/OOS variant children |
| B2C-VAR-005 | Product Variations - Price Updates by Variant | No variation product with per-variant pricing in B2B-mixed. All variation products (Flannel Shirts, Beats Solo 2) share parent-level pricing |
| B2C-CONFIG-007 | Product Configuration - Bundle/Kit Builder | No BillOfMaterials or multi-step component-picker product in catalog |

These are NOT product bugs. They are missing fixture gaps documented in `test-data/b2b/_seed-results-suite-009-restore.json` (stillMissing[] array).

## Bugs Found

None — no cases executed.

## Retry Log

| Suite | Attempt | Browser | Outcome | Error | Delay |
|-------|---------|---------|---------|-------|-------|
| 009 | 1 | playwright-chrome | browser_context_closed | Target page, context or browser has been closed | 0s |
| 009 | 2 | playwright-firefox | browser_context_closed | Target page, context or browser has been closed | 30s |
| 009 | 3 | playwright-edge | browser_context_closed | Target page, context or browser has been closed | 30s |

## Comparison vs REG-2026-05-19-1201 (BUG-009-ENV)

| Metric | REG-2026-05-19-1201 | REG-2026-05-19-1400 | Delta |
|--------|--------------------|--------------------|-------|
| Cases blocked | 31 | 31 | 0 |
| Root cause | Dead env var bindings (TEST_SKU/CONFIGURABLE_SKU undefined, pointed at wiped products) | MCP browser context failure (all 3 slots closed) | Different cause |
| Env vars | Not rebound | Rebound and verified live | Fixed |
| Application health | UP | UP | No change |
| Fixture blocks | Not separately identified | 3 pre-declared BLOCKED-FIXTURE | Improvement in diagnosis |
| Executable cases | 0 of 31 | 0 of 31 (blocked by infra) | Same count, different reason |

The env rebind fix is complete and verified. BUG-009-ENV is resolved at the data layer. The 28 non-fixture cases are ready to execute — they are blocked only by MCP browser infrastructure, not by missing data.

## Quality Gate

Suite 009 is P1. No quality gate evaluation is possible for a 0-executed run. Gate evaluation deferred to next execution attempt.

## Next Steps

1. Close all open Chrome/Firefox/Edge windows on the host machine
2. Restart Playwright MCP servers (or restart Claude Code)
3. Re-run `009` — expected outcome: ~28/28 executable cases reach pass/fail verdict; 3 remain BLOCKED-FIXTURE
