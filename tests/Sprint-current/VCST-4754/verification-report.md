# VCST-4754 Bug Fix Verification Report

## Bug Summary
Skyflow payment form input borders clipped on checkout payment page. The parent container wrapping the Skyflow iframe used Tailwind's `-mx-1` class (`margin: 0px -4px`), causing the left border of inputs to be cut ~4px. Additionally, the iframe had a fixed `height: 150px` that didn't resize for validation messages, clipping the bottom border of the last row fields.

## Fix Under Test
PR #2212 — Build `2.44.0-pr-2212-9072-9072853e`

## Environment
- **Frontend**: https://vcst-qa-storefront.govirto.com
- **Build**: 2.44.0-pr-2212-9072-9072853e (confirmed in footer)
- **Browser**: Chromium (playwright-chrome)
- **Viewport**: 1920x1080 (desktop)
- **Theme**: Dark mode
- **Account**: Coffee shop / Elena Mutykova (multi-org account)
- **Date**: 2026-03-23

---

## Test Execution Summary

### Scenario 1: Saved Card CVV Re-entry (3 runs)

| Run | Card Used | Left Border Visible | All 4 Borders | Result |
|-----|-----------|--------------------:|:--------------|--------|
| 1   | **** 0015 (09/27) | YES | YES | PASS |
| 2   | **** 0015 (09/27) | YES | YES | PASS |
| 3   | **** 1111 (01/29) | YES | YES | PASS |

**Evidence**: `scenario1-saved-card-cvv-run1.png`, `scenario1-cvv-closeup-run1.png`, `scenario1-saved-card-cvv-run2.png`, `scenario1-saved-card-cvv-run3.png`

### Scenario 2: New Card Form (3 runs)

| Run | Bottom Border Visible | Validation Text Visible | All 4 Borders | Result |
|-----|----------------------:|:-----------------------:|:--------------|--------|
| 1   | YES | YES | YES | PASS |
| 2   | YES | YES | YES | PASS |
| 3   | YES | YES | YES | PASS |

**Evidence**: `scenario2-new-card-form-run1-before-validation.png`, `scenario2-new-card-form-run1.png`, `scenario2-new-card-closeup-run1.png`, `scenario2-new-card-form-run2.png`, `scenario2-new-card-form-run3.png`

---

## Verification Checklist

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Scenario 1 (saved card CVV) -- left border NOT clipped | PASS (3/3) | All runs show complete rounded border on all sides |
| 2 | Scenario 2 (new card form) -- bottom border NOT clipped | PASS (3/3) | Expiration date and Security code bottom borders fully visible, even with validation errors |
| 3 | `-mx-1` compensation | PASS | Outer div still has `-mx-1` (`margin: 0px -4px`) but `overflow: visible`. Padding compensation (`padding: "0 4px"`) is applied within the Skyflow container styles inside the cross-origin iframe (cannot inspect directly, but visual result confirms no clipping) |
| 4 | Dynamic sizing -- no fixed `height: 150px` | PASS | iframe style attribute: `width: 100%` only (no height). Saved card CVV iframe: 150px height (single field, fits). New card form iframe: 245px height (dynamically sized to fit 4 fields + validation messages). No content clipped. |
| 5 | New card payment flow (tokenization) | NOT TESTED | Per instructions, did not complete actual payment. Form rendering and field interaction verified. |
| 6 | Saved card payment flow (CVV entry functional) | PASS | Saved card selection works, CVV field appears and accepts focus/input. "Pay now" button correctly stays disabled until CVV entered. |
| 7 | Console errors | PASS | 0 errors. 4 warnings total: 1x WebSocket connection closed (normal), 3x `postMessage` cross-origin Skyflow (known/expected -- Skyflow iframe is cross-origin). See `console-log.txt` |
| 8 | Validation errors display | PASS | All 4 field validation messages display fully without clipping: "Card number is required.", "Cardholder name is required.", "Security code is required.", "Expiration date is required." Red error borders appear on invalid fields. |
| 9 | BL-CHK-004 (state persistence on decline) | NOT TESTED | No actual payment attempted per instructions |
| 10 | Cross-browser note | INFO | Tested in Chromium only. The fix is CSS/container-level (padding compensation, ComposableContainer). The `-mx-1` + internal padding approach should behave consistently across browsers since it's standard CSS box model. Firefox/Edge testing recommended before merge but low risk. |

---

## DOM Inspection Results

### Outer Container (parent of Skyflow iframe)
```
Classes: -mx-1 w-full max-w-2xl bg-additional-50
Computed margin: 0px -4px
Computed padding: 0px
Overflow: visible
```

### Skyflow iframe (new card form, with validation)
```
Style attribute: width: 100%  (NO fixed height)
Actual height: 245px (dynamically sized by ComposableContainer)
Actual width: 672px
```

### Skyflow iframe (saved card CVV only)
```
Style attribute: width: 100%  (NO fixed height)
Actual height: 150px (adequate for single CVV field)
```

Note: Internal iframe styles cannot be inspected due to cross-origin restrictions (Skyflow SDK hosted on js.skyflow.com). Visual evidence confirms the padding compensation is working correctly.

---

## Additional Observations

1. **Dark mode styling**: The form renders correctly in dark mode with appropriate contrast. Input borders use a light gray/white color that is clearly visible against the dark background.

2. **"Place Order" double-submit prevention (BL-CHK-003)**: Verified that the "Place order" button disables immediately after first click, preventing duplicate orders.

3. **Order total formula (BL-CHK-006)**: Verified on payment page: $233.00 (subtotal) - $0.00 (discount) + $76.60 (tax) + $150.00 (shipping) = $459.60 (total). Correct.

4. **White area below CVV field**: The saved card CVV iframe has a 150px height but the CVV field only uses ~60px of it. The remaining space shows a white area (the `bg-additional-50` background of the container). This is cosmetic but not a regression -- the critical fix is that borders are no longer clipped. A follow-up could tighten the saved card CVV container height, but this is minor.

5. **Saved card dropdown**: Switching between saved cards and "Add new card" correctly swaps the iframe content each time without visual artifacts.

---

## Verdict

**PASS** -- The bug fix in PR #2212 resolves both reported issues:
1. Left border clipping on CVV input (caused by `-mx-1` without compensation) -- FIXED
2. Bottom border clipping on new card form fields (caused by fixed `height: 150px`) -- FIXED

The fix was verified 3 consecutive times for each scenario with consistent results. No new issues introduced. No console errors. Recommended for merge.

---

## Files in This Directory
- `scenario1-saved-card-cvv-run1.png` -- Saved card CVV, Run 1 (full page)
- `scenario1-cvv-closeup-run1.png` -- CVV field closeup, Run 1
- `scenario1-saved-card-cvv-run2.png` -- Saved card CVV closeup, Run 2
- `scenario1-saved-card-cvv-run3.png` -- Saved card CVV closeup, Run 3 (different card: 1111)
- `scenario2-new-card-form-run1-before-validation.png` -- New card form before validation, Run 1
- `scenario2-new-card-form-run1.png` -- New card form with validation (full page), Run 1
- `scenario2-new-card-closeup-run1.png` -- New card form closeup with validation, Run 1
- `scenario2-new-card-form-run2.png` -- New card form closeup with validation, Run 2
- `scenario2-new-card-form-run3.png` -- New card form closeup with validation, Run 3
- `console-log.txt` -- Browser console output
- `network-requests.txt` -- Network requests log
- `verification-report.md` -- This report

---

*Tested by: qa-frontend-expert (Claude Opus 4.6) | 2026-03-23*
