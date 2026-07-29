# vc-fix Self-Diagnostics — Detection-Architecture Audit & Fix Plan

- **Date:** 2026-07-29 · **Branch:** `fix/vcst-5582-onboarding-defects`
- **Status: P0 + P1 IMPLEMENTED** on this branch (593/593 unit tests green, incl. 18 new observation-layer tests). This document is the analysis the fix was built from; where it and the code disagree, the code wins. Deviations from the plan are listed in §11.
- **Install audited:** `C:\Users\Danil\.claude\plugins\cache\vc-tools\vc-fix\0.8.2`
- **Source repo (the plan targets this, not the cache):** `plugins/vc-fix/` in this repo. `hooks/session-telemetry.mjs` is **byte-identical** between cache 0.8.2 and `plugins/vc-fix/` (verified by `diff`), so the cache adds no drift. Every change must also be copied to `.claude/` — `scripts/unit/mirror-parity.test.mjs:21` enforces byte-identity for the self-diagnostics files.
- **Scope guard:** the Azure `$expand=Properties` HTTP-400 field-contract defect is **deliberately left broken** as the live reproduction fixture. It is the acceptance test (§7a), not a work item.

---

## 1. Root cause

The collector's `emitSpan()` performs **three** decisions in one statement. `hooks/session-telemetry.mjs:599-618` appends the span record, then — at `:608` — pushes to `state.flagged[]` **only** when `rec.outcome !== "success" && rec.outcome !== "recovered"`. Because `state.flagged[]` is the *only* thing that reaches the judgement layer (`skills/vc-self-check/SKILL.md:89-100` builds its analysis set from `finalize.flagged[]`, and `:96-100` instructs the skill to write "no issues" and **stop** when it is empty), the deterministic Tier-1 verdict computed at span-close simultaneously decides (a) what is *retained* for analysis, (b) what is *analysed*, and (c) what is *surfaced*. A signal the classifier does not recognise at close time is not "downgraded" — it ceases to exist. The file's own header claims the opposite ("CAPTURE is decoupled from ESCALATION", `:20`); the decoupling is real for *op-level* spans (all 292 spans of a session are written) but not for *findings*: the finding set is a filter, not a projection. Compounding this, the oracle's machine-readable half is consulted **at capture time** (`EXPECTED_OUTPUT` `:204-219` via `markExpected` `:408-414`, called at `:758`, `:821`, `:856`), so an oracle miss also destroys data rather than producing a low-confidence finding.

**The single architectural change:** introduce a durable, unconditional **observation record** (`type:"obs"`) written by the capture layer for *every* anomaly signal regardless of judged importance, and redefine `state.flagged[]` from "the findings" to "a routing hint". `/vc-self-check`'s analysis set becomes `observations ∪ flagged spans`; severity is assigned only there. The Stop hook keeps a gate, but it may only decide **tone and timing**, never retention — and it may only say "clean" when the observation count is literally zero.

Secondary root cause, same shape: the plugin's own scripts *already compute* structured verdicts (`verify-access.mjs:63-64` builds a `results[]` of PASS/FAIL/WARN/SKIP rows) and then **render and discard** them (`:461`, `:472` exits 0 unless a hard `FAIL`). Nothing consumes them as telemetry. The plugin is blind to its own conclusions.

---

## 2. Stage-by-stage: what exists, what is dropped

### 2.1 Hook event ingestion (`hooks/hooks.json`)

| Event | Subscribed | Handler | Notes |
|---|---|---|---|
| `SessionStart` | yes `:3-12` | `init` | writes `session_start`, age-caps old artifacts |
| `UserPromptSubmit` | yes `:13-22` | `prompt` | opens a command span; records `/vc-feedback` |
| `PostToolUse` **matcher `Skill`** | yes `:54-62` | `record` | **only `Skill`** — no per-tool hook exists |
| `PostToolUse` matcher `Edit` | yes `:44-53` | `npx tsc` | not telemetry; its output is the untied `hook_failure` source |
| `SubagentStop` | yes `:23-32` | `agentstop` | |
| `Stop` | yes `:64-73` | `finalize` | |
| `PreToolUse` | telemetry: **no** (`:33-43` is `enforce-real-user.mjs` only) | — | an *attempted* call that is then denied is only seen via its `tool_result` |
| `SessionEnd` / `PreCompact` / `Notification` | **no** | — | no terminal-boundary handler; no permission-prompt/idle signal (availability in the installed CC version to be confirmed — §8) |

Consequence: **all** op-level capture is reconstructed by re-reading the transcript delta at four boundaries (`scanTranscript`, `:639-882`). Nothing is captured from the hook payload itself.

### 2.2 Span open/close and op recording

- `newSpan` `:339-365`, `pushOp` `:373-379`. An op retains only `{tool, arg_hash, status, cls, ts, durationMs}` (`:836`, `:843`) — no exit code, no HTTP status, no stderr, no output size.
- `OPS_CAP = 120` (`:250`) with `ops.shift()` (`:378`): on a long span (a `/project-init` run easily exceeds 120 ops) the **earliest** ops are discarded. `opCount`/`sawDecisive` survive, but every detector that walks `ops[]` sees only the last 120.
- `pushDetail` `:366-369` caps `details` at **25**. `signals[cls]` keeps counting, but `recurring_error` reads `span.details` (`:466-472`) — so a recurring error whose occurrences land past the 25th is *countable but undetectable*.
- Tool inputs are hashed, capped at 8000 chars before redaction (`:750-752`); `tool_result` bodies likewise (`:795-796`). `snippet()` truncates evidence to **120 chars** (`:162-165`), and `classifyError` in the upstream reducer runs on that snippet — a distinguishing message past 120 chars degrades to `UNKNOWN`.
- `:725` `if (ev.isSidechain === true) continue;` — **every sub-agent's internal transcript is skipped.** All `/qa-fix` developer-skill behaviour is invisible; only the `Task` return rolls up (acknowledged at `:196-203`).

### 2.3 Struggle detection — established as structurally unable to fire here

`detectStruggle` `:417-483` reads *only* `span.ops` and `span.details`. Every detector is **behavioural** — it requires visible repetition, visible error recurrence, visible wall-clock, or visible aimlessness:

| Detector | Requires | Threshold (`T`, `:224-246`) |
|---|---|---|
| `retry_storm` | same `tool\|arg_hash` ≥3× **and** ≥2 of them errored | `:225-226` |
| `reread_loop` | same read `arg_hash` ≥5× | `:227` |
| `search_thrash` | ≥8 consecutive search ops **and** `!sawDecisive && !sawExpected` | `:228`, `:451-457` |
| `fallback_loop` | ≥3 distinct browser variants in one span | `:229`, `:461-462` |
| `recurring_error` | same 40-char error prefix ≥3× *within the 25-detail cap* | `:230`, `:466-472` |
| `stall` | one op > 8 min | `:231`, `:475` |
| `low_yield` | ≥20 ops **and** `!sawDecisive && !sawExpected` | `:238`, `:480` |

**Therefore: a first-try, clean-exit, wrong result can never be `degraded`.** The reference run (31 spans, all `success`, artifacts written) trips none of these by construction — there was no repetition, no error, no stall, and the readiness table satisfied `sawExpected`. Struggle detection is a *thrash* detector, and the failure class under audit produces no thrash.

### 2.4 `classify()` and the `success` fast path

`classify()` `:524-561`:
- `blockingErr` = `tool_error || permission_denied || hook_failure` (`:528`) — sourced **exclusively** from `tool_result.is_error === true` (`:810-812`). A successful tool whose body describes a problem is deliberately not a signal (`:804-809`, `:850-854`).
- `recovered` (`:530`, `allErrorsRecovered` `:504-522`) → not escalated.
- `degraded` ← struggle (see 2.3, unreachable here).
- `silent_suspect` (`:550`) requires `!span.sawExpected` **and** `opCount ≥ 2`.
- else `success` `:558`.

`sawExpected` is the last line of defence, and it is **existence-shaped, not correctness-shaped**. `EXPECTED_OUTPUT["project-init"]` (`:210`) is `/project-profile\.json|\.mcp\.json|\.env\.|readiness|verify-access/i`. Two things follow:
1. The run *did* write those files, so `sawExpected = true` → `success`. The oracle asks "did an artifact appear", never "is it complete".
2. Worse, `markExpected` is also fed the **input** of every op (`:756-758`) and the **body of every tool_result** (`:821`). The readiness table that *printed the WARN* matches `/readiness|verify-access/` — **the artifact carrying the warning is what certified the run healthy.**

### 2.5 `state.flagged[]` and `seenSignatures`

- `:608` is the discard gate (see §1). `:614` keeps only the **first** occurrence per signature (`hash(kind|name|outcome|topSignal)`, `:609`) under `FLAGGED_CAP = 200` (`:251`). Occurrence counts are lost — 20 identical failures are indistinguishable from 1.
- `seenSignatures` (`:1640`) is appended when a finding surfaces, and `:1509-1513` filters those out of `uniqueFresh` permanently. **Yes — a signature suppresses a recurrence that mattered:** a `failed /qa-fix` that surfaces once is silent for the rest of the session no matter how many times or how much worse it recurs.

### 2.6 `finalize` verdict

`:1534` `flaggedRun = uniqueFresh.length > 0 || negFeedback`, and `:1596`:

```js
verdict: flaggedRun ? "flagged" : (state.scanErrors ? "degraded-collector" : "clean"),
```

`uniqueFresh` is a **routing** set (fresh, undeduped signatures). Deriving the *verdict* from it makes the durable audit record lie. Confirmed on disk in this repo:

```
.vc-fix/diagnostics/5dd20cfc-….jsonl → "flagged":[{"name":"qa-verify-fix","outcome":"failed",…}],
   "decision":{"verdict":"clean","flaggedTotal":1,"suppressReason":"stop-hook-active"}
.vc-fix/diagnostics/6affde1f-….jsonl → "flagged":[{…"failed","struggle":["stall"]…}],
   "decision":{"verdict":"clean","flaggedTotal":1,"suppressReason":"self-check-session"}
```

A run with a `failed` span records itself **`clean`**. This is the same class as the reference incident, independent of any capture gap, and it is already reproducible from artifacts in the repo.

Second on-disk finding: `1964cc86-….jsonl` carries `"totals":{"hook_failure":4,…}` with `"spanCounts":{"success":292}`, `"flagged":[]`, `verdict:"clean"` — four hook failures counted at session level (`attributeSignal` `:701-712` → `untiedSignals`/`orphanDetails`) and then dropped, because no command span existed to adopt them (the Fix-2 synthesis at `:1455` requires a `complete` marker). Capture happened; judgement never saw it.

Third: that session has **two** `finalize` records 12 ms apart with *divergent* counters (292 vs 290 spans, 278 vs 276 tool calls). Cause: in this repo the collector is registered **twice** — `vc-fix@vc-tools` is enabled at user level (`~/.claude/settings.json` `enabledPlugins`) *and* `.claude/settings.json` wires `$CLAUDE_PROJECT_DIR/.claude/hooks/session-telemetry.mjs` for the same events. Two processes load, scan and `saveState()` the same files concurrently; `saveState` is atomic per write (`:1104-1114`) but there is no lock, so it is last-write-wins with lost cursor updates.

### 2.7 Surfacing gates — which can hide a *real* finding

| Gate | Line | Hides the clean line | Hides a finding | Verdict |
|---|---|---|---|---|
| `consentOff` (`VC_FIX_DIAG_CONSENT=off`) | `:1525` | yes | **yes** | by design (kill switch) |
| `lineOff` | `:1526` | yes | no | fine |
| `stopHookActive` | `:1399` | yes | this turn only | finding survives; **but mislabels `verdict:"clean"`** |
| `promptedThisTurn` | `:1535` | yes | this turn only | fine |
| `selfCheckSeen` | `:1263`, `:772`, `:1535` | yes | **yes, permanently for the session** | **defect** — one early `/vc-self-check` silences every later finding |
| `pluginActivity` | `:1554`, `:1571` | yes | no (`shouldPrompt` does not require it) | correct |
| `completePending` / `cleanEligible` | `:1564-1571` | yes | no | correct |
| `scanErrors` | `:1575` | yes | no | correct direction |
| `pendingBg` | `:1397-1412` | defers | **can starve** | see below |
| `pendingQuestions` | `:1424-1440` | defers | **can starve** | 45 min on the *session clock*, which "never ages out" while idle (`:1423`) — a missed `tool_result` can defer the terminal verdict indefinitely; there is no wall-clock or `SessionEnd` backstop |
| `suppressReason` | `:1289-1304` | audit only | no | correct |

So exactly two gates can genuinely lose a finding — **`selfCheckSeen`** and **deferral starvation** — plus `consentOff` by design. Everything else only costs a line.

### 2.8 The oracle — consulted where?

Split, and that is the problem. **Capture time:** §1c expected-output markers (duplicated as `EXPECTED_OUTPUT` `:204-219`) and §1d thresholds (duplicated as `T` `:224-246`). **Judgement time only:** §2 severity rubric, §3 per-skill phases/required outputs, §4 cross-cutting patterns. The judgement-only half contains checks the pipeline **can never deliver**, because nothing captures their inputs:

| Oracle row | Where | Capture backing today |
|---|---|---|
| "required phase never appears" → S1 | §2 `:147` | none — no phase/step markers are recorded |
| "gate was skipped" → S2 | §3 `:189` | none |
| "report over its `reports.md` cap" → S2 | §2 `:152`, §4 `:233` | none — nothing measures a written report |
| "write under the plugin dir" → S1 | §4 `:236` | none — write paths are hashed, never checked |
| "merge attempt" → S1 | §4 `:235` | tool name *is* in the span, but only reaches judgement if the span happens to be flagged |
| "silent all-clear on a failed probe" → S1 | §4 `:234` | **this is the reference incident** — and there is no capture of "a probe failed" other than `is_error` |
| `stop_bail` "on a broken trajectory" → S1 | §2 `:148` | `stop_bail` is in `SIGNAL_CLASSES` `:258` but excluded from `blockingErr` `:528` and from struggle — a bail cannot make a span non-`success` |

### 2.9 `/vc-self-check` — what it structurally cannot know

Inputs: `finalize.flagged[]`, the `span` records, `feedback` records, and `transcriptPath`. It *could* read the transcript and see everything — but `SKILL.md:96-100` tells it: `flagged` empty **and** no feedback ⇒ write a one-line "no issues" and stop. It is instructed not to look. What it cannot recover even if it did look: anything the capture layer never wrote *and* the transcript never carried — the `verify-access` `results[]` verdict (computed in-process, only rendered), `probe-lib` HTTP statuses swallowed into WARN prose, `tracker.fields = {}` (a *shape* of a file, not a transcript event), and every sidechain op.

### 2.10 `deliver` / `feedback.mode`

`feedback.mode` gates **outbound only** (`deliver.mjs:67-124`); capture and local DIAG need no consent. `reduce()` (`upstream-reduce.mjs:211-259`) reads `type:"span"` only (`:192`) and keeps `outcome ∈ {degraded, failed, silent_suspect}` (`:194`) — so **the upstream path inherits the same blind spot**: an observation that never became a flagged span can never be contributed. Note for §3: a new `type:"obs"` record is *ignored* by `reduce()` and by every existing reader, so it is additive and safe.

---

## 3. Blind-spot inventory

`obs()` below means "emit an observation record via the new capture API" (§4).

| # | Signal source | Where it exists today | Why it is dropped | Smallest change that captures it | Cost |
|---|---|---|---|---|---|
| 1 | **stderr of a script that exited 0** (the reference defect: `discover-tracker.mjs:215`) | **present in the transcript** as `ev.toolUseResult.stderr` — empirically confirmed: Bash results carry `{stdout, stderr, interrupted, isImage, noOutputExpected}` | `scanTranscript` reads only `ev.message.content[]` items and top-level string `content` (`:728-730`, `:877-880`) — `ev.toolUseResult` is never touched | read `ev.toolUseResult` in the `tool_result` branch; non-empty `stderr` ⇒ `obs{class:"script_stderr"}` | ~zero (line already parsed) |
| 2 | **Non-zero exit code** | captured *when* the harness marks the result `is_error:true` — body starts `Exit code N` (confirmed in transcripts) | (a) a piped invocation (`… \| head -20`) yields the pipe's exit 0 and masks it; (b) exit 0 + WARN is invisible by definition | parse `^Exit code (\d+)` into `op.exitCode`; ban piping plugin-script invocations in the SKILL docs | ~zero |
| 3 | **`verify-access` WARN/FAIL rows** | `results[]` `:63-64`, ~14 rows incl. the reference WARN at `:298-300` | rendered `:461` and thrown away; `:472` exits 0 unless a hard FAIL | before `signalSelfDiagnosticsComplete()` `:471`, `obs()` one record per non-PASS row + a counts summary | one small file write |
| 4 | **Non-2xx HTTP inside plugin scripts** | `adoGet` throws on `!res.ok` (`discover-tracker.mjs:61`) → caught at `:159`, `:192`, `:215`; `probe*` helpers return statuses that become WARN prose | all local variables; nothing leaves the process except stderr | `obs{class:"http_non2xx", code, subject}` at each catch site and in `probe-lib` return paths | negligible |
| 5 | **Degraded / empty output artifacts** — `tracker.fields == {}` (`discover-tracker.mjs:213`), `roleStatesComplete:false` (`:274`), `qaRoleStatesComplete:false` (`:237`), `upstreamRefResolved:false` (`verify-access.mjs:448`), empty `repos.client` on `projectType:"client"` | the written `project-profile.json` | it is a *file shape*, not an event — nothing inspects it | a new `assert-profile.mjs` run at the end of `/project-init`; one `obs{class:"degraded_artifact", subject}` per violated invariant | one script run, <1 s |
| 6 | **Self-labelled fallbacks in output** — "unverified defaults" (`discover-tracker.mjs:292`, `verify-access.mjs:300`), "falls back to", "best-effort", "could not be derived", "SKIP" | in stderr (invisible) **and** in the rendered table inside the `tool_result` body (scanned — but only by `markExpected`, which *credits* it) | no marker set looks for degradation language; the table instead satisfies `EXPECTED_OUTPUT` `:210` | a `FALLBACK_MARKER_RE` tested against the already-capped body ⇒ `obs{class:"self_reported_fallback"}` | one regex per op |
| 7 | **`recovered` errors** | fully classified (`:504-522`, `:544`) | excluded from `flagged[]` at `:608`, so invisible to judgement | `obs{class:"recovered_error", code, count}`; still **not** surfaced | zero (derived) |
| 8 | **Operator dissatisfaction short of 👎** — rejected `AskUserQuestion`, corrective prose ("no", "wrong"), the **same request repeated**, an interrupted tool use | `AskUserQuestion` result is in the transcript; `ev.prompt` is in the `UserPromptSubmit` payload; `toolUseResult.interrupted === true` exists (confirmed); "Command timed out"/exit 143 exists | nothing looks. Note `:850-854` deliberately refuses to derive *failure* from user prose (A-F1) — correct, and orthogonal: an *observation* is not a failure verdict | `cmdPrompt`: hash the prompt, `obs{class:"prompt_repeat"}` on a near-duplicate, `obs{class:"operator_correction"}` on corrective wording; `obs{class:"tool_interrupted"}` from `interrupted` | negligible; prompt text stays local (only a hash + enum travel upstream) |
| 9 | **Contradiction: a WARN anywhere vs a `clean` finalize** | needs #3/#6 first | no cross-surface consistency check exists | a deterministic invariant in `cmdFinalize`: any `self_reported_warn`/`_fail` observation ⇒ `verdict ≠ "clean"` | zero |
| 10 | **`verdict:"clean"` with `flaggedTotal > 0`** | on disk today (§2.6) | `:1596` derives the verdict from the *routing* set `uniqueFresh` (`:1509-1513`) | derive `verdict` from counts (`flaggedTotal + observations.total + scanErrors`); move routing into a separate `surfaceDecision` field | zero |
| 11 | **Recurrence of an already-seen signature** | occurrences happen; only the first is kept `:614`; `seenSignatures` `:1640` silences forever | dedup is doing double duty as retention *and* rate limiting | keep `occurrences` per signature; re-surface on growth (×N or a new class) — a count, not a severity | negligible |
| 12 | **Opt-in mid-run blind spot** (`/project-init` enables capture during its own run, `captureEnabled` `:1158`) | — | `SessionStart`/the first `UserPromptSubmit` fired before the flag existed | **Honest quantification: the data is *not* lost, the structure is.** On the first firing after the flag write, `state` is fresh, so `scanTranscript` takes the full-read branch (`:653-666`) and backfills the whole transcript from byte 0. What is lost is (a) the `session_start` header and (b) the command-span boundary — `cmdPrompt` was a no-op, so ops are parentless until the Fix-2 synthesis at Stop (`:1442-1486`). Fix: on the first captured firing, if `processedLines === 0` and the transcript already holds a plugin `/command` prompt, open the command span retroactively instead of waiting for Stop | zero |
| 13 | **Evidence destruction** | `pruneOldDiagnostics` `:926-956` (24 h, silent — observed firing: `prunedOldArtifacts:3` in a real `session_start`); the cleanup offer `:1589-1591` rides the **same turn** as the verdict and option 1 is `purge-inactive --all` `:1675`, which deletes *this* session's jsonl; `deliver`'s `purgeSession` (`deliver.mjs:494`) | no gate asks "has this session's findings been judged?" | **Assessment: yes, purge can destroy an uninvestigated finding.** `deliver`'s purge only fires after a *delivered* Issue (safe), but the cleanup offer and the 24 h age-cap both delete flagged-but-never-diagnosed sessions. **Missing guarantee:** a session whose jsonl holds a non-clean finalize or ≥1 observation and no matching `DIAG-*.md` must not be purged without `--force`; and the cleanup offer must move to the turn *after* the DIAG is on screen | zero |
| 14 | **Sub-agent (sidechain) work** | same transcript, `isSidechain:true` | skipped at `:725` | scan sidechain lines in **aggregate only** (per-agent counts + error classes → `obs`), attributed to the open `agent` span | bounded if aggregate-only |
| 15 | **Collector self-contention** | two registrations in this repo (§2.6) | no instance guard | a lock file / instance id in `.state.json`; on mismatch `obs{class:"collector_contention"}` | negligible |
| 16 | **Collector scan errors, historically** | `scanErrors` `:645`, `:658`, `:680` | **reset to 0 on the next successful read** (`:666`, `:685`) — a transient collector failure is forgotten | add a monotone `scanErrorsTotal` alongside the resettable flag; `obs{class:"collector_scan_error"}` | zero |
| 17 | **Oracle rows with no capture backing** — report size, write-path-outside-outputRoot, forbidden tool (`merge_pull_request`), phase/gate markers, `stop_bail` on a broken trajectory | oracle §2 `:147-158`, §4 `:230-236` | nothing measures them | at `Write`/`Edit` op close: line count + path prefix ⇒ `obs`; a tool-name allowlist hit ⇒ `obs{class:"forbidden_tool"}`; skills emit `obs{class:"phase", subject:"G2"}` at each gate | small; the phase markers need per-skill edits (P2) |
| 18 | **`markExpected` credits an *attempt*** | `:756-758` feeds the op **input** into the marker test; `/project-init`'s `/\.env\./` matches merely *reading* an env file | over-crediting was accepted as safe (`:399-401`) — but it disables the strongest silent-failure detector for `project-init` | gate `silent_suspect` on the strict `sawProduced` (`:408-414`) rather than `sawExpected`; narrow the `project-init` markers to write-shaped ops | zero; needs a regression check on false `silent_suspect` |
| 19 | **Ring/cap truncation is silent** — `OPS_CAP` `:250`, `details` 25 `:368`, `FLAGGED_CAP` 200 `:251`, `snippet` 120 `:162` | — | drops are unrecorded, so a long span looks quiet | on any cap hit, one `obs{class:"capture_truncated", subject, droppedCount}` | zero |
| 20 | **Deferral starvation** | `:1424-1440`, comment `:1423` | session clock never advances while idle | record the deferral as an `obs` (already in the `finalize` record) and add a `SessionEnd`/wall-clock backstop | small |
| 21 | **`feedback.mode:"off"` findings evaporate** | DIAG stays local, age-capped away in 24 h | intentional | out of scope; see §8 open question 4 | — |

---

## 4. Target data model

### 4.1 The observation record

Appended to the existing `<outputRoot>/.vc-fix/diagnostics/<sid>.jsonl`. **Additive:** `upstream-reduce.reduce()` filters `type === "span"` (`upstream-reduce.mjs:192`), `deliver` reads `span`/`feedback`/`finalize`, and `/vc-self-check` reads `finalize.flagged` — all ignore an unknown `type`, so nothing breaks before the readers opt in.

```jsonc
{ "type": "obs",
  "sessionId": "<sid>",
  "ts": "<iso>",                  // first occurrence
  "lastTs": "<iso>",              // last occurrence (rollup)
  "spanId": "<span id>|null",     // attribution; null = session-level
  "skill": "project-init|…|null", // closed vocabulary (upstream-reduce SKILLS)
  "class": "self_reported_warn",  // CLOSED, DESCRIPTIVE vocabulary — see 4.2
  "subject": "tracker_field_contract", // CLOSED: what the observation is about
  "code": "HTTP_4XX",             // closed error taxonomy (upstream-reduce ERROR_CODES) or "NONE"
  "count": 3,
  "source": "collector|script|profile-assert",
  "signature": "<djb2 base36 of class|subject|code|skill>",
  "evidence": { "snippet": "<redacted ≤160>", "exitCode": 0, "httpStatus": 400, "path": null }
}
```

Two fields are **deliberately absent**: no `severity`, no `verdict`. The capture layer may not express importance. `class`/`subject` are descriptive, not ranked — `self_reported_warn` says "a surface of ours printed a WARN", not "this is S2".

### 4.2 Capture vocabulary (`class`)

`tool_error` · `permission_denied` · `hook_failure` · `policy_block` · `stop_bail` · `script_stderr` · `script_exit_nonzero` · `http_non2xx` · `self_reported_warn` · `self_reported_fail` · `self_reported_skip` · `self_reported_fallback` · `degraded_artifact` · `recovered_error` · `struggle` · `oracle_marker_miss` · `report_oversize` · `write_outside_output_root` · `forbidden_tool` · `operator_correction` · `prompt_repeat` · `question_unanswered` · `tool_interrupted` · `capture_truncated` · `collector_scan_error` · `collector_contention` · `harness_noise` · `phase`.

`harness_noise` matters: the harness writes benign stderr (e.g. `Shell cwd was reset to …`, observed in real transcripts). It is recorded **as its own class**, not filtered — deciding it is noise is the judgement layer's job (§5).

### 4.3 Bounded growth — the honest volume answer

Capture-everything must not mean one record per occurrence. **Aggregate by `signature` at capture time**, which is lossless in class + count:

- `state.observations`: `Map<signature, {class, subject, code, skill, spanId, count, ts, lastTs, evidence}>`.
- Append a compact `obs` line the **first** time a signature appears (crash durability), then one `obs_rollup` batch at `finalize` carrying final counts.
- Caps: `OBS_SIGNATURE_CAP = 200`, per-class cap 25, evidence snippet 160 chars. **On overflow, emit `obs{class:"capture_truncated", subject:"<class>", count:<dropped>}`** — never silently truncate.
- Worst case ≈ 200 × ~320 B ≈ **65 KB**; a typical run < 20 signatures ≈ **6 KB**. For comparison, one existing real session jsonl in this repo is **230 KB** of span records alone — so observations are a rounding error, and the *span* stream is what actually needs a cap review.
- Hook CPU: one `Map` upsert per event; `toolUseResult.stderr` is free (the line is already parsed); the fallback regex is one extra `.test()` on a body already run through ~20 redaction regexes (`:751`, `:796`). Immeasurable next to existing work.
- `redact()` (`hooks/redact.mjs`) applies to every snippet, unchanged.

### 4.4 `finalize` additions (additive)

```jsonc
"observations": { "distinct": 7, "total": 19, "byClass": { "self_reported_warn": 2, "script_stderr": 3, … }, "truncated": 0 },
"decision": {
  "verdict": "clean|observed|attention|degraded-collector",   // from COUNTS only
  "surfaceDecision": "clean-line|observed-line|tail-trigger|none",
  "surfaceReason": "…",   // today's suppressReason, renamed — routing audit
  … existing fields …
}
```

`verdict` becomes a statement about the run; `surfaceDecision` a statement about the UI. Today's single `verdict` field conflates them, which is exactly how a `failed` span ended up in a `clean` record.

---

## 5. Judgement-layer spec (`/vc-self-check`)

**Analysis set** = `observations ∪ flagged spans ∪ feedback records`. Delete the "flagged empty ⇒ stop" short-circuit (`SKILL.md:96-100`); the new stop condition is `observations.total === 0 && flagged.length === 0 && no feedback`.

**Per-class candidate severity** (a *starting point*; correlation and the oracle's §2/§3 rows override):

| Class | Candidate | Escalates if |
|---|---|---|
| `self_reported_fail`, `forbidden_tool`, `write_outside_output_root` | **S1** | always |
| `self_reported_warn`, `degraded_artifact`, `http_non2xx`, `script_exit_nonzero` | **S2** | the subject is a *required* output/phase per oracle §3 ⇒ **S1** |
| `self_reported_fallback`, `report_oversize`, `struggle`, `question_unanswered` | S2 | |
| `script_stderr`, `recovered_error`, `tool_interrupted`, `prompt_repeat`, `capture_truncated`, `collector_scan_error` | S3 | count ≥ 3 or correlated with an S2 on the same subject ⇒ S2 |
| `policy_block`, `self_reported_skip`, `harness_noise`, `phase` | **NOISE** | never on its own; may still be *cited* as evidence |
| `collector_contention` | S2 | it invalidates measurement — verdict may not be `OK` |

**Correlation rules (N related observations = ONE finding):**
1. **Same-subject merge.** Observations sharing `subject` collapse into one finding at `max(severity)`. The reference incident becomes a single finding: `http_non2xx(HTTP_4XX, subject=tracker_field_contract)` + `script_stderr` + `degraded_artifact(tracker.fields empty)` + `self_reported_warn` → **one S2/S1 finding**, "the Bug field contract was never scanned; `/qa-bug` will send unverified defaults", with four independent pieces of evidence — even though every span was `success`.
2. **Escalate on triangulation.** ≥3 observations of *different* classes on one subject ⇒ +1 severity step (a corroborated degradation is not friction).
3. **Cross-surface contradiction ⇒ S1 automatically.** Any `self_reported_warn|_fail` in a run whose `finalize.decision.verdict` is `clean` is itself a **finding against the collector** (`subject:"collector_verdict_integrity"`). This is the check that would have caught the reference run *and* the on-disk `clean`-with-`flaggedTotal:1` records — and it is the highest-value single row in the whole rubric.
4. **Same-code clustering across skills** ⇒ one cross-cutting finding (existing oracle §4 behaviour, now with data).
5. **Occurrence weighting.** `count ≥ 3` on an S3 promotes to S2; a signature whose `count` grew since the last DIAG is re-reported even if previously judged.

**Benign suppression happens HERE, and stays in the record.** A NOISE verdict is *written*, never dropped: the DIAG gains one line — `Suppressed as noise: 6 observations (harness_noise ×4, policy_block ×1, self_reported_skip ×1)` — and the observations remain in the jsonl for the upstream reducer's counts. This is the property the current architecture lacks: "benign" is a *conclusion in the report*, not a hole in the data.

**Fail direction:** an observation whose subject/class the rubric does not recognise ⇒ **S3 + LOW confidence + "oracle gap: propose extending §1e"**. Never silently dropped.

---

## 6. Surfacing policy — quiet without a severity filter

Three states, derived **from counts only**:

| Condition (all deterministic) | `verdict` | Line shown |
|---|---|---|
| `observations.total === 0 && flaggedTotal === 0 && scanErrors === 0` | `clean` | `vc-fix self-check: no plugin issues detected` (today's line) |
| observations exist, none in the routing set | `observed` | `vc-fix self-check: no blocking issues — N observations recorded (run /vc-self-check for detail)` |
| ≥1 routing-set observation **or** ≥1 flagged span **or** a 👎 **or** a §5 rule-3 contradiction | `attention` | tail-trigger: silently run `/vc-self-check`, print one line |

**Why this is routing and not severity:**
1. The **routing set** is *data*, not a judgement — a class list in the oracle (new §1e), reviewed like the marker table. The hook only checks membership; it never ranks, scores or weighs.
2. **Nothing is dropped by the gate.** Every observation is already on disk before the gate runs. A non-routing observation still (a) forbids the word "clean", (b) is counted in the visible line, (c) is analysed by any `/vc-self-check`, (d) reaches `deliver --batch`.
3. **Rate limiting is a budget, not a filter.** Whether to *spend a model turn now* is bounded by per-signature dedup + a per-session trigger cap, and every deferral is recorded as `surfaceDecision:"deferred-budget"` — auditable, and drained by the next surfacing opportunity rather than discarded.
4. **The hard invariant:** `verdict === "clean"` **requires** `observations.total === 0`. And separately: any `self_reported_warn|self_reported_fail` observation forces `verdict ≥ "attention"`. Together these make the reference failure *unrepresentable* — a run containing a WARN cannot produce a `clean` record, whatever the classifier thinks of it.

Silence is preserved where it matters: a plain dev session opens no plugin span, so `pluginActivity === false` (`:1554`) still withholds *every* line — observations are recorded, nothing is shown. Multi-turn pauses still require the `complete` marker (`:1564-1571`) for a line, and the deferral checkpoints (`:1400`, `:1430`) still print nothing.

---

## 7. Prioritized fix plan

All edits land in `plugins/vc-fix/` first, then are copied byte-identically to `.claude/` (`scripts/unit/mirror-parity.test.mjs`). Verification harness: `npm test` → `scripts/unit/session-telemetry.test.mjs` (drives the real hook as a child process with a synthetic transcript + temp `VC_FIX_HOME`).

### P0 — closes the demonstrated failure

| # | File · function | Failure mode closed | Change (outline) | Blast radius | Verify |
|---|---|---|---|---|---|
| P0-1 | `hooks/session-telemetry.mjs` — new `recordObs()`, `state.observations`, wired into `attributeSignal` (`:694-714`), the `tool_result` branch (`:789-849`), `emitSpan` (`:599-618`), `freshState` (`:1013`) / `loadState` (`:1068`) | capture layer decides importance | signature-keyed `Map`; first-sighting `obs` line + `obs_rollup` at finalize; caps + `capture_truncated` | collector only; new record type ignored by all readers | new tests: an errored-then-recovered op yields `recovered_error`; caps emit `capture_truncated`; a pre-existing `.state.json` still loads |
| P0-2 | new `hooks/obs.mjs` (writer) + `skills/project-init/verify-access.mjs:461-471`, `skills/project-init/discover-tracker.mjs:159/192/215` | the plugin's own WARN/FAIL/HTTP verdicts never become telemetry — **the reference defect** | writer resolves the session via the same `newestSessionId` heuristic as `cmdComplete` (`:1726`), writes to an `obs-inbox.jsonl` drained by the next hook firing (race-free, immune to stdout caps); gated on `captureEnabled` | two scripts + one new file; both call sites are already inside `try{}` / after render, so onboarding behaviour is unchanged | run `/project-init --check` on the Azure fixture → assert `class:"self_reported_warn"`, `subject:"tracker_field_contract"` in the jsonl |
| P0-3 | `cmdFinalize` `:1595-1617` | `verdict:"clean"` with `flaggedTotal:1` (**reproducible from artifacts in this repo**) | derive `verdict` from counts; split routing into `surfaceDecision`/`surfaceReason`; add the three-state line (§6) and the two hard invariants | changes the `decision` record shape (additive + one renamed field) and the clean-line text on `observed` runs | replay the two existing jsonl fixtures → `verdict:"attention"`; a genuinely clean run still prints the old line verbatim |
| P0-4 | `skills/vc-self-check/SKILL.md` Step 2 (`:88-100`), Step 3; `knowledge/diagnostics/skill-expectations.md` new **§1e** (routing set) + **§1f** (obs → severity + correlation) | judgement layer is instructed not to look | analysis set = observations ∪ flagged; add §5's rubric + correlation rules incl. rule 3; DIAG gains a `Suppressed as noise:` line | docs only — **cheapest single change in the plan, and it alone would have produced a finding on the reference run** | run `/vc-self-check latest` against a fixture jsonl with observations and no flagged span → non-empty DIAG |
| P0-5 | `cmdFinalize` `:1535` + `:1263`/`:772` | `selfCheckSeen` permanently silences later findings | scope the guard to the *current tail-trigger* (`stopHookActive` + `promptedThisTurn` already prevent recursion); keep dropping `vc-self-check`'s own spans (`:607-608`) | more surfacing on long sessions — bounded by the trigger cap | test: flag → surface → flag a *new* signature later in the same session → surfaces |

### P1

| # | File · function | Failure mode | Change | Blast radius | Verify |
|---|---|---|---|---|---|
| P1-6 | `scanTranscript` `tool_result` branch | exit-0 stderr, interrupts, masked exit codes (#1, #2, #8-partial) | read `ev.toolUseResult` → `stderr` ⇒ `script_stderr` (harness-noise prefixes ⇒ `harness_noise`), `interrupted` ⇒ `tool_interrupted`; parse `^Exit code (\d+)` into `op.exitCode` | collector; new classes only | synthetic transcript with `toolUseResult.stderr` populated |
| P1-7 | new `FALLBACK_MARKER_RE` in the collector | self-labelled degradation is invisible, and the table that carries it *credits* the run (#6) | one regex over the already-capped body ⇒ `self_reported_fallback` | one extra `.test()` per op | fixture containing `unverified defaults` ⇒ observation emitted |
| P1-8 | new `skills/project-init/assert-profile.mjs` + a call in `SKILL.md` step 9 | degraded artifacts (#5) | invariant list → `degraded_artifact` per violation | new script; read-only | on the Azure fixture: `tracker.fields=={}` ⇒ observation |
| P1-9 | `emitSpan:614`, `cmdFinalize:1639-1642` | recurrence silenced forever (#11) | per-signature `occurrences`; re-surface on growth | slightly more surfacing | test: same failure ×5 ⇒ `occurrences:5`, one extra surfacing at the growth threshold |
| P1-10 | `pruneOldDiagnostics:926`, the cleanup offer `:1589-1591`/`:1670-1686`, `deliver.mjs purgeSession:494` | evidence destruction (#13) | refuse to purge a session with a non-clean finalize / ≥1 observation and no matching `DIAG-*.md` unless `--force`; move the cleanup offer to the turn **after** the DIAG | deletion becomes conservative — leftovers may live longer | test: flagged session + no DIAG ⇒ age-cap and `purge-inactive` both skip it |
| P1-11 | `scanTranscript:725` | sidechain invisibility (#14) | scan sidechain lines in **aggregate only** → per-agent counts + error classes as observations on the parent `agent` span | volume risk if not aggregate-only — cap per agent span | `/qa-fix`-shaped fixture with a sidechain ⇒ observations, jsonl growth within cap |
| P1-12 | `loadState`/`saveState` `:1068-1114` | collector contention / lost cursor updates (§2.6) | instance id + lock file; on mismatch `collector_contention`; document that a project must not register the mirror while the plugin is enabled | affects this dev repo primarily | two concurrent `finalize` invocations ⇒ one record + one contention observation |

### P2

| # | Target | Failure mode | Note |
|---|---|---|---|
| P2-13 | `classify:550`, `EXPECTED_OUTPUT:210` | `markExpected` credits an *attempt* (#18) | gate `silent_suspect` on `sawProduced`; narrow the `project-init` markers to write-shaped ops. Needs a false-positive sweep against real fixtures first |
| P2-14 | `cmdPrompt:1218-1266` | operator dissatisfaction short of 👎 (#8) | prompt-hash repeat detection + corrective-wording observation. Keep `:850-854`'s rule: prose never *forces* a failure verdict |
| P2-15 | skills + collector | oracle rows with no capture backing (#17) | report line count + write-path check at `Write`/`Edit` close; forbidden-tool allowlist; `obs{class:"phase"}` emitted by each skill at its gates — this is what finally makes "gate skipped" detectable |
| P2-16 | `:645/:666/:685`, `:1424-1440` | forgotten scan errors; deferral starvation (#16, #20) | monotone `scanErrorsTotal`; `SessionEnd`/wall-clock backstop |
| P2-17 | `snippet:162`, `detectStruggle:417` | 120-char snippet degrades `classifyError`; ring-limited struggle detection (#19, §2.2) | raise the evidence cap for classification; drive `recurring_error`/`retry_storm` off signature counters instead of the 25-detail ring |
| P2-18 | `upstream-reduce.mjs:211` | upstream inherits the blind spot (§2.10) | extend `reduce()` to build findings from observations — all fields are already closed-vocabulary, so §2a containment is preserved by construction |

---

## 8. Acceptance tests

**(a) The reference defect must produce a NON-clean self-diagnosis.** Re-run `/project-init --check` against the same Azure org with the `$expand=Properties` 400 still broken, then:

```bash
node -e "const fs=require('fs'),p='.vc-fix/diagnostics';const f=fs.readdirSync(p).filter(x=>x.endsWith('.jsonl')).map(x=>p+'/'+x).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];const r=fs.readFileSync(f,'utf8').trim().split('\n').map(JSON.parse);const obs=r.filter(x=>x.type==='obs'||x.type==='obs_rollup');const fin=r.filter(x=>x.type==='finalize').pop();const warn=obs.filter(o=>/self_reported_warn|degraded_artifact|http_non2xx/.test(o.class));console.log({file:f,observations:obs.length,warnClass:warn.map(o=>o.class+':'+o.subject),verdict:fin.decision.verdict});if(!warn.length)throw new Error('FAIL: the field-contract WARN was not captured');if(fin.decision.verdict==='clean')throw new Error('FAIL: a run containing a WARN reported clean');console.log('PASS')"
```

Expected: ≥1 observation with `subject:"tracker_field_contract"`, `finalize.decision.verdict === "attention"`, and a `DIAG-*.md` whose findings table carries a BROKEN/DEGRADED row for it. **Today this same command prints `verdict:"clean"` and zero observations** — that is the regression baseline.

**(b) A plain dev session with no plugin activity stays silent.** In a `selfDiagnostics:true` project, run a turn that touches no plugin skill (a `Read` + an `Edit`), then assert: the collector emitted **no** `{"decision":"block"}` on stdout, and `finalize.decision.surfaceReason === "no-plugin-activity"`. Observations may be non-zero (e.g. a `tsc` `hook_failure`) — the assertion is on *surfacing*, not on capture. Covered by extending `scripts/unit/session-telemetry.test.mjs`.

**(c) No per-turn nagging during a multi-turn skill's pauses.** Drive `init` → `prompt(/project-init)` → three `finalize` firings with no `complete` marker → `complete --skill project-init` → `finalize`. Assert: exactly **zero** blocks on the first three (`surfaceReason:"awaiting-completion"` or `"question-pending"`), exactly **one** on the last. Also drive a pending `AskUserQuestion` (`tool_use` with no `tool_result`) and assert `verdict:"deferred"`, no block — the VCST-5582 D guarantee must survive the new gate.

**(d) Bounded growth.** Feed a synthetic transcript with 5 000 distinct errors; assert the jsonl grows by < 100 KB, `observations.distinct ≤ 200`, and a `capture_truncated` record exists with the dropped count.

**(e) Mirror parity + no behavioural regression.** `npm test` green, including `scripts/unit/mirror-parity.test.mjs` and the existing 283-line telemetry suite unchanged except for additions.

**(f) Verdict-integrity replay.** Replay the two on-disk fixtures (`5dd20cfc-…`, `6affde1f-…`) — each has a `failed` span and `verdict:"clean"` — through the new derivation and assert `verdict:"attention"`. This test is available *before* any capture work lands, so P0-3 can be verified independently.

---

## 9. Open questions (each with a recommendation)

1. **Does the installed Claude Code expose `SessionEnd` / `PreCompact` / `Notification`, and does a `PostToolUse` entry with no `matcher` fire for every tool?** The `matcher`-less shape is already used for `SessionStart`/`Stop` in `hooks.json`, so it is very likely, but I did not verify it against the installed CC version. → *Recommendation:* verify before P1-6; a matcher-less `PostToolUse` would let exit codes and stderr be captured from the hook payload directly and make the transcript parse a fallback rather than the only path. `SessionEnd` is the clean answer to deferral starvation (P2-16).
2. **Should `verify-access.mjs` exit non-zero on a WARN?** Today only a hard FAIL does (`:472`), and `probe-lib.writeProbeSeverity`'s design call — a missing write scope is a WARN, not an onboarding blocker — is deliberate and correct. → *Recommendation:* **keep exit 0.** The observation record, not the exit code, is the right channel; changing the exit code would change onboarding UX for a telemetry benefit.
3. **How loud is the new `observed` line?** It replaces "no plugin issues detected" on any run with ≥1 observation — which, given `tsc` hook echoes and harness stderr noise, may be most runs at first. → *Recommendation:* ship it, but seed §1e's noise classes generously (`harness_noise`, `policy_block`, `self_reported_skip`) and make the line count **non-noise** observations only; keep the raw total in the jsonl. Revisit after one week of real runs.
4. **`feedback.mode:"off"` clients produce findings that evaporate in 24 h** (#21). → *Recommendation:* out of scope here; the closed-schema reducer already makes an enum-only aggregate beacon technically safe, but shipping any always-on outbound path needs an explicit product decision, not an engineering one.
5. **Should this repo stop registering the `.claude/` mirror hooks while `vc-fix@vc-tools` is user-enabled?** The double registration is measurably corrupting the dev repo's own telemetry (§2.6). → *Recommendation:* yes — prefer the plugin registration and drop the telemetry entries from `.claude/settings.json` (keep `enforce-real-user` and the `tsc` hook), *or* land P1-12's lock first. This is an operator decision because it changes which copy the dev repo exercises.
6. **Retention window for observations.** The 24 h age-cap was sized for span logs. → *Recommendation:* keep 24 h for `.jsonl`, but exempt a session with an unjudged non-clean verdict (P1-10) — bounded by the `--force` escape hatch.

---

## 11. Deviations from the plan, made during implementation

| Plan said | Shipped instead | Why |
|---|---|---|
| A new `hooks/obs.mjs` writer + an `obs-inbox.jsonl` drained by the next hook firing | An **`obs` subcommand on the existing collector** reading a JSON array from **stdin**, plus a thin `skills/project-init/lib/diag-obs.mjs` transport | Reuses `cmdComplete`'s proven session resolution and the collector's own vocabulary/redaction/caps; no new mirrored file; stdin avoids Windows argv quoting. The jsonl append is already race-free, so the inbox added nothing |
| Rename `decision.suppressReason` → `surfaceReason` | Kept `suppressReason`, **added** `surfaceDecision` | The rename touched ~10 existing test assertions for zero functional gain. `suppressReason` is now documented as a routing field |
| Move the cleanup offer to the turn **after** the DIAG | Offer still rides the verdict; **the unjudged-finding guard** is what protects evidence | Deferring the offer would make it surface standalone on a later turn — which the existing design deliberately forbids. The guard is strictly stronger: even `purge-inactive --all` cannot delete an un-diagnosed finding |
| Protect any session holding ≥1 observation | Protect only a **routing-class** observation, an `attention` verdict, or a flagged span | With capture-everything, an ordinary session records `harness_noise`; protecting on that would pin every artifact forever and quietly disable the 24 h age-cap — trading one failure mode for another |
| — | The degradation-marker scan **skips search/read ops**, and covers **stderr** as well as stdout | This repo's own sources contain the literal marker text, so scanning a `Read` result manufactured a false `self_reported_fallback`; and `discover-tracker.mjs` prints its fallback notice to *stderr*, so stdout-only would have missed the single most important instance |

Not yet done (P2, deferred as planned): `sawProduced`-gated `silent_suspect`, operator-dissatisfaction
signals, per-skill phase markers, extending `upstream-reduce` to observations.

Two acceptance tests remain **operator-run** because they need a live deployment: the end-to-end
`/project-init --check` against the Azure org (§8a — the deterministic equivalent is locked down by
the `reference defect` unit test), and confirming one `finalize` per Stop after the duplicate-hook
removal (§8h — `.claude/settings.json` changes take effect on the next session).

## 10. What I inferred vs what the code does

Everything in §2 is quoted from the source with line numbers. Three items are *inferences*, marked as such: (i) that the reference run's `sawExpected` was satisfied by the readiness table specifically — the mechanism at `:210`/`:821` is certain, the exact matching substring in that run is not, since its artifacts were already purged from the fixture directory; (ii) that the double `finalize` records with divergent counters are caused by the two registrations — the two registrations and the divergent records are both facts, the causal link is a strong inference; (iii) hook-event availability, per open question 1. Where the code's own comments already anticipate a gap I treated that as evidence the gap is known-but-unclosed, not as a counter-argument — notably `:1045-1048` ("a 👎 is the documented PRIMARY detector of SILENT failures", i.e. the system's own design admits its heuristics cannot see a task done wrong with no error), `:196-203` (developer skills are "sidechain-invisible", a DEFENSIVE fallback only), and `:399-401` (over-crediting `sawExpected` "only avoids a false flag" — true in isolation, and the mechanism by which the reference run certified itself).
