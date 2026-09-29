# FIX-2026-09-25-1723 — VCST-5855 re-fix (Admin blade validation message)

Env: vcst-qa @ Platform 3.1073.0-pr-3121-9965, Loyalty 3.1009.0-pr-18-e3e4 (pre-re-fix build)
Repo: VirtoCommerce/vc-module-loyalty (module, Admin SPA AngularJS) · PR #18 · branch `claude/qa-autofix/VCST-5855` · commit `4411e19`

## Why
A QA re-test found the API fix working, but the Add Mission blade showed only "400: Bad Request" (on create) or "Error 400" (on edit). The validator message never reached the admin, and the Mission tree went blank after a failed save.

## Root cause
In `loyalty-mission-details.js`, create had no error callback and update showed only the status code. The controller returns a raw `{propertyName, errorMessage}[]`, which neither path read. `stripOffUiInformation` also mutated the live entity, which cleared the tree's `templateURL`s.

## Change
One file, +15/−9: a shared `onSaveError` shows the `errorMessage` values, with `Error <status>` as the fallback, and the UI information is now stripped from an `angular.copy`.

## Gates
| Gate | Result |
|---|---|
| G0 triage | PASS — localized, non-breaking, one file |
| G1 route | PASS — vc-module-loyalty, kind module, Admin SPA → fullstack-backend |
| G2 red | PASS — rendered-DOM (visual render harness, real controller + platform + core tree + live CSS) |
| G3 green | PASS — create/edit show the message, tree 6/6; success paths byte-identical; build clean, 15/15 existing tests |
| G4 review | APPROVE (backend-reviewer, HIGH) |
| G5 CI | see summary.json `ci` |
| G6 | needs deploy verification |

PROOF_MEDIUM: rendered-DOM · PROOF_PROVENANCE: built-diff · PROOF_LINKAGE: an error callback on both paths plus strip-a-copy; either alone leaves a red assertion.

## Open
- The "OK wipes the form" symptom did not reproduce in the harness. Verify on deploy.
- A platform `httpError` handler still throws `...'join'` in the console on an array 400 body. That is vc-platform, out of scope.
- The tracker is at Tested with no in-progress/in-review transition available, so it was not moved.

Evidence: 12 screenshots + `harness-results-{before,after}.json` in this folder.
