---
name: vc-self-check
description: On-demand self-diagnostician for the vc-fix plugin (Tier 2 of the client→vendor feedback loop). Reads the passive session-telemetry span jsonl + the session transcript + the skill-expectations oracle, and emits a per-span verdict (OK / DEGRADED / BROKEN) with severity, evidence, a root-cause hypothesis, and a concrete proposed fix (which plugin file/line). Scope is OUTCOME-based — it diagnoses only the spans the Tier-1 classifier flagged (failed / degraded / silent_suspect) plus any /vc-feedback verdicts. Writes a LOCAL DIAG-*.md report only — it never modifies the installed plugin and never sends anything externally (that is the consent-gated, feedback.mode-driven `deliver` step). Plugin-wide (covers every vc-fix skill/command/agent/tool), so it is NOT qa-prefixed. Runs either from the end-of-turn tail-trigger (the collector auto-runs it SILENTLY when a span was flagged — no Yes/No modal) or when the user runs /vc-self-check directly. Recursion/re-nag is prevented by the collector dropping vc-self-check's own spans + per-signature dedup + the selfCheckSeen guard, not by disabling model invocation.
argument-hint: "[latest | <session-id>]"
---

# /vc-self-check — vc-fix Self-Diagnostician (Tier 2)

The on-demand LLM diagnostician of the self-diagnostics subsystem. The passive
Tier-0 collector ([`hooks/session-telemetry.mjs`](../../hooks/session-telemetry.mjs),
VCST-5475/5509) records *what happened* as **spans** and the Tier-1 classifier tags
each with an **outcome**; this skill *reasons* about the flagged spans on demand and
produces a verdict per span, judged against the oracle
([`knowledge/diagnostics/skill-expectations.md`](../../knowledge/diagnostics/skill-expectations.md),
VCST-5476).

**Capture is decoupled from escalation (VCST-5509).** Capture is total + silent;
this skill only ever looks at the *interesting* spans — the ones the deterministic
Tier-1 classifier already flagged (`failed` / `degraded` / `silent_suspect`) plus any
explicit `/vc-feedback` verdicts. The happy path (`success` / `recovered`) is dropped
before this skill runs. There is no numeric `anomalyScore` gate anymore.

**When it runs.**
1. **Tail-trigger (auto, silent).** At `Stop`, when the collector flagged ≥1 span with
   a NEW signature, its `finalize` returns a `{decision:"block"}` instructing the agent
   to run this skill **immediately and silently** (no Yes/No question) and print ONE
   info line. This replaces the old interactive consent modal.
2. **Direct.** The user runs `/vc-self-check [latest | <session-id>]`.

It is **not** otherwise auto-triggered. No recursion / re-nag: the collector never
flags `vc-self-check`'s own spans, dedups by per-span signature (`seenSignatures`), and
sets `selfCheckSeen` so a session that ran the diagnostician is never re-triggered —
so allowing model invocation (needed for the silent auto-run) does not open a loop.

**Scope at this step: LOCAL report only.** The output is a `DIAG-*.md` under the
project's `.vc-fix/diagnostics/`. Turning a confirmed DIAG into a scrubbed,
consent-gated contribution back to VirtoCommerce is the separate `deliver` step
([`deliver.mjs`](./deliver.mjs), VCST-5478/5509, driven by `feedback.mode`) —
mentioned here, **never run from this flow**.

---

## Hard invariants

- **Read-only w.r.t. the plugin install.** NEVER modify installed plugin files. The
  "proposed fix" is a written recommendation (file/line), not an applied edit.
- **Nothing leaves the machine here.** No PR, no issue, no tracker write, no network
  send. External delivery is the separate, `feedback.mode`-gated `deliver` step.
- **Never diagnose its own invocation.** The collector never flags `vc-self-check`
  spans; also drop any such span here before analysing (belt and braces).
- **Report discipline.** Obey [`.claude/rules/reports.md`](../../.claude/rules/reports.md):
  DIAG target 15–40 lines, hard cap ~100 (like a monitoring summary). Reference the
  telemetry file by path — never inline the jsonl.
- **English only**; never print a secret (the collector already redacts, but do not
  surface tokens/PANs from the transcript either).

---

## Flow

### Step 0 — Locate the session telemetry
- `outputRoot = VC_FIX_HOME || cwd`; diagnostics dir = `<outputRoot>/.vc-fix/diagnostics/`.
- **`latest`** (default): the newest `*.jsonl` in that dir. A specific **`<session-id>`**
  arg reads `<session-id>.jsonl`.
- If the dir or file is absent → tell the user telemetry hasn't been collected (the
  plugin may be running without the hooks wired, or `selfDiagnostics` is not `true` in
  `project-profile.json`) and STOP.
- Read the `session_start` record for `transcriptPath`, `pluginVersion`, `testEnv`,
  `projectType`.

### Step 1 — Load the oracle
Read [`knowledge/diagnostics/skill-expectations.md`](../../knowledge/diagnostics/skill-expectations.md)
— the outcome taxonomy (§1a), the expected-output markers (§1c), the struggle
sub-signals (§1d), the S0–S3 rubric (§2), the per-skill expectations (§3), and the
cross-cutting anti-patterns (§4).

### Step 2 — Build the analysis set (OUTCOME-flagged spans + feedback)
From the jsonl:
1. Read the `finalize` record's `flagged[]` — these are the **skill/command spans the
   Tier-1 classifier tagged `failed` / `degraded` / `silent_suspect`**. That IS the
   analysis set. Also collect every `type:"feedback"` record.
2. For each flagged span, pull its full `span` record (by `id`) plus its **child
   `agent`/`tool` span records** (`parentId === span.id`) for evidence.
3. **Drop any span whose `name` matches `vc-self-check`** (dedup guard — should already
   be absent from `flagged`).
4. **Clean-session test:** if `flagged` is empty **and** there are no `feedback`
   records → a clean session: write a one-line "no issues" DIAG (or, on the tail-trigger
   auto-run, just print the one info line) and stop. `success`/`recovered` spans and the
   session-prefix development noise are **never** analysed.

### Step 3 — Diagnose each flagged span against the oracle
For each span in the analysis set:
1. Start from its Tier-1 `outcome` + `struggle[]` + `signals` + `retries` + its child
   `agent`/`tool` spans. The classifier already did the coarse call; your job is the
   **root cause + the concrete fix**.
2. **`failed`** → find the blocking op (the `permission_denied`/`hook_failure`, or the
   `tool_error` whose tool never recovered). A **skill-invoked agent's failure is the
   SPAWNING skill's finding** — a failed `Task` surfaces as a `tool_error`/`permission_denied`
   on the parent span plus the child `agent` span (e.g. "`/qa-fix` → `fullstack-backend`:
   permission_denied on `gh pr create`").
3. **`degraded`** → name the struggle pattern (§1d) and *why* it happened — was the skill
   looping (retry_storm/reread_loop), lost in exploration (search_thrash/low_yield),
   bouncing browsers (fallback_loop)? Point at the skill step that should have converged.
4. **`silent_suspect`** → the worst mode: the span closed clean but produced **none** of
   its expected-output markers (§1c). Open the `transcriptPath` and confirm what it
   actually did (did `/qa-fix` end without a PR *and* without a BAIL? did `/qa-bug` never
   write a report?). Distinguish a genuine silent failure from an oracle gap (a real
   output the marker table doesn't yet recognise → propose extending §1c + the collector
   const, LOW confidence).
5. Where a verdict depends on **presence/absence of a required phase**, open the
   `transcriptPath` and confirm (e.g. did `/qa-fix` reach a green G2 repro before the
   PR? did `/qa-verify-fix` run Step 2 before the `testing` transition?).
6. Fold in `/vc-feedback` verdicts — a `👎` is the highest-value signal and the main
   detector of silent failures the heuristics missed; surface it even if every span was
   `success`.
7. Emit, per span:
   - **verdict**: `OK` (S0/S3) / `DEGRADED` (S2) / `BROKEN` (S1) — via the oracle rubric.
   - **severity**: S0 / S1 / S2 / S3.
   - **outcome**: the Tier-1 tag (`failed`/`degraded`/`silent_suspect`).
   - **evidence**: the signal counts / struggle list (+ delegated agent, if any) + a
     transcript reference (line/turn), no dumps.
   - **root-cause hypothesis**: one or two sentences.
   - **proposed fix**: a concrete plugin file (and line/area if known) — e.g. "extend
     `ALLOWED_PATTERNS` in `hooks/enforce-real-user.mjs`", "trim the bug report per
     `reports.md` §4", "`/qa-fix` ended without a PR or a BAIL — its Step-N should force
     one of the two terminal states".

### Step 4 — Cross-cutting check
Evaluate the flagged spans' `signals` + `struggle` + child spans against the oracle's §4
cross-cutting table (tsc-on-every-Edit, browser fallback loop, denied-tool retry storm,
oversized report, silent all-clear on a failed probe, merge attempt, write under the
plugin dir). Merge spans that share a root cause into one finding (note the affected
skills).

### Step 5 — Write the LOCAL DIAG report
Write `<outputRoot>/.vc-fix/diagnostics/DIAG-<session-id>-<UTC-timestamp>.md` using the
template below, within the size cap.

### Step 6 — Report + STOP
- **Tail-trigger auto-run:** print ONE non-blocking info line — the finding roll-up +
  the DIAG path (e.g. `vc-fix self-check: 1 BROKEN, 1 DEGRADED → .vc-fix/diagnostics/DIAG-….md`).
  Then continue whatever the user asked; do not nag.
- **Direct run:** print the DIAG path + the one-line roll-up. If the user wants this sent
  to VirtoCommerce to improve the plugin, tell them that is `deliver` (driven by
  `feedback.mode`) — a separate, scrubbed action — and **do not run it here**.

---

## DIAG report template

```markdown
# DIAG — <session-id>

- Session: <session-id> · Plugin: <pluginVersion> · Env: <testEnv> · Project: <projectType|native>
- Telemetry: `.vc-fix/diagnostics/<session-id>.jsonl` · Flagged: <n> (<x failed, y degraded, z silent_suspect>) · Feedback: <👍m 👎k>

## Findings

| Span (kind) | Verdict | Sev | Outcome | Signal / struggle | Root-cause hypothesis | Proposed fix (file) |
|-------------|---------|-----|---------|-------------------|-----------------------|---------------------|
| /qa-fix (command) | BROKEN | S1 | failed | 1× perm_denied on `gh pr create` | PR auth missing | check `GITHUB_FIX_BUGS_TOKEN` / `gh auth status` |
| /qa-bug (skill) | DEGRADED | S2 | degraded | search_thrash, low_yield | lost in exploration, no repro-first | tighten Step-1 in `skills/qa-bug` |

## Details
<one short paragraph per S1/S2 finding: evidence (transcript ref) + the concrete change.
Skip S0/S3 beyond the table row. Reference telemetry by path; never inline the jsonl.
Include any /vc-feedback verdict text verbatim (already redacted).>

_Local report only — no ticket filed, nothing sent. To contribute this upstream: `/vc-self-check deliver`._
```

---

## Step 4 (separate, consent-gated) — deliver upstream

Turning a confirmed DIAG into a scrubbed quality report to VirtoCommerce is
[`deliver.mjs`](./deliver.mjs) (VCST-5478/5509) — invoked as `/vc-self-check deliver`.
It is **not** part of the diagnose flow above and is never run implicitly.

```
node "$pluginRoot/skills/vc-self-check/deliver.mjs" [--diag <path>] [--batch] [--confirm] [--as pr|fork-pr|issue|local] [--keep] [--purge]
```

**`--batch`** consolidates ALL local `DIAG-*.md` into ONE contribution: findings are
deduped across sessions (each annotated with an occurrence count), operator feedback is
merged, and on a successful send every included session's artifacts are purged — so many
accumulated flagged sessions don't file one issue each. Same consent/route/scrub/dedup as
a single run; `--batch --purge` clears all batched sessions without sending.

**Consent is `feedback.mode` (set once at `/project-init`, `project-profile.json`):**
- **`off`** — nothing leaves the machine; `deliver` refuses to send and prints why. The
  DIAG stays local.
- **`ask`** (default) — the default DRY run: writes a scrubbed `DELIVERY-*.md` draft and
  presents a single [Show diff] / [Send] / [Don't send] decision; sends only on Send.
- **`auto`** — the Issue route auto-files (scrubbed) and prints the filed URL; a PR/fork-PR is
  prepared as ready `gh` commands (a human always opens the PR — an irreversible external
  action). Local capture + diagnosis never need consent — only this outbound step does.

**Routes by the GitHub token's real rights** on `VirtoCommerce/vc-mcp-testing-module`
(via `../project-init/probe-lib.mjs`): push/maintain/admin → **PR**; authenticated
no-push → **fork-PR**; issues-only → **GitHub Issue**; no token → **local + auth
instructions**.

**Containment (§2a):** every outbound title/body is scrubbed of client source, paths,
URLs, identifiers, tickets, and secrets — only plugin-file references + generic repro
survive; a client-specific finding is downgraded to a generic line.

**Fingerprint dedup:** an identical finding already upstream is NOT re-filed — `deliver`
adds a "+1 occurrence" comment to the existing issue instead, so the same defect from
many clients converges to one ticket with occurrence counts.

**Lifecycle — log → analyze → contribute → delete.** Local diagnostics are EPHEMERAL:
once a finding is contributed upstream the PR/issue is the source of truth, so the
processed session's local artifacts are removed. Scope is the **processed session only**
(its `<sid>.jsonl` + `.state.json` + `DIAG-<sid>-*.md` + this finding's `DELIVERY-*.md`)
— other sessions are never touched.
- **Issue route + `--confirm`** (filed, or a dedup already upstream) → auto-deleted.
  `--keep` retains.
- **PR / fork-PR** (handed off) and **local** (nothing sent) → nothing deleted; the run
  prints the ready `--purge` cleanup command to run *after* the PR is opened.
- **`--purge`** is the standalone terminal cleanup (send nothing).

## Notes
- Verdict/severity semantics + the (signal × expectation) table live in the oracle —
  cite them, don't restate.
- If two spans share a root cause (e.g. the same `tsc` hook failing across skills), merge
  into one finding and note the affected skills.
- A `LOW`-confidence diagnosis is fine — say so; better an honest "unclear, here's the
  evidence" than a confident wrong fix.
