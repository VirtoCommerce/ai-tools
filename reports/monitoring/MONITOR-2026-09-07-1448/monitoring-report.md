# MONITOR-2026-09-07-1448 — vcst online monitoring

**Run:** MONITOR-2026-09-07-1448 · **Env:** `vcst` · **Window:** last 30 min (`--since=30M`, ≈14:17Z–14:47Z)
**Layers:** both — backend `vcst-qa`, storefront `vcst-qa-storefront`
**Access route:** azure-mcp (CLI-session auth). `APPINSIGHTS_API_KEY_BACKEND`/`_STOREFRONT` are **empty**, so the documented REST path was unavailable; probes were run as KQL through azure-mcp instead. Classic schema (`requests`/`exceptions`/`dependencies`, `timestamp`).

## Signature counts

| | value |
|---|---|
| Signatures seen | 6 |
| NEW | 2 (one defect, two views of it) |
| SPIKING | 0 |
| SEEN-stable | 4 |
| Triaged this run | 1 |
| Deferred (cap) | 0 — well under `MONITOR_MAX_SIGNALS` 15 |

## Confirmed bugs

| Severity | Layer | Signature | Count | Repo | Tracker |
|---|---|---|---|---|---|
| High | backend / xAPI | `System.TypeLoadException at MediatR.Wrappers.RequestHandlerWrapperImpl\`2.Handle` → `POST graphql/SalesRepCustomerOrders` | 1 | `vc-module-sales-rep` | **VCST-5905** (already filed) |

Also surfaced as the request-level signature `500 POST graphql/SalesRepCustomerOrders` (1) — the same defect, not a second finding. Root cause `IXOrderMapper` moved `XOrder.Data` → `XOrder.Core` between XOrder 3.1010.0 and 3.1011.0. No new repro was performed: the defect was reproduced, root-caused and filed earlier in this session, so the repro gate was already satisfied.

## Needs review

None. Nothing ambiguous surfaced in this window.

## Dismissed

| Class | Signature | Count | Oracle / reason |
|---|---|---|---|
| NOISE | `ErrorEvent: ResizeObserver loop completed with undelivered notifications.` (page `CompanyMembers`, Edge 152) | 16 | Store status `noise` **and** `dismissed`. Not SPIKING: 16 < baseline+`MONITOR_SPIKE_MIN_DELTA`(20) for any baseline, so it cannot qualify regardless of history. Correlates with suite 008 (B2B Members) executing in-window |
| NOISE | `ApolloError at <no_method>` — `ApolloError: Failed to fetch` (page `Matcher`) | 1 | Store carries this exact instance as `dismissed` (`ApolloError Failed to fetch (Matcher)`) |
| SELF-INFLICTED | `GraphQL.Validation.Errors.KnownArgumentNamesError` — `Unknown argument 'storeId' on field 'orders'` | 1 | **Our own** malformed introspection query at 14:18:11 (`operation_Id a45303f4ab384b52b22811233bc7e84e`) during this session's investigation. Store status `noise`. Excluded, and named so the count stays reproducible |
| SELF-INFLICTED | `500 POST graphql/` | 1 | Same event as above, request-level view. Store status `triaged` |

## Empty probes — verified, not assumed

Two probes returned zero rows. Per the "empty is not clean" rule each was volume-checked before being reported:

| Probe | Result | Volume check |
|---|---|---|
| `backend-failed-dependencies` | 0 rows — **genuinely clean** | 4,464 backend dependencies in-window, **0 failed**, newest 14:47:28Z |
| `frontend-browser-failures` | 0 rows — **correct but qualified** | 2,314 browser dependencies, **157 failed**, but **0 at `resultCode ≥ 400`**. All 157 are `resultCode 0` (CORS/blocked/aborted), the class the probe deliberately excludes as "not a server defect". Consistent with browser teardown during an automated run; worth revisiting if it persists outside a regression window |

Backend requests: 598 in-window, 9 failed. The 5xx probe surfaced 2; the other 7 are 4xx below its `>= 500` threshold (asset/file 404s), by design.

## Context

The window overlaps regression run `REG-2026-09-07-1342` (suites 008 and 002 executing). That run is **not** trustworthy as a whole — it self-reported `completed` with 200 of 572 cases never executed (5 suites never dispatched, 2 still live at the flip). That is a separate issue from this monitoring run and does not affect the telemetry above.

## Actions taken

- **No tracker item filed** — the one real finding was already filed as VCST-5905 earlier this session.
- **No fix attempted.**
- **No Teams notification sent** — `TEAMS_WEBHOOK_URL` is unset. Not a failure; the layer is simply unconfigured on this machine.
- **Fingerprint store NOT modified** — see the note below.

## Store note

`reports/monitoring/.seen-fingerprints.json` (72 signatures, last updated 2026-08-28) was read but **not** written this run. The two NEW signatures would normally be recorded as `filed` so they stop re-alerting; that write is left for the operator to approve, because marking a signature `filed` suppresses future alerts on it and this run also overlaps an untrustworthy regression window.

**No JIRA filed from this run, no fix attempted.**
