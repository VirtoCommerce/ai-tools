# vc-test P2-5b — `qa-triage-results` in the plugin, with its own ticket-mode collector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/vc-test:qa-ticket` triages its checklist on a client install with no ai-tools checkout. The
`qa-triage-results` skill moves into `plugins/vc-test/`, and its ticket-mode collector becomes a plugin `.mjs`.
This repository keeps `/qa-triage-results` as a thin command that invokes the plugin skill, and keeps the
regression half of the collector in `scripts/lib/regression-triage.ts`. Released as `vc-test` 0.11.0. With it, the
"triage and investigation still need an ai-tools checkout" caveat is gone.

**Architecture:**
- **One skill, two modes.** The plugin skill carries the whole procedure:
  - **ticket mode** runs on the plugin's own collector;
  - **regression mode** is an adapter (spec U3). It runs where the project's `package.json` declares
    `triage:collect` and `triage:history`, and stops with one line where it does not.
- **The command's body becomes the skill's `SKILL.md`.** Today the skill says "read that command in full and run
  its Phases 0–6". After the move the phases live in `SKILL.md`. The skill's old body (problem, buckets, data
  flow, evidence and flaky model) becomes the supporting file `methodology.md`.
- **The classifier brief moves too.** `ci/agents/regression-triage-agent.md` is read only by this skill and
  command, and both modes need it. It becomes `plugins/vc-test/briefs/triage-classifier.md`: still a brief,
  dispatched as `general-purpose` with `model: "sonnet"`.

**Tech Stack:** Markdown prompts; one Node ESM script (`plugins/vc-test/lib/triage-collect.mjs`); a TypeScript
deletion in `scripts/lib/regression-triage.ts`.

**Spec:** [`docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md`](../specs/2026-10-15-vc-test-plugin-design.md) — U3 (adapters), U14 (the skill
stays Skill-tool invocable), U29 (`--min-severity P2`), line 381 (`qa-triage-results/` ticket mode, a moved canonical
copy), §10 P2. The P2-5 split and the owner's answers binding on it: [`2026-10-27-vc-test-p2-5a-verdict-and-reads.md`](2026-10-27-vc-test-p2-5a-verdict-and-reads.md)
§P2-5 is five plans: "skills move, commands stay … as thin shims"; "code consumers keep the repository's half".

## Decisions this plan makes (confirm at review)

| # | Question | Decision |
|---|---|---|
| B1 | What moves | **The whole skill, both modes**, to `plugins/vc-test/skills/qa-triage-results/`. This covers `SKILL.md`, `triage-taxonomy.md`, `routing-and-fix.md`, `live-triage-design.md` and the new `methodology.md`. `.claude/skills/qa-triage-results/` is deleted. Regression mode is an adapter (U3) gated on the project's `triage:collect` + `triage:history`. Moving ticket mode only would leave the regression procedure in a `.claude/` command that is not a shim. |
| B2 | `SKILL.md` content | **The command's body**, Phases 0–6 + `## Rules`, verbatim except for the links and names below. The frontmatter is the skill's: no `disable-model-invocation` (U14). The skill's old body goes, verbatim, into `methodology.md`, and `SKILL.md`'s §Supporting files lists it. |
| B3 | `.claude/commands/qa-triage-results.md` | **A thin shim.** It keeps `description` (shortened), `argument-hint` and `disable-model-invocation: true`. The body: invoke the Skill tool with `skill: "vc-test:qa-triage-results"` and the arguments unchanged; it needs vc-test ≥ 0.11.0, enabled in `.claude/settings.json`. Links to the command (`qa-run/run.md:32`, `waves.md:127`) stay valid. |
| B4 | The ticket-mode collector | **`plugins/vc-test/lib/triage-collect.mjs`**, a port of `regression-triage.ts`'s ticket half. Ported: `checklistVerdict`, `resolveTicketDir`, `readChecklistIssues`, `groupIssues`, `fingerprintFailure`, `normalizeSignature`, `harPathForBrowser` and the `collect --ticket` packet. The packet shape is byte-for-byte the same (`source: "checklist"`). It uses the plugin's `scripts/lib/run-dir.mjs` and `lib/paths.mjs` `currentEnv()`, and no new npm dependency. |
| B5 | The repository's collector | **Drop the ticket half** from `scripts/lib/regression-triage.ts`: the functions only it uses, the `--ticket` CLI branch, and its usage line. One implementation per mode. The regression half and its importers (`ci/run-regression.ts`, `close-run.ts`, `bl-fresh.ts`, `promote-cases.ts`) are untouched. |
| B6 | The classifier brief | **Move** `ci/agents/regression-triage-agent.md` → `plugins/vc-test/briefs/triage-classifier.md`, verbatim except its links (B7). `ci/README.md:214` and the prose that names the file are repointed. No copy stays in `ci/`: no CI runner reads it (`ci/run-triage-results.ts` was never built). |
| B7 | `.claude/` documents the moved files cite | Per the P2-5a pattern, DOC-009 must stay at its baseline (5, all P2-5c's `visual-axis.md`): <br>• **copy whole** to `knowledge/`: `oracles/vc-bug-catalog.md`, `execution/debugging-signals.md`, `api/platform-patterns.md`, `automation/storefront-config-flags.md` (this repository's copies, not vc-fix's diverged ones); <br>• **existing plugin copies**: `rules/test-data.md`, `rules/reports.md`, and `reports-policy.md` §1a → `knowledge/reports.md` §1a; <br>• **a plugin mechanism**: `rules/agents.md` (≤ 3 at a time) → the sentence itself, as A14; `templates/agent-dispatch.md`'s *Observed behaviour* line → `skills/ticket-context/known-ground.md`, as A15; `plugins/vc-fix/commands/qa-bug.md` → `/vc-fix:qa-bug` by name; <br>• **"(in this repository: …)" plain text**: `regression-pipelines.md`, `test-runner-tags.md`, `tracker-ops.md` §Labels, `ticket-status-transitions.md`, `visual-axis.md` §3, `.claude/knowledge/**`. |
| B8 | Phase 4's QA experts and the owner | **The project's own `qa-frontend-expert` / `qa-backend-expert` when it defines one, else `vc-fix:qa-frontend-expert` / `vc-fix:qa-backend-expert`.** vc-test depends on vc-fix, so this repository keeps its `.claude/` agents and a client gets vc-fix's. The owner line becomes "the session that invokes it (in this repository: `qa-lead-orchestrator`)". |
| B9 | Consumers in this repository | **Repoint** these to `skill: "vc-test:qa-triage-results"` or to the plugin path `plugins/vc-test/skills/qa-triage-results/routing-and-fix.md` (a repository path, valid here): <br>• the skill invocations: `qa-test-fast.md:135`, `qa-test-fast/verdict.md`, `qa-test/triage.md`, `qa-test/close-out.md:115`, `plugins/vc-test/commands/qa-ticket.md:135`; <br>• the brief path: `qa-test/triage.md:22`, `regression-selection.md:202`. <br>Prose that names `/qa-triage-results` the command stays. |
| B10 | vc-fix | **Untouched.** `qa-investigate` names `/qa-triage-results` the command, which still exists here. No vc-fix release. |
| B11 | Release | vc-test **0.11.0**. Drop "Triage and investigation … still need an ai-tools checkout until P2" from `plugin.json`, the marketplace entry, `README.md` and `commands/qa-ticket.md`'s `description`. Also: README rows, CHANGELOG, spec §10 ("P2-5b done"), `npm run docs:index`. After merge, push the tag `vc-test--v0.11.0`. |

## Global Constraints

- **NO CODE ⇒ NO UNIT TEST.** The prose moves get no test. `triage-collect.mjs` is code, so its test is
  temporary: `scripts/unit/tmp-triage-collect.test.mjs`, deleted before commit. It is not in the committed-test
  exceptions of `CLAUDE.md`.
- **A move is a move, a copy is a copy.** The text is verbatim. The only changes allowed:
  - outbound links rewritten to resolve inside the plugin, or turned into plain text (B7);
  - the owner and agent names (B8);
  - `npm run triage:collect -- --ticket` → `node <plugin>/lib/triage-collect.mjs --ticket`.

  Each knowledge copy opens with `<!-- copy of .claude/<path> — keep in step; the repository copy is canonical here -->`.
- **The triage's meaning does not change:**
  - the eight classes and the `REAL_BUG`/`LOW` bias;
  - `--min-severity`, `--verify`, and `--fix` being ignored in ticket mode;
  - the `unresulted[]` STOP;
  - "never file, never `/qa-fix`".
- **Paths in prompts** resolve through `<plugin>` (as `qa-ticket.md` does). Links inside `skills/` stay relative
  (`../../knowledge/…`, `../../briefs/…`).
- **Ratchets:**
  - DOC-009 stays at 5;
  - DOC-010 prints only its 2 accepted lines plus none from the new copies;
  - DOC-002/003/004/008 do not rise.
- **BUDGET-004:**
  - the plugin `SKILL.md` ≤ 19,000 chars, so it is not added to the baseline;
  - `commands/qa-ticket.md` stays ≤ 14,076 chars.
- `npm run context:check`, `npm run docs:index:check`, `npm run qa-test:doclint`, `npm test` and
  `claude plugin validate plugins/vc-test` are green at the end of every task that touches their scope.
- **The user's working-tree files are off limits.** Never stage `.claude/rules/vc-browser.md`, `.gitignore`,
  `.claude/settings.json` or `reports/tickets/…`. Commit with `git commit --only <paths>`.

## Review Focus

1. **Packet parity.** On the same checklist, the plugin collector's JSON equals the TypeScript one's: `issues`,
   `fingerprint`s, batch order, `unresulted`, `advisoryCount`, and `ticketDir`. The cases to watch:
   - a `## Round` re-test (the last row of an id wins);
   - a row with an extra empty cell, where the result shifts right;
   - a screenshot matched by id token versus by name;
   - a table with no `Result`/`Verdict` column (ignored).

   Task 1 pins each with a fixture.
2. **Regression mode where there is no regression runner.** On a client install, `/vc-test:qa-triage-results latest`
   must STOP with one line naming the missing `triage:collect`. It must not crash, and it must not fall into
   ticket mode. Checked in Task 2.
3. **This repository's `/qa-test` 5-triage and `/qa-test-fast` Stage 3 still reach the triage.**
   - Every invocation names `vc-test:qa-triage-results`, and every link into the old skill folder is repointed.
   - `npm run qa-test:doclint` is green.
   - `git grep "skills/qa-triage-results"` outside `plugins/` and `docs/` prints nothing.

   Checked in Task 2.
4. **The moved procedure says the same thing.** A diff of the old command body against the new `SKILL.md`, and of
   the old skill body against `methodology.md`, shows only link, name and collector-path lines. Checked in Task 2.
5. **The regression half still compiles and passes after the ticket half goes.** `npm test` passes,
   `npx tsc --noEmit -p ci/tsconfig.json` passes, and `npm run triage:collect -- latest` still prints a packet when a
   `REG-*` run exists. Checked in Task 3.

---

### Task 1: the plugin's ticket-mode collector

**Files:**
- Create: `plugins/vc-test/lib/triage-collect.mjs`
- Test (temporary): `scripts/unit/tmp-triage-collect.test.mjs`

**Interfaces:**
- Consumes:
  - `plugins/vc-test/scripts/lib/run-dir.mjs`: `priorRunDirs({ ticket })` → `[{ dir, env }]`, `sessionRun()` →
    `{ ticket, env, dir } | null`, `ticketOfRunDir(dir)` → `string | null`;
  - `plugins/vc-test/lib/paths.mjs`: `currentEnv()` → `string`.
- Produces:
  - Exports: `checklistVerdict(cell): "FAIL"|"BLOCKED"|"SKIPPED"|"PASS"|"ADVISORY"|null`,
    `resolveTicketDir(arg, env): string`, `readChecklistIssues(ticketDir, env): { issues, unresulted, advisoryCount }`,
    `groupIssues(issues, maxPerBatch = 25): IssueBatch[]`, `fingerprintFailure(env, suiteId, caseId, signature): string`,
    `normalizeSignature(s): string`.
  - CLI: `node <plugin>/lib/triage-collect.mjs --ticket <KEY|ticket-dir> [--max-batch N]`. It prints the packet
    `{ source:"checklist", ticketDir, environment, issueCount, byStatus:{FAIL,BLOCKED,SKIPPED}, advisoryCount,
    unresulted, batchCount, maxPerBatch, batches }`, the same keys in the same order as `regression-triage.ts`.
  - Exit codes: 0 when printed; 2 for usage; 1 when no checklist is found, with the TypeScript message (an
    `npm run run:dir` hint is replaced by naming the run folders searched).

- [ ] **Step 1: Write the failing test.** Fixtures go in a temp dir. Each test runs both
  `npx tsx scripts/lib/regression-triage.ts collect --ticket <dir>` and
  `node plugins/vc-test/lib/triage-collect.mjs --ticket <dir>` with `TEST_ENV=vcst`, and asserts deep-equal JSON.
  - `parity — FAIL, BLOCKED, NOT-RUN and a PASS row`: 3 issues, 1 PASS dropped.
  - `parity — a ## Round re-test supersedes the first pass`: id `A1` FAIL then PASS ⇒ 0 issues.
  - `parity — an extra empty cell shifts the result right`: `| A2 | x | data || FAIL … |` ⇒ 1 FAIL.
  - `parity — advisory and unresulted`: `DRIFT` ⇒ `advisoryCount 1`; an empty Result ⇒ `unresulted ["A4"]`.
  - `parity — screenshots by name and by id token`: `screenshots/a5-cart.png` and a row naming `shot.png` ⇒ both
    listed.
  - `parity — a table without Result is ignored`.
  - `parity — --max-batch 1 splits a group`: 2 FAIL in one section ⇒ 2 batches, keys `…#0`, `…#1`.
- [ ] **Step 2:** Run `node --test scripts/unit/tmp-triage-collect.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `triage-collect.mjs` as a line-for-line port of the TypeScript ticket half. Types become
  JSDoc. Use `createHash("md5")` from `node:crypto`. The file header names its source: `a port of
  scripts/lib/regression-triage.ts (ticket mode); this repository's regression half stays there`.
- [ ] **Step 4:** Run it again. Expected: PASS, 7 tests.
- [ ] **Step 5:** Delete the temporary test. Run `claude plugin validate plugins/vc-test`. Commit:
  `feat(vc-test): lib/triage-collect.mjs — the ticket-mode triage collector in the plugin (P2-5b)`.

### Task 2: the skill, its brief and its knowledge move into the plugin

**Files:**
- Create:
  - `plugins/vc-test/skills/qa-triage-results/SKILL.md` (B2: the skill's frontmatter + the command's body);
  - `plugins/vc-test/skills/qa-triage-results/methodology.md` (the skill's old body);
  - `plugins/vc-test/briefs/triage-classifier.md` (B6);
  - `plugins/vc-test/knowledge/{vc-bug-catalog,debugging-signals,platform-patterns,storefront-config-flags}.md` (B7).
- Move (`git mv`): `.claude/skills/qa-triage-results/{triage-taxonomy,routing-and-fix,live-triage-design}.md` →
  `plugins/vc-test/skills/qa-triage-results/`.
- Delete: `.claude/skills/qa-triage-results/SKILL.md` and `ci/agents/regression-triage-agent.md`.
- Modify: `.claude/commands/qa-triage-results.md` → the shim (B3).
- Modify (the consumers, B9), each only on the lines listed:
  - `.claude/commands/qa-test-fast.md` (`:135`);
  - `.claude/skills/qa-test-fast/verdict.md` (`:11–17`, `:42`);
  - `.claude/skills/qa-test-fast/execution.md` (`:103`, the collector name);
  - `.claude/skills/qa-test/triage.md` (`:14–27`, `:74`, `:22` the brief);
  - `.claude/skills/qa-test/close-out.md` (`:115`);
  - `.claude/knowledge/execution/regression-selection.md` (`:202`);
  - `ci/README.md` (`:214`);
  - `plugins/vc-test/commands/qa-ticket.md` (`:135`);
  - `.claude/agents/qa-lead-orchestrator.md` (`:60`, "the triage classifier brief").


**Interfaces:**
- Consumes: Task 1's CLI.
- Produces:
  - `SKILL.md` with `name: qa-triage-results`, the skill's `description` and `argument-hint`, and no
    `disable-model-invocation`.
  - Phase 0 opens with the **mode gate**:
    - `ticket <KEY>` ⇒ ticket mode;
    - otherwise ⇒ regression mode, only when the project's `package.json` declares both `triage:collect` and
      `triage:history`. Else STOP: `regression mode needs the project's regression runner (package.json scripts
      triage:collect, triage:history) — ticket mode is /vc-test:qa-triage-results ticket <KEY>`.
  - Phase 1 ticket mode runs `node <plugin>/lib/triage-collect.mjs --ticket <KEY> [--max-batch N]`.
  - Phase 3 dispatches `<plugin>/briefs/triage-classifier.md`.
  - Phase 4 names the agents per B8.
  - Each link per B7.
  - In the consumers, every Skill invocation says `skill: "vc-test:qa-triage-results"`, and every link into the old
    skill folder becomes `plugins/vc-test/skills/qa-triage-results/<file>`. From `.claude/` files that is the
    relative path `../../../plugins/vc-test/skills/qa-triage-results/<file>`, as P2-5a's close-out pointer.

- [ ] **Step 1:** Create the four knowledge copies, whole, each with the source header. Rewrite only their own
  outbound links (DOC-008 over `plugins/vc-test/**` stays 0).
- [ ] **Step 2:** `git mv` the three supporting files and the brief. Rewrite their links (B7).
- [ ] **Step 3:** Write `SKILL.md` from the command's body and `methodology.md` from the skill's old body. Change only
  what the Global Constraints allow. Delete the old `SKILL.md`. Turn the command into the shim.
- [ ] **Step 4:** Repoint the consumers' lines listed. Change no other wording.
- [ ] **Step 5: Checks.**
  - `diff` the old command body (from `git show HEAD:.claude/commands/qa-triage-results.md`) against `SKILL.md`, and
    the old skill body against `methodology.md`. Only link, name, mode-gate and collector-path lines differ.
  - `git grep -nE "\.claude/" plugins/vc-test/skills/qa-triage-results plugins/vc-test/briefs/triage-classifier.md`
    prints only `(in this repository: …)` mentions.
  - The `SKILL.md` char count (CRLF→LF) is ≤ 19,000.
  - `npm run --silent context:check` is green: DOC-009 = 5, DOC-008 does not rise, DOC-010 prints no new line.
  - `claude plugin validate plugins/vc-test` passes.
  - `git grep -nE "skills/qa-triage-results|regression-triage-agent.md|skill: \"qa-triage-results\"" -- ':!plugins' ':!docs' ':!CHANGELOG.md' ':!reports'`
    prints nothing.
  - `npm run qa-test:doclint` is green.
  - `commands/qa-ticket.md` is ≤ 14,076 chars.
- [ ] **Step 6: Commit:** `feat(vc-test): qa-triage-results moves into the plugin; /qa-triage-results here is a shim (P2-5b)`.

### Task 3: the repository's collector keeps the regression half only

**Files:**
- Modify: `scripts/lib/regression-triage.ts`

**Interfaces:**
- Produces: `collect --ticket` is gone. The usage line lists `collect <RUN_ID|latest> [--record]` and `history …`.
  The header comment says ticket mode is `plugins/vc-test/lib/triage-collect.mjs`. Every export the importers
  use stays:
  - `ci/run-regression.ts`: `mergeHistoryRows`;
  - `close-run.ts`: `REG_ROOT`, `appendSuiteHistory`, `resolveRunDir`;
  - `bl-fresh.ts`: `normalizeStatus`, `readRunSuites`;
  - `promote-cases.ts` and the two unit tests: whatever they import.

  The comment that names the classifier points at `plugins/vc-test/briefs/triage-classifier.md`.

- [ ] **Step 1:** Delete `CHECKLIST_FILE`, `checklistVerdict`, `splitRow`, `resolveTicketDir`, `ChecklistRead`,
  `readChecklistIssues` and the `--ticket` CLI branch. Drop the imports and `IssueInput.source`'s `"checklist"` case
  only if nothing else uses them. `git grep` each name first.
- [ ] **Step 2: Checks.**
  - `npm test` passes.
  - `npx tsc --noEmit -p ci/tsconfig.json` passes.
  - `npm run triage:collect -- latest` prints a packet with `source: "regression"` when a `REG-*` run exists (else it
    prints the "none exists" error unchanged).
  - `npm run --silent context:check` is green.
- [ ] **Step 3: Commit:** `refactor(triage): regression-triage.ts keeps the regression half; ticket mode lives in vc-test (P2-5b)`.

### Task 4: release vc-test 0.11.0

**Files:**
- Modify:
  - `plugins/vc-test/.claude-plugin/plugin.json` (`version`, `description`);
  - `.claude-plugin/marketplace.json` (the vc-test entry);
  - `plugins/vc-test/README.md` (the Preview paragraph; the "What is here" rows for the skill, the brief, the
    collector and the four knowledge copies);
  - `plugins/vc-test/commands/qa-ticket.md` (`description`);
  - `CHANGELOG.md`;
  - `docs/superpowers/specs/2026-10-15-vc-test-plugin-design.md` (§10 P2 row: "P2-5b done");
  - the generated blocks (`npm run docs:index`).

- [ ] **Step 1:** Make the edits (B11). `qa-ticket.md` must not grow.
- [ ] **Step 2: Checks.**
  - `npm run docs:index` (after `git add` of the new files), then `npm run docs:index:check` is green. This is the
    CI `offline` gate that failed twice in P2-3/P2-4. `.claude/ROUTING.md` already names `/qa-triage-results`.
  - `npm run --silent context:check` is green.
  - `npm test` passes.
  - `claude plugin validate plugins/vc-test` passes.
- [ ] **Step 3: Commit:** `release: vc-test 0.11.0 — triage runs from the plugin (P2-5b)`.
