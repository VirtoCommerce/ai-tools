# VCST-5441 — Fix Verification Report

**Verdict: VERIFIED** · 2026-07-15 · vcst-qa
**Bug:** Platform dictionary (`IsDictionary`) setting cannot be cleared to empty — delete-all + Save is a silent no-op.
**Fix:** vc-platform **PR #3076** (branch `fix/VCST-5441`) — `ObjectSettingEntry.ItHasValues` treats a non-null empty `AllowedValues` as a value for dictionaries; `DeepSaveSettingsAsync` guards untouched empty-defaults; obsolete `Value=""` workaround removed.
**Build:** Platform `3.1044.0-pr-3076-3479-vcst-5441-347993a4` (PR open, not merged) — deployment confirmed in `vc-deploy-dev@vcst-qa` `packages.json`. Env health 200.

> **Basis:** verification executed via `/qa-test` earlier the same day (qa-backend-expert, playwright-edge + Platform REST). Per the duplicate-run guard (<4h), that fresh, thorough evidence is reused here rather than re-dispatching against the same static build. Full execution detail: `test-execution-report.md`.

## Checklist

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | Reproduce original bug / STR (org whitelist clear-to-empty) | **PASS** | Now persists empty (pre-fix reverted) |
| 2 | Fix resolves the reported issue | **PASS** | REST: `POST /settings allowedValues:[]` → 204; GET → `[]`/`value:null` |
| 3 | Root cause addressed (not just symptom) | **PASS** | Matches PR #3076 diff (`ItHasValues` + filter); empty dict no longer dropped from save set |
| 4 | Regression — add-direction still persists | **PASS** | Add roles back → GET returns them; UI shows after reload |
| 5 | Regression — 2nd dictionary (`MembershipRolesWhitelist`) clears identically | **PASS** | REST 204 + GET `[]`; UI empty after reload |
| 6 | No new console errors | **PASS** | Only unrelated pre-existing noise (logo 404s; dashboardStatistics 500) |
| 7 | Admin SPA reflects corrected behavior (symptom layer) | **PASS** | Delete-all + Save → grid empty and **stays empty after full reload** |
| 8 | API returns expected response (owning layer) | **PASS** | `POST /api/platform/settings` → 204; follow-up GET empty |
| 9 | Edge — scalar (non-dictionary) setting unaffected | **PASS** | Boolean setting round-trips true→false→true |
| 10 | BL-B2B-011 (whitelist behavior) | **PASS** | Empty whitelist → picker shows all roles = **by design** (source `rolesPickerService.js`); BL-B2B-011 corrected. Not a defect |

**STR:** demonstrated across REST + Admin SPA on both whitelists (≥3 passing runs). **Checklist: 10/10.** No regressions, no side effects.

## App Insights (test window, backend)
No real bug correlated to the fix; all whitelist/scalar GETs returned 200. One NEEDS_REVIEW read-path `500` on `GET /settings/ApplicationInsights.Url` (unrelated to the save path). Noted, not filed.

## Bug report
`reports/bugs/open/…` → **moved to `reports/bugs/fixed/BUG-Customer-Roles-Whitelist-Clear-Not-Persisted.md`** with a `## Resolution` block; status set to FIXED.

## JIRA
QA-PASSED comment posted. Status transition **deferred** — no "Tested" transition exists from *Ready for test* in this workflow, and PR #3076 is still open (no-auto-DONE). Recommend holding at *Ready for test* until the PR merges + releases, then → Done. Awaiting user decision.
