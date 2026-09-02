# BUG — vc-shell confirmation popup loses its heading and close control at mobile width [Low]

**Env:** vcmp-dev Vendor Portal — `@vc-shell/framework` 2.6.0-rc.0, build `98032` (2026-09-02 11:23 GMT), Chrome, Light theme, viewport **390×844**.

## Summary
At mobile width the confirmation popup becomes full-screen and drops its header — no title, no heading, and no close (X). Confirm/Cancel remain pinned to the bottom, and Escape still works, so it is dismissable; what is lost is the dialog's own label and its visible dismiss affordance.

## STR
1. Resize to **390×844**.
2. Open a product blade and press **Delete**.

## Expected vs actual
**Expected:** the dialog keeps an accessible name and a visible dismiss control at every viewport.
**Actual:** full-screen panel with no header region; only Confirm / Cancel at the bottom.

## Unverified detail — do not treat as settled
Whether the **body text** ("Are you sure you want to delete this product?") still renders at this width was **not confirmed**. If it does, the defect is the missing label + dismiss affordance. If it does not, a destructive dialog is being shown with no statement of what it will delete, which would be materially worse than `Low` and should be re-graded. **Confirm this before acting on the severity.**

## Notes
Below the `/qa-test` 5d severity floor (`Low`) as currently understood, so deliberately **not** filed to the tracker — see the caveat above.
Found incidentally during the VCST-5632 / VCST-5670 re-verification. Whether this is an rc regression or long-standing mobile behaviour was not established.
