# FIX-2026-06-19-1444 — VCST-5021

**Ticket:** [VCST-5021](https://virtocommerce.atlassian.net/browse/VCST-5021) — *[Marketing][Cart] Coupons sidebar — Custom card empty-input submit is silently ignored* (Bug, Low/UX)
**Repo / kind:** `VirtoCommerce/vc-frontend` / `frontend` · **Branch:** `claude/qa-autofix/VCST-5021`
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2344 (#2344) — **OPEN, awaiting human review (not merged)**
**JIRA status:** left at **Draft** (no dev transition available from Draft; user opted to leave it; no JIRA write made)

## Summary
The cart "Custom code" coupon apply button was always enabled even with empty input; `handleClick()` silently early-returned on empty, giving the user no feedback. Fix disables the apply button when the trimmed input is empty.

## Root cause
`client-app/shared/cart/components/coupon-card.vue` — the `default` view of the `viewConfig` computed hardcoded `disabled: false`, so the apply button stayed enabled; `handleClick` then no-op'd on empty input.

## Fix (1 line)
```diff
-      button: { ...applyButtonBase, disabled: false },
+      button: { ...applyButtonBase, disabled: !code.value.trim() },
```
Read inside the existing `viewConfig` computed → reactive; `IViewConfig.button.disabled` stays `boolean`. `handleClick` guard kept; `applied`/`error` views untouched. ADD-only test: `client-app/shared/cart/components/__tests__/coupon-card.test.ts` (empty/whitespace → disabled; real code → enabled).

## Gate results
| Gate | Owner | Result |
|------|-------|--------|
| G0 eligibility | qa-lead | PASS — simple, localized, non-breaking UX fix |
| G1 single repo | orchestrator | PASS — vc-frontend, RCA anchor verified on `dev` |
| G2 reproduce (red) | fullstack-frontend | PASS — new vitest test 2-fail/1-pass on old code |
| G3 fix (green) | fullstack-frontend | PASS — 3-pass; full suite **1012 pass**; vue-tsc/eslint/build clean; no existing test edited |
| G4 review | frontend-reviewer | **APPROVE / HIGH** — single-repo, no contract change, BL-UI preserved, red→green re-verified |
| G5 CI | orchestrator | **PARTIAL** — `ci` ✅, SonarCloud ✅, deploy ✅, license/cla ✅; **`auto-tests` ❌ (unrelated infra — see below)** |
| G6 E2E | qa-frontend-expert | **DEFERRED** — logic unit-proven; visual/CLS needs deploy → PR carries "needs visual verification"; closes post-merge via `/qa-regression frontend` + `/qa-verify-fix` |
| G7 human review | orchestrator | **STOP — PR open, never merged** |

## auto-tests failure analysis (not caused by this change)
`auto-tests / auto-autotests` failed on all 3 DB backends (mysql/postgres/sqlserver). Step `Run Auto Tests` exited 1 with: `allure-results is empty — skipping Allure report`, `No files were found with the provided path: vc-testing-module/report/`, `Discovery path not found: .../docker-env-full/publish/modules/`. The harness produced **zero results** — an infra/setup failure in the shared backend pytest workflow, not a test assertion. A frontend 1-line button-disable cannot break backend graphql/restapi/e2e across all DBs; the frontend-affecting checks (`ci`, Sonar, deploy, CLA) are all green. Re-run once was attempted but the fix token lacks Actions re-run permission (`Resource not accessible by personal access token`) → escalated to human: re-run `auto-tests` from the GitHub UI to confirm transient before merge.

## Confidence
HIGH on the fix. Outstanding: confirm `auto-tests` is a transient infra failure (re-run), and post-deploy visual verification of the disabled-button state.
