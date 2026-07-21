# FIX-2026-07-21-1512 — VCST-5515 — PR open for human review (Gate 7)

- **Ticket:** [VCST-5515](https://virtocommerce.atlassian.net/browse/VCST-5515) — Stale "Has unsaved changes" banner after a clean Publish (Bug, Low) → **In review**
- **PR:** [VirtoCommerce/vc-module-pagebuilder#156](https://github.com/VirtoCommerce/vc-module-pagebuilder/pull/156) (base `dev`, branch `claude/qa-autofix/VCST-5515` @ `59d4991`, label `bug`) — **open, NOT merged**
- **Repo kind / agent:** `module` → embedded Vue3 sub-app `page-builder-shell` → `fullstack-frontend` + `/vc-shell-fix`
- **Outcome:** `FIX_STATUS: SUCCESS` — PR open awaiting human review. No auto-merge.

## Fix
`src/VirtoCommerce.PageBuilderModule.Web/Apps/page-builder-shell/src/modules/page-builder/pages/PageDetails.vue` — 2 insertions: `setBaseline()` after `await publishGroup();` and after `await unpublishGroup();` (before `callParent("reload")`), symmetric with the existing `handleSave()`. Root cause: `useBladeForm`'s baseline was never reset after the clean server-confirmed reload, so it reported a false "unsaved changes" state (banner + `beforeunload` guard). The composable's own `useModificationTracker` was already reset correctly.

## Gate results
| Gate | Result |
|------|--------|
| G0 eligibility | PASS (simple, localized, non-breaking, confirmed shell-side) |
| G1 route | PASS — `vc-module-pagebuilder` / `page-builder-shell` (single repo); GitHub push:true |
| G2 reproduce (red→green) | PASS — ephemeral vitest+jsdom+`@vue/test-utils` harness on real `PageDetails.vue` (stripped, not committed) |
| G3 fix (green) | PASS — `yarn type-check` ✓, existing `tsx --test` 9/9 ✓, no existing test/story edited |
| G4 review | APPROVE (frontend-reviewer, HIGH) |
| G5 CI (#156) | `ci` ✓, SonarCloud + Code Analysis ✓, `license/cla` ✓, `deploy` ✓; **`auto-tests` (graphql/restapi × 3 DBs) still running** at hand-off |
| G6 E2E/visual | Deferred by design — needs real deploy; verify via `/qa-verify-fix VCST-5515` |
| G7 human review | STOP — PR open, ticket In review. Never merged. |

## Notes
- **Root-cause evolution:** filed as "shell doesn't re-fetch"; a code trace refuted a "backend async race" (publish is synchronous, `HasChanges` computed); a live capture confirmed (a) display/state; the fix landed one level deeper than the composable — at `useBladeForm`'s baseline in the component. Full trail in the bug report + ticket comments.
- **Pre-existing debt (not fixed here, out of scope):** `page-builder-shell` `yarn lint` fails on an ESLint 9 vs legacy `.eslintrc.js` (`@vue/eslint-config-typescript/recommended`) mismatch — reproduces on untouched files, not run by CI. Candidate for a separate flat-config-migration ticket.

## Follow-ups (not `/qa-fix`'s job)
1. Human PR review + merge of #156.
2. `auto-tests` on #156 → confirm green (re-run once if flaky; unrelated to a frontend-only change).
3. Post-merge/deploy: `/qa-verify-fix VCST-5515` (visual banner + `beforeunload` on the real Admin SPA).
