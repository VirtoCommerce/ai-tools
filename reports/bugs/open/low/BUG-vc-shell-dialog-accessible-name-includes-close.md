# BUG — vc-shell confirmation dialog's accessible name absorbs its close button [Low]

**Env:** vcmp-dev Vendor Portal — `@vc-shell/framework` 2.6.0-rc.0, build `98032` (2026-09-02 11:23 GMT), Chrome, Light theme.

## Summary
The dialog's close button sits inside the `<h3>` used as the dialog's label, so the button's text is concatenated into the dialog's accessible name, which computes as **"Confirmation Close"**.

## STR
1. Open a product blade and press **Delete**.
2. Read the dialog's accessible name (ARIA snapshot or any AT).

## Expected vs actual
**Expected:** `dialog "Confirmation"`.
**Actual:** `dialog "Confirmation Close"` — the trailing "Close" is the close control's own name leaking into the label.

## Fix sketch
Move the close button out of the labelling element, or point `aria-labelledby` at a span wrapping only the title text.

## Notes
Below the `/qa-test` 5d severity floor (`Low`), so deliberately **not** filed to the tracker.
Found incidentally during the VCST-5632 / VCST-5670 re-verification. No AT pass was run — this is a computed accessible name.
