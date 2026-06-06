# Monitoring Report — MONITOR-2026-06-05-2025

**Env:** vcst-qa · **Window:** 24h (--since=1440, to 18:25 UTC 2026-06-05) · **Layers:** backend + frontend · **Mode:** interactive (Azure MCP) · Follow-up triage of [MONITOR-2026-06-05-2008](../MONITOR-2026-06-05-2008/monitoring-report.md) 24h context

**Signatures:** 9 seen · 9 new (first triage) · 0 spiking · 9 triaged · 0 deferred · **0 confirmed bugs** (no HIGH-confidence REAL_BUG → no live repro)

## Needs review (4)

| Sev | Layer | Signature | Count | Finding |
|-----|-------|-----------|-------|---------|
| P2 | both | `500 POST graphql/GetFullCart` + FE `400 POST /graphql` (Cart) + `FieldsOnCorrectTypeError` | 3+6+2 | One browser session (Chrome 148, 08:00–08:04 UTC) sent `GetFullCart` querying `currencyCode` on `LineItemType` + `cartTotals` on `CartType` — fields absent from the deployed schema AND from vc-frontend main (GitHub search: 0 hits). Bundle/schema version skew — suspect a PR build (VCST-5162 theme PR is QA-deployed) or stale cached bundle. Cart page broken for that session; current traffic clean. |
| P3 | backend | `HTTP essearch …:9200 400` (`contentfile-active` `_bulk`) | 2 | Background content-file indexing job rejected by ES, 13:26 + 14:06 UTC. No operation context, no traces. Watch for recurrence. |

## Dismissed (5)

| Class | Signature | Oracle |
|-------|-----------|--------|
| KNOWN_ISSUE | xAPI `AuthorizationError` → HTTP 500 (`GetCurrentUserAddresses` "Access denied", `GetFullCart` "token expired") ×3 | Expected auth denial on expired/anonymous sessions; 500-vs-401 mapping is a contract nit, not a defect (cf. `feedback_no_force_disabled_controls` — API-only signal) |
| NOISE | `ApolloError: Failed to fetch` ×5 (Matcher/Catalog, Budapest — local QA sessions) | Network-level fetch blips, `debugging-signals.md` benign class |
| TRANSIENT | FE `500 POST /graphql` ×4 (Dashboard, single burst 08:35, **no backend 500 logged at that time**) | Ingress-level one-off; single session |

Telemetry: [vcst-qa failures](https://portal.azure.com/#resource/subscriptions/973d0b8c-44bf-438d-a4b7-1c4162d3ccba/resourceGroups/vcst/providers/Microsoft.Insights/components/vcst-qa/failures) · fingerprint store seeded with all 9 signatures.

---
*Detect-and-report only — no JIRA filed, no fix attempted.*
