# BUG: PUT /grouped on a Published page changes permalink or audience without the conflict check
**Jira:** VCST-6722 (sub-task of VCST-6442)

**Severity:** High · **Ticket:** VCST-6442 (in scope, sub-task) · **Env:** vcptcore-qa · **Found:** 2026-10-29, round 2 (C1 CMS-PC-029, checklist R2-13; reproduced again by the orchestrator) · **Still deployed:** 2026-11-06
**Build:** PageBuilderModule 3.1041.0-pr-179-5e6c · Pages 3.1013.0-alpha.93-vcst-6442 (= pr-24-5782) · XCMS 3.1010.0-pr-28-35cb

## Summary
The conflict check runs when a page is published. `PUT /api/page-builder-pages/grouped` can change the permalink or
audience of a page that is ALREADY Published, and that save does not call the conflict check. So a live page can be
moved onto a permalink where an equally specific (Certain) page is live, and two Published pages end up competing.
The landing-page form's Save sends the same request.

## Steps
1. A: publish page LIVE (B2B-store, en-US, everyone, no dates) on permalink P1.
2. Publish page TGT (same store, language, everyone) on another permalink P2.
3. `PUT /api/page-builder-pages/grouped` for TGT with permalink P1 (status stays Published).
4. B: publish EVERY (everyone) and ORGP (organization A) on permalink P3, then `PUT /grouped` for ORGP with `organizationId: null`.

## Expected {SPEC 112272, 112409}
The same result as publishing onto that permalink: 409 with `{error, conflicts}` (Certain), or the change is saved
but the page goes back to Draft. Never two Published pages that are a Certain conflict.
The comments describe the rule for publishing only, so please confirm what a settings change on a live page should do.

## Actual
200. TGT stays Published on P1. Search for P1 returns 2 Published en-US groups, organization empty (TGT + LIVE). `permalink-usages`
reports them as Certain. `slugInfo` switches to the moved page, so the other live page is never shown.
Same in part B: 2 Published groups with empty organization on P3.

## Impact
The bypass of VCST-6601 is open again on a different route. It does not need the REST API: an editor saving the landing-page form does this.

## Evidence
- reports/regression/REG-2026-10-29-1639/traces/CMS-PC-029-FAIL-trace.json
- reports/tickets/Sprint26-21/VCST-6442/vcptcore/testing-checklist.md (R2-13), test-model.md #30
- Code at 5e6ccbf: the `PUT /grouped` save path does not call the conflict service
