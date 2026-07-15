# Skill-Expectations Oracle — vc-fix self-diagnostics

Step 2 of the vc-fix self-diagnostics subsystem (VCST-5476). This is the **oracle**
the on-demand LLM diagnostician `/vc-self-check` (Step 3, VCST-5477) judges each
session against. The passive Tier-A collector (`hooks/session-telemetry.mjs`,
VCST-5475) records *what happened*; this file declares, per shipped command, *what
a correct run looks like* — so the diagnostician can decide whether a skill actually
did its job, not merely whether a tool errored.

> **Reference, don't restate.** Gate IDs (`G0`–`G7`) are defined once in
> [`../../rules/quality-gates.md`](../../rules/quality-gates.md); report
> size caps live once in [`../../rules/reports.md`](../../rules/reports.md).
> This file cites them by ID/name and never re-defines them.

---

## 1. Signal vocabulary (what the collector gives the diagnostician)

The diagnostician reads the per-session jsonl (`<outputRoot>/.vc-fix/diagnostics/
<session_id>.jsonl`) plus the raw `transcript_path`. Each `skill_end` / `finalize`
record carries these deterministic counts (`hooks/session-telemetry.mjs`):

| Signal | Meaning | How the collector detects it |
|--------|---------|------------------------------|
| `tool_error` | A tool returned `is_error: true` | transcript `tool_result.is_error === true` |
| `permission_denied` | A tool call was denied / declined | permission-denied phrase in a `tool_result` / text |
| `hook_failure` | A PostToolUse/other hook failed (e.g. `tsc` on every Edit, `npm error`) | `error TS####`, `tsc … error`, `command failed…` in output |
| `stop_bail` | A STOP / BAIL / hand-off / `FIX_STATUS: FAILED` marker | marker regex in assistant text |
| `tool_calls` | Count of tool invocations in the span | `tool_use` items |
| `anomalyScore` | `tool_error*3 + permission_denied*2 + hook_failure*3` | finalize (stop_bail weighted 0 — a clean bail is success) |

Derived patterns the diagnostician computes from the transcript + these counts
(the collector does not pre-label them): **retry storm** (same tool re-invoked ≥4×
with repeated `tool_error`/`permission_denied`), **incomplete run** (expected phases
for the invoked skill never appear), **missing required output** (a required artifact
below was never written), **oversized report** (an artifact over its `reports.md` cap).

**Load-bearing nuance (quality-gates §3):** a `stop_bail` is a **SUCCESS**, not an
anomaly, when the run reached the bail *legitimately* (a G0/G1 BAIL with a reason
comment, or a reported `FIX_STATUS: FAILED` on an un-encodable repro). `stop_bail`
becomes a signal only when paired with a *broken* trajectory (bail mid-fix after a
green repro; bail with no reason; a permission/hook failure that forced the stop).
Tier A cannot tell these apart — that judgment is exactly this oracle's job.

---

## 2. Severity rubric (S0 → S3)

| Sev | Name | Definition | Diagnostician verdict |
|-----|------|------------|-----------------------|
| **S0** | OK | Ran its expected phases, produced its required outputs, no unexplained signals. A clean BAIL/STOP is S0. | `OK` |
| **S1** | Blocker | The skill could not complete its core job — a required phase never ran, a required output is missing, or a signal aborted the run before its purpose was met. | `BROKEN` |
| **S2** | Degraded | The skill completed but a rule was violated or a result is untrustworthy — e.g. a gate skipped, an oversized report, a wrong-layer route, a self-corrected error that still cost a full retry cycle. | `DEGRADED` |
| **S3** | Friction | The skill completed correctly but with avoidable noise — one denied tool it recovered from, a single flaky retry, a benign hook warning. Worth reporting to improve the plugin, not a functional defect. | `OK (with note)` |

### (signal × expectation) → severity

Apply the **most severe** matching row. "During a required phase" means the signal's
`skill_end`/`openSkill` span is one whose skill is listed in §3.

| Observation | Severity |
|-------------|----------|
| A **required phase/gate** for the skill never appears in the transcript, or a **required output** is missing | **S1** |
| `stop_bail` on a broken trajectory (mid-fix after green repro, bail with no reason comment, forced by a failure) | **S1** |
| `permission_denied` on a tool the skill *must* call to finish (e.g. tracker create/transition, PR open) with no recovery | **S1** |
| `hook_failure` that repeats across the span and blocks progress (e.g. `tsc` fails on *every* Edit) | **S1** |
| A **gate was skipped** but the run continued (e.g. `/qa-fix` opened a PR with no `skill_end` evidence of G2 repro; `/qa-verify-fix` transitioned before the Step-2 deploy gate) | **S2** |
| Report artifact **over its `reports.md` cap** | **S2** |
| **Retry storm** (≥4×) that eventually succeeded | **S2** |
| Wrong-layer / off-allowlist route that Gate 1 caught (route churn) | **S2** |
| A single `tool_error`/`permission_denied` the skill recovered from | **S3** |
| Benign `hook_failure` warning that did not block (e.g. one `tsc` note, later clean) | **S3** |
| Clean run, expected phases present, outputs written, `anomalyScore = 0` (or only a legitimate bail) | **S0** |

---

## 3. Per-skill oracle

Each entry lists the **expected phases/gates**, the **required outputs**, and
**anti-patterns** with at least one **S1 (blocker)** and one **S2 (degraded)** that the
Step-1 collector's signals can actually surface.

### `/project-init` — onboard the plugin onto a deployment
- **Expected phases** (`commands/project-init.md` → the `/project-init` skill): install deps → ask *only* env name + tracker (Jira/Azure Boards) + code host (GitHub/Azure Repos) + auth-per-axis → **derive** projectType/client-org/contribution-mode/fork-account from token + live module/repo scan → write `project-profile.json` + `.env.<env>` + `.env.local` + `.mcp.json` → **verify access** (readiness table).
- **Required outputs:** `project-profile.json` (valid JSON, at the project root — never under the plugin dir), `.env.<env>` + `.env.local`, `.mcp.json`, and a printed readiness table.
- **Anti-patterns:**
  - **S1** — the run ends with no `project-profile.json` written (or it landed under the plugin install dir instead of `outputRoot`), or the verify-access step never ran. *Signal:* required-output missing; `permission_denied`/`tool_error` on the token probe with no recovery.
  - **S2** — profile written but the readiness table shows a probed axis DOWN and the run proceeded anyway; or it asked the operator what the profile already answers (redundant prompts). *Signal:* `tool_error` on a tracker/host probe inside the verify phase, run still finalized OK.
  - **S3** — one `permission_denied` on an optional MCP the skill recovered from (noted, non-blocking).

### `/qa-bug` — reproduce, evidence, report, (optional) file
- **Expected phases** (`commands/qa-bug.md`): Step 0 pre-flight (build/version + Context7 + dup check) → Step 1 gather/reproduce → **Step 2 4-Layer Validation** → Step 3 research + resolve exact repo → Step 4 write report → Step 5 (optional, consent-gated) create ticket.
- **Required outputs:** a `reports/bugs/open/BUG-*.md` with the **Fix Routing block** filled; a tracker ticket **only if** the user said yes.
- **Anti-patterns:**
  - **S1** — no bug report written despite a reproduced defect; or a ticket was filed **without** the explicit user "yes" (consent violation). *Signal:* required-output missing; a tracker-create tool call with no preceding consent in the transcript.
  - **S2** — report written but **over the bug-report cap** (`reports.md` §2: simple ≤80 / functional ≤120 / cross-layer ≤150), or Step 2 4-layer validation never ran (owning layer unproven → route untrustworthy). *Signal:* oversized report; missing-phase.
  - **S3** — one `tool_error` on a layer probe that a later layer covered.

### `/qa-fix` — autonomous single-repo fix (gate ladder G0→G7)
- **Expected gates** (`quality-gates.md`, in order): **G0** triage → **G1** single repo → **G2** repro (red) → **G3** fix (green) → **G4** review → **G5** CI → **G6** delegated (not run here) → **G7** STOP at open PR. A clean **BAIL at G0/G1** or a reported `FIX_STATUS: FAILED` is a **SUCCESS** (S0), not a failure.
- **Required outputs:** either (a) a BAIL with a one-line reason comment on the ticket + ticket left in place, or (b) an **open PR** (never merged) + ticket at the in-review role. Reports under `reports/fixes/FIX-*/`.
- **Anti-patterns:**
  - **S1** — a merge happened (`merge_pull_request` / `gh pr merge`) — the no-auto-merge triple guard (quality-gates §2) was breached; or the run stopped mid-fix after a **green G2 repro** with no PR and no clean-bail reason (work lost). *Signal:* a merge tool call in the span; `stop_bail` on a broken trajectory.
  - **S2** — a PR was opened but a gate has no evidence in the transcript (no G2 repro `skill_end`, or G4 review skipped), or the fix touched **>1 repo** (G1 violation caught late). *Signal:* skipped-gate; route churn (repeated repo resolution).
  - **S2** — `hook_failure` where `tsc` PostToolUse errored on **every** Edit across the fix span (the fix never typechecked clean). *Signal:* `hook_failure ≥ Edit count`.
  - **S3** — one `permission_denied` on a clone/gh call that a retry resolved.

### `/qa-verify-fix` — verify a deployed fix, transition the ticket
- **Expected phases** (`commands/qa-verify-fix.md`): Step 0 pre-flight → Step 1 fetch ticket → **Step 2 confirm-deployment hard gate** → Step 3 transition to `testing` (ONLY after Step 2) → Step 4 checklist → Step 5 execute (STR ×3) → Step 6 decide + transition by role → Step 7 summary.
- **Required outputs:** `tests/{SPRINT}/VCST-XXXX/verification-summary.json` with a verdict; a role transition consistent with the verdict (or a BLOCKED with no transition).
- **Anti-patterns:**
  - **S1** — transitioned the ticket to `testing` (or `tested`/`reopen`) **before/without** the Step-2 deploy confirmation — tested old code and moved the ticket on a false "deployed". *Signal:* a transition tool call before any deploy-check evidence; missing Step-2 phase.
  - **S1** — an undeployed fix was transitioned to `reopen` (an undeployed fix is not a failed fix). *Signal:* `reopen` transition + a "not deployed" marker in the same span.
  - **S2** — STR passed only 2/3 but the verdict was VERIFIED (should be INTERMITTENT → `reopen`); or `verification-summary.json` missing while a transition still happened. *Signal:* verdict/evidence mismatch; missing-output with a transition present.
  - **S3** — one env probe `tool_error` recovered by a single retry.

### `/qa-monitoring` — App Insights online monitoring (detect-and-report only)
- **Expected phases** (`commands/qa-monitoring.md`): Phase 0 pre-flight → 1 query both layers → 2 dedup (fingerprint gate) → 3 triage → 4 live repro (HIGH-confidence REAL_BUG only) → 5 report + notify + **STOP**.
- **Required outputs:** a `reports/monitoring/MONITOR-*/` summary (within the monitoring cap, `reports.md` §2) ending in the "no ticket filed, no fix attempted" footer. **Never** a filed ticket and **never** a `/qa-fix` invocation.
- **Anti-patterns:**
  - **S1** — a tracker ticket was filed or a fix was attempted (crosses the detect-and-report-only boundary); or Phase 1 query returned nothing because the App Insights probe was **denied/errored** and the run reported "all clear" anyway (false negative). *Signal:* a tracker-create / `/qa-fix` `skill_start` in the span; `permission_denied`/`tool_error` on the App Insights query with an OK finalize.
  - **S2** — the fingerprint dedup (Phase 2) was skipped so already-seen signatures were re-reported (tracker/Teams spam), or the summary exceeds the monitoring cap. *Signal:* missing-phase; oversized report.
  - **S3** — one telemetry-query `tool_error` that a retry recovered.

### `/qa-env-check` — read-only environment validation
- **Expected checks** (`commands/qa-env-check.md`): (1) active-config summary → (2) env vars → (3) both-surface endpoint health → (4) MCP availability → (5) plugin local state → (6) profile-driven tracker/host connectivity → **verdict READY / NOT READY**.
- **Required outputs:** a printed check report ending in an explicit READY / NOT READY verdict. **Read-only** — no browser automation, no writes, no admin actions, target < 30s.
- **Anti-patterns:**
  - **S1** — the run performed a **write / browser automation / admin action** (violates read-only), or never emitted a verdict. *Signal:* a browser or write tool `tool_use` in a `/qa-env-check` span; missing-output.
  - **S2** — printed READY while a **required** MCP (playwright-chrome/firefox/edge) or a used tracker/host axis probed DOWN (a false-green readiness). *Signal:* `tool_error` on a required probe with a READY verdict.
  - **S3** — an optional MCP (context7/postman) missing, correctly reported as a warning (this is expected behavior, informational only).

---

## 4. Cross-cutting anti-patterns (any skill)

These are session-wide and detectable straight from `finalize` totals — the
diagnostician flags them regardless of which skill was running:

| Pattern | Detection | Severity |
|---------|-----------|----------|
| **`tsc` PostToolUse fails on every Edit** | `hook_failure` count ≈ Edit count across the session | S2 (S1 if it blocked all progress) |
| **Browser fallback loop** | same browser tool retried across the fallback chain (chrome→firefox→edge) ≥ the chain length with repeated `tool_error` | S2 |
| **Denied-tool retry storm** | `permission_denied` ≥ 4 on the same tool with no strategy change | S2 |
| **Oversized report** | any written report over its `reports.md` cap | S2 |
| **Silent all-clear on a failed probe** | a monitoring/env probe `tool_error`/`permission_denied` followed by an OK/READY verdict | S1 |
| **Merge attempt** | `merge_pull_request` / `gh pr merge` anywhere (quality-gates §2 breach) | S1 |
| **Write under the plugin dir** | a write path resolves inside the plugin install dir instead of `outputRoot` | S1 |

---

## 5. Worked mappings (for the Step-3 dry read)

- **Known-good `/qa-env-check`:** span shows checks 1–6 + a READY verdict, `anomalyScore = 0`, no browser/write tool_use → **S0 / OK**.
- **Synthetic broken `/qa-fix`:** span shows a green G2 repro `skill_end`, then a `stop_bail` with no PR and no reason comment, `permission_denied` on `gh pr create` → **S1 / BROKEN** (blocker: could not deliver the fix; root-cause hypothesis: PR auth missing → propose checking `GITHUB_FIX_BUGS_TOKEN` / `gh auth status`).
- **Degraded `/qa-bug`:** report written but 190 lines for a functional bug (cap 120), Step 2 4-layer table present → **S2 / DEGRADED** (fix: trim per `reports.md` §4 bloat patterns).

---

## 6. References

- Gate ladder G0–G7 + no-auto-merge + client-code containment: [`../../rules/quality-gates.md`](../../rules/quality-gates.md)
- Report categories + size caps + bloat patterns: [`../../rules/reports.md`](../../rules/reports.md)
- Signal source + record schema: [`../../hooks/session-telemetry.mjs`](../../hooks/session-telemetry.mjs)
- The 6 command definitions: [`../../commands/`](../../commands/)
