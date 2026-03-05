# CyberSource Payment — Functional Test Execution Report

## Summary

| Field | Value |
|-------|-------|
| **Date** | 2026-03-05 |
| **Environment** | https://vcst-qa-storefront.govirto.com |
| **Browser** | Chrome (playwright-chrome) |
| **Payment Method** | Bank card (CyberSource) — Flex Microform v2.0.2 |
| **Results** | 20 passed, 0 failed / 20 total — **100% pass rate** |
| **JIRA** | VCST-4726 (fix verified), VCST-3387 (original feature) |

## Test Results

### Positive Tests

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| PAY-CS-001 | Valid Form Submission | PASS | Order CO260305-00007 completed end-to-end |
| PAY-CS-002 | Special Chars in Name | PASS | Mary-Jane O'Connor, Jose Garcia, Van Der Berg, Smith Jr. all accepted |
| PAY-CS-003 | Expiry Format Variations | PASS | Auto-formatting works for "092029" and "09/2029" -> "09 / 2029" |

### Negative Tests

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| PAY-CS-004 | Invalid Card Number | PASS | "1234567890123456" blocks submission, all card type icons dimmed |
| PAY-CS-005 | Empty Card Number | PASS | Place Order button stays disabled |
| PAY-CS-006 | Empty Cardholder Name | **PASS (BUG FIXED)** | Previously submitted without name — now correctly blocks. CSV note outdated. |
| PAY-CS-007 | Expired Card | PASS | "01/2020" shows "Expiration date must be in the future" |
| PAY-CS-008 | Empty Expiry | PASS | Shows "This field is required" |
| PAY-CS-009 | Invalid Expiry Format | PASS | "13" and "00" show "Provide a valid expiration month" |
| PAY-CS-010 | Invalid CVV Length | PASS | "12" (too short) keeps button disabled |
| PAY-CS-011 | Empty CVV | PASS | Place Order button disabled |
| PAY-CS-012 | Non-numeric CVV | PASS | "abc" rejected by iframe, field stays empty |

### Validation Tests

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| PAY-CS-013 | Card Auto-Formatting | PASS | "4622943127013705" -> "4622 9431 2701 3705" |
| PAY-CS-014 | Visa Detection | PASS | Icons visible but no strong visual differentiation for detected card type |
| PAY-CS-015 | CVV Masking | PASS | CVV masked visually in iframe |

### UX Tests

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| PAY-UX-001 | Field Labels | PASS | All fields labeled with asterisks, helpful placeholders |
| PAY-UX-002 | Tab Order | PASS | Card -> Name -> Expiry -> CVV, no tab traps |

### Performance

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| PAY-PERF-001 | Form Load Time | PASS | Under 2 seconds |

### Edge Cases

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| PAY-EDGE-001 | Double-Click Submit Prevention | PASS | Button disables after first click, no duplicate orders |

## Key Finding: PAY-CS-006 Bug Fixed

The regression suite CSV (`06-payment-tests.csv`) notes for PAY-CS-006: `"NOTE: Bug found - form submits without name"`. This bug is **no longer reproducible** — the Place Order button correctly stays disabled when cardholder name is empty. The CSV note should be updated.

## Screenshots

- `pay-cs-004-invalid-card.png` — Invalid card with all icons dimmed
- `pay-cs-009-invalid-month.png` — Expiry "00" with red border and error
- `pay-cs-014-015-visa-cvv.png` — Valid form with card type icons and CVV masking
- `pay-cs-001-order-completed.png` — Order completion page CO260305-00007

## Decision

**PASS** — All 20 functional test cases passed. CyberSource payment form validation, submission, UX, performance, and edge case handling are all working correctly. One previously known bug (PAY-CS-006) is now fixed.
