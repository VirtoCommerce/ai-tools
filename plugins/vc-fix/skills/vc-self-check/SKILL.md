---
name: vc-self-check
description: On-demand self-diagnostician orchestrator for the vc-fix plugin (Tier 2 of the client→vendor feedback loop). It SPAWNS the `self-check-diagnostician` subagent to read this session's telemetry jsonl + transcript + the skill-expectations oracle and return a validated finding STRUCT — the oracle, jsonl and transcript never enter the main conversation. The orchestrator then relays a SHORT summary (the exact fields that would be sent), and if ≥1 finding is BROKEN/DEGRADED asks ONE binary AskUserQuestion — file the issue(s) in Virto, yes/no — and on yes spawns the `self-check-deliverer` subagent to run the delivery. The one question is the ONLY operator interaction; a yes means 'publish whatever is appropriate, decide the form yourself' and the agent never asks again. It writes NO local report files (no DIAG-*.md/.json, no DELIVERY-*.md), never modifies the install, and never sends anything without an explicit yes (or a hand-set feedback.mode:auto). Plugin-wide (every vc-fix skill/command/agent), so NOT qa-prefixed. Runs from the end-of-turn tail-trigger (silent, no modal) when a span was flagged or a 👎 was recorded, or when the user runs /vc-self-check directly. Recursion/re-nag is prevented by the collector dropping vc-self-check + self-check-diagnostician spans + per-signature dedup + the selfCheckSeen guard.
argument-hint: "[latest | <session-id>] | deliver"
---

# /vc-self-check — vc-fix Self-Diagnostician (Tier 2) — ORCHESTRATION CONTRACT

This skill is an **orchestrator**. It does not analyse telemetry inline and it does not send inline.
It spawns the `self-check-diagnostician` subagent ([`agents/self-check-diagnostician.md`](../../agents/self-check-diagnostician.md)),
receives its validated finding struct, discloses it, asks the operator's one yes/no, and — on yes —
spawns the `self-check-deliverer` subagent ([`agents/self-check-deliverer.md`](../../agents/self-check-deliverer.md))
which drives [`deliver.mjs`](./deliver.mjs). The passive Tier-0 collector
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
- **The consent MUST be an actual `AskUserQuestion` TOOL CALL — never a prose "yes/no" typed into
  chat.** Emit the disclosure as text, then STOP and call the `AskUserQuestion` tool with a single
  binary question ("File the issue(s) in Virto?" → **Yes** / **No**). A question typed as plain prose
  (e.g. `File the issue(s) in Virto? (yes / no)`) does NOT count — it doesn't render the interactive
  form, is easy to miss, and does not gate delivery. If `AskUserQuestion` is unavailable (a headless /
  non-interactive run), do NOT fall back to a prose question: report the plan and stop (or rely on
  `feedback.mode: auto`). The disclosure text and the tool call are two separate steps.
- **The binary AskUserQuestion is the ONLY operator interaction in the delivery path, and a yes ends
  it.** After the operator says yes you MUST NOT ask again for ANY reason — the yes means *"publish
  whatever is appropriate, decide the form yourself"*. In particular, NEVER ask any of these (each is
  the agent's own deterministic decision, taken by the `self-check-deliverer`, not the operator's):
  - which route to take (new issue vs a comment on a deduped match) — see A3/Step 3;
  - whether to supplement an existing issue whose body lacks the evidence — YES, always (B1);
  - what to do when the boundary validator dropped a field — send what passed, note it in one clause
    of the result line (B3), never a question;
  - whether to keep or purge the session's telemetry — automatic (A4/Step 3), never a question.
- **The validator is the ONLY gateway (B3 — HARD PROHIBITION).** No agent, subagent, or skill may
  hand-author, edit, or "top up" an upstream issue/comment body to work around a validator denial.
  The only outbound bytes are the ones `deliver.mjs` composes from the closed-schema struct + the
  vendor-provenance channel. If content is still dropped after B1/B2, send what passed and note the
  omission — do not reach for `mcp__github__*` / `gh` / a raw body to add it back.
- **One info line + at most ONE question per turn.** The question, when asked, is the single binary
  *file the issue(s) in Virto — yes/no*. There is never a second question. No cleanup prompt (the
  24 h age-cap reclaims leftovers unprompted).
- **Never diagnose its own invocation.** The collector drops `vc-self-check` and
  `self-check-diagnostician` spans/observations; the subagent drops them again (belt and braces).
- **English only**; never print a secret.

---

## Flow

**The orchestrator has exactly four jobs (C2):** (1) spawn the diagnostician and receive its struct;
(2) relay the SHORT roll-up + disclosure and, if a routable finding exists, ask the ONE binary
question; (3) on yes, spawn the `self-check-deliverer` subagent with the struct; (4) print the
deliverer's one result line. It does NOT do dedup, route selection, body composition, the leak scan,
sending, or telemetry retention inline — those belong to `deliver.mjs`, driven by the deliverer, so
the dedup output and the issue/comment bodies never enter the main conversation.

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

### Step 2 — Relay the roll-up + disclosure (shown ONCE, before the question)

The subagent's output is invisible to the operator, so restate it — briefly, and **exactly once**.
Render the roll-up table + **exactly the fields that would be sent**, one finding per line, because
this is the only disclosure the operator gets before consenting. It is shown here, before the
question, and **never restated after delivery** (D2):

```
vc-fix self-check: 1 BROKEN, 1 DEGRADED (session <sid>, plugin 0.8.2)
• S1 qa-bug/ado_create_workitem (BROKEN) — HTTP_4XX at discover-tracker.mjs:232
    offending literal `$expand=all`; fix: drop $expand=Properties, request the valid enum member
    vendor: HTTP 400
• S2 qa-bug/admin_credential_handoff (DEGRADED) — permission_denied handoff gap
```

To compute the plan for disclosure, run `deliver.mjs` in its **dry** mode (it sends NOTHING) and read
only what you need — the dedup split and the normalized string fields — without dumping the plan JSON
into chat.

**Pass the struct via `--input <file>`, NEVER a `<json> | node …` pipe.** Write the validated struct
to a scratch file first, then run a plain command. The piped-stdin form is rejected by Claude Code's
auto-mode permission classifier **before the script runs** (a pipe feeding data into an interpreter
reads as arbitrary execution) and, being a pipeline, is not cleanly allowlistable — so a consented
delivery silently never happens in auto mode. A plain `node deliver.mjs --input <file>` is both
classifier-friendlier and narrowly allowlistable.

```bash
# write the struct to a scratch file (once), then run WITHOUT a pipe:
node "$pluginRoot/skills/vc-self-check/deliver.mjs" --input "<outputRoot>/.vc-fix/diagnostics/<sid>.deliver-input.json" --session <sid> --json
```

**Enumerate every possible OUTCOME the yes covers**, in this order — so the consent genuinely covers
what follows. Do NOT describe the plan as "one issue per finding"; that phrasing is what made the
real outcome (3 comments on 1 legacy issue) read as a deviation from consent:

1. one **new Issue** per genuinely new finding;
2. for an **already-reported** finding (an **open** dedup match), a **comment on the existing issue
   carrying the SAME evidence** the issue would — the `## Where` block, never a bare counter;
3. **dedup is OPEN-only (VCST-5582):** a defect whose only prior issue is **closed** is NOT a match —
   a closed issue is not proof the bug is gone, so a recurrence is filed as a **new** issue, not
   swallowed as "already fixed";
4. the session's **telemetry is purged** after a fully successful delivery (partial/failed keeps it).

State the dedup split verbatim from the dry plan's `summary`, e.g.
`1 already reported (#173 open), 2 new`. If a finding carries a
`vendorErrorMessage`, show the **normalized** value (the dry plan's `struct.findings[]` holds the
post-validation string) **verbatim** on its line — that is the §6b informed-consent disclosure; if
you cannot show it, it is not sent.

### Step 3 — The ONE question, then hand off to the deliverer (no more interaction)

Decide by `feedback.mode` (read from `project-profile.json`, default `ask`):

| mode | what the orchestrator does |
|---|---|
| **off** | No question, no send. Report the plan, note delivery is disabled, stop. |
| **auto** | No question — the operator consented at onboarding. Spawn the deliverer and print its line. |
| **ask** (default) | If ≥1 finding is BROKEN/DEGRADED and any has `plan: file` or `plan: comment`, call the **`AskUserQuestion` TOOL** (the interactive form — NOT a prose "yes/no" in chat; see Hard invariants) with ONE binary question: *"File these in the VirtoCommerce plugin repo?"* — **Yes** / **No**. There is no third option — Step 2 already showed what would be sent. |

- **Already offered this session?** If every finding's record in `state.json` is already `sent`/
  `declined` (the dry run wrote `pending` for anything new), stay silent — do not re-ask.
- **Yes** → **spawn the `self-check-deliverer` subagent** (Task tool,
  `subagent_type: "self-check-deliverer"`), passing it the finding struct, the `<sid>`, `outputRoot`,
  and the fact of the yes. It owns dedup, **deterministic route selection** (below), body
  composition, the leak scan, sending, and telemetry retention — and it asks nothing. Print its ONE
  result line (Step-4/D1). Do **not** run `--confirm` inline and do **not** re-ask anything, whatever
  the deliverer reports (a dropped field, a legacy-issue comment, a purge) — those are all covered by
  the yes (see the Hard-invariants forbidden-follow-ups list).
- **No** → nothing sent; `deliver` recorded `declined`, so it will not re-ask this session.

**Route selection is deterministic, decided by the deliverer, and never narrated before acting (A3):**

| dedup state | route |
|---|---|
| no OPEN match (incl. a closed prior issue) | file a new issue |
| open match | comment with full evidence (the `## Where` block) |

Dedup is **OPEN-only** — a closed prior issue is ignored, so a recurrence files a new issue.

**Telemetry retention is automatic and never asked (A4):** a fully successful delivery purges this
session (`<sid>.jsonl` + `<sid>.state.json`); a partial/failed one keeps it, and the deliverer says
so in one clause of the result line.

### Step 4 — The result line (post-delivery output is ONE line — D1)

Print the deliverer's single line verbatim: what was filed, what was commented (with links), and the
retention clause — **no tables, no restated roll-up** (Step 2 already showed it). Expand to a few
lines **only** when delivery PARTIALLY FAILED (which finding failed, and that its telemetry was kept
for retry). Example:

```
filed #212 (project-init/tracker_field_contract), +1 on #174 (qa-bug/ado_create_workitem, evidence attached); telemetry purged.
```

For a session with no delivery:

- Clean session (`findings: []`, no 👎): `vc-fix self-check: no plugin issues detected`.
- Observations recorded but none routed to a finding: the collector's own line already says
  `no blocking issues — N observation(s) recorded`; do not contradict it.

A turn emits ONE info line + at most ONE question. Never a second question, never a cleanup prompt.

---

## The deliver step (consent-gated) — contribute upstream

[`deliver.mjs`](./deliver.mjs) turns the finding struct (passed via **`--input <file>`**, never a
pipe — see the auto-mode note in Step 2) into GitHub Issues on `VirtoCommerce/vc-mcp-testing-module`.
On the interactive path the orchestrator does NOT run `--confirm` itself — after the one yes it spawns
the [`self-check-deliverer`](../../agents/self-check-deliverer.md) subagent, which writes the struct to
a scratch file and runs `deliver.mjs --input <file> --confirm` off the main thread (so dedup output +
issue/comment bodies never enter the conversation) and returns one line. `deliver.mjs` is still invoked
directly for the dry disclosure plan (Step 2) and as `/vc-self-check deliver`.

**The validator is the only gateway (B3).** Neither the orchestrator, the deliverer, nor any skill
may hand-author or edit an upstream body to route around a validator denial. The only outbound bytes
are what `deliver.mjs` composes from the closed-schema struct + the vendor-provenance channel
([`upstream-reduce.mjs`](./upstream-reduce.mjs)). If a field is still dropped after B1/B2, the
deliverer sends what passed and notes the omission in one clause of its result line — it never falls
back to `mcp__github__*` / `gh` / a raw body to add it back.

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

**One issue PER FINDING; dedup on `(skill, subject)` against OPEN issues only (VCST-5582).** A closed
prior issue is NOT a dedup match — a closed issue is not proof the defect is gone, so a recurrence
files a NEW issue instead of being swallowed as "already fixed". Defect
identity is exactly `(skill, subject)` (`findingKey`) — severity, verdict, outcome, errorCode and
counts are per-session judgements about the same bug and MUST NOT enter the key. That divergence is
why two sessions filed #173 and #174 for one `project-init/tracker_field_contract` defect
(`S2/UNKNOWN` vs `S1/HTTP_4XX`). Per finding:

- **Open match** → `+1 occurrence` comment (session count, plugin version, severity now) that
  **carries the same `## Where` evidence the issue body has** (location, code excerpt, offending
  literal, vendor identity, proposed fix) whenever the target issue does not already have it —
  matched on `WHERE_MARKER` + a content hash, so a legacy/evidence-less issue (#174) gets full detail
  on the FIRST comment and repeat occurrences stay a short counter (B1). If the new severity is
  higher, the comment says so and the issue title's verdict is upgraded.
- **No OPEN match** (no match at all, OR the only prior issue is CLOSED) → file it, embedding a
  searchable marker `<!-- vc-fix-finding: <skill>/<subject> -->`. A closed prior issue is ignored, so
  a recurrence surfaces as a fresh issue.
- **Legacy bridge:** #173/#174 are bundled issues with no per-finding marker, so the search ALSO
  matches `<skill>/<subject>` as text in the title/body (OPEN only) — else the first run refiles
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
