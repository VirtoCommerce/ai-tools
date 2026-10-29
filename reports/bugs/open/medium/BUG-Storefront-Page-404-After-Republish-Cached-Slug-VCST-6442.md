# BUG: Storefront shows "404 Page not found" for a page right after it is republished
**Jira:** VCST-6603 (sub-task of VCST-6442)

**Severity:** Medium · **Ticket:** VCST-6442 (AC Frontend #4, sub-task) · **Env:** vcptcore-qa · **Found:** 2026-10-28, step 4a frontend
**Build:** theme vc-theme-b2b-vue-2.61.0-pr-2601-8058 · Pages 3.1011.0-pr-24-8c93 · XCMS 3.1009.0-pr-28-7ebe · PageBuilder 3.1039.0-pr-179-5c9d

## Summary
Publishing a page with changes gives it a new page id. The storefront keeps the cached `slugInfo` result and requests
`pageDocument` with the OLD id, gets `null` and renders 404 instead of the page.

## Steps
1. Sign in to the storefront (B2B-store) and open a page-builder page (/agent-test-vcst6442-f-4).
2. Edit and republish the page in the admin (or via REST `grouped/publishing/{id}?publish=true`).
3. In the open tab, go to another page (footer "Catalog"), then press Back.

## Expected {SPEC 112407 Frontend #4}
The page renders (new content), never an empty page.

## Actual
No new `slugInfo` request; `getPageDocument(id:"<old id>")` → `{"pageDocument":null}`; "404 Page not found" until a full reload (2 of 2).
Also: a full reload during the ~0.5 s of the publish call renders 404 with no retry (2 of 74 samples).

## Notes
Not proven to predate the ticket (no control env without these builds). Likely fix area: vc-frontend (re-resolve the slug or retry once on null).

## Evidence
- reports/tickets/Sprint26-21/VCST-6442/vcptcore/screenshots/4a-fe-F4-spa-back-404-after-republish.png
- reports/tickets/Sprint26-21/VCST-6442/vcptcore/screenshots/4a-fe-F4-reload-during-republish.png · KB-45981F33
