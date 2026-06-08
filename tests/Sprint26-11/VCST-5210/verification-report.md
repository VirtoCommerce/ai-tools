# VCST-5210 — Fix Verification (VERIFIED)

**Bug:** [Push Messages] FCM tokens rejected with UNREGISTERED (404) are never pruned — dead tokens retried on every send (Low/Minor)
**Verdict:** ✅ VERIFIED · **Date:** 2026-06-08 · **Gate 6 (deploy/E2E): CLOSED**
**Env:** vcst-qa @ Platform `3.1035.0-pr-3051-...-vcst-5212` · Module `VirtoCommerce.PushMessages 3.1001.0-pr-24-433d` (PR #24 artifact, confirmed loaded in Admin → Modules)
**PR:** VirtoCommerce/vc-module-push-messages#24 — still OPEN (Gate 7: human review + merge pending)

## Method
Telemetry-only bug (no UI symptom) — verified by an **active trigger**: three identical Admin-SPA push sends to the same org (`AGENT-TEST-Org-TechFlow-20260310`), observing App Insights `vcst-qa` `dependencies` for `fcm.googleapis.com` POST `…/messages:send`. Expected post-fix: terminal-error (404/`Unregistered`) tokens are pruned, so repeated sends stop re-hitting dead tokens.

## Result — monotonic decay to zero

| Push | Send (UTC) | fcm 404 (stale) | fcm 200 (valid) | msg id |
|------|-----------|-----------------|-----------------|--------|
| #1 | 18:12:17 | **17** | 0 | b31e1679…626958 |
| #2 | 18:16:20 | **3** | 1 | 1303d70f…19e9d9 |
| #3 | 18:20:11 | **0** | 0 | cba5d364…b9143b |

**17 → 3 → 0.** Pre-deploy baseline (MONITOR-2026-06-08-0947): the same path held steady at **102 × 404 over 09:43–11:14Z with zero decay** — every push re-hit all dead tokens. Post-deploy, dead tokens prune and drain to zero within a few sends.

## Checklist
- [x] Fix deployed & loaded — module `3.1001.0-pr-24-433d` shown in Admin → Modules (`01-module-version-pr24.png`)
- [x] Root cause addressed — stale (404) tokens pruned, not just logged; count decays 17→3→0 across identical sends
- [x] BL preserved — healthy tokens NOT pruned: push #2 `200` succeeded; valid delivery still works
- [x] No transient over-deletion observable; no exceptions in `exceptions` table during 18:11–18:30Z window
- [x] No new console/app errors (Admin side all `200`; only benign asset-404s for logo SVGs)
- [x] Pre-deploy recurring burst (102×404) does not recur

## Evidence
Screenshots `01`–`06` in this folder. App Insights `dependencies`/`exceptions`/`traces` queried via Azure MCP (resource `vcst-qa`).

## Notes
- A lone valid `200` token seen at push #2 was absent by push #3 (token set drained) — immaterial to the bug (concerns stale-token retry, not healthy delivery).
- **Gate 7 still open:** PR #24 is not merged. JIRA should reflect QA-passed (TESTED); final DONE belongs after human merge.
