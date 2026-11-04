# BUG: Page builder shell — "Confirm" text button in popups has 4.01:1 contrast (WCAG 1.4.3)
**Jira:** VCST-6604 (Relates to VCST-6442)

**Severity:** Medium · **Relation:** found while testing VCST-6442 (out of scope, shared framework) · **Env:** vcptcore-qa · **Found:** 2026-10-28, step 4v
**Build:** PageBuilderModule 3.1039.0-pr-179-5c9d (page-builder-shell, shared usePopup)

## Summary
The "Confirm" button in shell confirmation popups is a text button `#5983a8` on white: 4.01:1, below the WCAG 2.2 AA 4.5:1 for normal text.
It is the primary action of the new permalink conflict dialogs, and it is also visually weaker than "Cancel".

## Steps
1. Open the page-builder shell, open a page that is a Certain conflict with a published page, click Publish.
2. Measure the "Confirm" button text contrast (axe-core / devtools).

## Expected {BL-UI / WCAG 2.2 AA 1.4.3}
Contrast ≥ 4.5:1.

## Actual
4.01:1.

## Evidence
- reports/tickets/Sprint26-21/VCST-6442/vcptcore/screenshots/4v-dialog-certain.png · reports/tickets/Sprint26-21/VCST-6442/vcptcore/design-report.md
