---
name: qa-monitoring
description: "[QA Method] Online bug monitoring from Application Insights: query both layers, dedup by fingerprint, triage new/spiking signatures, reproduce HIGH-confidence bugs live, report. Detect-and-report only — never files a bug tracker ticket or auto-fixes."
argument-hint: "[frontend|backend|both] [--since=MIN] [--dry-run]"
disable-model-invocation: true
---

# /qa-monitoring — Online Bug Monitoring (methodology)

Methodology + reference for the `/qa-monitoring` command. The command file
(`commands/qa-monitoring.md`) is the terminal entry; this skill holds the data
flow, the KQL probe library, the triage taxonomy, and the dedup model.
**Detect-and-report only**: the flow stops at a report and a human decides
whether to run `/qa-bug` or `/qa-fix`.

> **In `vc-fix`:** this is a self-contained extract of the full `vc-qa` plugin's
> monitoring pipeline (`ci/run-monitor.ts` + `ci/lib/appinsights.ts` +
> `ci/lib/fingerprint-store.ts` + `ci/monitoring/queries/` + `ci/agents/monitor-triage-agent.md`
> + `ci/notify-teams.ts` — full `vc-qa` plugin only, not shipped here). The headless
> CI twin and its `@azure/identity` REST query client are dropped; queries run through
> **Azure MCP's `applicationinsights` tool** directly instead. The dedup logic is kept
> verbatim in `skills/qa-monitoring/fingerprint-store.ts` (self-contained — no
> import from an unshipped `ci/lib/appinsights.ts`), the KQL probes are kept
> verbatim in `skills/qa-monitoring/queries/`, and the Teams card is a monitor-only
> extract in `skills/qa-monitoring/notify-teams.ts` (the regression-card mode of the
> original is dropped — no regression pipeline is shipped here).

## Why this exists
Real production-like defects in the QA environment (storefront JS exceptions, failed
xAPI/REST calls, backend 5xx, failed dependencies) sit in Application Insights unread
until someone happens to query the portal. This flow polls App Insights on demand,
keeps a memory of what it has already seen, and surfaces only **genuinely new or
surging** problems — confirmed live before anyone is asked to act.

## Resolve the environment FIRST (no hardcoded resources)
Like `/qa-investigate` (full `vc-qa` plugin), determine `TEST_ENV` and resolve the
active App Insights resources from the environment — never assume a fixed resource
name:
- `APPINSIGHTS_APP_ID_BACKEND` / `APPINSIGHTS_API_KEY_BACKEND` — platform/backend.
- `APPINSIGHTS_APP_ID_STOREFRONT` / `APPINSIGHTS_API_KEY_STOREFRONT` — storefront.
- `APPINSIGHTS_RESOURCE_BACKEND` / `_STOREFRONT` — display names, only for portal links.
- `AZURE_SUBSCRIPTION_ID` / `AZURE_RESOURCE_GROUP` — for portal links.
A layer with no App ID/key is skipped with a clear message; some envs have none.

## Data flow (one run)
1. **Query** — run the probe queries (below) against each enabled layer over the
   look-back window, via Azure MCP's `applicationinsights` tool (pass the KQL text
   from `skills/qa-monitoring/queries/*.kql` and the resolved App ID; apply the
   window as the tool's timespan parameter).
2. **Fingerprint + dedup** — group rows into signatures using
   `skills/qa-monitoring/fingerprint-store.ts` (`signalFromRow` + `classify`),
   comparing against `reports/monitoring/.seen-fingerprints.json` as NEW / SPIKING /
   SEEN-stable. Only NEW/SPIKING proceed; cap at `MONITOR_MAX_SIGNALS` and log
   deferrals. After triage, call `recordRun` + `saveStore` to persist the updated
   baselines.
3. **Triage** — classify each candidate (taxonomy below) with severity, repo route,
   confidence — consulting the oracle knowledge files. Owner: `monitor-triage-agent`.
4. **Repro gate** — only HIGH-confidence `REAL_BUG` with a code-fixable `REPRO_LAYER`
   is reproduced live by the layer's QA expert (`qa-frontend-expert` / `qa-backend-expert`).
   Reproduced → draft bug report with a `## Fix Routing` block (same contract
   `/qa-bug` uses, so `/qa-fix` can pick it up); not reproduced → NEEDS_REVIEW
   (listed, not drafted).
5. **Report + notify + STOP** — write the monitoring report + summary, persist the
   store, send the Teams card via `skills/qa-monitoring/notify-teams.ts` (no-ops
   without `TEAMS_WEBHOOK_URL`). No ticket filed, no fix attempted.

## KQL probe library (`skills/qa-monitoring/queries/`)
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

## Triage taxonomy (`agents/monitor-triage-agent.md`)
`REAL_BUG` · `KNOWN_ISSUE` · `NOISE` · `CONFIG_GATED` · `THIRD_PARTY` · `TRANSIENT`.
Oracles: `knowledge/oracles/vc-bug-catalog.md` (familiar failures),
`knowledge/oracles/business-logic.md` (BL-* violations are always high severity),
`knowledge/execution/debugging-signals.md` (benign-noise filter),
`knowledge/api/platform-patterns.md` (expected desync/cache behavior). When
ambiguous, prefer NEEDS_REVIEW over REAL_BUG — a log line alone is not a defect.

## Dedup model (`skills/qa-monitoring/fingerprint-store.ts`)
- Fingerprint = md5(`env|layer|probe|normalized-signature`). The store is shared across
  envs (vcst, vcptcore, …); the `env` (= `TEST_ENV`) keeps each env's signatures separate
  inside the one file, so a vcst decision never masks the same signature in vcptcore.
- Per signature: first/last seen, cumulative count, run count, EMA baseline, status
  (`new|triaged|confirmed|noise|filed`).
- SPIKING = `count ≥ max(baseline×factor, baseline+minDelta)` (factor/minDelta env-tunable).
- `classify()` reads the *previous* baseline; `recordRun()` updates it — order matters.
- The store is local working state (gitignored — `reports/monitoring/.seen-fingerprints.json`),
  not carried across CI runs since there's no CI twin shipped here.

## Teams notification (`skills/qa-monitoring/notify-teams.ts`)
Optional — loads the layered `.env.defaults`/`.env.${TEST_ENV}`/`.env.local` files
directly via `scripts/lib/load-layered-env.mjs` (not `config.js`, whose `coreRequiredVars`
check would fail the notification over unrelated missing vars like `FRONT_URL`) and posts
an Adaptive Card summarizing the run
(status, layers, signature counts, confirmed/needs-review counts, cost). No-ops with
a clear console message when the webhook is unset; `/qa-monitoring` still completes
and writes its report either way. Run standalone with
`MONITOR_RUN_ID=<run-id> npx tsx skills/qa-monitoring/notify-teams.ts`, or let it pick
up the most recent `reports/monitoring/MONITOR-*/summary.json` when `MONITOR_RUN_ID`
is unset.

## Knobs (env)
`MONITOR_LAYERS` (both|frontend|backend) · `MONITOR_SINCE_MIN` (35) · `MONITOR_MAX_SIGNALS`
(15) · `MONITOR_SPIKE_FACTOR` (3) · `MONITOR_SPIKE_MIN_DELTA` (20) · `DRY_RUN` (triage
only — no repro/drafts) · `TEAMS_WEBHOOK_URL` (optional Teams card).

## Cross-references
- Command: `commands/qa-monitoring.md`
- Bug handoff contract (`## Fix Routing`): `commands/qa-bug.md` → `/qa-fix`
- Reports policy + the `reports/monitoring/` category: `.claude/rules/reports.md`
- Bug lifecycle after a confirmed draft: `/qa-bug` → `/qa-fix` → `/qa-verify-fix`
