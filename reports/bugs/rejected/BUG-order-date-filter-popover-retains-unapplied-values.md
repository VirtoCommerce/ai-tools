# Orders date-filter popover retains un-applied Start/End values on reopen after outside-click dismiss — P3

> **Not filed 2026-10-05 — QA owner decision (draft kept after outside-click is acceptable).**

**Env:** vcst-qa @ suite 014 (REG-2026-08-10-1144), case ORD-075

## Summary
Selecting Start/End dates in the orders date-filter popover, then dismissing it via an outside click without clicking Apply, correctly discards the filter itself — but reopening the popover shows the stale un-applied dates still populated in the Start/End inputs.

## STR
1. Open `/account/orders`, open the date-filter popover.
2. Select a Start and End date but do NOT click Apply.
3. Click outside the popover to dismiss it.
4. Reopen the popover.

## Expected vs Actual
- **Expected:** Reopening shows empty (or the last *applied*) Start/End values, since the selection was never applied.
- **Actual:** The popover reopens with the previously-selected, never-applied Start/End dates still shown — even though the order list itself correctly shows no filter was applied.

![Stale dates retained on reopen](screenshots/ORD-075-FAIL-stale-dates-retained-on-reopen.png)

## Fix Routing
- **Repo:** vc-frontend — orders date-filter popover: reset the local Start/End input state (not just the applied filter) on outside-click dismiss without Apply.
- **Kind:** frontend
