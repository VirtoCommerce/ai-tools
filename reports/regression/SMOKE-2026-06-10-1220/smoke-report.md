# Smoke Test Report — SMOKE-2026-06-10-1220

## Verdict: 🔴 NO-GO — Platform/xAPI backend down (environment outage)

| Field | Value |
|-------|-------|
| Run ID | SMOKE-2026-06-10-1220 |
| Date | 2026-06-10 |
| Scope | Storefront only (Track A) |
| Environment | https://vcst-qa-storefront.govirto.com (vcst-qa) |
| Platform | 3.1035.0 |
| Theme | vc-theme-b2b-vue 2.51.0-pr-2310 |

**Run halted at the pre-flight backend-health gate. Not a code/feature failure — the backend never answered.**

## Track A — Storefront Results

Checklist gates: SMOKE-CHECKLIST.md (**0/33**) · SMOKE-CROSS-LAYER-CHECKLIST.md (**0/25**)

| Cases | PASS | FAIL | BLOCKED | SKIP |
|-------|------|------|---------|------|
| 33 | 0 | 0 | 33 | 0 |

All SMK-001 … SMK-033 BLOCKED by the same root cause (`environment_unreachable`): the storefront cannot render any data-backed page because every xAPI `/graphql` query times out. None reached an executable assertion, so no functional pass/fail signal exists for this build.

## Root Cause — backend xAPI unreachable

The pre-flight curl timeout was **not** the known Windows SSL quirk. Confirmed via 4 independent signals:

- **Storefront render:** HTML shell loads (200, title "Virto Commerce") but `/` and `/catalog` are **blank white screens** — empty a11y snapshot after fresh reload + 6–8s waits.
- **Browser console:** `ApolloError: signal timed out` at 120106 ms (`vendor-aUHQp9xl.js`) — initial xAPI query dies at the 120s Apollo timeout.
- **Browser network:** `POST /graphql => net::ERR_ABORTED` (client aborts the hung requests).
- **Direct probes:** `GET {BACK_URL}/health` → HTTP 000 (timeout); `POST {BACK_URL}/graphql {__typename}` → HTTP 000. Re-probed post-run (~25 min later) — still HTTP 000.

Storefront front-end + CDN are healthy; the **Platform/xAPI backend at vcst-qa.govirto.com is down or hung** — even `/health` does not answer. Sustained ≥25 min, so not a momentary restart blip.

## App Insights (run window)

Skipped — Azure MCP `monitor_resource_log_query` not loaded this session and `APPINSIGHTS_API_KEY_*` unset (not creatable per project access). Does not affect the verdict. Recommend a human check the `vcst` resource group / vcst-qa App Insights `failures` blade to classify the outage (deploy-in-progress vs crash vs SQL/dependency health).

## Bugs Found

- **BUG_042_001 (P0, confirmed:false):** vcst-qa Platform/xAPI backend unreachable — storefront renders blank shell, all `/graphql` queries time out at 120s. Surfaced by SMK-001. Evidence: `BLOCKED-catalog-blank-backend-down.png`. Likely an environment outage (deploy/restart, or DB/SQL health) rather than a code defect — needs ops/qa-testing-expert confirmation before filing JIRA.

## Recommendation

Re-run `/qa-smoke storefront` once `{BACK_URL}/health` returns 200. No deploy go/no-go signal is available from this run — the build was never exercised.
