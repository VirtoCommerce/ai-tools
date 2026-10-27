# FIX-2026-10-20-1648 — VCST-6143: mission progress bars expose no progressbar role

**Result:** PR open for human review — https://github.com/VirtoCommerce/vc-frontend/pull/2591 (NOT merged). Ticket → **In review**.
**Repo:** `VirtoCommerce/vc-frontend` (kind `frontend`, native platform) · branch `claude/qa-autofix/VCST-6143` → `dev` · head `e420a067`.
**Bug report:** `reports/bugs/open/medium/BUG-missions-progress-bar-no-progressbar-role.md`

## Gates
| Gate | Result |
|---|---|
| G0 triage | PASS — a11y attribute-only, localized, non-breaking |
| G1 route | PASS — Fix Routing block confirmed on `dev` (`mission-card.vue`, `order-mission-modal.vue`); UI kit has no progress primitive |
| G2 repro | RED 3/3 — new `mission-progress-a11y.test.ts` |
| G3 fix | GREEN 3/3 + existing `mission-card.test.ts` 2/2; `vue-tsc --build` 0, eslint/prettier clean |
| G4 review | APPROVE ×2 (`frontend-reviewer`, HIGH) |
| G5 CI | PASS — iteration 1 fixed Sonar `Web:S6819` (role → native `<progress>`); one `auto-tests (sqlserver, opensearch)` red on unrelated `AddOrUpdateCartShipment` GraphQL test → green on rerun; 19/19 checks |
| G6 E2E | Not run by design — screen-reader check pending `/qa-verify-fix VCST-6143` post-deploy |
| G7 | STOP at In review; never merged |

## Final change
Visually hidden native `<progress :value="view.percent" max="100">` beside each bar; card named via `aria-labelledby` → `useId()` id on the title h3, modal via `aria-label=view.title`; drawn track `aria-hidden`.

## Open
- Reviewer follow-up (non-blocking): `aria-hidden` on visible "N%" spans to avoid browse-mode double read.
- Local Node 22.22.0 < repo's `>=22.22.1` — install/commit needed `PLUGIN_YARN_ENGINES_DISABLE=1` (hooks still ran).
- `GITHUB_FIX_BUGS_TOKEN` lacks Actions rerun permission; `GIT_TOKEN` was used for the rerun.
