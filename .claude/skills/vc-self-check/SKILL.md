---
name: vc-self-check
description: On-demand self-diagnostician for the vc-fix plugin (Tier B). Reads the passive session-telemetry jsonl + the session transcript + the skill-expectations oracle, and emits a per-skill verdict (OK / DEGRADED / BROKEN) with severity, evidence, a root-cause hypothesis, and a concrete proposed fix (which plugin file/line). Writes a LOCAL DIAG-*.md report only — it never modifies the installed plugin and never sends anything externally (that is the consent-gated Step-4 delivery). Plugin-wide (covers every vc-fix skill/tool), so it is NOT qa-prefixed. Invoke ONLY on explicit user consent — the end-of-session consent prompt's "Yes", or when the user runs /vc-self-check directly — NEVER as an unprompted auto-trigger. Recursion/re-nag is prevented by the collector dropping its own spans + the one-shot consent guard (selfCheckSeen), not by disabling model invocation.
argument-hint: "[latest | <session-id>]"
---

# /vc-self-check — vc-fix Self-Diagnostician (Tier B)

The on-demand LLM diagnostician of the self-diagnostics subsystem. The passive
Tier-A collector ([`hooks/session-telemetry.mjs`](../../hooks/session-telemetry.mjs),
VCST-5475) records *what happened* every session; this skill *reasons* about a
session on demand and produces a verdict per shipped skill, judged against the
oracle ([`knowledge/diagnostics/skill-expectations.md`](../../knowledge/diagnostics/skill-expectations.md),
VCST-5476).

**When it runs.** Only on explicit user consent: either the model runs it right after
the user answers **Yes** to the end-of-session consent prompt (the `Stop` finalize offers
an `AskUserQuestion` Yes/No when the **skill-attributed** anomaly score crosses the
threshold *and a skill actually ran*; see `session-telemetry.mjs`), or the user runs
`/vc-self-check` directly. It is **not** auto-triggered outside that flow — do not invoke
it unprompted. No recursion / re-nag: the collector never re-prompts a session that already
ran the diagnostician (`selfCheckSeen`) and drops `vc-self-check` spans from its own
analysis, so removing `disable-model-invocation` (needed so the model *can* run it on Yes)
does not open a loop.

**Scope at this step: LOCAL report only.** The output is a `DIAG-*.md` under the
project's `.vc-fix/diagnostics/`. Turning a confirmed DIAG into a scrubbed,
consent-gated contribution back to VirtoCommerce is **Step 4**
([`deliver.mjs`](./deliver.mjs), VCST-5478) — mentioned here, **never run from
this skill**.

---

## Hard invariants

- **Read-only w.r.t. the plugin install.** NEVER modify installed plugin files.
  The "proposed fix" is a written recommendation (file/line), not an applied edit.
- **Nothing leaves the machine here.** No PR, no issue, no tracker write, no
  network send. External delivery is the separate, explicitly-consented Step 4.
- **Never diagnose its own invocation.** Drop every telemetry span whose skill is
  `vc-self-check` before analysing (the collector also suppresses the consent
  prompt for a session that ran the diagnostician — belt and braces).
- **Report discipline.** Obey [`.claude/rules/reports.md`](../../rules/reports.md):
  DIAG target 15–40 lines, hard cap ~100 (like a monitoring summary). Reference the
  telemetry file by path — never inline the jsonl.
- **English only**; never print a secret (the collector already redacts, but do
  not surface tokens/PANs from the transcript either).

---

## Flow

### Step 0 — Locate the session telemetry
- `outputRoot = VC_FIX_HOME || cwd`; diagnostics dir = `<outputRoot>/.vc-fix/diagnostics/`.
- **`latest`** (default): the newest `*.jsonl` in that dir is the current session
  (`ls -t <dir>/*.jsonl | head -1`). A specific **`<session-id>`** arg reads
  `<session-id>.jsonl` directly.
- If the dir or file is absent → tell the user telemetry hasn't been collected
  (the plugin may be running without the `SessionStart` hook wired) and STOP.
- Read the `session_start` record for `transcriptPath`, `pluginVersion`,
  `testEnv`, `projectType`.

### Step 1 — Load the oracle
Read [`knowledge/diagnostics/skill-expectations.md`](../../knowledge/diagnostics/skill-expectations.md)
— the per-skill expected phases/outputs/anti-patterns and the S0–S3 rubric.

### Step 2 — Build the span list
From the jsonl, assemble each skill span (`skill_start` → matching `skill_end`)
plus the still-open `finalize.openSkill`, and the session-prefix signals (those
recorded before the first `skill_start`). **Drop any span whose skill matches
`vc-self-check`** (dedup guard). If there are no spans and `finalize.anomalyScore`
is 0 → a clean session: report "no issues" (a one-line DIAG is fine) and stop.

### Step 3 — Diagnose each span against the oracle
For each span:
1. Take its recorded signal counts (`tool_error`, `permission_denied`,
   `hook_failure`, `stop_bail`, `tool_calls`).
2. Where a verdict depends on **presence/absence of a required phase or output**
   (the oracle's S1/S2 rows), open the `transcriptPath` and confirm — e.g. did
   `/qa-fix` actually reach a green G2 repro before the PR? did `/qa-verify-fix`
   run Step 2 before the `testing` transition? was the bug report written and
   within its cap?
3. Emit, per skill:
   - **verdict**: `OK` (S0) / `DEGRADED` (S2/S3) / `BROKEN` (S1) — map via the
     oracle rubric. A clean STOP/BAIL is `OK`.
   - **severity**: S0 / S1 / S2 / S3.
   - **evidence**: the signal counts + a transcript reference (line/turn), no dumps.
   - **root-cause hypothesis**: one or two sentences.
   - **proposed fix**: a concrete plugin file (and line/area if known) — e.g.
     "extend `ALLOWED_PATTERNS` in `hooks/enforce-real-user.mjs`", "trim the bug
     report per `reports.md` §4", "the `testing` transition in `commands/qa-verify-fix.md`
     Step 3 fired before Step 2 confirmed deploy".

### Step 4 — Session-wide cross-cutting check
Evaluate the finalize totals against the oracle's §4 cross-cutting table
(tsc-on-every-Edit, browser fallback loop, denied-tool retry storm, oversized
report, silent all-clear on a failed probe, merge attempt, write under the plugin
dir). Add any hit as its own finding.

### Step 5 — Write the LOCAL DIAG report
Write `<outputRoot>/.vc-fix/diagnostics/DIAG-<session-id>-<UTC-timestamp>.md`
using the template below, within the size cap.

### Step 6 — Report + STOP
Print the DIAG path and a one-line roll-up (e.g. "2 findings: 1 BROKEN, 1
DEGRADED"). If the user wants this sent to VirtoCommerce to improve the plugin,
tell them that is `/vc-self-check deliver` (Step 4, `deliver.mjs`) — a separate,
scrubbed, consent-gated action — and **do not run it here**.

---

## DIAG report template

```markdown
# DIAG — <session-id>

- Session: <session-id> · Plugin: <pluginVersion> · Env: <testEnv> · Project: <projectType|native>
- Telemetry: `.vc-fix/diagnostics/<session-id>.jsonl` · Anomaly score: <n>

## Findings

| Skill | Verdict | Sev | Signal | Root-cause hypothesis | Proposed fix (file) |
|-------|---------|-----|--------|-----------------------|---------------------|
| /qa-fix | BROKEN | S1 | 1× perm_denied on `gh pr create` | PR auth missing | check `GITHUB_FIX_BUGS_TOKEN` / `gh auth status` |
| /qa-bug | DEGRADED | S2 | report 190 ln (cap 120) | over-long report | trim per reports.md §4 |

## Details
<one short paragraph per S1/S2 finding: evidence (transcript ref) + the concrete change.
Skip S0/S3 beyond the table row. Reference telemetry by path; never inline the jsonl.>

_Local report only — no ticket filed, nothing sent. To contribute this upstream: `/vc-self-check deliver`._
```

---

---

## Step 4 (separate, consent-gated) — deliver upstream

Turning a confirmed DIAG into a scrubbed quality report to VirtoCommerce is
[`deliver.mjs`](./deliver.mjs) (VCST-5478) — invoked as `/vc-self-check deliver`.
It is **not** part of the diagnose flow above and is never run implicitly.

```
node "$pluginRoot/skills/vc-self-check/deliver.mjs" [--diag <path>] [--confirm] [--as pr|fork-pr|issue|local] [--keep] [--purge]
```

**Lifecycle — log → analyze → contribute → delete.** Local diagnostics are EPHEMERAL,
not archived: once a finding is contributed upstream, the source of truth is the
PR/issue, so the processed session's local artifacts are removed.

- **Routes by the GitHub token's real rights** on `VirtoCommerce/vc-mcp-testing-module`
  (via `../project-init/probe-lib.mjs`): push/maintain/admin → **PR**; authenticated
  no-push → **fork-PR**; issues-only → **GitHub Issue**; no token → **local + auth
  instructions**.
- **Containment (§2a):** every outbound title/body is scrubbed of client source,
  paths, URLs, identifiers, tickets, and secrets — only plugin-file references +
  generic repro survive; a client-specific finding is downgraded to a generic line.
- **Draft-and-confirm:** the default run is DRY (writes a `DELIVERY-*.md` draft and
  shows it). It sends ONLY with `--confirm`, and even then auto-files just the
  Issue route; a PR/fork-PR is handed off as ready commands. Issue dedup via a
  stable fingerprint marker. It never touches the client-installed plugin.
- **Delete-after-deliver (the "delete all" step):** the cleanup is scoped to the
  **processed session only** (its `<sid>.jsonl` + `.state.json` + `DIAG-<sid>-*.md`
  + this finding's `DELIVERY-*.md`) — other sessions are never touched.
  - **Issue route + `--confirm`** (filed, or a dedup that is already upstream) →
    the session's local artifacts are deleted automatically. `--keep` retains them.
  - **PR / fork-PR** (handed off — the human opens the PR) and **local** (no token,
    nothing sent) → **nothing is deleted**; the run prints the ready cleanup command
    to run *after* the PR is opened / after authenticating.
  - **Nothing worthwhile** (no BROKEN/DEGRADED finding) → files nothing and offers the
    cleanup command.
  - **`--purge`** is the standalone terminal step: delete this session's local
    artifacts and send nothing (used after a hand-off PR is opened, or to discard a
    non-actionable session).

## Notes
- Verdict/severity semantics and the (signal × expectation) table live in the
  oracle — cite them, don't restate.
- If two spans share a root cause (e.g. the same `tsc` hook failing across skills),
  merge them into one finding and note the affected skills.
- A `LOW`-confidence diagnosis is fine — say so; better an honest "unclear, here's
  the evidence" than a confident wrong fix.
