# vc-test P2-4 — the `vc-fix` bump: `qa-bug` from the investigation, `qa-checklist` Mode 5 with risk ids — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two changes to `vc-fix`, released as `vc-fix` 0.17.0 with its `vc-fix--v0.17.0` tag. `/vc-fix:qa-bug
--evidence <package>` writes the report from the `vc-fix:qa-investigate` package and nothing else: no reproduction,
no layer probe, no code search, no docs query (U50). `vc-fix:qa-checklist` gets the Mode 5 that so far exists only in
this repo's `.claude/` copy, with a `--from-strategy <test-strategy.md>` entry and a Ref that leads with the risk id
exactly as `trace.mjs` reads it.

**Architecture:** Prose and one new on-demand knowledge file; no code, so no unit test (NO CODE ⇒ NO UNIT TEST). The
`--evidence` procedure moves out of `commands/qa-bug.md` into `knowledge/execution/bug-from-package.md`; the command
keeps one pointer per step, and it ends smaller than its BUDGET-004 baseline. Mode 5 is ported from
`.claude/skills/qa-checklist/from-model.md` into the plugin with plugin-local paths, and both copies get the same
`--from-strategy` and Ref wording in one commit. The self-diagnostics oracle (`skill-expectations.md`, both copies)
learns the `--evidence` path, so the diagnostician stops calling a skipped Step 2 a defect and starts calling a
second investigation one. Each change is checked by a real run on recorded inputs.

**Tech Stack:** Markdown prompts; `npm run context:check` (BUDGET-004, dangling paths); `trace.mjs` and a temporary
script for the Mode 5 check; no new dependency.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) —
U50, U11, U25, U29, U56 (the `checklist-writer` loads skills), B20, §4 (the `vc-fix` row: "One `vc-fix` version bump
for three changes" — the third, the tracker CLIs' read commands, shipped in P1b as 0.14.0), §10 P2. P2 index and its
conventions: [`2026-10-26-vc-test-p2-1-scripts.md`](2026-10-26-vc-test-p2-1-scripts.md) §P2 is seven plans. Package
shape: `plugins/vc-fix/skills/qa-investigate/evidence-and-root-cause.md` (Part A = `evidence-index.md`, Part B =
`root-cause.md`). Today's Mode 5: `.claude/skills/qa-checklist/from-model.md`.

## What exists today

| | `.claude/` (this repo) | `plugins/vc-fix/` (what a client runs) |
|---|---|---|
| `qa-checklist` Mode 5 | `--from-model [--strategy <file>]`, `from-model.md`; Ref "leads with the `R-n`" | **absent** — Modes 1–4 only, and `disable-model-invocation: true`, so an agent cannot load the skill at all |
| `qa-bug --evidence <dir>` | — (plugin-only command) | Step 1 reads the package, but still reproduces on another build or a missing screenshot; Steps 0.2, 2 and 3 (Context7, 4-layer probe, `search_code`, App Insights) still run in full; Rules say "always complete the 4-layer validation" |
| who calls them | `/qa-test-fast` wave 3 (`--from-model --strategy`); `/qa-triage-results` and `/qa-run` (`qa-bug --evidence`) | vc-test's `briefs/checklist.md` (`--from-model --strategy`, "this run has no model"); `qa-ticket.md` step 8 (`qa-bug` with the package) |

## Decisions this plan makes (the spec leaves them open — confirm at review)

| # | Question | Decision |
|---|---|---|
| D1 | What does `--from-strategy` mean, given `.claude/` already has `--from-model --strategy`? | `--from-strategy <file>` is Mode 5 with the strategy as authority. The model is read only when the strategy's `Test model` Artifacts row says `RUN`. `--from-model --strategy <file>` stays as its old spelling in both copies, so `/qa-test-fast` and vc-test's brief keep working unchanged. `--from-model` alone is unchanged |
| D2 | How much of `.claude/`'s `qa-checklist` comes to the plugin? | Mode 5 only: `from-model.md`, its Mode 5 section, usage lines, argument hint, and the dropped `disable-model-invocation`. The other drift between the two copies (domain checklists 46 KB vs 70 KB, oracle wording) is not this plan's work |
| D3 | How is the risk id written in Ref? | As the strategy's `### Risks` table writes it: `R3`, never `R-3`. That is the form `trace.mjs` attributes by (`R<n>`). It always comes first: `R3 · S#4 · <node-id>`; an AC item is `AC-2 · R7`. `from-model.md`'s "`R-n`" prose becomes `R<n>` |
| D4 | What may `qa-bug --evidence` read and call? | It reads the package, Step 0's deployed versions, the duplicate check, and `fix-repos.json` + `module-suite-map.md` to spell the repo name. It never calls a browser tool, dispatches `qa-testing-expert`, runs `search_code` / `get_file_contents`, queries App Insights or Context7 |
| D5 | The package was made on a build other than the one deployed now | The build is compared on the owning repo's package (root-cause §2), or on every listed version when the package names no repo. A mismatch means **STOP for that bug**: `STALE_PACKAGE: <name> <package ver> ≠ <deployed ver> — re-run vc-fix:qa-investigate`. Never a re-reproduction (U50 replaces today's "reproduce when another build") |
| D6 | The package lacks a mandatory slot | **STOP for that bug**: `INCOMPLETE_PACKAGE: <slots>`. `qa-bug` never captures the missing artifact itself. The mandatory set is Part A's **M** rows (M\* only when root-cause §2 names a server-side layer) plus root-cause §1, §2, §5 (two rows) and §7 |
| D7 | Is a package's reproduction status checked? | No. The package carries none (`qa-investigate` returns `REPRODUCED` to its caller), and every caller already passes only reproduced bugs (`routing-and-fix.md`, `qa-run/waves.md`, vc-test step 8). LOW confidence is filed with routing confidence LOW and no repo |
| D8 | Where does the report go with `--evidence`? | `<package>/../bugs/<bucket>/` — `qa-investigate` writes the package at `<run folder>/evidence-<UTCstamp>/`, so this is the package's own run folder. Screenshots are **copied** from the package's `screenshots/` to `<bugs>/screenshots/<slug>/`; the package stays whole for `/qa-fix` |
| D9 | Severity, and the Medium-or-worse filter (U25, U50) | `qa-bug` grades the report from the package as it does today; no `--severity` flag. The Medium+ filter, and the ticket-related-Low exception, stay with the caller (vc-test step 6, triage), which decides what is handed over |
| D10 | Does P2-4 touch vc-test? | **No.** The old spelling keeps vc-test working. Its brief's switch to `--from-strategy` and its dependency `vc-fix >=0.17.0` go to P2-5, which needs P2-4 anyway. This keeps P2-4 off `plugins/vc-test/.claude-plugin/plugin.json`, which P2-3 bumps in parallel |
| D11 | `commands/qa-bug.md` is 47,776 chars, baselined, and may only shrink | The procedure lives in `knowledge/execution/bug-from-package.md`. Step 2's "Screenshots — RELATIVE filenames" box restates `skills/qa-evidence/output-paths.md` §How a browser screenshot reaches its permanent path; it becomes one line citing that file. That pays for the pointers |

## Global Constraints

- **No unit test** (CLAUDE.md §Essential Rules, NO CODE ⇒ NO UNIT TEST): this plan ships prose. Task 1's check script
  is `scripts/unit/tmp-vc-fix-mode5-refs.mjs`, run and deleted before its commit; nothing under `scripts/unit/` is
  committed.
- **vc-fix is self-contained** (`plugins/CLAUDE.md`): a plugin file cites only plugin paths — never `.claude/…`,
  `rules/test-data.md`, `run-output.md` or `npm run …` scripts the plugin does not ship. Plugin paths: `pluginRoot()` for
  plugin files, `outputRoot()` for the project's (`plugins/CLAUDE.md` §paths).
- **Mirrors change in the same commit:** `qa-checklist` (`SKILL.md`, `from-model.md`) and
  `knowledge/diagnostics/skill-expectations.md` exist in both `plugins/vc-fix/` and `.claude/`; each task edits both.
  `qa-investigate`'s "Run ahead of `/vc-fix:qa-bug`" bullet exists only in the plugin copy, so only that copy changes.
- **BUDGET-004** (19,000 chars of body, `npm run context:check`): `commands/qa-bug.md` ends **below** its baseline
  (47,776), recorded with `npm run context:check:baseline`; both `qa-checklist/SKILL.md` stay under 19,000 (the
  procedure is in `from-model.md`, a supporting file). The `.claude/` one's body is 18,608 chars today, so its edit
  adds at most ~350 net; the plugin one is 16,188 and takes the Mode 5 section.
- **Callers keep working:** `--from-model --strategy <file>` and `qa-bug --evidence <dir> [--link] [--confirmed]` keep
  their meaning for `/qa-test-fast`, `/qa-triage-results`, `/qa-run` and vc-test.
- **U11 unchanged:** `qa-bug` keeps its own "Create a bug-tracker ticket?" question; `--evidence` does not imply
  `--confirmed`.
- **Release:** `plugins/vc-fix/.claude-plugin/plugin.json` → `0.17.0` (component counts unchanged: 16 skills, 7
  commands, 10 agents; `from-model.md` and `bug-from-package.md` are supporting files); a root `CHANGELOG.md` entry;
  spec §10 P2 row; after merge, `claude plugin tag --push` from `plugins/vc-fix/` (`docs/release-process.md` §Step 1,
  §Step 5a — vc-test, vc-perf and nothing else depend on vc-fix, and an untagged bump strands them).
- `npm run context:check` and `npm test` green before the PR.

## Review Focus

1. **A stand redeployed between the investigation and `qa-bug`.** The package says `vc-module-mfa 3.1004.0-pr-1-41b3`,
   the stand now runs `…-cf83`. The bug is not filed against a build nobody tested, and not reproduced again.
   `STALE_PACKAGE` names both versions. Checked in Task 2, run (b).
2. **A frontend-only package with no trace id.** A CSS contrast bug (VCST-6504's shape): root-cause §2 says
   storefront-only, so `TRACE_ID` and App Insights (M\*) are not demanded. The report is written with layers 2–4
   `N/A — not probed by the investigation`. Checked in Task 2, run (c).
3. **The self-diagnostics oracle reading an `--evidence` run.** With no Step 2 in the transcript, today's S2 rule
   ("Step 2 4-layer validation never ran") would flag a correct run. After Task 2 it does not, and a `browser_*` or
   `search_code` call in such a run is the S2 instead. Checked in Task 2, step 6.
4. **A Ref spelled `R-3`, or a risk id the round does not have.** `trace.mjs` attributes nothing to `R-3` and reports
   `R12` as unknown. The Mode 5 checklist written from VCST-5903's round 2 has every item Ref leading with an `R<n>`
   of that round. Checked in Task 1, step 6.
5. **A client install that cannot load `qa-checklist`.** With `disable-model-invocation: true` an agent's "load the
   `qa-checklist` skill" silently finds nothing and it improvises. After Task 1, `vc-fix:qa-checklist` is listed in
   the agent's skills. Checked in Task 1, step 5.

---

### Task 1: `qa-checklist` Mode 5 in vc-fix — `--from-strategy`, the risk id in Ref

**Files:**
- Create: `plugins/vc-fix/skills/qa-checklist/from-model.md`
- Modify: `plugins/vc-fix/skills/qa-checklist/SKILL.md` (frontmatter; Usage; supporting-files list; `### Mode 5` after Mode 3)
- Modify: `.claude/skills/qa-checklist/SKILL.md` (argument hint, Usage line, Mode 5 section — `--from-strategy`)
- Modify: `.claude/skills/qa-checklist/from-model.md` (synopsis, Inputs row, §With a strategy, Ref bullet)
- Temporary: `scripts/unit/tmp-vc-fix-mode5-refs.mjs`

**Interfaces:**
- Produces, both copies: `/qa-checklist <TICKET> --from-strategy <test-strategy.md> [--mind-map <slug>]`, and the old
  `--from-model --strategy <file>` as the same thing (D1). The argument hint reads `domain name | feature | <ticket-key>
  [--from-model] [--from-strategy <test-strategy.md>] | new <domain> | admin <module>`.
- Produces, `from-model.md` Inputs, the strategy row: *the last `## Round N` of the file, `Status:` not `DRAFT`
  (DRAFT ⇒ STOP: the strategy is a contract only once approved). Its `Test model` Artifacts row decides the model:
  `RUN (amend <path>)` ⇒ that file; `RUN (new)` ⇒ `test-model.md` beside the strategy; either missing ⇒ STOP naming the
  row. `SKIP — …` ⇒ no model is read.* The row's own path replaces the dropped legacy fallback.
- Produces, `from-model.md` §With a strategy, the Ref bullet (D3): *Ref leads with the risk id exactly as the
  strategy's `### Risks` table spells it — `R3`, never `R-3`; `trace.mjs` attributes a row by `R<n>`: `R3 · S#4 ·
  <node-id>`. An AC item names the risk whose Source cites that AC (`AC-2 · R7`); an item no risk reaches follows the
  next sentence.* (the existing drop-or-Amendments sentence, unchanged).
- Produces, plugin `from-model.md`: the `.claude/` file with those edits and these path substitutions — nothing else
  differs:

  | `.claude/` copy cites | plugin copy cites |
  |---|---|
  | `../../knowledge/execution/run-output.md` | `../../knowledge/execution/run-env.md` §The run folder |
  | `../../rules/test-data.md` layers | `../../knowledge/execution/live-discovery.md` §Decision tree |
  | `.claude/knowledge/domain/` for the mind map | the run folder's `knowledge/domain/`, else `<outputRoot>/.claude/knowledge/domain/`, else `Mind map: ABSENT` |
  | the legacy `reports/ba/test-models/<TICKET>-*.md` fallback | dropped (this repo's history only) |
  | `/qa-test-model`, `/qa-test-mind-map` | kept as named commands; a client without them gets the STOP / DRIFT line as written |

- [ ] **Step 1: Port** — create the plugin `from-model.md` per the table; plugin `SKILL.md`: delete
  `disable-model-invocation: true` (D2), set the argument hint, add the two Usage lines (`--from-model`,
  `--from-strategy`), the `from-model.md` bullet under the supporting files, and the Mode 5 section as `.claude/`'s
  (`Mode 2 + the test model + the mind map; every in-scope row or node becomes an item or a declared omission.
  --from-strategy: every risk too, and no model unless the strategy's Test model row is RUN. Procedure: from-model.md.`).
- [ ] **Step 2: Both copies** — the `--from-strategy` synopsis, Inputs row and Ref bullet above, in
  `.claude/skills/qa-checklist/from-model.md` and the plugin copy alike; `.claude/` `SKILL.md` argument hint, Usage
  line and Mode 5 sentence the same as the plugin's. `diff` of the two `from-model.md` files shows only the path rows
  of the table above.
- [ ] **Step 3: Self-containment** — `grep -nE "\.claude/(skills|rules|knowledge)|rules/test-data|run-output|npm run"
  plugins/vc-fix/skills/qa-checklist/from-model.md` prints nothing except the `<outputRoot>/.claude/knowledge/domain/`
  lookup. `npm run context:check` green (no dangling path in either copy; both `SKILL.md` under BUDGET-004).
- [ ] **Step 4: The check script** — `scripts/unit/tmp-vc-fix-mode5-refs.mjs <strategy> <checklist>`: reads the
  strategy's last round with `lastRound` / `block` from `plugins/vc-test/lib/strategy-artifacts.mjs`, takes the risk ids
  of its `### Risks` table, and prints as JSON every item row of the checklist's tables (rows under `## A.`/`## B.`/…
  lane headings) whose Ref does not start with one of them. Expected on a hand-made two-row file: one row with `R-3`
  and one with `R99` are printed, a row `R1 · S#2` is not.
- [ ] **Step 5: Real run, plugin copy** — in a session started with `claude --plugin-dir plugins/vc-fix`: confirm
  `vc-fix:qa-checklist` is in the skills list (Review Focus 5), then `/vc-fix:qa-checklist VCST-5903 --from-strategy
  reports/tickets/Sprint26-21/VCST-5903/test-strategy.md`, with the output written to
  `.vc-fix/p2-4-check/testing-checklist.md` (gitignored). Round 2's row is `RUN (amend
  reports/ba/test-models/VCST-5903-2026-10-19.md)`, so the header says `Strategy: … · Round 2 · Model:
  reports/ba/test-models/VCST-5903-2026-10-19.md`. Then two copies of the strategy in `.vc-fix/p2-4-check/`: one with
  that row as `SKIP — scenarios cover the MODEL risks (vc-test)` ⇒ `Model: SKIP …` and no STOP (vc-test's case); one
  with `RUN (new)` and no `test-model.md` beside it ⇒ STOP naming the row.
- [ ] **Step 6: Check it** — `node scripts/unit/tmp-vc-fix-mode5-refs.mjs reports/tickets/Sprint26-21/VCST-5903/test-strategy.md
  .vc-fix/p2-4-check/testing-checklist.md` prints `[]` (Review Focus 4). Every `EXPLORE` risk of round 2 appears under
  *Not covered, deliberately* as a charter, never as an item. Record the output for the PR.
- [ ] **Step 7: Old spelling** — the same session, `/vc-fix:qa-checklist VCST-5903 --from-model --strategy <same
  file>`: the same header line (no "Mode 5 without a model is Mode 2" STOP).
- [ ] **Step 8: Delete the temporary script, commit** — `feat(vc-fix): qa-checklist Mode 5 in the plugin — --from-strategy, the risk id first in Ref (vc-test P2-4)`.

### Task 2: `qa-bug --evidence` writes from the package (U50)

**Files:**
- Create: `plugins/vc-fix/knowledge/execution/bug-from-package.md`
- Modify: `plugins/vc-fix/commands/qa-bug.md` (Usage `--evidence` line; Step 0; Step 1's `--evidence` paragraph; Step 2's
  screenshot box and one `--evidence` line; Step 3 one line; Step 4a one line; Rules: three bullets)
- Modify: `plugins/vc-fix/skills/qa-investigate/SKILL.md:68` (the "Run ahead of `/vc-fix:qa-bug`" bullet)
- Modify: `plugins/vc-fix/knowledge/diagnostics/skill-expectations.md` and `.claude/knowledge/diagnostics/skill-expectations.md` (§`/qa-bug`)
- Modify: `scripts/maintenance/.prompt-size-baseline.json` (via `npm run context:check:baseline`)

**Interfaces:**
- Consumes: the package of `evidence-and-root-cause.md` — `evidence-index.md` (header slots `TRACE_ID`,
  `BUILD_VERSIONS`, `REPRO_RATE`; the Part A table) and `root-cause.md` (§1 Symptom … §8 Fix Routing handoff).
- Produces: `bug-from-package.md`, sections in this order, each the rule its name says:
  - **§Reads** — D4's allowed list and its never list, verbatim from the table above.
  - **§Complete** — D6's mandatory set; any one missing ⇒ the bug's outcome is `INCOMPLETE_PACKAGE: <slot, slot>`, no
    report.
  - **§Build** — D5: `BUILD_VERSIONS` against Step 0's deployed versions; mismatch ⇒ `STALE_PACKAGE: …`, no report.
  - **§Layers** — the Layer Validation table filled from root-cause §2/§3 and the Part A rows. A layer with an artifact
    gets its FAIL/PASS and that path. A layer without one gets `N/A — not probed by the investigation`. The owning layer
    is §2's.
  - **§Routing** — the Fix Routing block from §2 + §8. The repo name is spelled as `fix-repos.json` `routing[]` /
    `module-suite-map.md` spell it. §7 LOW ⇒ routing confidence LOW and no repo (`evidence-and-root-cause.md`
    §The confidence bar).
  - **§Report** — the report template's sections from the package: Summary ← §1; STR and Actual ← the manifest and
    the Part A artifacts; Root Cause Analysis ← §3–§5 with package paths, never inlined (`reports.md` §8); Regression ←
    §6 when filled. Bugs dir and screenshots per D8. Line 4 `Found by:` as the caller's `found-by:` argument says (Step 1).
  - **§Outcome** — what `qa-bug` returns to its caller: the report path, or the `INCOMPLETE_PACKAGE` / `STALE_PACKAGE`
    line. Then Step 5 (its own question, or `--confirmed`) and the completion signal, as without `--evidence`.
- Produces, `qa-bug.md`: Usage `--evidence <dir>` — *a `vc-fix:qa-investigate` package; the report is written from it
  and nothing is re-checked: `knowledge/execution/bug-from-package.md`*. Step 0 item 1 *with `--evidence`: also
  §Build*, item 2 *skipped with `--evidence` (root-cause §5 ruled out by-design)*. Step 1's paragraph becomes *With
  `--evidence`: Steps 1–3 are `bug-from-package.md` §Complete, §Layers, §Routing — no reproduction, no probe, no
  search*. Steps 2 and 3 each open with *With `--evidence`: skip — §Layers / §Routing*. Step 4a: *with `--evidence`,
  copy from the package's `screenshots/` (§Report)*. Rules: "Always reproduce …", "Always complete the 4-layer
  validation …" and "Always query Context7 …" each end *— with `--evidence`, the package did it (`bug-from-package.md`)*.
  The Step 2 screenshot box becomes: *Screenshots: a bare relative filename, then the mandatory reconcile —
  `skills/qa-evidence/output-paths.md` §How a browser screenshot reaches its permanent path.*
- Produces, `qa-investigate/SKILL.md:68`: the bullet adds *the package must pass `/vc-fix:qa-bug`'s
  `knowledge/execution/bug-from-package.md` §Complete — `qa-bug` captures nothing you left out*.
- Produces, both `skill-expectations.md` §`/qa-bug`: **Expected phases** gains *With `--evidence`: Step 0 (versions +
  §Build + dup check) → `bug-from-package.md` §Complete → Step 4 → Step 5; no Step 2 or Step 3 tool call*. **S2** gains
  *with `--evidence`: any `browser_*`, `qa-testing-expert` dispatch, `search_code` / `get_file_contents`,
  `applicationinsights` or Context7 call — a second investigation (U50). Signal: that tool call inside the span*. The
  existing S2 clause "Step 2 4-layer validation never ran" gains *(not with `--evidence`)*. Same text in both copies.

- [ ] **Step 1: Write `bug-from-package.md`** per the Interfaces; cite `skills/qa-investigate/evidence-and-root-cause.md`
  Part A / Part B for the shapes rather than copying them.
- [ ] **Step 2: Edit `qa-bug.md`** per the Interfaces. `wc -c plugins/vc-fix/commands/qa-bug.md` < 47,776; `npm run
  context:check:baseline`, then `npm run context:check` green.
- [ ] **Step 3: `qa-investigate` and both `skill-expectations.md`** — the edits above; `diff` of the two §`/qa-bug`
  blocks is empty.
- [ ] **Step 4: The fixtures** — under `.vc-fix/p2-4-check/run/` (gitignored), two packages built by hand from the
  recorded VCST-5904 reports, in the Part A / Part B shapes. `evidence-20261027T000001Z/` comes from
  `reports/tickets/Sprint26-21/VCST-5904/vcst/bugs/critical-high/BUG-MFA-Wrong-Code-Limiter-Per-Instance-VCST-6506.md`
  (server-side: a `TRACE_ID`, a failing request, root-cause §2 REST, its repo, confidence MEDIUM). `BUILD_VERSIONS` are
  read from the stand now (`GET {BACK_URL}/api/platform/modules`). `evidence-20261027T000002Z/` comes from
  `…/bugs/medium/BUG-OTP-Code-Boxes-Border-Contrast-Below-3to1-VCST-6504.md` (storefront-only, no `TRACE_ID`). Each holds
  one screenshot copied from the run folder's evidence the report cites.
- [ ] **Step 5: Real runs**, in a session started with `claude --plugin-dir plugins/vc-fix`, answering "No — keep the
  local report only" each time:
  (a) `/vc-fix:qa-bug "MFA wrong-code limiter is per instance" --evidence .vc-fix/p2-4-check/run/evidence-20261027T000001Z
  found-by:agent-testing VCST-5904` ⇒ `.vc-fix/p2-4-check/run/bugs/critical-high/BUG-*.md`. Its Fix Routing repo is
  root-cause §8's, its Layer Validation names package paths, and its screenshot is under `…/bugs/screenshots/<slug>/`
  while the package still holds its own copy.
  (b) the same package with the owning module's `BUILD_VERSIONS` entry changed to an older version ⇒
  `STALE_PACKAGE: <module> <old> ≠ <deployed>`, no new report (Review Focus 1).
  (c) the VCST-6504 package ⇒ `…/bugs/medium/BUG-*.md` with layers 2–4 `N/A — not probed by the investigation`, no
  `INCOMPLETE_PACKAGE` for the missing `TRACE_ID` (Review Focus 2).
  (d) package (a) with its failure screenshot deleted ⇒ `INCOMPLETE_PACKAGE: 1 Failure-state screenshot`.
- [ ] **Step 6: The transcripts** — in each run's session file (`~/.claude/projects/<project>/<session>.jsonl`), `grep -cE
  '"name":"(mcp__[^"]*browser_|mcp__github__search_code|mcp__github__get_file_contents|mcp__azure-mcp__applicationinsights|mcp__context7__)'`
  is `0`. Then `/vc-fix:vc-self-check` on run (a)'s session reports no S2 for a missing Step 2 (Review Focus 3); the
  collector records only with `selfDiagnostics: true` in `project-profile.json`, so set it for these runs and restore
  it after, or record this half as not checked.
  Record the four outcomes and the counts for the PR; delete `.vc-fix/p2-4-check/`.
- [ ] **Step 7: Commit** — `feat(vc-fix): qa-bug --evidence writes from the investigation package, no second investigation (U50, vc-test P2-4)`.

### Task 3: release `vc-fix` 0.17.0

**Files:**
- Modify: `plugins/vc-fix/.claude-plugin/plugin.json` (`version`)
- Modify: `CHANGELOG.md` (a new entry on top, the shape of the 0.16.0 one)
- Modify: `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` (§10 P2 row)

**Interfaces:**
- Consumes: Tasks 1 and 2.

- [ ] **Step 1: Bump** — `plugin.json` `"version": "0.17.0"`; description and counts unchanged (no component added).
  `.claude-plugin/marketplace.json` unchanged (the listing did not change; release-process §Step 1).
- [ ] **Step 2: Changelog** — `## /vc-fix:qa-bug writes from the investigation; qa-checklist Mode 5 with risk ids —
  vc-fix 0.17.0 — <date>`: **Changed** `--evidence` (no reproduction, probe, search or docs query; `STALE_PACKAGE`,
  `INCOMPLETE_PACKAGE`; the report beside the package — D5, D6, D8); **Added** Mode 5 in the plugin with
  `--from-strategy` and the risk id first in Ref, the skill now loadable by an agent; the self-diagnostics oracle's
  `--evidence` path. One line: vc-test switches to `--from-strategy` and requires `>=0.17.0` in P2-5.
- [ ] **Step 3: Spec** — §10 P2 row gains "**P2-4 done** (vc-fix 0.17.0: `qa-bug` from the investigation, U50;
  `qa-checklist` Mode 5 with `--from-strategy` and risk ids)".
- [ ] **Step 4: Gates** — `claude plugin validate plugins/vc-fix`, `npm run context:check`, `npm test` green.
- [ ] **Step 5: Commit** — `release(vc-fix): 0.17.0 — qa-bug from the investigation, qa-checklist Mode 5 with risk ids (vc-test P2-4)`.
- [ ] **Step 6: After merge** — from `plugins/vc-fix/` on the merged `main`: `claude plugin tag --push`; `git tag -l
  "vc-fix--v0.17*"` prints `vc-fix--v0.17.0` (release-process §Step 5a).
