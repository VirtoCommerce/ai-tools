# Regression Report: REG-2026-03-24-1030 (Final)

**Date:** 2026-03-24
**Selection:** Suite 072b — Configurable Products E2E
**Trigger:** Manual `/qa-regression 072b` (post `/qa-seed-data catalog`)
**Batches:** 4 (chrome x2, edge x1, firefox x1)

## Environment

| Property | Value |
|----------|-------|
| Frontend | https://vcst-qa-storefront.govirto.com |
| Backend | https://vcst-qa.govirto.com |
| Platform | 3.1009.0 |

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Cases | 54 |
| Executed | **20** |
| Passed | **19 (95.0% of executed)** |
| Failed | **1** |
| Blocked | 34 |
| Bugs Found | **1 (High)** |
| Orders Created | CO260324-00005, -00006, -00007 |
| Verdict | **PARTIAL PASS — 95% execution pass rate, 1 bug** |

## Progress Across Session

| Run | Passed | Failed | Blocked | Delta |
|-----|--------|--------|---------|-------|
| REG-0729 (before seed) | 4 | 0 | 50 | Baseline |
| REG-1030 Batch 1 | 9 | 0 | 45 | +5 |
| REG-1030 Batch 2 | 15 | 1 | 38 | +6, +1 bug |
| REG-1030 Checkout | 19 | 1 | 34 | +4 |
| REG-1030 File Upload | 19 | 1 | 34 | No change (all blocked) |

## Bug Report

### BUG_072b_001 — OOS Configuration Option Selectable (High)

| Field | Value |
|-------|-------|
| Test Case | CFG-E2E-009 |
| Product | AGENT-TEST-Config-OOS-Bike-20260324 |
| Business Rule | BL-CAT-006 |
| Severity | **High** |
| Confirmed | No (preliminary) |

**Description:** Out-of-stock configuration option (Limited Edition Black, qty=0) in the Frame Color section is fully selectable on the storefront. No visual differentiation (disabled state, greyed out, "Out of Stock" label) between OOS and in-stock options.

**Expected:** OOS option should be visually disabled/greyed out and not selectable, or show an "Out of Stock" indicator.

**Actual:** All 4 radio options appear identical and selectable regardless of inventory level.

**Screenshot:** `cfg-e2e-009-oos-bike.png`

## Passed Tests (19)

### Batch 1 — Core E2E (Chrome)
| ID | Title | Priority |
|----|-------|----------|
| CFG-E2E-001 | Create Bike with Optional Radio Section | Critical |
| CFG-E2E-002 | Optional Section Add-to-Cart Without Upgrade | Critical |
| CFG-E2E-003 | Selected Upgrade Reflected in Cart | Critical |
| CFG-E2E-004 | Laptop with Two Required Sections | Critical |
| CFG-E2E-005 | Required Sections Block Add-to-Cart | Critical |
| CFG-E2E-006 | All 9 Multi-Section Combinations Correct | High |
| CFG-E2E-041 | Same Product Different Configs = Separate Items | High |
| CFG-E2E-047 | Widget State After Page Refresh | High |
| CFG-E2E-049 | Section Order Matches Admin | High |

### Batch 2 — Sale/OOS/Text (Chrome)
| ID | Title | Priority |
|----|-------|----------|
| CFG-E2E-007 | Multi-Section Config Preserved in Cart | High |
| CFG-E2E-008 | Sale Price and Strikethrough Display | High |
| CFG-E2E-017 | Required Text Section Input | Critical |
| CFG-E2E-018 | Required Text Blocks Empty Add-to-Cart | Critical |
| CFG-E2E-019 | Optional Text Section Empty and Filled | Critical |

### Batch 3 — Checkout/Payment (Edge)
| ID | Title | Priority |
|----|-------|----------|
| CFG-E2E-010 | Full Purchase Flow (PDP → Order History) | Critical |
| CFG-E2E-011 | Multiple Configurable Products in Checkout | High |
| CFG-E2E-012 | Cart Qty Update Preserves Configuration | High |
| CFG-E2E-043 | Hard Reload on Checkout Preserves Config | High |
| CFG-E2E-044 | Reorder from Order History | High |

## Blocked Tests (34)

### File Upload Tests (8) — Missing File Section in Seeded Data
CFG-E2E-021 through 024, 030 through 033. The seeded products don't have File-type configuration sections, and the pre-existing products with File sections (configurable-hat, custom-t-shirt) return 404. **Resolution:** Re-seed with File section or verify pre-existing product URLs.

### Admin Modification Tests (4) — Destructive Operations
CFG-E2E-013 through 016. These modify/delete sections and options in admin. Skipped to preserve seeded data.

### Remaining Tests (22) — Not Yet Executed
| Category | Tests | Count |
|----------|-------|-------|
| Security/Boundary | 027-029, 034-036 | 6 |
| Concurrency | 037-039, 051, 054 | 5 |
| State Management | 040, 042 | 2 |
| Wishlist/Reorder | 045 | 1 |
| Stock Limits | 046 | 1 |
| Multi-section/Mixed | 025-026 | 2 |
| Variation Sections | CFG-VAR-019, 020 | 2 |
| Text Through Checkout | 020 | 1 |
| Non-configurable | 048 | 1 |
| Admin Edit (name) | 050 | 1 |

## Key Findings

1. **Price calculation engine: SOLID** — All tested combinations returned exact correct values (9/9 for Laptop matrix)
2. **Config → Cart → Checkout pipeline: WORKING** — Configuration details preserved through entire purchase flow across 3 orders
3. **CyberSource payment: FUNCTIONAL** — Payment form renders in iframe on cart page, test card accepted, orders created
4. **Text sections: WORKING** — Required validation blocks empty input, optional allows empty, custom text preserved in cart
5. **Sale pricing: CORRECT** — Strikethrough list price + sale price displayed correctly with option math
6. **OOS handling: BUG** — Out-of-stock options not visually differentiated (BUG_072b_001)

## Artifacts

| File | Description |
|------|-------------|
| `suite-072b-results.json` | Batch 1 results (9 tests) |
| `suite-072b-remaining-results.json` | Batch 2 results (7 tests) |
| `suite-072b-checkout-results.json` | Checkout batch (6 tests) |
| `suite-072b-file-upload-results.json` | File upload batch (8 tests) |
| `cfg-e2e-009-oos-bike.png` | Bug evidence screenshot |
| `test-run-status.json` | Final status tracker |
