# BUG: [Sales Rep] Calendar footer "Clear" empties the field but leaves the calendar open over Apply — Low

**Env:** vcptcore-qa, theme `2.59.0-pr-2519-1d9b-1d9bc6dc`. **Provenance: IN-SCOPE** — the footer (`show-footer`) is added by vc-frontend#2519; the pre-PR control (vcptcore-qa1 `2.59.0-pr-2540`) has no footer at all. Found by agent in /qa-test VCST-6001 (2026-10-06); below the 5-file severity floor, not filed.
**Relates:** VCST-6001 (AC3 clearing mechanism) · VCST-5955 (range picker review follow-ups)

## Summary
In the customer-orders Filters drawer, clicking **Clear** in a date field's calendar footer empties that field but keeps the calendar popover open; its day cells overlap and intercept clicks on **Apply** until the rep presses Escape or clicks outside.

## STR
1. Sales rep → `/company/customer-orders` → Filters → Custom date; set Start and End.
2. Open the Start calendar → click **Clear** in its footer.
3. Try to click **Apply**.

## Expected vs Actual
- **Expected:** the calendar closes after Clear (or does not cover Apply).
- **Actual:** the calendar stays open; the first click lands on the calendar, not Apply.

**Why Low:** Escape or a click outside closes it; no data is wrong and Apply works on the next click. Evidence: SBTM-VCST-6001-2026-10-06 (3x), C1 `REG-2026-10-06-1457` SR-CO-045 notes.
