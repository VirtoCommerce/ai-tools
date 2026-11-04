# BUG: POST /grouped with status Published bypasses the permalink conflict check
**Jira:** VCST-6601 (sub-task of VCST-6442)

**Severity:** High · **Ticket:** VCST-6442 (in scope, sub-task) · **Env:** vcptcore-qa · **Found:** 2026-10-28, exploratory 3x + C1 (CMS-PC-026)
**Build:** PageBuilderModule 3.1039.0-pr-179-5c9d · Pages 3.1011.0-pr-24-8c93 · XCMS 3.1009.0-pr-28-7ebe

## Summary
The conflict check added by vc-module-pagebuilder#179 runs only in `POST grouped/publishing/{id}`. Creating a group with
`POST /api/page-builder-pages/grouped` and `status: "Published"` publishes it directly, so a second, equally specific page
goes live on a permalink that already has a published page.

## Steps
1. Publish page X: store B2B-store, en-US, everyone, no dates, permalink P.
2. `POST /api/page-builder-pages/grouped` with `{status:"Published", pages:[{status:"Published", ...}]}`, same store, language, targeting and permalink P.

## Expected {SPEC 112407 A2/A8, 112409}
409 with `{error, conflicts}` (or the group is saved as Draft). Never two Published groups that are a Certain conflict.

## Actual
200. Both groups Published and indexed; `pageDocuments` for P returns totalCount 2. (`PUT /grouped` with Published does not publish.)

## Impact
Any client of the REST API (import tools, the AI publish tool, integrations) can create exactly the undefined state the ticket fixes.

## Evidence
- reports/regression/REG-2026-10-28-1917/traces/CMS-PC-026-FAIL-trace.json
- reports/tickets/Sprint26-21/VCST-6442/vcptcore/exploratory/3x-api-evidence.log (sections m3, m4) · KB-304E47CC
