# Orders date-filter "Open calendar" buttons (Start/End) share an identical accessible name — P3

**Jira:** already filed as [VCST-5718](https://virtocommerce.atlassian.net/browse/VCST-5718) (Draft) — still reproduces in REG-2026-10-02-2022; not re-filed.

**Env:** vcst-qa @ suite 014 (REG-2026-08-10-1144), case ORD-076

## Summary
Both the Start-date and End-date "Open calendar" buttons in the orders date-filter expose the identical accessible name "Open calendar" — a screen-reader user cannot tell them apart by name alone.

## STR
1. Navigate to `/account/orders`, open the Filters popover.
2. Query the accessibility tree for buttons named "Open calendar".

## Expected vs Actual
- **Expected:** Two distinct accessible names, e.g. "Open Start date calendar" / "Open End date calendar".
- **Actual:** Both buttons expose the identical name "Open calendar".

## Fix Routing
- **Repo:** vc-frontend — orders date-filter component: give the Start/End "Open calendar" buttons distinct `aria-label`s.
- **Kind:** frontend
