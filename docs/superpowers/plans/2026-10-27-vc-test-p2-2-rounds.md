# vc-test P2-2 — round N is a refresh: count, delta, append, re-run the bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/vc-test:qa-ticket` counts a ticket's rounds before any context and refuses a fourth. From round 2 it refreshes
instead of re-running: it fetches only what changed since the last round, appends a `## Round N` section without
asking, re-runs every prior in-scope bug's reproduction (`FIXED` / `NOT FIXED`) beside the delta's own risks, and closes
the round into a record the next round reads. Released as `vc-test` 0.8.0.

**Architecture:** One new module, `plugins/vc-test/lib/rounds.mjs`, with four pure cores behind one CLI (`count`,
`delta`, `append`, `close`), the shape of `trace.mjs`. The fetch itself is not in `rounds.mjs`: it is
`/vc-test:ticket-context`'s `prepare --since <record>`, so the delta read inherits the bridge, the host-governed passes
and the scrubbing the full read already has. A round's facts persist in `<RUN_DIR>/rounds/round-<N>.json` plus a copy
of its bundle (B3); the prior bugs run as a second per-row template in the registry (`prior-bug`, rows `PB-n`), so
`plan-run`, `scenario-rows`, `trace` and the verdict see them like any other result row.

**Tech Stack:** Node 18+ ES modules, `node:test`; no new dependency.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — §3
(Rounds; Round N ≥ 2 is a refresh), §4 (`lib/rounds.mjs`), §10 P2, U15, B2, B3, D6, V9. Method:
`plugins/vc-test/skills/qa-test-strategy/rounds.md` (counting, the cap, what round N reads), `SKILL.md` §Reconcile,
`template.md`. P2 index and the P2-1 conventions this plan keeps: [`2026-10-26-vc-test-p2-1-scripts.md`](2026-10-26-vc-test-p2-1-scripts.md) §P2 is seven plans, §Global Constraints.

## Decisions this plan makes (the spec leaves them open — confirm at review)

| # | Question | Decision |
|---|---|---|
| P1 | Where does the delta fetch live? | `ticket-context`'s `cli.mjs prepare <KEY> --since <round record>`; `rounds.mjs delta` only computes over its output. Same connectors, bridge, host passes, scrub — no second fetcher |
| P2 | Where is a round's bug list read from? | `<RUN_DIR>/verdict.json`, written by the verdict agent beside `verdict.md` (Task 2). Prose is never parsed |
| P3 | A refresh finds the same build (no new commit, no new PR) | STOP: "round N−1 already tested this build" — a round is one build (rounds.md). Amending a closed round (D7) stays manual |
| P4 | How do the prior bugs run? | A registry template `prior-bug` (row `Prior bugs`), one `bug:PB-n` entry each, rows `PB-n`: its `.spec` through the runner where one exists, else its package's reproduction on a browser lane |
| P5 | Round N's ACs | Round N's checklist proves only the ACs a round-N risk cites; `trace.mjs` gets `--bundle` in round 1 only, so untouched ACs are not reported as rowless |
| P6 | A prior bug still failing | Not filed again: `verdict.json` carries it with `priorBug` and its original key; step 8 skips it |

## Global Constraints

- **No committed unit test** (CLAUDE.md §Essential Rules, NO CODE ⇒ NO UNIT TEST): every task's test is
  `scripts/unit/tmp-vc-test-<name>.test.mjs`, run red then green, deleted before its commit. The one exception:
  Task 5 adds a case to the already-committed `plugins/vc-test/lib/write-zones.test.mjs` (U10).
- **Exit codes**, as the other `lib/` CLIs: 0 OK, 1 usage or unreadable input, 2 a finding the command acts on (a
  fourth round, the same build), 3 not available (the bridge refused — the command falls back as stated).
- **Paths:** plugin files through `import.meta.url`; output through `outputRoot()` (`lib/paths.mjs`); every path a
  record stores is POSIX-relative to `outputRoot()`, so a round on another env or sprint folder resolves it.
- **Rounds count per ticket across stands** (rounds.md §What a round is): prior run folders come from
  `priorRunDirs({ ticket })` (`scripts/lib/run-dir.mjs`), never from the current env alone.
- **Round N−1's sections are never edited** by anything in this plan; `append` adds, `trace --write` touches only the
  last section (P2-1).
- **No raw diff or comment reaches the orchestrator** (B3, §8): it holds paths and the scripts' JSON summaries only.
- **The command body stays under BUDGET-004** (19,000 chars); the round-N branch is one section of call lines citing
  scripts and `rounds.md`.
- **Release:** `plugins/vc-test/.claude-plugin/plugin.json` → `0.8.0` (keep the "until P2" phrase: P2-5 has not
  landed), README rows for `rounds.mjs` and `prepare --since`; spec §10's P2 row says P2-2 done; after merge
  `claude plugin tag --push` from `plugins/vc-test/` (`docs/release-process.md` §Step 1, §Step 5a).
- `npm run context:check` and `npm test` green before the PR.

## Review Focus

1. **One round seen by two sources.** A `/qa-test-fast` round leaves a strategy section (`Build: vc-frontend#2568 @
   3f8af63a`) and a `summary.json` whose theme version is `2.61.0-pr-2568-3f8a-3f8af63a`; counted twice it would end
   the ticket a round early. Sources sharing a 7-hex prefix are one round. Test in Task 1.
2. **A verdict comment with no sha.** It is a round only when it was posted after the newest local round closed;
   otherwise it is that round's own comment. Test in Task 1.
3. **An interrupted round.** The last strategy section has an empty Reconciliation: that round resumes (`mode:
   "resume"`), it is not a new one and not counted as closed. Test in Task 1.
4. **A force-push.** The last tested sha is no longer an ancestor of the PR head: GitHub's compare answers
   `diverged`; the PR is `changed` with the full PR diff and `from: null`, never "unchanged". Test in Task 3.
5. **A prior bug with no reproduction.** No `.spec` and no package: its `PB` row is `BLOCKED — no reproduction
   recorded`, which caps the round below PASS as any blocked High would; never silently dropped. Test in Task 5.

---

### Task 1: `rounds.mjs count` — the round number, before any context

**Files:**
- Create: `plugins/vc-test/lib/rounds.mjs`
- Test (temporary): `scripts/unit/tmp-vc-test-rounds-count.test.mjs`

**Interfaces:**
- Consumes: `lastRound`, `block`, `rows` (`lib/strategy-artifacts.mjs`); `priorRunDirs` (`scripts/lib/run-dir.mjs`);
  Task 2's record shape (`rounds/round-<N>.json`) when present.
- Produces: `countRounds({ strategies, records, summaries, signals, now }) → { round, mode, closed, open, escalation }`
  - `strategies`: `[{ path, md }]`; `records`: `[{ path, json }]`; `summaries`: `[{ path, json, committedAt }]` (every
    git version, newest first); `signals`: the bundle's `signals[]` or `[]`.
  - A **closed round** is a strategy `## Round N` section whose `### Reconciliation` table has a row with a Result other
    than `—`, a record, or a summary; its `key` is the set of 7-hex prefixes found in its build text (the `Build:` line,
    the record's `build[].sha`, the summary's `build` JSON). Two closed rounds whose keys intersect are one; a source
    with no hex is keyed by its text.
  - A **verdict comment** is a signal whose `source` starts `comment:` and whose text starts with `QA Complete`,
    `PASS WITH NOTES`, `PASS` or `FAIL` (case-insensitive, after `#`/`*` markup). It joins a closed round its hex keys
    intersect; with no hex it is a new round only when its `@<created>` is after the newest closed round's date.
  - `closed`: `[{ n, build, date, verdict, sources }]` in date order; `open`: the last strategy section's N when its
    Reconciliation is empty, else `null`.
  - `mode`: `"cap"` when `closed.length ≥ 3` and `open` is null; `"resume"` when `open`; `"first"` when nothing is
    closed; else `"refresh"`. `round`: `open ?? closed.length + 1`.
  - `escalation` (mode `cap` only): `{ rounds: closed, failed: [{ n, items }], repeated: [text], to: "the developer, the
    PO and the QA lead" }` — `items` from each round's FAIL rows (Reconciliation R + risk text, or the record's bugs),
    `repeated` the risk sources or bug titles that failed in more than one round (rounds.md §At most three).
- CLI: `node lib/rounds.mjs count --key <KEY> [--run-dir <RUN_DIR>] [--bundle <bundle.json>]` — reads every
  `test-strategy.md`, `rounds/round-*.json` and `summary.json` under `priorRunDirs` plus `--run-dir`, and each
  summary's git versions (`git log --all --format=%H%x09%cI -- <path>`, `git show <sha>:<path>`) when the folder is in a
  work tree. Prints the result plus `strategy` (the newest `test-strategy.md` path, POSIX-relative) and `record` (the
  newest record path, or null). Exit 2 on `cap`, 0 otherwise, 1 usage.

- [ ] **Step 1: Write the failing test** — (a) nothing ⇒ `{ round: 1, mode: "first" }`; (b) a strategy with two
  reconciled sections (builds `@ 3f8af63a`, `@ bfe0b259`) and a summary whose theme is `2.61.0-pr-2568-bfe0-bfe0b259`
  ⇒ `closed.length === 2`, `round: 3`, `mode: "refresh"` (Review Focus 1); (c) the same plus a verdict signal
  `{ text: "FAIL — round 3", source: "comment:9@<after the last date>" }` ⇒ `mode: "cap"`, escalation `repeated`
  holds a risk source failing in rounds 1 and 2; a no-hex signal dated before the last round ⇒ still `refresh`
  (Review Focus 2); (d) a last section with an empty Reconciliation ⇒ `{ mode: "resume", round: <that N> }`
  (Review Focus 3); CRLF strategy text counts the same.
- [ ] **Step 2: Run it** — `node --test scripts/unit/tmp-vc-test-rounds-count.test.mjs`; expected FAIL.
- [ ] **Step 3: Implement** `countRounds` and the `count` CLI.
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Real run** — `node plugins/vc-test/lib/rounds.mjs count --key VCST-5903` prints `closed` of length 2
  and `round: 3`; `--key VCST-5904` prints `round: 2` (one prototype round). Record both outputs for the PR.
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): rounds.mjs count — the round number and the cap of three, before any context (P2-2)`.

### Task 2: the round's record — `verdict.json` and `rounds.mjs close` (B3)

**Files:**
- Modify: `plugins/vc-test/lib/rounds.mjs` (`closeRound`, the `close` CLI)
- Create: `plugins/vc-test/lib/verdict.schema.json`
- Modify: `plugins/vc-test/briefs/verdict.md` (Inputs: `ROUND`, `PRIOR_BUGS`; it also writes `verdict.json`)
- Modify: `plugins/vc-test/lib/artifacts.json` (`orchestrator.writes` + `<run>/verdict.json`, `<run>/rounds/**`)
- Test (temporary): `scripts/unit/tmp-vc-test-rounds-close.test.mjs`

**Interfaces:**
- Produces: `verdict.schema.json` — `{ verdict: "PASS" | "PASS WITH NOTES" | "FAIL" | "BLOCKED", bugs: [{ id: "B-<n>",
  severity: "Critical" | "High" | "Medium", scope: "in" | "out", title, rows: [row id], package: path | null, spec:
  path | null, priorBug: "PB-<n>" | null, key: string | null }] }`. Medium-or-worse only (Low is "Noticed"); paths
  POSIX-relative to `outputRoot()`; `key` is set only for a prior bug (P6).
- Produces: `closeRound({ round, strategyMd, verdict, filed, env, closedAt, bundlePath }) → record`:
  `{ round, env, closedAt, verdict, build: [{ repo, number, sha }], bugs: [...verdict.bugs with key from filed or
  their own], unresulted: [R ids whose Reconciliation Result is — or BLOCKED], bundle: "<rounds>/round-<N>.bundle.json" }`.
  `build` is parsed from the round's `Build:` line: every `<owner/repo or repo>#<n> @ <hex>` (first hex after `@`).
- CLI: `node lib/rounds.mjs close --key <KEY> --run-dir <RUN_DIR> --bundle <BUNDLE> [--filed B-1=VCST-7001,B-2=…]` —
  reads the last section of `<RUN_DIR>/test-strategy.md` and `<RUN_DIR>/verdict.json` (validated against the schema),
  writes `<RUN_DIR>/rounds/round-<N>.json` and copies `BUNDLE` to `round-<N>.bundle.json` beside it (skipped when
  `BUNDLE` is that file). Exit 0; 1 usage, a missing or invalid `verdict.json`, or no `## Round`; a `--filed` id with no
  bug is exit 1 naming it.

- [ ] **Step 1: Write the failing test** — a round-2 section with `Build: VirtoCommerce/vc-module-x#41 @ a1b2c3d4 ·
  vc-frontend#2568 @ bfe0b259 (product)` and a Reconciliation where R2 is `BLOCKED`, R4 `—`; a verdict with an in-scope
  High `B-1`, an out-of-scope Medium `B-2`, and a prior bug `B-3` (`priorBug: "PB-1"`, `key: "VCST-7001"`);
  `filed: { "B-1": "VCST-7100" }` ⇒ `build` has both PRs with their shas, `unresulted` is `["R2","R4"]`, `B-1.key` is
  `VCST-7100`, `B-3.key` stays `VCST-7001`; `filed` naming `B-9` throws; a `verdict.json` whose bug has `severity:
  "Low"` fails validation.
- [ ] **Step 2: Run it** — expected FAIL.
- [ ] **Step 3: Implement** `closeRound` and the CLI; the schema check is the same small validator `check-change-map.mjs`
  uses (reuse it, do not add a dependency).
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: `briefs/verdict.md`** gains: write `{RUN_DIR}/verdict.json` (schema path) with one entry per
  Medium-or-worse bug of `## Bugs`, `scope` from its in-scope/outside count (B16), its investigation package and the
  `.spec` that failed if the row has one; and, when `ROUND ≥ 2`, a `## Prior bugs` section after Bugs — every `PB-n`
  row with its key, `FIXED` / `NOT FIXED` / `BLOCKED`, and every out-of-scope bug of `PRIOR_BUGS` with its current
  status (B2). **A `NOT FIXED` prior bug makes the round FAIL** whatever its severity (spec §3, round N 4–5), and its
  `verdict.json` entry carries `priorBug` and its key.
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): rounds.mjs close — the round's record and its bundle copy; verdict.json (P2-2)`.

### Task 3: the delta fetch — `prepare <KEY> --since <record>` and a diff from a sha

**Files:**
- Modify: `plugins/vc-test/skills/ticket-context/lib/cli.mjs` (`prepare` takes `--since`)
- Modify: `plugins/vc-test/skills/ticket-context/lib/connectors/github.mjs` (`compareDiff`)
- Modify: `plugins/vc-test/skills/ticket-context/lib/connectors/azure-repos.mjs` (`diff` takes `{ from }`)
- Modify: `plugins/vc-test/skills/ticket-context/lib/github.mjs` (`collectPr` passes `from`)
- Modify: `plugins/vc-test/skills/ticket-context/SKILL.md` (Step 0: one paragraph, `--since`)
- Test (temporary): `scripts/unit/tmp-vc-test-prepare-since.test.mjs`

**Interfaces:**
- Consumes: Task 2's record (`build[]`, `closedAt`, `bugs[]`, `bundle`).
- Produces: `github.compareDiff(o, r, from, to) → { status: "ahead" | "diverged" | "identical" | "behind", diff: string }`
  — `gh api repos/{o}/{r}/compare/{from}...{to}` (status) and the same path with `Accept: application/vnd.github.diff`
  (both GET through `$VC_RUN`; `checkSha` on both shas). Azure: `diff(o, r, n, { from })` reads the base side at `from`
  instead of the merge base.
- Produces: `prepare <KEY> --since <record>` — reads the issue (the same fields and AC field resolution) and the PR
  ladder as today, and **skips** attachments, pages, Figma, linked issues and siblings. Per PR, against the record's
  `build[]`: head equal to the recorded sha ⇒ `{ ..., delta: "unchanged" }` with no diff; a recorded PR whose head
  moved ⇒ `collectPr` with the diff from the recorded sha (`delta: "changed", from: <sha>`), or the full PR diff with
  `from: null` when compare says `diverged` or `behind` (Review Focus 4); a PR not in the record ⇒ full `collectPr`,
  `delta: "new"`. `ticket.json` keeps only comments created after `closedAt`. Each out-of-scope bug's key in the
  record is read for its status (one read each; a failure is a gap, never a stop). `prepare.json` gains `delta: { since:
  <record path>, closed_at, comments: <n>, acceptance_changed: bool, bug_status: [{ key, status }] }`;
  `acceptance_changed` compares `fields.description` and `fields.acceptance` with the record's bundle copy. Never served
  from the cache and never cached. Exit codes as `prepare`'s (host-governed: the same `--raw` passes).

- [ ] **Step 1: Write the failing test** — drive `prepare --since` through its connector seams (the `run` stub the
  existing connector tests' shape takes): a record with `PR#41 @ aaa1111` and `PR#42 @ bbb2222`; the stub reports #41
  head `aaa1111`, #42 head `ccc3333` (compare `ahead`), a new #43, and comments created before and after `closedAt` ⇒
  #41 `unchanged` with `diff_path: null`, #42 `changed` `from: "bbb2222"` with the compare diff, #43 `new`; one comment
  kept; no attachment download was requested. Compare `diverged` for #42 ⇒ `from: null` and the PR diff.
- [ ] **Step 2: Run it** — expected FAIL.
- [ ] **Step 3: Implement** `compareDiff`, Azure's `from`, `collectPr`'s `from`, then `--since` in `prepare`.
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Real run** — write a record for VCST-5903 by hand with `vc-frontend#2568 @ 3f8af63a` and `closedAt`
  `2026-10-19T23:59:00Z`, then `node plugins/vc-test/skills/ticket-context/lib/cli.mjs prepare VCST-5903 --since <it>`:
  #2568 is `changed` from `3f8af63a`, its `diff.patch` is smaller than the PR's full diff, and `node … deploy --prepare
  <prepare_path>` reads the delta `prepare.json` unchanged (if it does not, make `deploy` read it in this task).
  Then `abort --prepare <path>`.
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): ticket-context prepare --since — the round-N delta fetch, diffs from the last tested sha (P2-2)`.

### Task 4: `rounds.mjs delta` and `append` — the refresh and the Round N section

**Files:**
- Modify: `plugins/vc-test/lib/rounds.mjs` (`deltaOf`, `appendRound`, the `delta` and `append` CLIs)
- Modify: `plugins/vc-test/skills/qa-test-strategy/template.md` (`### Prior bugs` after `### Scenarios`)
- Modify: `plugins/vc-test/skills/qa-test-strategy/lib/check-strategy.mjs` (clause 14)
- Modify: `plugins/vc-test/skills/qa-test-strategy/SKILL.md` (§Gate: clause 14, one line)
- Modify: `plugins/vc-test/skills/qa-test-strategy/rounds.md` (§Round N in vc-test: the record, the delta, P3)
- Modify: `plugins/vc-test/briefs/strategy.md` (§Round N ≥ 2)
- Test (temporary): `scripts/unit/tmp-vc-test-rounds-append.test.mjs`

**Interfaces:**
- Consumes: Task 2's records (all of them: prior bugs come from every round), Task 3's delta `prepare.json`.
- Produces: `deltaOf({ records, prepare }) → { round, since, sameBuild, prs: [{ repo, number, delta, from, to }],
  comments, acceptanceChanged, priorBugs: [{ pb, key, title, severity, foundIn, spec, package }], outOfScope: [{ key,
  status }], carried: [{ r, round }], dispatch: { ticket: bool, change: [ref] } }`.
  - `priorBugs`: every `scope: "in"` bug of every record, de-duplicated by `key` (else by `id@round`), numbered `PB-1…`
    in round then id order (B2: only the ticket's own bugs). `carried`: the newest record's `unresulted`.
  - `sameBuild`: no PR is `changed` or `new` (P3). `dispatch.ticket`: comments > 0 or `acceptanceChanged`;
    `dispatch.change`: the `changed` and `new` PRs.
  - The recount (spec §3: "recounted from the verdict comments"): round N has no new bundle, so `delta` runs Task 1's
    `countRounds` again with the kept comments as signals (`{ text: <first line>, source: "comment:<id>@<created>" }`)
    and returns its `mode` and `escalation`; `mode: "cap"` there is the same STOP.
- Produces: `appendRound({ strategyMd, delta, env, date, changeMapPath }) → string` — a new last section:
  `## Round <N> of 3 — <date>`; `Status: AUTO (round <N> refresh, U15) · Depth label: <N−1's>`; `Build:` from
  `delta.prs` (`repo#n @ to`); `Stand: <env>`; `Deployed:` left for the strategy agent; `Previous: Round <N−1>
  <verdict>, <its build>`; `Change map: <changeMapPath | none>`; `### Risks` = one row per carried risk (its N−1 row,
  Source `carried from Round <N−1> R-n`) and one per prior bug (`<title> is fixed, and nothing next to it broke`,
  Source its key, Level its severity); their `### Approach per risk` rows (carried: copied; a bug: `FLOW · REGRESSION`,
  oracle `{OBSERVED}` the bug's expected value, lane from the bug's proof); `### Prior bugs` = `| PB | Bug | Severity |
  Found | Reproduction | R |` (`spec <path>` or `package <path>` or `none`); `### Artifacts` copied from N−1 with the
  row `Prior bugs | RUN — <n> bugs` (or `SKIP — no prior bug`). Mission, Inputs, Out of scope, Data, Criteria are left
  as one `TBD — strategy agent` line each. Round N−1's text is byte-equal after it. A last section already numbered N ⇒
  unchanged (idempotent).
- Produces: clause 14 of `check-strategy.mjs`: round ≥ 2 ⇒ a `### Prior bugs` table; each PB row names an R of the round
  whose Level is not below the PB's Severity; no `TBD — strategy agent` line remains.
- CLI: `rounds.mjs delta --key <KEY> --run-dir <RUN_DIR> --prepare <delta prepare.json>` → writes `<WORK>/delta.json`,
  prints it; exit 2 on `sameBuild` (P3) or `mode: "cap"`. `rounds.mjs append --run-dir <RUN_DIR> --delta
  <WORK>/delta.json [--change-map <path>]` (round 1's map; absent — another env's `WORK` — ⇒ `Change map: none`) — when
  `<RUN_DIR>` has no `test-strategy.md`, the newest prior one is copied in first and the old folder's file gets the
  one-line pointer `Moved to <path> at Round <N>.` (rounds.md §Storage); exit 0, 1 usage.

- [ ] **Step 1: Write the failing test** — two records (round 1: in-scope High `B-1` key `VCST-7100`, out-of-scope
  `B-2` `VCST-7200`; round 2: `B-1` again as prior `PB-1`, a new in-scope Medium `B-3` with a `.spec`) and a delta
  prepare with one `changed` PR ⇒ `priorBugs` is `PB-1 VCST-7100`, `PB-2 B-3` (spec path kept), `outOfScope` holds
  `VCST-7200` with its status, `round: 3`; all PRs `unchanged` ⇒ `sameBuild: true`; a kept comment `PASS — build
  ddd4444` beside the two records ⇒ `mode: "cap"`. `appendRound` on a two-round file
  adds `## Round 3 of 3`, two bug risks with Level High and Medium and their PB rows; the first two sections are
  byte-equal; a second call returns the same text; `check-strategy` on the appended section with the TBD lines filled
  passes clause 14, and fails it when a PB row's R is Low.
- [ ] **Step 2: Run it** — expected FAIL.
- [ ] **Step 3: Implement** `deltaOf`, `appendRound`, clause 14, the two CLIs.
- [ ] **Step 4: Run it** — expected PASS.
- [ ] **Step 5: Docs** — `template.md` gains the `### Prior bugs` block (round ≥ 2 only; deleted in round 1);
  `rounds.md` gains §Round N in vc-test: the record and bundle copy (B3), `prepare --since`, the same-build STOP (P3),
  prior bugs from every round, out-of-scope bugs listed not re-run (B2); `briefs/strategy.md` gains §Round N ≥ 2: input
  `DELTA` (`delta.json`) and the TICKET/CHANGE outputs; fill only the `TBD` lines and **append** risks for what the
  delta names (a new PR, a changed AC, a new area) with their scenarios, and one class-fitting scenario per prior bug
  scoped to the fix's diff (`Why likely … · R<bug's risk>`); never edit a row `append` wrote or a round N−1 line; the
  gate (`check-strategy.mjs`, clauses with 14) must pass; in round 3 the Mission says it is the last and Out of scope
  is the ticket's residual risk (rounds.md §At most three); return as round 1 does, without the approval summary.
- [ ] **Step 6: Delete the temporary test, commit** — `feat(vc-test): rounds.mjs delta and append — round N's section without asking; Prior bugs in the strategy (P2-2)`.

### Task 5: the prior bugs run — `prior-bug` in the registry, `PB-n` rows everywhere

**Files:**
- Modify: `plugins/vc-test/lib/artifacts.json` (the `prior-bug` template)
- Modify: `plugins/vc-test/lib/strategy-artifacts.mjs` (`readStrategy` returns `priorBugs`)
- Modify: `plugins/vc-test/lib/plan-run.mjs` (instantiates `bug:PB-n`)
- Modify: `plugins/vc-test/lib/scenario-rows.mjs` (`--ids` takes `PB-n`)
- Modify: `plugins/vc-test/lib/trace.mjs` (`PB-n` is a result row)
- Modify: `plugins/vc-test/lib/write-zones.test.mjs` (committed: one case)
- Create: `plugins/vc-test/briefs/bug-rerun.md`
- Test (temporary): `scripts/unit/tmp-vc-test-prior-bugs.test.mjs`

**Interfaces:**
- Consumes: Task 4's `### Prior bugs` table.
- Produces: the registry entry `{ "id": "prior-bug", "row": "Prior bugs", "per": "prior-bug", "run": { "brief":
  "briefs/bug-rerun.md", "agent": "general-purpose", "model": "sonnet" }, "needs": [], "proofs": { "spec": { "lane":
  null, "requires": ["back-url"] }, "browser": { "lanes": [the scenario template's three], "requires": ["front-url"] } }, "writes": ["<run>/scenarios/PB-n.rows.md", "<run>/screenshots/**"] }`.
  A PB's proof: `spec` when its Reproduction names one, else `browser`; a reproduction of `none` is still dispatched
  (the agent writes the BLOCKED row — Review Focus 5).
- Produces: `readStrategy(md).priorBugs → [{ pb, key, severity, reproduction, r, proof }]`; `planRun` adds one entry
  `bug:PB-n` per row, in the **first** wave, lanes from the same ≤ 3 pool as the scenarios; the generic per-row
  instantiation now serves both templates (`per: "scenario"`, `per: "prior-bug"`) — one loop, not two copies.
- Produces: `scenario-rows.mjs merge --ids PB-1,…` takes from `scenarios/PB-n.rows.md` only `| PB-n |` rows; `trace.mjs`
  `ROW_ID` accepts `PB-\d+`, and a PB row is attributed by the `R<n>` in its Ref (`PB-1 · R3`).
- Produces: `briefs/bug-rerun.md` — inputs `PB`, `STRATEGY`, `KEY`, `RUN_DIR`, `LANE`, `CAPABILITIES`, the ledger brief;
  read the PB row and its risk; `spec` ⇒ `node "$VC_RUN" runner playwright <spec>`; `package` ⇒ follow its
  `root-cause.md` reproduction steps on `LANE` (3 attempts, as `vc-fix:qa-investigate`); write one row `| PB-n | PB-n ·
  R<k> | <what was done> | <expected> | <observed> | <Result> |` with Result `PASS — FIXED`, `FAIL <severity> — NOT FIXED:
  <observed>` or `BLOCKED — <why>` (`no reproduction recorded` when the row says `none`); no investigation, no bug.

- [ ] **Step 1: Write the failing test** — a round-2 strategy with two PB rows (one `spec`, one `none`) and one
  scenario ⇒ `planRun` puts `bug:PB-1` (no lane) and `bug:PB-2` (a browser lane) in wave 1 and keeps ≤ 3 browser lanes;
  `merge --ids PB-1` takes `| PB-1 |` and ignores a stray `| SC-1.1 |` in that file; `reconcile` gives the bug's risk
  `FAIL High` for `FAIL High — NOT FIXED: …` and `BLOCKED` for `BLOCKED — no reproduction recorded` with `capped: true`
  when that risk is High. In the committed `write-zones.test.mjs`: a run plan with `bug:PB-1` makes
  `<run>/scenarios/PB-1.rows.md` inside a zone.
- [ ] **Step 2: Run them** — `node --test scripts/unit/tmp-vc-test-prior-bugs.test.mjs plugins/vc-test/lib/write-zones.test.mjs`; expected FAIL.
- [ ] **Step 3: Implement** in the five modules and the registry; write the brief.
- [ ] **Step 4: Run them** — expected PASS.
- [ ] **Step 5: Delete the temporary test, commit** — `feat(vc-test): prior bugs re-run as PB rows — registry, plan, merge, trace, brief (P2-2)`.

### Task 6: wire the round into the command; release 0.8.0

**Files:**
- Modify: `plugins/vc-test/commands/qa-ticket.md` (step 0 counts; a `0b — Round N ≥ 2` section; steps 7 and 8)
- Modify: `plugins/vc-test/README.md`, `plugins/vc-test/.claude-plugin/plugin.json`
- Modify: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` (§10 P2 row: P2-2 done)

**Interfaces:**
- Consumes: every CLI above.

- [ ] **Step 1: Step 0** gains, after route: `node <plugin>/lib/rounds.mjs count --key <TICKET> --run-dir <RUN_DIR>` →
  `ROUND`, `MODE`. Exit 2 ⇒ STOP: print its `escalation` (rounds.md §At most three) — nothing else runs. `refresh` ⇒
  0b instead of steps 1–3. `resume` ⇒ steps as for that round, the approved section reused. After step 1 (round 1
  only): `count --bundle <BUNDLE>` again; exit 2 ⇒ the same STOP.
- [ ] **Step 2: `## 0b — Round N ≥ 2: refresh (U15)`** — no `/vc-test:ticket-context`, no change map, no scenarios agent,
  no human point 1:
  1. `node <ctx>/lib/cli.mjs prepare <TICKET> --since <record>` (host-governed: ticket-context's Step 0 passes) →
     `DELTA_PREPARE`; `node <plugin>/lib/rounds.mjs delta --key <TICKET> --run-dir <RUN_DIR> --prepare
     <DELTA_PREPARE>` → `DELTA`; exit 2 ⇒ `abort` the prepare, then STOP: `sameBuild` "Round <N−1> already tested
     this build" (P3), `cap` its escalation.
  2. Dispatch `vc-test:ticket-context-analyst` per `DELTA.dispatch` (TICKET; CHANGE per PR) with `PREPARE =
     DELTA_PREPARE`, then `save` / `merge-change` and `deploy --prepare` as ticket-context Steps 2 and 4. `NOT DEPLOYED`
     ⇒ BLOCKED on deploy, as step 1.
  3. `rounds.mjs append --run-dir <RUN_DIR> --delta <DELTA> --change-map <WORK>/change-map.json`; dispatch `strategy` (`opus`) with `DELTA`, the analysts'
     outputs, `BUNDLE` = the record's `bundle`, `CHANGE_MAP` = round 1's, `CAPABILITIES`, `RUN_DIR`. Gate fails twice
     ⇒ STOP. Then step 4.
- [ ] **Step 3: Steps 5, 7, 8** — step 5's waves also dispatch each `bug:PB-n` (its `run.agent`, brief, `PB`, `LANE`)
  and merge `PB-n` ids; step 7's `trace.mjs` gets `--bundle` in round 1 only (P5); the verdict gets `ROUND` and
  `PRIOR_BUGS` = `DELTA` (round ≥ 2); step 8 skips `/vc-fix:qa-bug` for a `verdict.json` bug with `priorBug` (P6), then
  `rounds.mjs close --key <TICKET> --run-dir <RUN_DIR> --bundle <BUNDLE> --filed <id=KEY,…>` before teardown.
- [ ] **Step 4: Budget** — `wc -c plugins/vc-test/commands/qa-ticket.md` ≤ 19,000; `npm run context:check` green.
- [ ] **Step 5: Release** — `plugin.json` `0.8.0`; README rows: `rounds.mjs` (count · delta · append · close) and
  `prepare --since`; spec §10 P2 row: "**P2-2 done** (vc-test 0.8.0: `rounds.mjs`, `prepare --since`, prior bugs as
  `PB` rows)".
- [ ] **Step 6: P2's check on round N** — `/vc-test:qa-ticket VCST-5903 --dry-run`: `count` says round 3, the refresh
  runs, `append` writes `## Round 3 of 3` with the round-2 bugs as PB rows, `plan-run` lists `bug:PB-n` in wave 1, and
  nothing is written outside the run folder and `.vc-fix/` (`write-zones.mjs check`). Revert the dry run's strategy
  section afterwards (`git checkout -- reports/tickets/Sprint26-21/VCST-5903/`). Record the output in the PR.
- [ ] **Step 7: `npm test` green, commit** — `release(vc-test): 0.8.0 — round N is a refresh: count, delta, append, prior bugs (vc-test P2-2)`.
