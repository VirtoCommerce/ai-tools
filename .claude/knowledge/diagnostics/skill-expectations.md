# Skill-Expectations Oracle — vc-fix self-diagnostics

The **oracle** for the vc-fix self-diagnostics subsystem (VCST-5476, extended by the
client→vendor feedback loop VCST-5509). The passive Tier-0 collector
(`hooks/session-telemetry.mjs`, VCST-5475/5509) records *what happened* as spans and
tags each with a Tier-1 **outcome** (deterministic, no LLM); the on-demand LLM
diagnostician `/vc-self-check` (Tier 2) judges the flagged spans against this file —
so it can decide whether a skill actually did its job, not merely whether a tool
errored. This file is **dual-purpose**: the machine-readable §1c/§1d tables are kept
in **lock-step with the collector's inline consts** (Tier 1 uses them); the prose is
the diagnostician's judgment guide (Tier 2).

> **Reference, don't restate.** Gate IDs (`G0`–`G7`) are defined once in
> [`../../.claude/rules/quality-gates.md`](../../.claude/rules/quality-gates.md); report
> size caps live once in [`../../.claude/rules/reports.md`](../../.claude/rules/reports.md).
> This file cites them by ID/name and never re-defines them.

---

## 1. Signal vocabulary (what the collector gives the diagnostician)

The diagnostician reads the per-session jsonl (`<outputRoot>/.vc-fix/diagnostics/
<session_id>.jsonl`) plus the raw `transcript_path`. The jsonl now carries one
**`span`** record per closed operation (VCST-5509) plus a `finalize` roll-up. A span:

```
{ type:"span", id, parentId, kind:"command|skill|agent|tool", name,
  status:"ok|error", outcome, struggle[], startTs, endTs, durationMs, retries,
  tool_name, arg_hash, signals:{…}, details:[…] }
```

Span **kinds** nest: `command` (a plugin slash-command turn) ▷ `skill` (a Skill
invocation) ▷ `agent` (a Task/Agent delegation) / `tool` (any other tool). Each span's
`signals` are the deterministic counts:

| Signal | Meaning | How the collector detects it |
|--------|---------|------------------------------|
| `tool_error` | A tool returned `is_error: true` | transcript `tool_result.is_error === true` |
| `permission_denied` | A tool call was denied / declined | permission-denied phrase in a `tool_result` / text |
| `hook_failure` | A PostToolUse/other hook failed (e.g. `tsc` on every Edit, `npm error`) | `error TS####`, `tsc … error`, `command failed…` in output |
| `stop_bail` | A STOP / BAIL / hand-off / `FIX_STATUS: FAILED` marker the AGENT declared | marker regex in **assistant** text, excluding an echoed command/skill DEFINITION body, and requiring a bail context around the weak `hand off` marker (VCST-5582 F2 — `commands/qa-bug.md` contains the literal "hand off", which used to make the plugin trip its own detector) |
| `policy_block` | **Non-blocking.** A by-design guardrail refused a call and the agent obeyed + adapted (`hooks/enforce-real-user.mjs` blocking `browser_evaluate`) | `BLOCKED by real-user interaction rule` in a `tool_result`. Recorded and reported, but **excluded from `blockingErr`** — a rule working as intended can never make a run `failed` (VCST-5582 F4) |
| `tool_calls` | Count of tool invocations in the span | `tool_use` items |
| `agent_calls` | Count of agents delegated (Task/Agent tool) | `tool_use` name ∈ {Task, Agent}. A COUNT — a FAILED delegation surfaces as `tool_error`/`permission_denied` on the parent span |

The **numeric `anomalyScore >= 6` gate is GONE** (VCST-5509). Escalation is driven by
the per-span `outcome` (§1a), not a weighted count. `finalize` carries `spanCounts`
(outcome histogram), `flagged[]` (the non-`success`/non-`recovered` skill/command
spans with their dedup `signature`), `feedbackCount`, `anySkillSeen`, and a **`decision`**
object — the durable, deterministic audit of the decision moment. A **terminal** Stop
records `{ verdict:"clean|flagged", pluginActivity, freshCount, flaggedTotal, surfaced,
suppressReason }`; a **checkpoint** Stop (a background sub-agent is still running — detected
via `background_tasks`, fallback to an open agent op) records `{ verdict:"deferred",
pendingSubagents, surfaced:false, suppressReason:"subagent-running" }` and returns without
closing spans or surfacing anything, so a verdict/line never lands mid-task. `surfaced` is
whether a user-visible line was produced (a `Stop` hook cannot show a line without resuming
the agent). On a terminal plugin turn the hook resumes to print one line: a finding →
`/vc-self-check`; a clean turn → "no plugin issues detected" (default ON — silence with
`VC_FIX_DIAG_LINE=off`). Grep `"type":"finalize"` to see when the collector ran and what it
decided.

**Load-bearing nuance (quality-gates §3):** a `stop_bail` is a **SUCCESS**, not an
anomaly, when the run reached the bail *legitimately* (a G0/G1 BAIL with a reason
comment, or a reported `FIX_STATUS: FAILED` on an un-encodable repro). A clean BAIL is
an accepted expected output (§1c), so it classifies as `success`, never `silent_suspect`.

### 1a. Outcome taxonomy (Tier 1 → S0–S3)

The collector tags every **skill/command** span (the escalation units) with exactly one
outcome. `error ≠ failure`: a self-corrected error is `recovered`, not `failed`.

| Outcome | Meaning | Escalate? | Maps to |
|---------|---------|-----------|---------|
| `success` | Ran clean, produced its expected output (§1c). A clean BAIL is `success`. | no | S0 |
| `recovered` | An error occurred but was resolved **either** way: (a) **literal retry** — the same invocation (same `tool` + `arg_hash`) later succeeded within the span; **or** (b) **adaptation** (VCST-5582 F1) — the failed invocation was never repeated AND the span **provably produced** its expected artifact (`sawProduced`: a §1c marker backed by an operation that SUCCEEDED — never by a failed attempt, so "tried `gh pr create`, denied" is still `failed`). Clause (b) exists because the correct agent response to an error is to ADAPT (fix the quoting, pick another selector, switch tool), which mints a NEW `arg_hash` — keying recovery on (a) alone classified **every adaptive run** as `failed`. Applies to `tool_error`, `permission_denied`, and a `hook_failure` **surfaced via a `tool_result`** tied to a `tool_use_id`. A `hook_failure` detected from a bare top-level string echo (an untied PostToolUse note, e.g. a `tsc` message after an Edit — no `tool_use_id` to key an op on) has no invocation to resolve against and can **never** classify as `recovered`; it always forces `failed` for its span, even if the very next Edit is clean. Deliberate fail-toward-escalation, not an oversight. | **no** | S3 (note only) |
| `degraded` | Completed but a **struggle** sub-signal fired (§1d) — persistence without progress. | yes | S2 |
| `failed` | A blocking error that was **not** recovered (its exact `tool`+`arg_hash` never succeeded afterward, or — for an untied `hook_failure` echo — unconditionally, per the `recovered` row above) — a `tool_error`, `permission_denied`, or `hook_failure`. Signals come ONLY from `is_error` tool results (never from narration or the text content of a successful tool). | yes | S1 |
| `silent_suspect` | Closed with no error and no struggle, but produced **none** of its expected-output markers (§1c) — task likely done wrong with no error signal. Requires a **minimum of real work** (`SILENT_MIN_OPS = 2` ops): a command span that opened and closed with ~0 ops (e.g. `/qa-fix` → the agent asks a clarifying question → stop) is a trivial/deferred turn, not a silent failure, and is NOT flagged. | yes | S1/S2 |

Only `degraded`/`failed`/`silent_suspect` spans are `flagged`; the tail-trigger runs the
diagnostician once per turn on **new** signatures only (dedup). `recovered`/`success`
never escalate. `vc-self-check`'s own spans are dropped (loop guard).

### 1c. Expected-output markers (Tier 1 `silent_suspect` — machine-readable)

A skill/command span that closed clean but matched **none** of its markers is
`silent_suspect`. Markers are matched against the span's tool names + redacted tool
inputs + assistant text. **A clean BAIL/STOP marker counts as expected output.** Kept
in lock-step with `EXPECTED_OUTPUT` in `hooks/session-telemetry.mjs`.

| Skill / command | An expected-output marker is ANY of |
|-----------------|-------------------------------------|
| `/qa-bug` | a `reports/bugs/` write · a tracker-create (`createJiraIssue`/`create_issue`) · a clean BAIL |
| `/qa-fix` | a PR created (`create_pull_request` / `gh pr create` / `pull/<n>`) · a clean BAIL |
| `/qa-verify-fix` | a ticket transition/update · `READY FOR TEST`/`testing`/`verified`/`reproduc…` · a clean BAIL |
| `/qa-monitoring` | a `reports/monitoring/` write · `signature`/`dedup`/"no new signatures" · a clean BAIL |
| `/qa-env-check` | a readiness/`PASS`/`FAIL` verdict table |
| `/project-init` | a `project-profile.json`/`.mcp.json`/`.env.*` write · a readiness/verify-access table (any mode: full onboarding, `--add-env` = an `.env.*` write + verify table, `--check` = a reconcile summary + verify table) |
| `/vc-docs` | any activity (lookup skill — never silent_suspect) |
| **developer skills** (`/dotnet-unit-test`, `/dotnet-fix`, `/angular-admin`, `/vue-unit-test`, `/vue-fix`, `/vc-shell-fix`) | a red→green test run (`vitest`/`tsx --test`/`dotnet test`/`vue-tsc`/…) · a code edit (`Edit`/`Write`) · a pass/fail verdict · a clean BAIL. **NOTE:** these run inside the `fullstack-*` sub-agents, whose transcripts are sidechains the collector **skips** — so this is a DEFENSIVE fallback for a standalone main-session invocation; normally their outcome rolls up to the enclosing `/qa-fix` command span. |

A skill with **no** entry above is never `silent_suspect` (the collector treats an
absent oracle entry as "output produced"). Add an entry here **and** in the collector
const when a new user-facing skill ships. A new **developer** skill shipped for `/qa-fix`
should be added to the developer-skills row + `DEV_SKILL_OUTPUT` in the collector.

### 1d. Struggle sub-signals (Tier 1 `degraded` — machine-readable)

Detected from the span's op history — **persistence without progress**, not volume.
Thresholds are the `T.*` consts in `hooks/session-telemetry.mjs`; tuned conservatively
so normal thorough work does NOT trip them. Any hit ⇒ `degraded`.

| Sub-signal | Fires when | Threshold const | Sev |
|------------|-----------|-----------------|-----|
| `retry_storm` | same tool + `arg_hash` repeated with recurring errors | `RETRY_STORM_REPEATS=3` & `RETRY_STORM_ERRORS=2` | S2 |
| `reread_loop` | same read/search `arg_hash` repeated | `REREAD_LOOP=5` | S2 |
| `search_thrash` | a run of consecutive search/read ops AND the span produced **no progress** at all — where progress = a decisive op (Edit/Write/PR/create → `sawDecisive`) **OR** the skill's own expected output (`sawExpected`, §1c). A read-only skill like `/qa-env-check` does many reads and produces a readiness table (its expected output) with no decisive op — that is progress, NOT thrash | `SEARCH_THRASH_RUN=8` | S2 |
| `fallback_loop` | distinct browser variants used in one span (firefox→edge→chrome bounce) | `FALLBACK_DISTINCT=3` | S2 |
| `recurring_error` | same error signature keeps returning | `RECURRING_ERROR=3` | S2 |
| `stall` | a single op ran abnormally long | `STALL_MS=8min` | S2/S3 |
| `low_yield` | many tool ops with **no progress** — neither a decisive op nor the skill's expected output (`sawExpected`) | `LOW_YIELD_OPS=20` | S2 |

> **Progress, not volume (both `search_thrash` + `low_yield`).** Neither fires while the span
> has already produced its expected output — a read-heavy but successful read-only skill is
> not struggling. Volume alone never flags.

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
`span` is one whose skill/command is listed in §3. (These rows refine the §1a outcome:
Tier 1 gives the coarse outcome deterministically; Tier 2 uses the rows below to place
the exact severity + verdict.)

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
| A single `tool_error`/`permission_denied` the skill recovered from (outcome `recovered`) | **S3** |
| Benign `hook_failure` warning that did not block (e.g. one `tsc` note, later clean) | **S3** |
| Clean run, expected phases present, expected output produced (§1c), no struggle (outcome `success`) | **S0** |
| Closed clean but produced no expected output (outcome `silent_suspect`) — task likely done wrong, no error | **S1** (S2 if a partial artifact exists) |

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
- **Required outputs:** `reports/tickets/{SPRINT}/VCST-XXXX/verification-summary.json` with a verdict; a role transition consistent with the verdict (or a BLOCKED with no transition).
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

These are detectable across a skill/command span's own `signals` + `struggle` + the
child `agent`/`tool` span records (never the session-prefix development noise before
the first skill/command) — the diagnostician flags them regardless of which skill was
running. Several now surface automatically as a `degraded`/`failed` outcome (§1a/§1d);
the diagnostician still confirms the root cause and names the fix:

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

## 5. Worked mappings (for the Tier-2 dry read)

- **Known-good `/qa-env-check`:** span `outcome:"success"`, checks 1–6 + a READY verdict, no browser/write tool_use → **S0 / OK**.
- **Synthetic broken `/qa-fix`:** span `outcome:"failed"`, a green G2 repro then no PR, `permission_denied` on `gh pr create` (never recovered) → **S1 / BROKEN** (root-cause: PR auth missing → propose checking `GITHUB_FIX_BUGS_TOKEN` / `gh auth status`).
- **Silent `/qa-fix`:** span `outcome:"silent_suspect"` — closed clean, edits made, but no PR-created and no BAIL marker → **S1** (task ended without delivering or bailing; the worst failure mode — no error signal).
- **Degraded `/qa-bug` (struggle):** span `outcome:"degraded"`, `struggle:["search_thrash","low_yield"]` — 10 searches, no decisive op → **S2** (root-cause: lost in exploration; fix: the skill's Step-1 needs a tighter repro-first path).
- **Recovered `/qa-bug`:** span `outcome:"recovered"` — one `gh` `tool_error` then a successful retry → **S3 / note only, NOT escalated.**
- **Operator `/vc-feedback` 👎:** a `feedback` record `{verdict:"down"}` — the highest-value signal; always surface it even if every span was `success` (a silent failure the heuristics missed).

---

## 6. References

- Gate ladder G0–G7 + no-auto-merge + client-code containment: [`../../.claude/rules/quality-gates.md`](../../.claude/rules/quality-gates.md)
- Report categories + size caps + bloat patterns: [`../../.claude/rules/reports.md`](../../.claude/rules/reports.md)
- Signal source + record schema: [`../../hooks/session-telemetry.mjs`](../../hooks/session-telemetry.mjs)
- **Upstream contribution schema (default-deny, closed vocabulary):** [`upstream-schema.md`](./upstream-schema.md) + ADR [`adr-upstream-default-deny.md`](./adr-upstream-default-deny.md). The `deliver` step builds its outbound artifact ONLY from the structured jsonl reduced to this closed schema — the LLM DIAG free text (`signal`/`rootcause`/`fix`) never leaves the machine.
- The 6 command definitions: [`../../commands/`](../../commands/)

---

## Signal completion at your final step (REQUIRED for every skill & command)

The self-diagnostics **clean status line** (`vc-fix self-check: no plugin issues detected`) is
gated on an **explicit completion signal**, NOT on the `Stop` hook. `Stop` fires at the end of
**every** turn — including every pause where a multi-turn skill (e.g. `/project-init`'s interview,
`/qa-fix`'s sub-agent hand-off) waits for the operator — and it carries no signal that a skill has
*finished*. A per-turn guard structurally cannot express "once, at the end", so without an explicit
marker the clean line either repeats on every pause or never fires at the right moment.

So every command/skill MUST, as the **LAST action of its terminal step** (after all user-visible
output), emit the completion marker:

```bash
node "$pluginRoot/hooks/session-telemetry.mjs" complete --skill "<this-skill-name>"
```

(`$pluginRoot` = the active install path, resolved at runtime via `claude plugin list --json` — see
[`../execution/plugin-root.md`](../execution/plugin-root.md); `/project-init` uses `$CLAUDE_PLUGIN_ROOT`,
consistent with the rest of that skill.)

Rules:

- Run it **exactly once**, at the real end of the workflow (e.g. after the final "Done"/STOP step),
  **AFTER** all user-visible output — never at an intermediate pause, and never before a step that
  still waits on the operator.
- **NEVER while an operator DECISION is pending** (VCST-5582 D — this is the rule the OPUS run
  broke). A skill that asks the operator anything — `/qa-bug`'s Step-5 "create a ticket?", its
  parent-link question, a field-mapping question — emits `complete` only **after** that question is
  answered or the step is explicitly declined. Two things go wrong otherwise: (1) everything the
  skill does after `complete` lands **outside** the span as `parentId: null` orphans, so neither the
  oracle nor `/vc-self-check` ever evaluates it (on the OPUS run that was the entire
  ticket-creation phase); (2) with the span closed, the `Stop` hook may resume the agent to print a
  verdict, pushing the unanswered question out of view.
- **Ask with `AskUserQuestion`, not prose.** A prose question ends the turn, which is what lets an
  end-of-turn hook interleave with it. `AskUserQuestion` blocks inside the turn. Belt-and-braces:
  `cmdFinalize` DEFERS any `Stop` whose transcript tail holds an `AskUserQuestion` `tool_use` with no
  matching `tool_result` — recorded as `{ verdict: "deferred", surfaced: false, suppressReason:
  "question-pending" }`, and it emits no block. That is a safety net, not a licence to signal early.
- Only the **top-level command/skill the operator invoked** emits it. A **dispatched sub-agent**
  (the `fullstack-*` devs, `qa-*-expert`s) must NOT — its spans run in a collector-skipped sidechain
  and roll up to the enclosing command, and a sub-agent's `complete` would set the marker with a
  misattributed name on the parent session mid-run. The parent orchestrator owns the signal.
- If the skill **bails early** (NOT READY / BAIL / no-op / couldn't reproduce), still emit it — a
  correct early exit is a completed run.
- It is safe and silent: it **never throws, never blocks** a tool, and is a **no-op** when
  self-diagnostics **capture** is not opted in (no `selfDiagnostics:true`, or `VC_FIX_DIAG_CAPTURE=off`)
  or when there is no session state yet. It is **NOT** gated on `VC_FIX_DIAG_CONSENT` — consent gates
  *surfacing* the clean line at finalize, not writing the marker (matching the CHANGELOG's "capture
  is unaffected by the consent kill-switch"). Being Bash-invoked it has no hook
  stdin, so it targets the session whose `.state.json` was most recently modified (the active
  session) unless `--session <id>` is passed.

**Why:** the marker sets `state.skillCompletePending`; the next terminal `Stop`'s `cmdFinalize`
consumes it to surface the clean line **exactly once**, after your skill actually finished. Without
it the clean line is withheld (audit `suppressReason: "awaiting-completion"`) — or, only when
`VC_FIX_DIAG_LINE_FALLBACK=on`, a once-per-**session** legacy fallback fires instead. The `findings`
escalation (a flagged span → silent `/vc-self-check`) is independent and needs no marker.

**Authoring checklist (add to every new skill/command):**

- [ ] The terminal step's LAST action emits `session-telemetry.mjs complete --skill "<name>"`.
- [ ] Every early-exit path (BAIL / NOT READY / no-op) also emits it.
- [ ] `<name>` matches the skill/command name the collector attributes spans to (the slash-command
      name without its namespace, e.g. `qa-fix`, `project-init`).
