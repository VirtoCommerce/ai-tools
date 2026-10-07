# BUG: [Sales Rep][a11y] Closing a date calendar returns focus to the input, not to the "Open calendar" button that opened it — Low

**Env:** vcptcore-qa, theme `2.59.0-pr-2519-1d9b-1d9bc6dc`; also on control vcptcore-qa1 `2.59.0-pr-2540` (no #2519) ⇒ **PRE-EXISTING**. Found by agent in /qa-test VCST-6001 (2026-10-06); below the 5-file severity floor, not filed.
**Relates:** VCST-6001 · BL-A11Y-001 (return focus to the trigger)

## Summary
Opening a date field's calendar with the keyboard (Tab to **Open calendar: Start date** → Enter) and closing it with Escape — or picking a day with Enter — moves focus to the date **input**, not back to the calendar button that opened the dialog. Happens in split and combined layouts.

## STR
1. Sales rep → `/company/customer-orders` → Filters → Custom date.
2. Tab to **Open calendar: Start date** → Enter → Escape. Check `document.activeElement`.

## Expected vs Actual
- **Expected:** focus returns to the triggering button (WAI-ARIA date-picker dialog pattern, BL-A11Y-001).
- **Actual:** focus is on the Start date input.

**Why Low:** focus stays inside the field group next to the trigger, and the input owns `aria-haspopup="dialog"`, so the keyboard user is not lost. Evidence: C1 `REG-2026-10-06-1457` SR-CO-051; 4v `design-report.md` B12.
