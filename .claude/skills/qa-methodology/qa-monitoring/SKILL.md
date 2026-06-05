---
description: "[QA Method] Online bug monitoring from Application Insights: query both layers, dedup by fingerprint, triage new/spiking signatures, reproduce HIGH-confidence bugs live, report. Detect-and-report only — never files JIRA or auto-fixes."
argument-hint: "[frontend|backend|both] [--since=MIN] [--dry-run]"
disable-model-invocation: true
---

# /qa-monitoring — Online Bug Monitoring (methodology)

Methodology + reference for the `/qa-monitoring` command and its headless twin
`ci/run-monitor.ts`. The command file (`.claude/commands/qa-monitoring.md`) is the
terminal entry; this skill holds the data flow, the KQL probe library, the triage
taxonomy, and the dedup model. **Detect-and-report only**: the flow stops at a
report + Teams alert and a human decides whether to `/qa-bug` or `/qa-fix`.

## Why this exists
Real production-like defects in the QA environment (storefront JS exceptions, failed
xAPI/REST calls, backend 5xx, failed dependencies) sit in Application Insights unread
until someone happens to query the portal. This flow polls App Insights on a cadence,
keeps a memory of what it has already seen, and surfaces only **genuinely new or
surging** problems — confirmed live before anyone is asked to act.

## Resolve the environment FIRST (no hardcoded resources)
Like `/qa-investigate`, determine `TEST_ENV` and resolve the active App Insights
resources from the environment — never assume a fixed resource name:
- `APPINSIGHTS_APP_ID_BACKEND` / `APPINSIGHTS_API_KEY_BACKEND` — platform/backend.
- `APPINSIGHTS_APP_ID_STOREFRONT` / `APPINSIGHTS_API_KEY_STOREFRONT` — storefront.
- `APPINSIGHTS_RESOURCE_BACKEND` / `_STOREFRONT` — display names, only for portal links.
- `AZURE_SUBSCRIPTION_ID` / `AZURE_RESOURCE_GROUP` — for portal links.
A layer with no App ID/key is skipped with a clear message; some envs have none.

## Data flow (one run)
1. **Query** — run the probe queries (below) against each enabled layer over the
   look-back window. The window is applied by the REST API `timespan` param.
2. **Fingerprint + dedup** — group rows into signatures, classify NEW / SPIKING /
   SEEN-stable against `reports/monitoring/.seen-fingerprints.json`. Only NEW/SPIKING
   proceed; cap at `MONITOR_MAX_SIGNALS` and log deferrals.
3. **Triage** — classify each candidate (taxonomy below) with severity, repo route,
   confidence — consulting the oracle knowledge files.
4. **Repro gate** — only HIGH-confidence `REAL_BUG` with a code-fixable `REPRO_LAYER`
   is reproduced live by the layer's QA expert. Reproduced → draft bug report with a
   `## Fix Routing` block; not reproduced → NEEDS_REVIEW (listed, not drafted).
5. **Report + notify + STOP** — write the monitoring report + summary, persist the
   store, send the Teams card. No JIRA, no fix.

## KQL probe library (`ci/monitoring/queries/`)
| Probe | Layer | Surfaces |
|-------|-------|----------|
| `backend-exceptions.kql` | backend | server-side exceptions by `problemId` |
| `backend-failed-requests.kql` | backend | 5xx requests by route template |
| `backend-failed-dependencies.kql` | backend | failed SQL/Redis/HTTP/payment deps |
| `frontend-exceptions.kql` | frontend | browser JS exceptions by `problemId` |
| `frontend-browser-failures.kql` | frontend | failed browser AJAX (path normalized) |

Each query `summarize`s by a stable `signature` with `count_`, first/last seen, and a
sample `operation_Id` for a portal deep-link. Signatures use route/path **templates**,
not concrete URLs, so they don't drift with test data (`feedback_env_resilience`).

## Triage taxonomy (`ci/agents/monitor-triage-agent.md`)
`REAL_BUG` · `KNOWN_ISSUE` · `NOISE` · `CONFIG_GATED` · `THIRD_PARTY` · `TRANSIENT`.
Oracles: `vc-bug-catalog.md` (familiar failures), `business-logic.md` (BL-* violations
are always high severity), `debugging-signals.md` (benign-noise filter),
`platform-patterns.md` (expected desync/cache behavior). When ambiguous, prefer
NEEDS_REVIEW over REAL_BUG — a log line alone is not a defect.

## Dedup model (`ci/lib/fingerprint-store.ts`)
- Fingerprint = md5(`layer|probe|normalized-signature`).
- Per signature: first/last seen, cumulative count, run count, EMA baseline, status
  (`new|triaged|confirmed|noise|filed`).
- SPIKING = `count ≥ max(baseline×factor, baseline+minDelta)` (factor/minDelta env-tunable).
- `classify()` reads the *previous* baseline; `recordRun()` updates it — order matters.
- The store is local working state (gitignored). In CI it is carried across scheduled
  runs via `actions/cache` (see `.github/workflows/monitor.yml`).

## Knobs (env)
`MONITOR_LAYERS` (both|frontend|backend) · `MONITOR_SINCE_MIN` (35) · `MONITOR_MAX_SIGNALS`
(15) · `MONITOR_SPIKE_FACTOR` (3) · `MONITOR_SPIKE_MIN_DELTA` (20) · `MAX_BUDGET_USD` (15)
· `MODEL` · `DRY_RUN` (triage only — no repro/drafts).

## Cross-references
- Command: `.claude/commands/qa-monitoring.md` · Twin: `ci/run-monitor.ts`
- Bug handoff contract (`## Fix Routing`): `.claude/commands/qa-bug.md` Step 4 → `/qa-fix`
- Reports policy + the `reports/monitoring/` category: `.claude/rules/reports.md`
- Bug lifecycle after a confirmed draft: `/qa-bug` → `/qa-fix` → `/qa-verify-fix`
