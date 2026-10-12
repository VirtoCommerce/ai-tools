# FIX-2026-10-05-1729 — VCST-6173 "Last week" preset selects a future week

**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2540 (`claude/qa-autofix/VCST-6173` → `dev`, commit `bd703eb`) — awaiting human review, not merged.
**Ticket:** VCST-6173 (Bug, Draft — no in-progress/review transition exists from Draft; status left unchanged). Comment 111363.

| Gate | Result |
|---|---|
| G0 triage | PASS — localized date arithmetic, non-breaking; semantics (previous calendar period) confirmed by PO 2026-10-05 |
| G1 route | vc-frontend · frontend · `client-app/shared/account/composables/useUserOrdersFilter.ts` `getDateFilterRanges()` (confirmed on origin/dev) |
| G2 reproduce | RED — new `useUserOrdersFilter.test.ts`: cross-month + cross-year fail (Oct 20–27 received), same-month control passes |
| G3 fix | GREEN — 2-line change (bounds copied from `firstDayOfWeek`); 3/3 in UTC, UTC+3, New_York; vue-tsc 0; eslint 0 errors |
| G4 review | APPROVE (frontend-reviewer; re-verified red without fix, green in LA/Auckland) |
| G5 CI | GREEN — ci, SonarCloud, CodeQL, Semgrep, OSV, deploy-cloud, license/cla; auto-tests 6/6 after one re-run of an unrelated flaky cart e2e on (sqlserver, opensearch) |
| G6 E2E | n/a — pure date computation, no visual aspect; post-deploy `/qa-verify-fix VCST-6173` |
| G7 | STOP for human review |

**Proof:** medium vitest · provenance built-diff · linkage: only month/year-correct bounds green the cross-boundary cases.

**Second commit `710ab0f` (user request):** "Last month" on the 29th–31st after a shorter month collapsed to an empty range (`setMonth` before `setDate(1)`). Fixed by swapping the two calls; 4 new test cases (2 RED before the fix), 7/7 GREEN in 4 TZ. Ticket description, PR title and PR body updated; Jira comment 111363 amended.

**Env notes:** `yarn` not on PATH and repo pins Node 22 — pre-commit hook ran via a scratch shim (cached Yarn 4.17.0 + portable Node 22.23.3). No `gh` — push via askpass, PR via REST.

**Third commit `7105bd2` (user request, 2026-10-06):** live verification on vcptcore-qa1 (UTC+3 browser) showed every preset applied one day early — presets were `toISOString()` of local midnight cut to the UTC date. Presets now emit `toLocalDateOnly()`. RED at TZ=Europe/Kyiv (Sep 20 / Aug 31), GREEN 9/9 in 4 TZ; 45 existing related tests unmodified and green. Gate 4: reviewer asked to restore `process.env.TZ` correctly when unset — fixed. PR title/body, ticket summary/description updated; comment 111363 amended.
