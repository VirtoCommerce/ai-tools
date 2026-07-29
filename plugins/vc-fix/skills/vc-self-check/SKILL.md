---
name: vc-self-check
description: On-demand self-diagnostician orchestrator for the vc-fix plugin (Tier 2 of the client→vendor feedback loop). It SPAWNS the `self-check-diagnostician` subagent to read this session's telemetry jsonl + transcript + the skill-expectations oracle and return a validated finding STRUCT — the oracle, jsonl and transcript never enter the main conversation. The orchestrator then relays a SHORT summary (the exact fields that would be sent), and if ≥1 finding is BROKEN/DEGRADED asks ONE binary AskUserQuestion — file the issue(s) in Virto, yes/no — before piping the struct to `deliver.mjs`. It writes NO local report files (no DIAG-*.md/.json, no DELIVERY-*.md), never modifies the install, and never sends anything without an explicit yes (or a hand-set feedback.mode:auto). Plugin-wide (every vc-fix skill/command/agent), so NOT qa-prefixed. Runs from the end-of-turn tail-trigger (silent, no modal) when a span was flagged or a 👎 was recorded, or when the user runs /vc-self-check directly. Recursion/re-nag is prevented by the collector dropping vc-self-check + self-check-diagnostician spans + per-signature dedup + the selfCheckSeen guard.
argument-hint: "[latest | <session-id>] | deliver"
---

# /vc-self-check — vc-fix Self-Diagnostician (Tier 2) — ORCHESTRATION CONTRACT

This skill is an **orchestrator**. It does not analyse telemetry inline. It spawns the
`self-check-diagnostician` subagent ([`agents/self-check-diagnostician.md`](../../agents/self-check-diagnostician.md)),
receives its validated finding struct, discloses it, and — with the operator's one yes/no — hands it
to [`deliver.mjs`](./deliver.mjs). The passive Tier-0 collector
([`hooks/session-telemetry.mjs`](../../hooks/session-telemetry.mjs)) records *what happened* as spans
and `type:"obs"` observations and assigns **no** severity; the subagent assigns it, judged against
the oracle ([`knowledge/diagnostics/skill-expectations.md`](../../knowledge/diagnostics/skill-expectations.md)).

**Why a subagent (PR #172 item 1).** Diagnosis reads the whole session jsonl, the transcript, and a
long oracle. Doing that inline floods the main conversation with material the operator never needs.
The subagent keeps all of it out of context and returns only a compact struct. It also cannot ask
questions — only the orchestrator can — so the "one question per turn" rule is structural, not a
convention.

**No local report artifacts (PR #172 item 2).** `DIAG-*.md`, `DIAG-*.json` and `DELIVERY-*.md` are
**gone** — none are written, none are read. The only persistence is a compact per-finding record in
the session's own `state.json` (`selfCheckFindings[]`), written by `deliver.mjs`, which is what stops
re-asking about a defect already declined and lets a failed send be retried.

---

## Hard invariants

- **Read-only w.r.t. the plugin install.** NEVER modify installed plugin files. The "proposed fix"
  is a written recommendation, not an applied edit.
- **Nothing leaves the machine without an explicit yes.** The diagnose flow makes no PR, no issue,
  no tracker write. `deliver.mjs` sends only on `--confirm` (the operator's yes) or the hand-set
  `feedback.mode: auto`. `feedback.mode: off` ⇒ no question, no send.
- **The subagent's output is not user-visible.** The orchestrator MUST restate it in chat — that
  restatement, showing the exact fields that would be sent, is the disclosure surface (it replaces
  the old "Show what would be sent" option).
- **One info line + at most ONE question per turn.** The question, when asked, is the single binary
  *file the issue(s) in Virto — yes/no*. There is never a second question. No cleanup prompt (the
  24 h age-cap reclaims leftovers unprompted).
- **Never diagnose its own invocation.** The collector drops `vc-self-check` and
  `self-check-diagnostician` spans/observations; the subagent drops them again (belt and braces).
- **English only**; never print a secret.

---

## Flow

### Step 1 — Spawn the diagnostician (do NOT analyse inline)

Immediately spawn the subagent with the **Task tool**, `subagent_type: "self-check-diagnostician"`.
Pass it: the session id (`latest` or the `<session-id>` arg) and `outputRoot`
(`VC_FIX_HOME || cwd`). Do not read the jsonl, the transcript, or the oracle yourself — that is the
whole point of the subagent.

It returns a JSON finding struct (schema v3): `{ sessionId, pluginVersion, nodeVersion, os,
feedback, sessionCount, findings[] }`. Each finding carries the enum verdict fields plus the v3
provenance fields (`pluginFile`/`pluginLine`/`codeExcerpt`/`offendingLiteral`/`apiShape`/
`proposedFix` + the vendor error identity). If it returns `findings: []` and no 👎, this was a clean
session — print the one clean info line (§Step 4) and stop.

### Step 2 — Relay a SHORT summary (the disclosure surface)

The subagent's output is invisible to the operator, so restate it — briefly. Render **exactly the
fields that would be sent**, one finding per line, because this is the only disclosure the operator
gets before consenting:

```
vc-fix self-check: 1 BROKEN, 1 DEGRADED (session <sid>, plugin 0.8.2)
• S1 qa-bug/ado_create_workitem (BROKEN) — HTTP_4XX at discover-tracker.mjs:232
    offending literal `$expand=Properties`; fix: drop it, request ?api-version=7.1
    vendor: HTTP 400
• S2 qa-bug/admin_credential_handoff (DEGRADED) — permission_denied handoff gap
```

If a finding carries a `vendorErrorMessage`, show the **normalized** message string **verbatim** on
its line — that is the informed-consent disclosure for §6b, and if you cannot show it you must not
send it. (To get the normalized value, run the dry plan in Step 3 first — its JSON `struct.findings[]`
holds the post-validation `vendorErrorMessage`, i.e. exactly what would travel.)

### Step 3 — The delivery plan + the ONE question

Run `deliver.mjs` in its **dry** mode to compute the plan (it sends nothing):

```bash
echo '<the finding struct JSON>' | node "$pluginRoot/skills/vc-self-check/deliver.mjs" --session <sid> --json
```

The plan's `findings[]` each carry a `plan`: `file` (new), `comment` (an OPEN issue already tracks
`skill/subject` → +1 occurrence), or `already-fixed` (a CLOSED issue tracks it → the defect is fixed
upstream; upgrade, don't refile). Its `summary` states the split, e.g.
`2 already reported (#173 open, #119 closed/fixed), 2 new`. Relay that split verbatim — it is the
whole point of per-finding dedup.

Then decide the question by `feedback.mode` (read from `project-profile.json`, default `ask`):

| mode | what the orchestrator does |
|---|---|
| **off** | No question, no send. Report the plan, note delivery is disabled, stop. |
| **auto** | No question — the operator consented at onboarding. Re-run with `--confirm` and report the filed/commented result. |
| **ask** (default) | If ≥1 finding is BROKEN/DEGRADED and any has `plan: file` or `plan: comment`, ask **ONE** `AskUserQuestion`: *"File these in the VirtoCommerce plugin repo?"* — **Yes** (file the new issue(s) + add the occurrence comment(s)) / **No** (nothing sent; the local telemetry stays). There is no third option — the disclosure in Step 2 already showed what would be sent. |

- **Already offered this session?** If every finding's record in `state.json` is already `sent`/
  `declined` (the dry run wrote `pending` for anything new), stay silent — do not re-ask.
- **Yes** → re-run the exact same pipe **with `--confirm`**. Report each result: `filed #N (url)`,
  `+1 occurrence on #N (url)` (with an escalation note if the severity grew), or `already fixed in
  #N — upgrade`. On a successful send the session's telemetry is auto-purged (unless `--keep`).
- **No** → nothing sent; `deliver` recorded `declined`, so it will not re-ask this session.
- **`already-fixed` findings** never need the question — report them as "already fixed upstream
  (#N), upgrade the plugin" regardless of the answer.

### Step 4 — The clean / no-blocking line

- Clean session (`findings: []`, no 👎): `vc-fix self-check: no plugin issues detected`.
- Observations recorded but none routed to a finding: the collector's own line already says
  `no blocking issues — N observation(s) recorded`; do not contradict it.

Print ONE info line + at most ONE question. Never a cleanup prompt.

---

## The deliver step (consent-gated) — contribute upstream

[`deliver.mjs`](./deliver.mjs) turns the finding struct on **stdin** into GitHub Issues on
`VirtoCommerce/vc-mcp-testing-module`. Invoked by Step 3, or directly as `/vc-self-check deliver`.

```
<struct.json  node deliver.mjs [--session <sid>] [--confirm] [--dry] [--as issue|local]
                               [--assert-nonempty] [--keep] [--json]
node deliver.mjs --batch  [--confirm] [--json]      # consolidate the state.json records
node deliver.mjs --purge  --session <sid> [--json]  # clear this session's telemetry
node deliver.mjs --backfill [--json]                # one-off: mark legacy bundled issues
```

- **Input is a struct on stdin**, not a report path. The old `--diag <path>` + markdown/regex
  recovery is gone (item 1): `deliver` re-derives nothing from prose.
- **`--assert-nonempty`** (implies `--dry`, no network) is the information-free-payload gate: exits
  **3** when a struct with a BROKEN/DEGRADED finding would carry nothing identifying (all `other` /
  `none` / `UNKNOWN` with no provenance).
- **`--batch`** consolidates the compact `selfCheckFindings[]` records still `pending` across all
  sessions' `state.json` into one delivery pass (thinner than an interactive run — the batch record
  carries no provenance). `--purge` clears a session's telemetry + records.

**One issue PER FINDING; dedup on `(skill, subject)` against open AND closed (item 3).** Defect
identity is exactly `(skill, subject)` (`findingKey`) — severity, verdict, outcome, errorCode and
counts are per-session judgements about the same bug and MUST NOT enter the key. That divergence is
why two sessions filed #173 and #174 for one `project-init/tracker_field_contract` defect
(`S2/UNKNOWN` vs `S1/HTTP_4XX`). Per finding:

- **Open match** → `+1 occurrence` comment (session count, plugin version, severity now). If the new
  severity is higher, the comment says so and the issue title's verdict is upgraded.
- **Closed match** → the defect is already FIXED upstream — reported to the operator with the issue
  number (and release if known); the remedy is an upgrade, not a refile.
- **No match** → file it, embedding a searchable marker `<!-- vc-fix-finding: <skill>/<subject> -->`.
- **Legacy bridge:** #173/#174 are bundled issues with no per-finding marker, so the search ALSO
  matches `<skill>/<subject>` as text in the title/body (`state: all`) — else the first run refiles
  everything they contain. `--backfill` adds per-finding marker comments to open bundled issues.

**Two routes only** (`issue` / `local`), by the GitHub token's real rights via
`../project-init/probe-lib.mjs`. There is no PR route — a self-check contribution is a telemetry
report, not a code change; the old `pr`/`fork-pr` hand-offs sent nothing. `--as pr` is rejected. A
transient probe failure is retried once (`probeWithRetry`).

**Consent is `feedback.mode`** (`project-profile.json`, default `ask`) — `off` never sends, `ask`
means the orchestrator's per-finding yes/no, `auto` files directly. `/project-init` no longer asks
this at onboarding (item 4); it defaults to `ask` and is hand-editable.

**Containment (§2a) — vendor-provenance + boundary validation (item 5).** The outbound artifact is
built from a validated `UpstreamSignal` struct
([`upstream-reduce.mjs`](./upstream-reduce.mjs); spec
[`../../knowledge/diagnostics/upstream-schema.md`](../../knowledge/diagnostics/upstream-schema.md);
ADR [`../../knowledge/diagnostics/adr-upstream-default-deny.md`](../../knowledge/diagnostics/adr-upstream-default-deny.md)).
Every enum field is closed-vocabulary. Every STRING field either **proves vendor provenance** (a
`codeExcerpt`/`offendingLiteral` must be a verbatim substring of the cited plugin file, re-read by
`deliver` at send time) or passes a boundary validator that **denies — never coerces** — anything
carrying a URL host, an absolute path, an email, a token-shaped run, a GUID, a value read from the
client's `.env.*` / `project-profile.json`, or a work-item field outside `System.*` /
`Microsoft.VSTS.*`. Work-item STATE names, custom work-item TYPES, and repo/org/project names never
travel; counts do. A vendor error MESSAGE, if present, is normalized to placeholders, denied on any
surviving client value, and the orchestrator discloses it verbatim before the send. `findingStructSig`
deliberately excludes every v3 string, so a line-number shift cannot fork an already-filed issue.

**Lifecycle — log → analyze → contribute → delete.** On a confirmed send (or a dedup already
upstream) the processed session's telemetry (`<sid>.jsonl` + `<sid>.state.json`) is removed; `--keep`
retains. `local` (nothing sent) deletes nothing.

---

## Notes

- **Decision trail.** Every `finalize` writes a `decision` object on the jsonl. Review with
  `grep '"type":"finalize"' <outputRoot>/.vc-fix/diagnostics/<sid>.jsonl`.
- **The visible line — THREE states.** A finding/routing observation → run this skill + report;
  observations but none routing → `no blocking issues — N observation(s) recorded`; a genuinely
  empty record → `no plugin issues detected` (silence with `VC_FIX_DIAG_LINE=off`).
- Verdict/severity semantics + the (signal × expectation) table live in the oracle — cite them.
- A `LOW`-confidence diagnosis is fine — say so; better an honest "unclear, here's the evidence"
  than a confident wrong fix.
