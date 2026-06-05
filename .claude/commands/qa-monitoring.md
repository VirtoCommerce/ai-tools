---
description: "Online bug monitoring from Application Insights: query both layers → dedup by fingerprint → triage new/spiking signatures → reproduce HIGH-confidence bugs live → draft reports + Teams alert → STOP for human. Detect-and-report only; never files JIRA or auto-fixes. Interactive twin of ci/run-monitor.ts."
argument-hint: "[frontend|backend|both] [--since=MIN] [--dry-run]"
disable-model-invocation: true
---

# /qa-monitoring — Online Bug Monitoring (interactive)

Watch Azure **Application Insights** for both layers — the platform/backend resource and
the storefront resource (both per-env, resolved from `APPINSIGHTS_*` env vars; never
hardcoded) — separate real defects from noise, **reproduce the high-confidence ones live**,
and write a monitoring report + bug-report drafts, then **STOP for a human**. No JIRA
filing, no `/qa-fix` kickoff: this run only detects and reports. It is the **interactive
twin** of the headless `ci/run-monitor.ts` (same relationship `/qa-regression` has with
`ci/run-regression.ts`) and shares the KQL query library (`ci/monitoring/queries/*.kql`),
the fingerprint store (`reports/monitoring/.seen-fingerprints.json`), the triage agent
(`ci/agents/monitor-triage-agent.md`), and routing (`ci/lib/repo-router.ts`).

## Usage
```
/qa-monitoring both            # both layers, default 35-min window
/qa-monitoring backend --since=120
/qa-monitoring frontend --dry-run   # triage only — no live repro, no bug drafts
```

> **Hard orchestration rule** (as in `qa-fix.md`): the orchestrator only queries,
> evaluates the dedup/triage gates, and prints verdicts. Live repro is delegated to
> the QA expert agents via the Task tool. **Never** file JIRA or open a PR here —
> stop at the report and let the human decide.

The fastest path is to **run the headless twin and present its output**:
`DRY_RUN=<bool> MONITOR_LAYERS=<sel> MONITOR_SINCE_MIN=<min> npm run ci:monitor`,
then summarize `reports/monitoring/MONITOR-*/monitoring-report.md`. Run the phases
below inline only when Azure MCP is available locally and you want step-by-step control.

---

## Phase 0 — Pre-flight
1. `/qa-env-check` (endpoints) + confirm App Insights access: either Azure MCP
   (`applicationinsights` tool) is connected, **or** `APPINSIGHTS_APP_ID_*` +
   `APPINSIGHTS_API_KEY_*` are set (`npm run env:check`). Neither → STOP: "App Insights
   not configured — set the App IDs/keys in `.env.local` or connect Azure MCP."
2. Resolve args: layers (`both` default), `--since` minutes (default 35), `--dry-run`.

## Phase 1 — Query (both layers)
- For each enabled layer, run the probe queries from `ci/monitoring/queries/` over the
  look-back window (Azure MCP `applicationinsights`, or the REST client in the twin).
  Backend: exceptions, failed 5xx requests, failed dependencies. Frontend: browser
  exceptions, failed browser AJAX. Resolve each layer's App Insights resource from the
  `APPINSIGHTS_*` env vars — do not hardcode resource names.

## Phase 2 — Dedup (fingerprint gate)
- Group rows into signatures and classify against `reports/monitoring/.seen-fingerprints.json`
  as **NEW**, **SPIKING**, or **SEEN-stable** (skip). Only NEW/SPIKING proceed. This is
  the noise gate — without it the same exception is re-triaged every run. Cap triage at
  `MONITOR_MAX_SIGNALS` (default 15) by occurrence count; **log what was deferred** (no
  silent truncation).

## Phase 3 — Triage (Gate)
> **Owner:** `qa-lead-orchestrator` → `qa-backend-expert` for signal interpretation, using
> `ci/agents/monitor-triage-agent.md`.
- Classify each candidate: `REAL_BUG | KNOWN_ISSUE | NOISE | CONFIG_GATED | THIRD_PARTY |
  TRANSIENT`, with severity, a `suggestRepo()` route, and confidence. Oracles (read-only):
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
  standard structure **and the `## Fix Routing` block** (so `/qa-fix` can pick it up).
  **Not reproduced** → list as NEEDS_REVIEW; do not draft.

## Phase 5 — Report + notify + STOP
- Write `reports/monitoring/MONITOR-YYYY-MM-DD-HHMM/{monitoring-report.md,summary.json}`
  (≤100 lines; confirmed / needs-review / dismissed tables — see `.claude/rules/reports.md`).
  Persist the updated fingerprint store. Send the Teams card (`NOTIFY_MODE=monitor npx tsx
  ci/notify-teams.ts`).
- **STOP.** Present the confirmed drafts and ask the user whether to file JIRA (`/qa-bug`)
  or attempt a fix (`/qa-fix`). Do not do either automatically.

---

## Autonomous / scheduled runs
Run unattended as a **Claude Code Routine** (`/schedule`, min 1h) invoking `/qa-monitoring`,
or via the headless `ci/run-monitor.ts` + `.github/workflows/monitor.yml` (uncomment the
`*/30` cron; the fingerprint cache keeps runs idempotent). The 35-min default window
overlaps a 30-min cadence so nothing slips between runs.

## Rules
- **Detect-and-report only** — never file JIRA, never open a PR, never auto-fix. The human
  is the gate (per the approved design).
- Read-only on App Insights + GitHub. Agent prompts forbid external-system writes
  (`feedback_subagent_external_writes`).
- Dedup before triage; cap + log deferrals; normalize signatures so they don't drift with
  test data (`feedback_env_resilience`).
- Reports follow `.claude/rules/reports.md` (the `reports/monitoring/` category). Long logs
  via SendMessage, not on disk.
