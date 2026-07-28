---
description: "Online bug monitoring from Application Insights: query both layers → dedup by fingerprint → triage new/spiking signatures → reproduce HIGH-confidence bugs live → draft reports → STOP for human. Detect-and-report only; never files a ticket or auto-fixes."
argument-hint: "[frontend|backend|both] [--since=MIN] [--dry-run]"
disable-model-invocation: true
---

# /qa-monitoring — Online Bug Monitoring

Watch Azure **Application Insights** for both layers — the platform/backend resource and
the storefront resource (both per-env, resolved from `APPINSIGHTS_*` env vars; never
hardcoded) — separate real defects from noise, **reproduce the high-confidence ones live**,
and write a monitoring report + bug-report drafts, then **STOP for a human**. No ticket
filing, no `/qa-fix` kickoff: this run only detects and reports. It shares the KQL query
library (`skills/qa-monitoring/queries/*.kql`), the fingerprint store
(`reports/monitoring/.seen-fingerprints.json`, via `skills/qa-monitoring/fingerprint-store.ts`),
and the triage agent (`monitor-triage-agent`).

> **In `vc-fix`:** this is the self-contained interactive-only version of the full `vc-qa`
> plugin's monitoring pipeline — the headless CI twin (`ci/run-monitor.ts` +
> `.github/workflows/monitor.yml`) is full `vc-qa` plugin only, not shipped here. Every
> query and dedup step below runs inline through Azure MCP + this plugin's own
> `skills/qa-monitoring/` — there is no headless twin to delegate to. The Teams card
> **is** shipped, as `skills/qa-monitoring/notify-teams.ts` (a monitor-only extract of
> `ci/notify-teams.ts` — the regression-card mode is dropped, `vc-fix` has no regression
> pipeline); it needs `TEAMS_WEBHOOK_URL` in `.env.local` and no-ops with a clear message
> when unset.

## Usage
```
/qa-monitoring both            # both layers, default 35-min window
/qa-monitoring backend --since=120
/qa-monitoring frontend --dry-run   # triage only — no live repro, no bug drafts
```

> **Hard orchestration rule** (as in `qa-fix.md`): the orchestrator only queries,
> evaluates the dedup/triage gates, and prints verdicts. Live repro is delegated to
> the QA expert agents via the Task tool. **Never** file a ticket or open a PR here —
> stop at the report and let the human decide.

---

## Phase 0 — Pre-flight
1. `/qa-env-check` (endpoints) + confirm App Insights access: either Azure MCP
   (`applicationinsights` tool) is connected, **or** `APPINSIGHTS_APP_ID_*` +
   `APPINSIGHTS_API_KEY_*` are set (`npm run env:check`). Neither → STOP: "App Insights
   not configured — set the App IDs/keys in `.env.local` or connect Azure MCP."
2. Resolve args: layers (`both` default), `--since` minutes (default 35), `--dry-run`.

## Phase 1 — Query (both layers)
- For each enabled layer, run the probe queries from `skills/qa-monitoring/queries/` over
  the look-back window via Azure MCP's `applicationinsights` tool. Backend: exceptions,
  failed 5xx requests, failed dependencies. Frontend: browser exceptions, failed browser
  AJAX. Resolve each layer's App Insights resource from the `APPINSIGHTS_*` env vars — do
  not hardcode resource names.

## Phase 2 — Dedup (fingerprint gate)
- Use `skills/qa-monitoring/fingerprint-store.ts` (`signalFromRow` → `classify`) to group
  rows into signatures and classify against `reports/monitoring/.seen-fingerprints.json`
  as **NEW**, **SPIKING**, or **SEEN-stable** (skip). Only NEW/SPIKING proceed. This is
  the noise gate — without it the same exception is re-triaged every run. Cap triage at
  `MONITOR_MAX_SIGNALS` (default 15) by occurrence count; **log what was deferred** (no
  silent truncation). After triage, `recordRun` + `saveStore` to persist the updated
  baselines.

## Phase 3 — Triage (Gate)
> **Owner:** `monitor-triage-agent`, given the signature + oracle context by the
> orchestrator.
- Classify each candidate: `REAL_BUG | KNOWN_ISSUE | NOISE | CONFIG_GATED | THIRD_PARTY |
  TRANSIENT`, with severity, a `ROUTE_REPO`, and confidence. Oracles (read-only):
  `vc-bug-catalog.md`, `business-logic.md`, `debugging-signals.md`, `platform-patterns.md`.
  When ambiguous, prefer NEEDS_REVIEW over REAL_BUG.

## Phase 4 — Live repro (HIGH-confidence REAL_BUG only)
> **Owner:** `qa-frontend-expert` (storefront, playwright-chrome) / `qa-backend-expert`
> (API/Admin, playwright-edge) by the triage `REPRO_LAYER`.
- Reproduce as a real user (never force disabled controls; never bypass the UI with
  scripts — see `feedback_no_force_disabled_controls`, `feedback_real_user_interaction`).
  Backend signals may be confirmed via a real API/Admin interaction. Confirm a second
  source before treating a payload-only signal as a bug (`feedback_verify_payload_bugs_second_source`).
- **Reproduced** → draft a bug report to `reports/bugs/open/BUG-AI-<fp>-<date>.md` with the
  standard structure **and the `## Fix Routing` block** — the same profile-based contract
  `commands/qa-bug.md` defines, including its client|platform **Ownership hint** (a hint only;
  `/qa-fix` Gate 1/1b decides ownership from the profile). So the draft carries no native-only
  repo assumption. **Not reproduced** → list as NEEDS_REVIEW; do not draft.

## Phase 5 — Report + notify + STOP
- Write `reports/monitoring/MONITOR-YYYY-MM-DD-HHMM/{monitoring-report.md,summary.json}`
  (≤100 lines; confirmed / needs-review / dismissed tables — see `.claude/rules/reports.md`).
  Persist the updated fingerprint store. Send the Teams card:
  `MONITOR_RUN_ID=<run-id> npx tsx skills/qa-monitoring/notify-teams.ts` (no-ops if
  `TEAMS_WEBHOOK_URL` is unset).
- **STOP.** Present the confirmed drafts and hand off to `/qa-bug` (file) or `/qa-fix`
  (attempt a fix) — **the profile decides the tracker** (Jira / Azure Boards) and repo route,
  not this command. Do not file or fix automatically.
- **Signal completion (self-diagnostics — the LAST action, on every terminal exit incl. a
  "nothing new" early STOP)** — best-effort, silent, never blocks:
  ```bash
  node "$pluginRoot/hooks/session-telemetry.mjs" complete --skill "qa-monitoring"
  ```
  So the collector's one-line clean/health status prints **exactly once** after the run.
  `$pluginRoot` = the active install path (`claude plugin list --json`; see
  [`knowledge/execution/plugin-root.md`](../knowledge/execution/plugin-root.md)). Details:
  [`knowledge/diagnostics/skill-expectations.md`](../knowledge/diagnostics/skill-expectations.md)
  §Signal completion.

---

## Rules
- **Detect-and-report only** — never file a bug tracker ticket, never open a PR, never
  auto-fix. The human is the gate (per the approved design).
- Read-only on App Insights + GitHub. Agent prompts forbid external-system writes
  (`feedback_subagent_external_writes`).
- Dedup before triage; cap + log deferrals; normalize signatures so they don't drift with
  test data (`feedback_env_resilience`).
- Reports follow `.claude/rules/reports.md` (the `reports/monitoring/` category). Long logs
  via SendMessage, not on disk.
