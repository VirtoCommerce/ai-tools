# One thin `/qa-test` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/qa-test` FAST/FULL and `/qa-test-fast` with one thin, strategy-driven `/qa-test` built on the vc-test skills, and migrate every consumer.

**Architecture:** The command orchestrates six stages (ROUTE → CONTEXT → STRATEGY → PREPARE → EXECUTE → CLOSE). Which bricks run is decided by the approved `/vc-test:qa-test-strategy` artifact rows; context, strategy and triage are vc-test skills; repo-only steps (status, docs, kb, hand-off to `/qa-test-lifecycle`) stay in `.claude/skills/qa-test/`. Files that only the old paths read are deleted after their consumers are repointed.

**Tech Stack:** Claude Code prompt files (Markdown commands, skills, agents); Node 18 ESM scripts; gates `context:check`, `qa-test:doclint`, `summary:validate`, `npm test`.

**Spec:** `docs/superpowers/specs/2026-11-13-qa-test-single-design.md` (decisions E1–E7 in its §10; the 2026-10-09 decisions D1–D12 it builds on are read with `git show 40805707^:docs/superpowers/specs/2026-10-09-qa-test-strategy-redesign.md`).

## Global Constraints

- `.claude/commands/qa-test.md` ≤ 19,000 chars; every `SKILL.md` ≤ 19,000 chars (BUDGET-004); the command's entry leaves `scripts/maintenance/.prompt-size-baseline.json`.
- `.claude/skills/qa-test/` total ≤ 161,000 chars (half of today's 322K); no file there is a deleted file moved unchanged.
- Argument grammar: `/qa-test <TICKET> [<env>] [--yes] [--dry-run]`. A feature name, `PR #N`, several keys ⇒ STOP with one line; `--iterate`, `--epic`, `--visual`, `--contract`, `--coverage`, `--axes`, `--release-regression` ⇒ one line saying it is gone, run continues without it.
- vc-test is required: Step 0 checks `vc-test:ticket-context`, `vc-test:qa-test-strategy`, `vc-test:qa-triage-results`, `vc-test:qa-design` are in the skill list, vc-test ≥ 0.17.1; absent ⇒ STOP "install or update vc-test (`/plugin install vc-test@ai-tools`, or `/plugin marketplace update ai-tools`), then restart Claude Code".
- `/qa-test` never writes a suite CSV, never writes a seeder, never makes more than one tracker comment per round, moves status only per `ticket-status-transitions.md`.
- Every dispatch description starts `[vc-test:qa-test.<step>]` (`<step>` one of `context`, `domain-map`, `strategy`, `model`, `mind-map`, `checklist`, `runner-fe`, `runner-be`, `exploratory`, `visual`, `regression`, `triage`, `investigate`, `docs`).
- Budget is reported, never a stop or a question: `node plugins/vc-test/lib/run-cost.mjs --since <start> --budget qa --key <TICKET>`.
- NO CODE ⇒ NO UNIT TEST: no new `scripts/unit/` file is committed. The one code edit (`route.mjs` string) gets no test.
- A plugin text change bumps that plugin's version: vc-test `0.17.1 → 0.17.2`, vc-fix `0.18.9 → 0.18.10`, with a `CHANGELOG.md` entry each; the `{name}--v{version}` tags are pushed at release (`docs/release-process.md` §Step 5a), not on this branch.
- Plugin knowledge copies (`plugins/vc-test/knowledge/exploratory-box.md`, `ui-kit-class.md`) change in the same commit as their canonical source.
- **Out of scope:** `scripts/regression/verify-gate.ts` and its committed `scripts/unit/verify-gate.test.ts` encode FULL's gate sheets (`3`, `5-report`); they are left unchanged here, and the zero-hit greps below skip them. Retiring them is a separate follow-up.

## Review Focus

1. **A plugin file still citing a deleted `.claude/` file or a removed `ticket-routing.md §5x`** — `context:check` scans `.claude/` only; a plugin reader would hit a dead link. Pinned by Task 6 Step 3's grep over `plugins/`.
2. **Historical `summary.json` files turning red after the schema edit** — a removed key would make baselined files "worse". Pinned by Task 5: keys are marked legacy, never removed, and `summary:validate` runs over all runs.
3. **A runtime string pointing at a deleted file** — `tc:scope` prints `skills/qa-test/coverage-triage.md §3` to the user. Pinned by Task 3 Step 4.
4. **The canonical/copy pair drifting** — editing `exploratory-lane.md` §5 or `ui-kit-class.md` without its plugin copy. Pinned by Task 2 Step 6's diff.
5. **A `/qa-test-fast` invocation in someone's muscle memory or a prompt** — the command is gone with no forwarding stub; every textual reference must name `/qa-test`. Pinned by Task 7 Step 1's zero-hit grep.

---

### Task 1: Branch and spec

**Files:**
- Create (in a new worktree): branch `feat/qa-test-single` from `main`
- Add: `docs/superpowers/specs/2026-11-13-qa-test-single-design.md`, this plan

- [ ] **Step 1:** Create a worktree on `feat/qa-test-single` from `main` (superpowers:using-git-worktrees). The main checkout stays on `feat/vc-test-qa-goal` with the owner's uncommitted `plugins/vc-test/lib/oauth-code.mjs` untouched.
- [ ] **Step 2:** Copy the spec and this plan into the worktree.
- [ ] **Step 3:** Commit: `docs(qa-test): single strategy-driven /qa-test — design and plan`.

### Task 2: New command and skill core

**Files:**
- Rewrite: `.claude/commands/qa-test.md`
- Rewrite: `.claude/skills/qa-test/SKILL.md`
- Create: `.claude/skills/qa-test/execution.md` (from `.claude/skills/qa-test-fast/execution.md`)
- Rewrite: `.claude/skills/qa-test/close-out.md` (absorbs `.claude/skills/qa-test-fast/verdict.md`)
- Trim: `.claude/skills/qa-test/reporting.md`, `triage.md`, `sequencing.md`, `dispatch-pack.md`, `contract-refresh.md`, `exploratory-lane.md`, `ui-kit-class.md`
- Modify (same commit as its source): `plugins/vc-test/knowledge/exploratory-box.md`, `plugins/vc-test/knowledge/ui-kit-class.md`
- Rewrite: `docs/qa-test-flow.md` (the diagram the command cites)

**Interfaces:**
- Produces, cited by later tasks: command sections `## Rules`, `## 0 — Route`, `## 1 — Context`, `## 2 — Strategy`, `## 3 — Prepare`, `## 4 — Execute`, `## 5 — Close`; skill files `execution.md` §Runner brief · §Exploratory · §Visual · §Data · §Join gate; `close-out.md` §5-verdict · §5-file · §Files · §HTML page and comment · §Hand-off to lifecycle; `reporting.md` §5-status · §5-docs · §5-docs-map.
- Consumes: vc-test `ticket-context`, `qa-test-strategy` (incl. `reconcile.md`), `qa-triage-results`, `qa-design`; `run-cost.mjs`.

- [ ] **Step 1: Command.** Write `.claude/commands/qa-test.md` from spec §5 and §5.1–§5.6: frontmatter (`description` naming the six stages and "ticket keys only"; `argument-hint: "<TICKET> [<env>] [--yes] [--dry-run]"`), the argument table from Global Constraints, `## Rules` (the Global Constraints that bind a run), then one section per stage whose body is the §5.1 rows for that stage as one-line rules with links. Stage 0 also: routing from `ticket-routing.md` §4 (a non-`test` job STOPs naming its command; a not-fixed Bug runs with mission "reproduce and characterize" and names `/vc-fix:qa-fix` next), the opening status hop per `ticket-status-transitions.md`, `npm run run:use`, the start time for `run-cost.mjs`. Stage 1: `ticket-context` and, when the map is `ABSENT`/`unresolved`, `/qa-domain-map` in one message, both joined before Stage 2. Stage 2 also: every `FIXTURE-GAP` risk listed in the approval question with its two answers (spec §5.2); the spend so far shown (spec §5.3). Stage 5 order: reconcile → triage → investigate → `qa-bug` → teardown by ledger id → verdict → `summary.json` + `verdict.md` → `/vc-fix:qa-report` → 5-status → `/qa-docs` (Tested/Done) → 5-docs-map → kb → run cost → lifecycle question. No method text.
- [ ] **Step 2: Skill index.** `SKILL.md`: one table of the kept files and when to read each, the two holding principles (value chain first; silence is never an answer — kept from today's file), the rationalization table and red flags merged from `.claude/skills/qa-test-fast/SKILL.md` with the `/qa-test-fast`, FAST/FULL and suite-authoring rows dropped.
- [ ] **Step 3: execution.md.** Move `qa-test-fast/execution.md` in; replace "Stage 2/3" with the new stage names; add the regression lane (`/qa-regression <non-stale case ids>`, counted in the ≤3 lanes); keep §Data and the teardown rule verbatim.
- [ ] **Step 4: close-out.md.** Keep §5-verdict and §5-file; add §Files, §HTML page and comment, §Tracker comment from `qa-test-fast/verdict.md`; add §Hand-off to lifecycle (spec §5.6: both lists, their item shapes, the one question). Drop every C1 / 5r / FULL reference.
- [ ] **Step 5: Trim the rest.** `reporting.md` keeps §5-status, §5-docs, §5-docs-map only (5-report's verifier and §5-mind-map go); `triage.md` drops §0's C1 run and 5-loop text; `sequencing.md`, `dispatch-pack.md`, `contract-refresh.md` drop FAST/FULL and axis wording (`contract_surface` ⇒ "strategy row `Contract refresh: RUN`"). `exploratory-lane.md` keeps §5 (the box) and the charter sources; drops 3x/FULL ordering. `ui-kit-class.md` drops `3-cases` / Artifact A lines. Keep every heading another file cites, or note it for Task 3.
- [ ] **Step 6: Copies.** Re-copy `exploratory-lane.md` §5 into `plugins/vc-test/knowledge/exploratory-box.md` and `ui-kit-class.md` into its plugin copy (line 1 header unchanged). The copies already differ from their sources on `main` (`context:check` DOC-010, informational): carry the same edits into each copy so the DOC-010 line count for both files does not grow; record before/after counts in the report.
- [ ] **Step 7: Diagram.** `docs/qa-test-flow.md` = the spec §5 stage block plus the §5.1 table's `Runs when` column.
- [ ] **Step 8: Verify.** `wc -c .claude/commands/qa-test.md .claude/skills/qa-test/SKILL.md` each ≤ 19000; `npm run qa-test:doclint` exit 0; `npm run context:check` exit 0 (old files still exist, so links resolve).
- [ ] **Step 9: Commit:** `feat(qa-test): one strategy-driven path — command, skill core, execution and close-out`.

### Task 3: Move the shared rules out of files about to go

**Files:**
- Modify: `.claude/knowledge/execution/regression-selection.md` §Existing-Coverage Triage
- Modify: `.claude/knowledge/execution/ticket-routing.md`
- Modify: `scripts/test-cases/scope-existing-coverage.ts:11,603`, `ci/lib/suite-batching.ts:10` (comments / printed string only)

- [ ] **Step 1:** Move `coverage-triage.md` §3 (four dispositions), §3a (`REPAIR`/`RE-BASE` split), §3b, §3c and §4 (`tc:scope` core, `runFate`, the no-domain case) into `regression-selection.md` §Existing-Coverage Triage, rewritten for a reader who is `/qa-test`'s staleness check or `qa-suite-sync` — not Artifact A.
- [ ] **Step 2:** `ticket-routing.md`: delete §5–§5d (EFFORT axis, Review task, Story tokens, `ui-kit`, `technical-change`); §1 drops the EFFORT half; §4's `technical-change` row folds into `test` with a line "a refactor is a `test` job; F5 makes its strategy regression-averse; stale cases go to `/qa-test-lifecycle`"; keep §2, §3, §6.
- [ ] **Step 3:** Repoint the two script comments and the `tc:scope` printed line (`scope-existing-coverage.ts:603`) to `.claude/knowledge/execution/regression-selection.md §Existing-Coverage Triage`.
- [ ] **Step 4: Verify.** `npx tsx scripts/test-cases/scope-existing-coverage.ts --help` (or its smallest real invocation) still runs; `grep -n "coverage-triage.md" scripts ci` = 0 hits; `npm run context:check` exit 0.
- [ ] **Step 5: Commit:** `refactor(qa-test): coverage-triage rules to regression-selection; ticket-routing keeps FLOW only`.

### Task 4: Migrate repo consumers

**Files (each: replace `/qa-test-fast`, FAST/FULL, Artifact A, `3-cases`, axis and `--iterate`/`--epic` wording with the new stage or brick; repoint links to deleted skill files):**
- `CLAUDE.md` (Detailed References rows: `/qa-test` pipeline, six axes row deleted, `ticket-routing.md` row's scope)
- `.claude/rules/agents.md` (`test-management-specialist` row: no longer `/qa-test`'s corpus step; owner of `qa-suite-sync` phases 2–4), `.claude/agents/test-management-specialist.md`
- `.claude/ROUTING.md`, `.claude/skills/README.md`, `.claude/knowledge/README.md`, `.claude/knowledge/agents/README.md`, `.claude/knowledge/agents/qa/qa-lead-orchestrator-verifier-mode.md`
- `.claude/knowledge/execution/`: `reports-policy.md`, `run-env.md`, `run-output.md`, `tracker-ops.md`, `ticket-status-transitions.md`, `cases-that-catch-bugs.md`, `regression-promotion.md`
- `.claude/commands/`: `qa-triage-results.md`, `qa-regression.md`
- `.claude/skills/`: `preflight/SKILL.md` + `mcp-requirements.json` (profile `ticket-fast` ⇒ `ticket`), `qa-test-model/SKILL.md` + `test-model.md`, `qa-test-mind-map/SKILL.md`, `qa-docs/SKILL.md`, `qa-review-tests/SKILL.md`, `qa-test-cases-generator/authoring-references.md`, `qa-evidence/output-paths.md`, `qa-metrics/quality-gates.md`, `prompt-review/repo-profile.md`
- `.claude/templates/agent-dispatch.md`, `.claude/templates/test-model.md`
- `.claude/knowledge/domain/search.mind-map.json`, `page-builder.md`, `sales-rep.md` (provenance text only)
- `scripts/lib/regression-triage.ts:20`, `scripts/lib/jira-bug-labels.mjs:13`, `scripts/maintenance/lint-claude-docs.mjs:329` (comments)

- [ ] **Step 1:** Edit each file. A sentence that only explained a removed path is deleted, not reworded.
- [ ] **Step 2: Verify.** `grep -rln --exclude-dir=worktrees -e "qa-test-fast" -e "Artifact A" -e "3-cases" -e "FAST path" -e "FULL path" -e "data_surface" -e "coverage_surface" .claude CLAUDE.md scripts ci config | grep -v verify-gate` lists only the files Task 6 deletes; `npm run context:check` exit 0; `npm test` green.
- [ ] **Step 3: Commit:** `refactor(qa-test): migrate repo consumers to the single /qa-test`.

### Task 5: summary.json contract

**Files:**
- Modify: `.claude/templates/qa-test-summary.schema.json`

- [ ] **Step 1:** Add top-level blocks: `candidate_cases` (array of `{checklist_row, risk, behaviour, layer}`), `stale_cases` (array of `{id, suite, reason}`, reason `renamed-field|removed-selector|known-defective|failed-as-test-defect`), `cost` (`{steps: [{step, inputTotal, output, wallMin}], budget_line: ""}` — the `run-cost.mjs` table and its `budget:` line). `path` gains the value `STRATEGY` (new runs), its `$comment` saying depth is `strategy.depth_label`. Mark `path_route`, `iterations`, `epic.roll_up`, `new_cases_authored`, `coverage_triage`, `discovery` and the `technical-change` value of `flow` with `$comment` "legacy — written by runs before 2026-11-13; the current /qa-test never writes it". Remove nothing.
- [ ] **Step 2: Verify.** `npm run summary:validate` exit 0 over all runs (no baselined file worse); `npm run summary:validate -- --update-baseline` is NOT run.
- [ ] **Step 3: Commit:** `feat(qa-test): summary.json — candidate_cases, stale_cases, cost; legacy keys marked`.

### Task 6: Delete the old surface

**Files:**
- Delete: `.claude/commands/qa-test-fast.md`, `.claude/skills/qa-test-fast/` (all four files)
- Delete: `.claude/skills/qa-test/intake.md`, `context-wave.md`, `axes.md`, `authoring.md`, `coverage-triage.md`, `technical-change.md`, `modes.md`
- Modify: `scripts/maintenance/.prompt-size-baseline.json`

- [ ] **Step 1:** `git rm` the files above.
- [ ] **Step 2:** `npm run context:check:baseline` — the `qa-test.md` entry disappears (now under the cap); confirm with `grep qa-test scripts/maintenance/.prompt-size-baseline.json` showing no `commands/qa-test.md`.
- [ ] **Step 3: Verify.** For each deleted path `p`: `grep -rn --exclude-dir=worktrees "$p" .claude CLAUDE.md scripts ci config plugins` = 0 hits outside `plugins/` (plugin hits are Task 7's list — record them); `npm run context:check`, `npm run qa-test:doclint`, `npm test` all green; `du -cb .claude/skills/qa-test/*.md | tail -1` ≤ 161000.
- [ ] **Step 4: Commit:** `refactor(qa-test)!: remove /qa-test-fast, FAST/FULL and the files only they read`.

### Task 7: Plugins and the lifecycle hand-off

**Files:**
- vc-test: `README.md`, `briefs/triage-classifier.md`, `commands/qa-ticket.md`, `lib/route.mjs` (`technical-change` `next` string), `lib/rounds.mjs`, `lib/triage-collect.mjs` (comments), `skills/qa-design/{SKILL.md,visual-axis.md,personas.md,ux-task-walkthrough.md,claude-design-verification.md}`, `skills/qa-test-strategy/{SKILL.md,entry.md,floors.md,reconcile.md,template.md,verdict-rules.md,lib/floors.mjs}` (comments), `skills/qa-triage-results/{SKILL.md,routing-and-fix.md}`, `skills/ticket-context/{SKILL.md,lib/cache.mjs,lib/github.mjs}` (comments); `.claude-plugin/plugin.json` → `0.17.2`; `CHANGELOG` entry
- vc-fix: `commands/qa-bug.md`, `commands/qa-verify-fix.md`, `knowledge/agents/README.md`, `knowledge/execution/{tracker-ops.md,run-env.md}` (keep in step with the `.claude/` sources edited in Task 4), `skills/qa-report/{SKILL.md,reference.md,lib/model.mjs}` (text only; `reference.md`'s `modes.md` citation dropped); `.claude-plugin/plugin.json` → `0.18.10`; `CHANGELOG` entry
- `.claude-plugin/marketplace.json` only if it pins either version
- `.claude/skills/qa-suite-sync/scope.md`, `.claude/skills/qa-suite-sync/SKILL.md:122`

- [ ] **Step 1: Plugin text.** `/qa-test-fast` ⇒ `/qa-test`; "the single `/qa-test` next" ⇒ present tense; citations of deleted `.claude/skills/qa-test/*` files ⇒ their new homes (`floors.md`'s `coverage-triage.md §3a` ⇒ `regression-selection.md §Existing-Coverage Triage`; `visual-axis.md`'s `axes.md` ⇒ the strategy's `Visual lane` row). `route.mjs` `technical-change` `next`: `/qa-test <KEY> (scoped regression), then /qa-test-lifecycle <KEY> (case sync)`; `qa-ticket.md` step 1 says the same.
- [ ] **Step 2: qa-suite-sync.** `scope.md`: when the input is a ticket and its run folder's `summary.json` holds `stale_cases` or `candidate_cases`, add each stale case as a sync target with its reason and each candidate as a gap to author; its own scope derivation is unchanged. `SKILL.md:122` row ⇒ "After a `/qa-test` run → `/qa-test-lifecycle <TICKET>` (sync, author, promote)".
- [ ] **Step 3: Verify.** `grep -rn -e "qa-test-fast" -e "skills/qa-test/\(intake\|context-wave\|axes\|authoring\|coverage-triage\|technical-change\|modes\)\.md" -e "ticket-routing.md.*§5[a-d]\?" plugins` = 0 hits; `node plugins/vc-test/lib/route.mjs --help` still prints usage; `npm run vc-test:design:check` exit 0; `npm test` green.
- [ ] **Step 4: Commit:** `chore(plugins): vc-test 0.17.2, vc-fix 0.18.10 — name the single /qa-test; lifecycle reads /qa-test's case lists`.

### Task 8: Record and prove

**Files:**
- Modify: `docs/decisions/qa-test-evolution.md` (one new section)

- [ ] **Step 1: Decision record.** Section "Single `/qa-test` (2026-11-13)": what was removed (FAST/FULL, `/qa-test-fast`, Artifact A, `technical-change` flow, `--iterate`, `--epic`, non-ticket targets), E1–E7 one line each, that §8 of the 2026-10-09 design was waived by the owner, and the before/after sizes (command 54,804 → measured; skill 321,653 → measured).
- [ ] **Step 2: Final zero-hit check.** `grep -rln --exclude-dir=worktrees -e "qa-test-fast" -e "Artifact A" -e "FAST path" -e "FULL path" .claude CLAUDE.md scripts ci config plugins | grep -v -e verify-gate -e "scripts/qa-test/doclint.mjs"` = empty.
- [ ] **Step 3: Dry run.** In a fresh session on the branch: `/qa-test <a recent Story key> --dry-run` reaches the strategy approval question, shows the spend line and any `FIXTURE-GAP` list, and writes nothing to the tracker. Record the ticket key and the result in the PR description.
- [ ] **Step 4: Gates.** `npm run context:check`, `npm run qa-test:doclint`, `npm run summary:validate`, `npm test` — all exit 0.
- [ ] **Step 5: Commit:** `docs(decisions): single /qa-test`.
