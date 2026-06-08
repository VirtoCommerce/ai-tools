# FIX-2026-06-08-1538 — VCST-5212

**Ticket:** [VCST-5212](https://virtocommerce.atlassian.net/browse/VCST-5212) — `GET /api/platform/modules` 500 NRE in `ModulesController.IconFileExists` (null local IconUrl)
**Repo:** VirtoCommerce/vc-platform (kind: platform) · **Branch:** `claude/qa-autofix/VCST-5212` · **Base:** `dev`
**PR:** https://github.com/VirtoCommerce/vc-platform/pull/3051 (open, not merged)

## Root cause
`GetModules()` builds the list from two collections. The `Where(x => !string.IsNullOrEmpty(x.IconUrl))` guards the *management* descriptor, but `IconFileExists(localModule)` runs on the *local* module, whose `IconUrl` can be null → `moduleIconUrl.StartsWith('/')` NREs → endpoint 500. Non-deterministic (depends on module load state).

## Fix
One-line null/empty guard at the top of `IconFileExists` (`return false` for null/empty IconUrl) — semantically identical to the caller's existing `? localModule.IconUrl : null` fallback. No contract/DTO/schema/manifest change, no refactor.

Files (2): `src/VirtoCommerce.Platform.Web/Controllers/Api/ModulesController.cs` (+5), `tests/VirtoCommerce.Platform.Web.Tests/Controllers/Api/ModulesControllerTests.cs` (new, +88, ADD only).

## Gate results
| Gate | Result |
|------|--------|
| G0 eligibility | PASS — simple, localized, non-breaking, code-fixable |
| G1 single repo | PASS — vc-platform (HIGH-confidence routing block confirmed) |
| G2 reproduce (red) | PASS — new test threw NRE at `ModulesController.cs:543` on `dev` |
| G3 fix (green) | PASS — guard turns it green; all 93 Web.Tests pass, unmodified |
| G4 code review | APPROVE (backend-reviewer, HIGH) |
| G5 CI green | PENDING — GH Actions in progress (build / test-and-sonar / CodeQL / ci). `license/cla` pending (bot account must sign CLA) |
| G6 E2E / deploy | DEFERRED — backend static-only in CI; PR flagged "needs deploy verification"; closes post-merge via `/qa-verify-fix VCST-5212` |
| G7 human review | PR open, NOT merged. JIRA: In review |

**Confidence:** HIGH. **Token preflight note:** `GITHUB_FIX_BUGS_TOKEN` had a stray inline `#(expires …)` comment glued to the value (broke auth); stripped to its own comment line in `.env.local`.
