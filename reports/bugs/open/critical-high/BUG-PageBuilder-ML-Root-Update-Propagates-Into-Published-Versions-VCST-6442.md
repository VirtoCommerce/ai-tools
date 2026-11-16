# BUG: Multilanguage page root update moves Published versions onto a used permalink without the conflict check
**Jira:** VCST-6723 (sub-task of VCST-6442)

**Severity:** High · **Ticket:** VCST-6442 (in scope, sub-task) · **Env:** vcptcore-qa · **Found:** 2026-10-29, round 2 (C1 CMS-PC-030, checklist R2-14) · **Still deployed:** 2026-11-06
**Build:** PageBuilderModule 3.1041.0-pr-179-5e6c · Pages 3.1013.0-alpha.93-vcst-6442 (= pr-24-5782) · XCMS 3.1010.0-pr-28-35cb

## Summary
`PUT /api/page-builder-multilanguage-pages` copies the root's permalink and audience (permalink, visibility, user groups,
organization, dates) into every language version that does not override them. That includes versions that are already Published, and
the copy does not call the conflict check. So a live version can land on a permalink where an equally specific
standalone page is live.

## Steps
1. A: publish a standalone page LIVE (B2B-store, en-US, everyone) on permalink P1.
2. Create a Multilanguage Page on P2 with en-US and de-DE versions, and publish both.
3. `PUT /api/page-builder-multilanguage-pages`: change the root permalink to P1.
4. B: publish standalone EVERY2 (everyone) on P3 and an ML page whose en-US version EN2 is for organization A on P3, then
   change the root's `organizationId` to null.

## Expected {SPEC 112272, 112409, 112508}
Same as Publish all (112508): an en-US version that would completely replace the live page is not left Published next to it
(409, or that version goes back to Draft with the "Not published: en-US" report). Never two Published pages that are a Certain conflict.

## Actual
200. en-US and de-DE take P1 and stay Published. Search for P1 returns 2 Published en-US groups (the version and LIVE).
`permalink-usages` reports them as Certain. `slugInfo` serves the ML version, so the standalone page is hidden.
Same in part B: EN2 takes organization null and stays Published, so P3 has 2 Published en-US groups with empty organization.

## Impact
An editor saving the root settings of a live Multilanguage Page can create the undefined state this ticket fixes.
Publish all checks for this, but the root save does not.

## Evidence
- reports/regression/REG-2026-10-29-1639/traces/CMS-PC-030-FAIL-trace.json
- reports/tickets/Sprint26-21/VCST-6442/vcptcore/testing-checklist.md (R2-14), test-model.md #31
- Code at 5e6ccbf: root update → `SaveGroupSettingsAsync`, with no call to the conflict service
