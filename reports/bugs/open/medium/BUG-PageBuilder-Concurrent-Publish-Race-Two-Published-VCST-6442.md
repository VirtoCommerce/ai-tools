# BUG: Two concurrent publishes of equally specific pages both succeed
**Jira:** VCST-6602 (sub-task of VCST-6442)

**Severity:** Medium · **Ticket:** VCST-6442 (in scope, sub-task) · **Env:** vcptcore-qa · **Found:** 2026-10-28, exploratory 3x + C1 (CMS-PC-027)
**Build:** PageBuilderModule 3.1039.0-pr-179-5c9d

## Summary
The publish conflict check is read-then-write and not atomic. Two `publishing?publish=true` calls for two Certain-equal drafts
sent at the same time can both return 200, leaving two Published pages on one permalink.

## Steps
1. Create drafts A and B: same store, en-US, everyone, no dates, same permalink.
2. Send `POST /api/page-builder-pages/grouped/publishing/{A}?publish=true` and the same for B concurrently (no unpublishConflicting). Repeat 5 times with fresh pairs.

## Expected {SPEC 112409}
Exactly one 200 and one 409; never two Published groups.

## Actual
1 of 4 (3x) and 1 of 5 (C1) pairs: both 200, both Published. With `unpublishConflicting=true` both callers get 200 and one page silently ends up Draft.

## Evidence
- reports/regression/REG-2026-10-28-1917/traces/CMS-PC-027-FAIL-trace.json
- reports/tickets/Sprint26-21/VCST-6442/vcptcore/exploratory/3x-api-evidence.log (m4 race 2, m5) · KB-DA0955FC
