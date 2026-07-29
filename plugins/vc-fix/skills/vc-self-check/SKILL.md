---
name: vc-self-check
description: On-demand self-diagnostician for the vc-fix plugin (Tier 2 of the client→vendor feedback loop). Reads the passive session-telemetry jsonl (observation records + span records) + the session transcript + the skill-expectations oracle, and emits a per-finding verdict (OK / DEGRADED / BROKEN) with severity, evidence, a root-cause hypothesis, and a concrete proposed fix (which plugin file/line). THIS is the layer that decides what matters: the collector captures every anomaly signal however minor and assigns no severity, so the analysis set is observations ∪ flagged spans ∪ /vc-feedback verdicts — a run whose every span was `success` can still hold real findings. Writes a LOCAL DIAG-*.md report only — it never modifies the installed plugin and never sends anything externally (that is the consent-gated, feedback.mode-driven `deliver` step). Plugin-wide (covers every vc-fix skill/command/agent/tool), so it is NOT qa-prefixed. Runs either from the end-of-turn tail-trigger (the collector auto-runs it SILENTLY when a span was flagged — no Yes/No modal) or when the user runs /vc-self-check directly. Recursion/re-nag is prevented by the collector dropping vc-self-check's own spans + per-signature dedup + the selfCheckSeen guard, not by disabling model invocation.
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

**Capture is decoupled from JUDGEMENT (VCST-5509, made real by VCST-5582 H).** Capture is
total + silent **and forbidden from deciding what matters**: every anomaly signal, however minor
or likely-benign, becomes a durable `type:"obs"` record with no severity field
(oracle §1e). **Severity is assigned HERE** (§1f). So the analysis set is
**observations ∪ Tier-1-flagged spans ∪ `/vc-feedback` verdicts** — not flagged spans alone.
That earlier scope was the defect: it made the whole subsystem blind to any signal the
deterministic classifier did not recognise at span close, and a run with a visible WARN in its
own readiness table self-diagnosed "no plugin issues detected". A run whose every span is
`success` can still hold real findings. There is no numeric `anomalyScore` gate anymore.

**When it runs.**
1. **Tail-trigger (auto, silent).** At `Stop`, when the collector has a NEW signature worth a
   look — a flagged span, a **routing-class observation** (oracle §1e: a self-reported
   WARN/FAIL, a degraded artifact, an HTTP non-2xx, a non-zero script exit, collector
   contention), a 👎, or a signature whose occurrence count has **grown** — its `finalize`
   returns a `{decision:"block"}` instructing the agent to run this skill **immediately and
   silently** (no Yes/No question) and print ONE info line. This replaces the old interactive
   consent modal. Membership of the routing set is DATA, not a severity call: it decides only
   *when to spend a turn*, and everything outside it is still recorded and still analysed here.
2. **Direct.** The user runs `/vc-self-check [latest | <session-id>]`.

It is **not** otherwise auto-triggered. No recursion / re-nag: the collector never
flags `vc-self-check`'s own spans, dedups by per-span signature (`seenSignatures`), and
sets `selfCheckSeen` so a session that ran the diagnostician is never re-triggered —
so allowing model invocation (needed for the silent auto-run) does not open a loop.

**Scope at this step: LOCAL report only.** The output is a `DIAG-*.md` under the
project's `.vc-fix/diagnostics/`. Turning a confirmed DIAG into a scrubbed,
consent-gated contribution back to VirtoCommerce is the separate `deliver` step
([`deliver.mjs`](./deliver.mjs), VCST-5478/5509, driven by `feedback.mode`). Since
VCST-5582 G this flow **offers** that contribution (Step 6b) when the DIAG has a
BROKEN/DEGRADED row — by running `deliver` **DRY** (a local draft, nothing sent) and
asking once. **Sending still needs an explicit "Send".**

---

## Hard invariants

- **Read-only w.r.t. the plugin install.** NEVER modify installed plugin files. The
  "proposed fix" is a written recommendation (file/line), not an applied edit.
- **Nothing leaves the machine without an explicit "Send".** The diagnose flow itself makes
  no PR, no issue, no tracker write. Step 6b may run `deliver` **DRY** (a local
  `DELIVERY-*.md` draft) to present the offer, but the outbound call happens only on
  `--confirm` (the operator's Send) or the onboarding-time `feedback.mode: auto`.
  `feedback.mode: off` ⇒ no draft, no offer, no send.
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
  plugin may be running without the hooks wired, or capture was never opted in — it is
  opt-in, so it stays off until `project-profile.json` sets `selfDiagnostics: true`; also
  off if `VC_FIX_DIAG_CAPTURE=off`) and STOP.
- Read the `session_start` record for `transcriptPath`, `pluginVersion`, `testEnv`,
  `projectType`. Note: `session_start.testEnv` is null when `TEST_ENV` was passed inline
  per-command (not exported to the hook env) — the **`finalize`** record carries the value
  recovered from tool args, so prefer `finalize.testEnv` when `session_start.testEnv` is null.
- A session that survived a **resume/compact** has a second `session_start` with
  `source:"resume"`/`"compact"`; the collector carries the command span + cursor across it,
  so treat the run as one continuous session (don't read it as "the plugin didn't run").

### Step 1 — Load the oracle
Read [`knowledge/diagnostics/skill-expectations.md`](../../knowledge/diagnostics/skill-expectations.md)
— the outcome taxonomy (§1a), the expected-output markers (§1c), the struggle
sub-signals (§1d), the S0–S3 rubric (§2), the per-skill expectations (§3), and the
cross-cutting anti-patterns (§4).

### Step 2 — Build the analysis set (observations ∪ flagged spans ∪ feedback)

**The capture layer no longer decides what is worth looking at — you do.** Until VCST-5582 H
this step read `flagged[]` and nothing else, and stopped outright when it was empty. That made
the whole subsystem blind to any signal the deterministic classifier did not recognise at span
close: a real `/project-init` run printed a **WARN** in its own readiness table (the Azure Bug
field contract was never scanned) and this skill would have written "no issues" — `flagged` was
empty and every span was `success`. Observations (§1e) exist precisely to carry that class.

From the jsonl:
1. Read **every `type:"obs"` record** (and the latest `finalize`'s `decision.observations`
   rollup). These are the anomaly signals — however minor — that capture recorded without
   judging. They carry no severity: assigning it is your job (§1f).
2. Read the `finalize` record's `flagged[]` — the skill/command spans Tier 1 tagged `failed` /
   `degraded` / `silent_suspect`, each with an `occurrences` count. Treat this as **one input,
   not the truth**: a `success`/`recovered` span can still carry real signals.
3. Collect every `type:"feedback"` record.
4. For each flagged span, pull its full `span` record (by `id`) plus its **child `agent`/`tool`
   span records** (`parentId === span.id`) for evidence. For an observation, its `spanId` points
   at the span it happened inside (may be `null` — a session-level signal).
5. **Drop any span whose `name` matches `vc-self-check`**, and treat observations whose `skill`
   is `vc-self-check` as this skill's own noise (loop guard — the collector already keeps them
   out of routing).
6. **Clean-session test — now a three-way check.** Stop early **only** when `observations.total
   === 0` **and** `flagged` is empty **and** there are no `feedback` records: that is a
   genuinely empty record, so write the one-line "no issues" DIAG (or, on the tail-trigger
   auto-run, print the one info line) and stop. **If observations exist, you may not stop here**
   even when every span was `success` — classify them (§1f), and if they all land on NOISE say
   so explicitly with the count. The session-prefix development noise before the first
   skill/command span is still never analysed.

**Cross-check the collector against itself (§1f rule 3).** If the run's
`decision.verdict` is `clean` while a `self_reported_warn`/`_fail` observation exists, or while
`flaggedTotal > 0`, that contradiction is itself an **S1 finding against the collector**
(`subject: collector_verdict_integrity`) — report it even though it is not a skill defect. In the
originating incident the most valuable finding in the whole report was of exactly this shape.

### Step 2b — Diagnose the observations (§1f)

Observations are the *new* half of the analysis set, and they need correlating before they are
findings. Apply §1f in order:

1. **Merge by `subject`.** All observations sharing a subject become ONE finding at
   `max(severity)`, citing each as separate evidence. The reference incident is
   `http_non2xx` + `self_reported_fallback` + `degraded_artifact` + `self_reported_warn`, all on
   `tracker_field_contract` → one S2/S1 finding: *"the Bug field contract was never scanned;
   `/qa-bug` will send unverified defaults"*.
2. **Triangulation escalates** — ≥3 different classes on one subject ⇒ +1 severity step.
3. **Ask what the subject MEANS for the skill** (§3). A `degraded_artifact` on a *required*
   output is S1, not S2 — that is where the oracle's per-skill knowledge earns its keep.
4. **Occurrence weighting** — `count ≥ 3` promotes S3 → S2.
5. **Unknown class/subject** ⇒ S3, LOW confidence, reported as an **oracle gap** with a proposed
   §1e/§1f extension. Never drop it.

For a NOISE-class observation, do not open a finding — count it for the Step-5 suppression line.

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

### Step 6 — Report, OFFER to contribute, STOP

> **ONE question per turn (item 8).** The reproduction turn asked the operator three things at
> once — the verdict, the delivery offer, and a three-option "clean up vc-fix diagnostic files?"
> prompt — so every question after the first competed with the one that mattered, and the delivery
> offer had to be re-asked on a later turn. The turn now emits **one info line** (6a) and **at most
> one question** (6b). Cleanup asks **nothing**: the 24 h age-cap already reclaims leftovers
> unprompted, so the count rides on 6a's line as information, never as a decision.

**6a — report the verdict (always first).** ONE non-blocking info line, on BOTH paths — the
finding roll-up + the DIAG path (e.g.
`vc-fix self-check: 1 BROKEN, 1 DEGRADED → .vc-fix/diagnostics/DIAG-….md`). If the hook's block
reason carried a stale-artifact count, it belongs on this same line — do not spend a second line
or any question on it.

> **6a does not end the turn, on EITHER path.** 6a and 6b are **sequential steps of one turn**,
> never alternatives: report the roll-up line, then immediately evaluate 6b. **6b applies to the
> silent tail-trigger auto-run exactly as it does to a direct `/vc-self-check`** — the auto-run is
> where the client actually is, so skipping the offer there is the same dead loop VCST-5582 G fixed
> (the Stop hook's block reason used to say "and stop", which killed 6b; if you ever see wording
> like that, 6b still applies — nothing is *sent* without an explicit Send, which is what 6b asks).
> Print-one-line-and-stop is the whole behaviour ONLY when 6b's conditions do not hold (typically:
> every row is OK, so there is nothing worth sending).

**6b — offer to contribute it upstream (VCST-5582 G).** This step exists because the loop
used to die here: BOTH paths above said "that is `deliver`, do not run it here", so the
profile's default `feedback.mode: "ask"` — which literally means *ask each time* — was
unreachable, and the only route left was the operator typing `/vc-self-check deliver`, which
no client will do. The DIAG footer even printed that as a hint; a dead one.

**Offer when ALL of these hold:**

| Condition | Why |
|---|---|
| the DIAG has **≥1 row with verdict BROKEN or DEGRADED** | this — NOT the flagged span's outcome — is "there is something worth sending". In the OPUS DIAG the flagged span's verdict was **OK** (a false positive) while the **collector itself** was BROKEN: the most valuable finding in the whole report would have been skipped by keying on the span |
| `feedback.mode !== "off"` | `off` means nothing ever leaves the machine — stay silent, no offer, no draft |
| the run produced a verdict this turn | never a standalone offer on a no-verdict turn (same rule as the cleanup offer) |
| no operator question is pending | shares item D's deferral — an offer must never compete with a question |
| this session has not been offered this finding | one-shot, see below |

**How:**

1. Run `deliver.mjs` in its **DRY** mode — local only, writes `DELIVERY-*.md`, sends nothing:
   ```bash
   node "$pluginRoot/skills/vc-self-check/deliver.mjs" --json
   ```
2. If the plan reports **`alreadyOffered: true`** → **stay silent**. The one-shot guard
   (`deliveryOffered` in the session state, deduped by finding fingerprint — the same pattern
   as the collector's `cleanupOffered`) already offered this finding.
3. Otherwise present **exactly ONE** `AskUserQuestion` — and it must be the ONLY question this
   turn (item 8):
   - **"Show what would be sent"** → print the `DELIVERY-*.md` draft, then re-ask the
     remaining two options.
   - **"Send"** → re-run with `--confirm`.
   - **"Don't send"** → stop; the DIAG stays local.

   With **`feedback.mode: auto`** there is NO question: the operator consented at onboarding, so
   the Issue files directly (`deliver` pre-confirms) and 6a's line reports the filed URL. Since
   `issue` is the only sending route (item 4), `auto` now always means "it was filed" — it can no
   longer resolve to a hand-off that sent nothing.
4. **Show the HONEST route** from the plan's `route` + `reason` — the only two are `issue` and
   `local`, and `resolveRoute` never assumes an unreadable capability is upstream-capable
   (VCST-5582 A), so `route: "local"` with a remedy in `reason` is a real answer, not a fallback
   to hide. Quote it as-is, and relay the plan's `nextSteps[]` verbatim.

**Nothing is ever sent without an explicit "Send".** `--confirm` is the only trigger, and
`feedback.mode: auto` (an onboarding-time consent) is the only way to skip the question.

**6c — ordering on a terminal Stop.** Diagnostic verdict line **FIRST** → delivery offer (at most
one question) → nothing else. An offer rides a verdict, it never opens the conversation. There is
no third step: the cleanup **question is gone** (item 8), so a turn is now exactly one line and at
most one question.

---

## DIAG report template

```markdown
# DIAG — <session-id>

- Session: <session-id> · Plugin: <pluginVersion> · Env: <testEnv> · Project: <projectType|native>
- Telemetry: `.vc-fix/diagnostics/<session-id>.jsonl` · Verdict: <clean|observed|attention|degraded-collector> · Flagged: <n> (<x failed, y degraded, z silent_suspect>) · Observations: <distinct> distinct / <total> total · Feedback: <👍m 👎k>

## Findings

| Span (kind) | Verdict | Sev | Outcome | Signal / struggle | Root-cause hypothesis | Proposed fix (file) |
|-------------|---------|-----|---------|-------------------|-----------------------|---------------------|
| /qa-fix (command) | BROKEN | S1 | failed | 1× perm_denied on `gh pr create` | PR auth missing | check `GITHUB_FIX_BUGS_TOKEN` / `gh auth status` |
| /qa-bug (skill) | DEGRADED | S2 | degraded | search_thrash, low_yield | lost in exploration, no repro-first | tighten Step-1 in `skills/qa-bug` |
| /project-init · tracker_field_contract | DEGRADED | S2 | success (obs) | http_non2xx 400 + fallback + degraded_artifact + WARN | `$expand=Properties` rejected → `tracker.fields` empty | fix the field-contract request in `skills/project-init/discover-tracker.mjs` |

_Suppressed as noise: <N> observation(s) (<harness_noise ×4, policy_block ×1, …>) — recorded in the jsonl, judged benign._

## Details
<one short paragraph per S1/S2 finding: evidence (transcript ref) + the concrete change.
Skip S0/S3 beyond the table row. Reference telemetry by path; never inline the jsonl.
Include any /vc-feedback verdict text verbatim (already redacted).>
<An OBSERVATION-derived row cites its subject + the classes that corroborate it, and says what the
degradation MEANS downstream — that is the difference between "a probe 400'd" and "/qa-bug will
file bugs with a field set this organization never confirmed".>
<The `Suppressed as noise` line is REQUIRED whenever a NOISE-class observation exists: "benign"
must be a conclusion the reader can check, never missing data. Omit the line only at zero.>

_Local report only — no ticket filed, nothing sent. <FOOTER>_
```

**`<FOOTER>` states the ACTUAL delivery state** — it is written after Step 6b, so it reports what
happened, not what the operator could theoretically type. It used to read
_"To contribute this upstream: `/vc-self-check deliver`"_ — a dead hint nobody ever acted on
(VCST-5582 G). Pick the one that is true:

| Situation | `<FOOTER>` |
|---|---|
| a draft was prepared and the offer is on screen | `draft prepared: `DELIVERY-<fp>-<ts>.md` (route: <route>) — awaiting your decision` |
| the operator chose **Send** | `contributed upstream: <issue url \| the handed-off PR commands>` |
| the operator chose **Don't send** | `not sent — declined; the DIAG stays local` |
| `feedback.mode: off` | `upstream delivery is off (feedback.mode=off) — nothing left this machine` |
| every row is OK (nothing worth sending) | `nothing to contribute — no BROKEN/DEGRADED finding` |
| already offered this session | `draft already prepared this session: `DELIVERY-<fp>-<ts>.md`` |

---

## The deliver step (consent-gated) — contribute upstream

Turning a confirmed DIAG into a scrubbed quality report to VirtoCommerce is
[`deliver.mjs`](./deliver.mjs) (VCST-5478/5509) — invoked as `/vc-self-check deliver`, or
**offered automatically by Step 6b** after a DIAG with a BROKEN/DEGRADED row.

> **It is never run implicitly IN ITS SENDING MODE.** Step 6b runs it **DRY** (local draft,
> nothing leaves the machine) purely to produce the offer; sending still requires an explicit
> **Send** (`--confirm`) or the onboarding-time `feedback.mode: auto`. Before VCST-5582 G the
> skill refused to run it at all, which made the default `ask` mode dead — see Step 6b.

```
node "$pluginRoot/skills/vc-self-check/deliver.mjs" [--diag <path>] [--batch] [--confirm] [--dry] [--as issue|local] [--keep] [--purge] [--assert-nonempty]
```

**`--dry`** forces the draft-only path whatever the consent mode says (previously "draft only"
was reachable merely by omitting `--confirm`, which `feedback.mode: auto` silently overrode).

**`--assert-nonempty`** (implies `--dry`, needs no network) is the **information-free-payload
gate**: it reduces the DIAG and exits **3** when a report with ≥1 BROKEN/DEGRADED row would
contribute nothing — no findings at all, or findings that are *all* `skill: other` +
`signalClass: none` + `errorCode: UNKNOWN`. It exists because a report can be perfectly
contained and still say nothing: the containment tests assert what must NOT be present, so an
empty payload passed every gate and only a human reading the rendered table noticed.

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
- **`auto`** — the Issue auto-files (scrubbed) and prints the filed URL. Local capture +
  diagnosis never need consent — only this outbound step does.

**Two routes only** (`issue` / `local`), by the GitHub token's real rights on
`VirtoCommerce/vc-mcp-testing-module` (via `../project-init/probe-lib.mjs`): **any**
authenticated token with issue rights — including push/maintain/admin — files a **GitHub
Issue**; no token, a failed probe, or a token whose read scopes carry neither `repo` nor
`public_repo` → **local + what to grant**.

> **There is no PR route.** `push`/`maintain`/`admin` used to resolve to `pr` and a
> fork-capable token to `fork-pr`, and BOTH were hand-offs that printed `git`/`gh` commands and
> sent nothing — so the more rights a token had, the less got delivered: a `maintain` token
> produced `sent: false, handoff: true` while an issues-only token auto-filed. A self-check
> contribution is a **telemetry report, not a code change**: there is no patch to review and no
> working tree to build one in, and the hand-off asked the operator to author the fix by hand —
> exactly the work the report exists to hand to the vendor. `--as pr` is now rejected.

**A transient probe failure is retried once.** `probeWithRetry` re-probes after a short backoff
before declaring a token unusable, and the `reason` says a retry was spent — a dry run once
reported `route: local` / "authentication failed" while a confirm run minutes later on the SAME
token reported `perm: maintain`.

**Everything operator-actionable is a JSON field.** The plan carries `nextSteps[]` (and
`probeRetried`), so an automated consumer sees what to do next; it used to exist only on the
human-readable path.

**Containment (§2a) — default-deny closed schema, not scrubbing.** The outbound artifact is
built ONLY from a validated `UpstreamSignal` struct
([`upstream-reduce.mjs`](./upstream-reduce.mjs), spec in
[`../../knowledge/diagnostics/upstream-schema.md`](../../knowledge/diagnostics/upstream-schema.md),
rationale in [`../../knowledge/diagnostics/adr-upstream-default-deny.md`](../../knowledge/diagnostics/adr-upstream-default-deny.md)):
every field is a closed-vocabulary enum or a number (skill, verdict, severity, outcome,
signal-class, struggle, an error **taxonomy code**, tool-family, repo-**kind**, counts). It
carries **NO free text** — `reduce()` reads ONLY the structured collector jsonl (span
records + feedback verdicts); the LLM-authored DIAG cells (`signal`/`rootcause`/`fix`) and
`/vc-feedback` prose NEVER enter the upstream path (feedback travels as 👍/👎 **counts**
only). Error TEXT is classified LOCALLY to a code; only the code travels. Repo/module/org
NAMES are never sent. A runtime validator rejects any out-of-vocabulary value. So there is
structurally **nothing to leak** — the leak class is impossible by TYPE, not chased by a
denylist. (`redact()` still scrubs secrets on the LOCAL persist path; the old free-text
scrubbers were removed as dead code — with an enum-only upstream artifact there is nothing
free-text to scrub, so the closed schema is the sole upstream guard. PR #143 R2.) Because the
payload is tiny enums+numbers, `ask` mode shows the operator the exact struct before any send.

**Fingerprint dedup:** the fingerprint is computed over the STRUCTURAL enum tuple
(`fingerprintStruct`), never raw text — so dedup can't smuggle client bytes into the hash.
An identical finding already upstream is NOT re-filed — `deliver` adds a "+1 occurrence"
comment to the existing issue instead, so the same defect from many clients converges to one
ticket with occurrence counts.

**Lifecycle — log → analyze → contribute → delete.** Local diagnostics are EPHEMERAL:
once a finding is contributed upstream the PR/issue is the source of truth, so the
processed session's local artifacts are removed. Scope is the **processed session only**
(its `<sid>.jsonl` + `.state.json` + `DIAG-<sid>-*.md` + this finding's `DELIVERY-*.md`)
— other sessions are never touched.
- **Issue route + `--confirm`** (filed, or a dedup already upstream) → auto-deleted.
  `--keep` retains.
- **local** (nothing sent) → nothing deleted; the artifacts are kept until a run actually
  delivers, and the `--purge` command is printed for a manual clear.
- **`--purge`** is the standalone terminal cleanup (send nothing).

## Notes
- **Decision trail (when did the collector run, what did it decide).** Every `finalize`
  writes a `decision` object on its jsonl `finalize` record. A **terminal** Stop records
  `{ verdict:"clean|flagged", pluginActivity, freshCount, flaggedTotal, surfaced,
  suppressReason }`; a **checkpoint** Stop (a sub-agent is still running in the background)
  records `{ verdict:"deferred", pendingSubagents, surfaced:false,
  suppressReason:"subagent-running" }` and does nothing else. To review a session's
  decisions: `grep '"type":"finalize"' <outputRoot>/.vc-fix/diagnostics/<session-id>.jsonl`.
- **The visible line — THREE states.** On a **terminal** plugin turn the hook resumes the agent to
  print one line (costing one extra model turn): a finding/routing observation → run
  `/vc-self-check` + report; observations recorded but none routing →
  `vc-fix self-check: no blocking issues — N observation(s) recorded (run /vc-self-check for detail)`;
  a genuinely empty record → `vc-fix self-check: no plugin issues detected` (default ON — silence
  with `VC_FIX_DIAG_LINE=off`). The middle state exists so the hook can stay quiet **without ever
  saying "clean" while observations exist** — `verdict:"clean"` requires a literally empty record.
  N counts non-noise classes only. A checkpoint Stop never prints, so no line can land mid-task.
- Verdict/severity semantics + the (signal × expectation) table live in the oracle —
  cite them, don't restate.
- If two spans share a root cause (e.g. the same `tsc` hook failing across skills), merge
  into one finding and note the affected skills.
- A `LOW`-confidence diagnosis is fine — say so; better an honest "unclear, here's the
  evidence" than a confident wrong fix.
