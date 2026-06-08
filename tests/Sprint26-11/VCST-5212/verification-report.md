# Verification — VCST-5212

`[vc-platform] GET /api/platform/modules 500 NullReferenceException in IconFileExists (null local IconUrl)`

**Verdict: VERIFIED** · Severity: High · Layer 4 (Platform REST API) + Layer 2 (Admin Modules blade)
**Date:** 2026-06-08 · **Env:** vcst-qa @ Platform `3.1035.0-pr-3051-23c3-vcst-5212-23c309b0` · **Agent:** direct (REST) + playwright-edge (Admin blade)
**Fix PR:** [vc-platform#3051](https://github.com/VirtoCommerce/vc-platform/pull/3051) — **OPEN/unmerged** (PR build deployed to QA; `license/cla` check pending)

## Fix confirmation
- **Code (root cause addressed):** PR #3051 adds a 3-line `if (string.IsNullOrEmpty(moduleIconUrl)) return false;` guard at the top of `ModulesController.IconFileExists` — the documented RCA anchor. Semantically identical to the caller's existing `: null` fallback; no behavioral branch, no contract/DTO/schema change.
- **Test (red→green):** new `ModulesControllerTests.GetModules_LocalModuleHasNullIconUrl_ReturnsOkWithNullIconUrl` — ADD only, no existing test modified. Encodes the exact STR (management IconUrl set + local IconUrl null) → asserts 200 OK + IconUrl null.
- **Deployed:** navbar + `backend/packages.json@vcst-qa` confirm `3.1035.0-pr-3051-…-vcst-5212` is live on QA.

## STR result — 3/3 PASS
`GET /api/platform/modules` (admin Bearer), 3 consecutive runs:

| Run | HTTP | total | iconUrl set | iconUrl null |
|-----|------|-------|-------------|--------------|
| 1 | 200 | 83 | 69 | 14 |
| 2 | 200 | 83 | 69 | 14 |
| 3 | 200 | 83 | 69 | 14 |

**14 entries carry `iconUrl: null`** — the exact condition that NRE'd on `dev` — and are now returned gracefully as `null` (200), not a 500. This is the post-fix expected behavior live-confirmed.

> The original NRE is non-deterministic (depends on management-vs-local catalog discovery state) and could not be force-reproduced on QA. The `POST /modules/reload` leg of the STR was not run (denied — disruptive on shared QA). Verification rests on: correct code fix + unit test + deployed build + the live endpoint cleanly handling the null-icon condition.

## Regression / Layer 2 — PASS
- **Admin Modules blade** renders **"Installed (83)"** with the full module grid; page network call `https://vcst-qa.govirto.com/api/platform/modules → 200`. Evidence: `screenshots/modules-blade-installed-83-pr3051.png`.
- Health endpoint: Modules health = **Healthy**, "All modules are loaded".
- No new console errors tied to the endpoint on the env under test. (Console `all=true` surfaced `500` entries against `http://localhost:8090/api/platform/modules` — a **stale prior dev session**, NOT vcst-qa; the vcst-qa call returned 200.)

## Notes for human reviewer
- PR #3051 is **open/unmerged**; `license/cla` is pending (bot must sign the VirtoCommerce CLA). Recommend JIRA → **TESTED** (fix verified on the deployed PR build), holding **DONE** until a human merges the PR. Never auto-merge (Gate 7).
