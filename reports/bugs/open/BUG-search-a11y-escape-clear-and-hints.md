# Search autocomplete: Escape doesn't close hints, clear button unlabeled, clear collapses dropdown — P3

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
Three related accessibility/behavior defects in the storefront search bar autocomplete: Escape fails to close the hints dropdown, the clear (X) button exposes no accessible name, and clicking clear collapses the dropdown entirely instead of reverting to the Hints state. WCAG 2.4.4 and 4.1.2.

## STR
1. Focus the storefront search bar (hints dropdown appears).
2. Arrow-down to highlight a hint, then press **Escape** — dropdown does not close (SRCH-NEW-025).
3. Type a query so the clear (X) button appears; inspect the a11y tree — the X has no accessible name (SRCH-NEW-026).
4. Click the clear (X) button — the dropdown closes entirely instead of returning to the Hints state (SRCH-NEW-004).

## Expected vs Actual
- **Expected:** Escape closes the hints dropdown; the clear button has an accessible name (e.g. "Clear search"); clicking clear reverts the field to the initial Hints state.
- **Actual:** Escape leaves the hints dropdown open; the clear button is unlabeled in the a11y tree; clicking clear dismisses the dropdown completely.

## Evidence
![Escape does not close hints](screenshots/SRCH-NEW-025-escape-no-close.png)

## Refs
WCAG 2.4.4 (Link Purpose), 4.1.2 (Name, Role, Value).

## Fix Routing
- **Repo:** vc-frontend (search bar / autocomplete component)
- **Kind:** frontend
