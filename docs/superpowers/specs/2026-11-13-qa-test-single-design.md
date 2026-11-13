# One thin `/qa-test`: strategy-driven, built on vc-test

> **Status: for owner approval (2026-11-13); decisions E1–E7 in §10.** This design continues the `/qa-test` redesign of 2026-10-09
> (decisions D1–D12, VCST-6249). That file was removed from `docs/superpowers/specs/` on 2026-11-02 in a
> spec clean-up; read it with
> `git show 40805707^:docs/superpowers/specs/2026-10-09-qa-test-strategy-redesign.md`. Its decisions stand
> and are not reopened here. **Its §8 validation gate is waived by the owner (2026-11-13):** `/qa-test-fast`
> has been in use as the prototype, and the old FAST/FULL paths are deleted without a further comparison run.

## 1. Intent

`/qa-test` is too heavy to load and too rigid to run. The command is 55.7K characters (BUDGET-004 caps a
loaded-whole prompt at 19K; it survives only through the size baseline), its skill is 322K characters in 16
files, and it carries two paths (FAST/FULL), a third flow (`technical-change`) and three opt-in axis flags. A
second command, `/qa-test-fast`, sits between FAST and FULL.

The owner wants **one thin `/qa-test`** whose flow is **assembled per ticket**: the orchestrator picks the
skills and agents a ticket needs from what the ticket and its change say, keeps its own context small, and
does not spend time on steps the ticket does not need. `/qa-test-fast` is removed.

The choice of steps is not left to the model's judgment at run time. It is the **approved test strategy**
(`/vc-test:qa-test-strategy`): deterministic floors set the minimum, every artifact row is `RUN` or
`SKIP — <observable reason>`, and the strategy is reconciled against what ran before the verdict. That is
what makes a flexible flow auditable.

## 2. Goals, non-goals, anti-goals

**Goals**
- One command, `/qa-test <TICKET>`. No FAST/FULL, no `/qa-test-fast` (D1).
- The command only orchestrates. Context, strategy, routing and triage come from vc-test; repo-specific
  steps come from repo skills. Each step is invoked, not restated.
- The command fits BUDGET-004 (≤19,000 chars) and leaves `.prompt-size-baseline.json`. `SKILL.md` stays
  ≤19,000 chars too.
- The orchestrator holds paths, not content: every hand-off between steps is a file in `{RUN_DIR}`.

**Non-goals**
- No change to `/vc-fix:qa-verify-fix`, `/qa-hotfix-check`, `/vc-fix:qa-fix`, `/qa-regression`,
  `/qa-test-lifecycle` or `/vc-test:qa-ticket`.
- No change to the vc-test skills' behaviour. Plugin files change only where their text names a
  removed command or file (§8).
- No new execution machinery: runners, lanes, triage, `qa-investigate`, `qa-bug`, `qa-report` are reused.

**Anti-goals** — a result that would be a failure even if it runs
- **A copy of the plugin.** No repo file restates how context is gathered, how a strategy is chosen, how a
  job is routed or how a result is triaged. If the repo needs that behaviour, it calls the plugin.
- **A silent skip.** A step that did not run without a `SKIP — <reason>` row somewhere a reader looks.
- **The weight coming back as prose.** A slimmer command whose detail moved, unchanged, into new skill
  files. The total size of what a run reads must go down, not just the command's.
- **Two comments, or a comment without a yes.** The one-comment rule (`.claude/rules/reports.md` §0) holds.

## 3. Constraints

- **vc-test is a hard dependency.** Enabled for the team in the tracked `.claude/settings.json`. Step 0
  checks the needed skills are present at a minimum version and STOPs with the install line otherwise
  (the pattern `/qa-test-fast` Step 0 uses today). `/qa-test` is a repo command, never distributed, so a
  machine without vc-test is not a supported case.
- **Plugin files may not read `.claude/`** (`context:check` DOC-009). The repo may call the plugin; the
  reverse stays forbidden.
- **Two plugin knowledge copies take their source from `.claude/skills/qa-test/`**:
  `plugins/vc-test/knowledge/exploratory-box.md` ← `exploratory-lane.md` §5, and
  `plugins/vc-test/knowledge/ui-kit-class.md` ← `ui-kit-class.md`. A source cannot be deleted while its
  copy names it.
- **Per-plugin versioning.** A text change in `plugins/vc-test` or `plugins/vc-fix` bumps that plugin's
  version and needs its `{name}--v{version}` tag (`docs/release-process.md` §Step 1, §Step 5a).
- **Ticket status** moves only per `.claude/knowledge/execution/ticket-status-transitions.md` (two hops at
  most, the closing one confirmed).
- **NO CODE ⇒ NO UNIT TEST.** This change is prompts and knowledge; gates are `context:check` and
  `summary:validate`. A script changed for the migration gets a temporary test only.

## 4. Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| **A** | One path; the approved vc-test strategy decides which repo steps run. Context, strategy, routing, triage come from vc-test; repo keeps only what the plugin does not do | Largest cut (command ≤19K, ~half the skill deleted); vc-test becomes a hard dependency (it already is for triage and visual) | **Chosen** by the owner, 2026-11-13 |
| B | Trim in place: keep FAST/FULL, move detail into the skill, merge files, delete `/qa-test-fast` | Lowest risk; but the repo keeps its own intake and context wave beside the plugin's, the saving is modest and 19K is hard to reach | Rejected: keeps the duplication |
| C | `/qa-test` as a wrapper around `/vc-test:qa-ticket`, adding the repo's tracker/docs steps after it | No duplication; but `qa-ticket` is a prototype with its own two human points and its own `verdict.md` — one run would ask twice and write two verdicts | Rejected |

## 5. The shape

```
/qa-test <TICKET> [<env>] [--yes] [--dry-run]
 0 ROUTE     ticket-routing.md FLOW → job · preflight · prior runs · round count (≤3) · vc-test version check
 1 CONTEXT   /vc-test:ticket-context → bundle   ‖  /qa-domain-map when ABSENT — both joined before step 2
 2 STRATEGY  /vc-test:qa-test-strategy → test-strategy.md → gate → [strategy-verifier if Critical] → ONE approval
             ── --dry-run stops here
 3 PREPARE   only the rows marked RUN: contract refresh · test model · mind map · staleness check of
             cases at risk → checklist (every item names its R-n)
 4 EXECUTE   ≤3 browser lanes: checklist runners ‖ exploratory (first or alongside, D3) ‖ visual ‖ regression
             of the selected, non-stale cases
 5 CLOSE     reconcile → triage → investigate → qa-bug → verdict → summary.json + verdict.md
             → qa-report (page + ONE comment, after a yes) → status (confirmed) → docs → kb → candidate cases
```

### 5.1 Bricks — who owns each, and when it runs

| Brick | Owner | Runs when |
|---|---|---|
| Job routing (`verify-fix` / `hotfix-check` / `test`) | repo `ticket-routing.md` §1–§4 (FLOW only) | always; a non-`test` job STOPs and names the command. Not vc-test `route.mjs`: it maps status to role only through `profile.test.routing`, which this repo's profiles do not carry, so every Bug would come back `unresolved` |
| Env, build, MCP, duplicate run | repo `/preflight` | always |
| Ticket, materials, PRs, deployment, known ground | `/vc-test:ticket-context` | always |
| Domain map | repo `/qa-domain-map` | the map is `ABSENT`/`unresolved` |
| Strategy, floors, gate, approval, Critical-risk verifier | `/vc-test:qa-test-strategy` (+ `vc-test:strategy-verifier`) | always |
| Contract refresh | repo commands (`contract-refresh.md`) | strategy row `Contract refresh: RUN` |
| Test model | repo `/qa-test-model --strategy` | strategy row `Test model: RUN` |
| Mind map (update, no stamps) | repo `/qa-test-mind-map` | strategy row `Mind map: RUN` |
| Checklist | repo `/qa-checklist --from-model --strategy` | always |
| Checklist runners | `qa-frontend-expert` (chrome) · `qa-backend-expert` (edge) | always, one per lane section |
| Exploratory | repo `/qa-exploratory ticket` → `qa-testing-expert` (firefox) | strategy row `Exploratory: RUN` |
| Visual lane | `vc-test:ui-ux-expert` + Skill `vc-test:qa-design` | strategy row `Visual lane: RUN` |
| Staleness check + regression of cases at risk | repo `tc:scope` / `regression:select` + `/qa-regression <ids>` | strategy row `Coverage triage + regression: RUN` (F5/F7). Stale cases go to `/qa-test-lifecycle`, never into the run (D11) |
| Reconcile plan vs fact | `/vc-test:qa-test-strategy` `reconcile.md` | always |
| Triage | Skill `vc-test:qa-triage-results ticket --verify` | always |
| Investigation | `vc-fix:qa-investigate` | each Medium+ real-bug candidate |
| Bug filing | `/vc-fix:qa-bug` with the package | each confirmed bug, after its own question |
| Verdict rules (AC/DoD reconcile, severity floor) | repo `close-out.md` | always |
| Page + the one tracker comment | `/vc-fix:qa-report` | always; the post only after a yes |
| Status transition | repo `reporting.md` §5-status (qa-lead rules) | always asked; never past `TESTED` |
| Documentation | repo `/qa-docs` | ticket ends in Tested or Done |
| Domain-map write-back | repo `reporting.md` §5-docs-map | a map exists and the run established something; non-blocking |
| kb confirm / dispute / capture | `kb_*` tools | each platform behaviour the verdict states |
| Candidate and stale cases → lifecycle | `summary.json` `candidate_cases` / `stale_cases`, then ONE question offering `/qa-test-lifecycle <TICKET>` | either list non-empty (§5.6, E7) |

### 5.2 Test data — no seeder is written in a run (E5)

FULL's Step 3a (`test-data-engineer` dispatched when `data_surface` was `true`) goes with the axes. Its place:

- **The strategy decides per risk** (its step 10), the checklist's Data cell per item, cheapest first:
  1. already in the environment — `{{VAR}}`, an existing `@td()` alias, `live-discover`;
  2. **created on the fly** — `create-on-fly <entity> via <op>`: `AGENT-TEST-` prefix, id in the ledger,
     torn down by id at close. The default for state only this run needs, for session state (cart, list,
     quote draft), for a state the environment can take away (`.claude/rules/test-data.md` FIFTH RULE),
     and for anything one or two operations make, the diverging values of the SECOND RULE included;
  3. **an existing seeder** a Data cell names (`npm run seed … --only <part>`) — a cross-entity combination,
     a state that needs asynchronous processing before the test (search index, loyalty recalculation, a
     background job), a record that must exist before a redeploy, a persistent fixture mutated and restored;
  4. none of these ⇒ the risk's Data is **`FIXTURE-GAP`**.
- **A new seeder is never written inside `/qa-test`** — the same reasoning as D2: repository code is not
  written by a ticket run. A new seeder is warranted only when the state will be reused by regression
  cases, the environment leaves it alone, and a few operations cannot make it; it is authored by
  `test-data-engineer` through `/qa-generate-data` → `/qa-seed-data`.
- **A gap is found before approval, not during execution.** Every `FIXTURE-GAP` risk is listed in the
  approval question with two answers: run `/qa-generate-data` + `/qa-seed-data` first and come back, or
  approve with those risks `BLOCKED — FIXTURE-GAP` in the strategy's Out of scope.
- Teardown is by ledger id only, after bug filing (`/qa-test-fast` `execution.md` §Data, moved as is);
  never a `seed:*:teardown` sweep.

### 5.3 Budget and time (E6)

- **Measured, by the plugin's script, not a copy.** Every dispatch description starts
  `[vc-test:qa-test.<step>]`, so `plugins/vc-test/lib/run-cost.mjs --since <start> --budget qa --key <TICKET>`
  counts input-equivalent tokens and wall minutes per step from the session logs. The budget is the
  profile's `test.budget.qa`; without one, the script's defaults (half of the measured VCST-6398 run:
  386M tokens, 92.4 wall minutes), named as defaults.
- **Shown before it is spent.** The approval question carries the spend so far and the artifacts chosen.
- **Never a stop.** The budget does not stop, pause or question the run at any point (owner, 2026-11-13).
  An overrun is a reported fact, not a gate.
- **Reported at close**: the per-step table in `summary.json`, its `budget:` line in `verdict.md`.
- **Time is spent by the strategy, so that is where it is saved**: floors alone switch on the model,
  exploratory and visual lanes; ≤3 browser lanes at once; exploratory box 30–60 min; the orchestrator
  holds paths, not content; each agent runs on the model its own definition declares.

### 5.4 What the command file holds

The stage list above, the brick table's `Runs when` column as one-line rules, the STOP conditions, the two
human points (strategy approval, the post/status questions), and links. It holds **no method**: no floor
text, no routing matrix, no brief text, no triage taxonomy.

### 5.5 Modes

- **No `--iterate`, no `--epic`** (owner, 2026-11-13 — this reverses the 2026-10-09 §7 note that kept them;
  no `summary.json` under `reports/` records a run of either). A re-test on a new build is simply
  `/qa-test <TICKET>` again: the strategy skill counts it as the next round (≤3 per ticket, a new section,
  a new comment). An Epic's stories are tested one `/qa-test` each. Either flag, if passed, is answered with
  one line naming this and the run goes on without it.
- **Ticket keys only, one per run** (owner, 2026-11-13). A feature name, `PR #N` or several keys STOP with
  one line: a feature area → `/qa-exploratory`, a PR → the ticket it belongs to or `/qa-regression`,
  several keys → one run each.
- A not-fixed Bug runs as `test` with mission "reproduce and characterize" and names `/vc-fix:qa-fix` next.
- A refactor, migration or dependency bump is **not** a separate flow: the floors (F5) make the strategy
  regression-averse, and the bricks above run as selected. **Consequence of D2/D11, stated so it is not
  lost:** such a ticket no longer gets its stale cases repaired inside the run; the run lists them, and
  `/qa-test-lifecycle <TICKET>` repairs them. vc-test `route.mjs`'s `technical-change` `next` line (which
  `/vc-test:qa-ticket` prints when it stops) is reworded to name both commands — a text change, no
  behaviour change.

### 5.6 Cases: used, never edited — handed to `/qa-test-lifecycle` (E7)

`/qa-test` reads and runs suite cases; it never writes, edits or deletes one (D2, D11). Two lists carry
what the run learned about the corpus to the one command that may change it:

- **`stale_cases`** — cases at risk that the staleness check (or a run) showed no longer match the build:
  `{ id, suite, reason }`, `reason` one of `renamed-field` · `removed-selector` · `known-defective` ·
  `failed-as-test-defect` (triage classified a FAIL as a case defect, not a product bug) · `non-executable` (a row
  `suites:executability` flags) · `repair` (a REPAIR disposition: a moved route, a dead `@td()` alias…).
- **`candidate_cases`** — checklist items that PASSED and that no suite case covers:
  `{ checklist_row, risk, behaviour, layer }`.

At close, after the verdict and the comment, if either list is non-empty: ONE question — run
`/qa-test-lifecycle <TICKET>` now, or later. `verdict.md` names the command either way.

**`qa-suite-sync` reads them.** When its input is a ticket and that ticket's run folder holds a
`summary.json` with either list, `scope.md` adds both to the change inventory: each stale case becomes a
sync target with its reason, each candidate a gap to author. It still derives its own scope from the
ticket as today; the lists add to it, never replace it. Its "Which input when" row for "after a `/qa-test`
run authored new cases" is reworded: `/qa-test` no longer authors, so after a `/qa-test` run the route is
`/qa-test-lifecycle <TICKET>`, which syncs, authors and then promotes.

## 6. What is removed

| Today | After |
|---|---|
| `/qa-test-fast` command + `skills/qa-test-fast/` | deleted; its runner briefs, data rules and join gate move into `skills/qa-test/execution.md`, its verdict/report rules into `close-out.md` |
| FAST/FULL paths, the EFFORT axis, `ticket-routing.md` §5–§5d | deleted; depth is the strategy's derived label `light`/`standard`/`deep` (D5), reported, never an input |
| `1a`/`1b` intake waves, `1r`·`1c`·`1d`·`1c-map` context wave, the six axes | `ticket-context` bundle + floors. `intake.md`, `context-wave.md`, `axes.md` deleted |
| Artifact A (2a triage + authoring), `1e-plan`, `3-cases` verifier | deleted (D2, D11). `authoring.md`, `coverage-triage.md` deleted. `test-management-specialist` is no longer dispatched by `/qa-test` |
| The `technical-change` flow | deleted; `technical-change.md` deleted |
| FULL's `5-report` Feature-Release-Gate verifier | replaced by the Critical-risk strategy verifier |
| `--visual` · `--contract` · `--coverage` · `--axes` | deleted; the strategy rows decide. Each is answered with one line if passed |
| Feature-name and `PR #N` targets, several ticket keys at once | deleted (§5.5) |
| `--iterate` (5-loop) and `--epic` | deleted (§5.5); `modes.md` deleted, `qa-report/reference.md`'s citation repointed |

**Kept in `skills/qa-test/`**, each trimmed to what the new flow reads: `SKILL.md`, `execution.md` (new,
from `/qa-test-fast`), `close-out.md`, `triage.md` (App Insights correlation and the visual-finding classes —
`visual-axis.md` cites it), `reporting.md` (5-status, 5-docs, 5-docs-map only),
`sequencing.md`, `dispatch-pack.md`, `contract-refresh.md`, `exploratory-lane.md` (canonical source of
`exploratory-box.md`), `ui-kit-class.md` (canonical source of the plugin copy).

## 7. Deliverables of a run

`{RUN_DIR}/test-strategy.md` (the round's section, approved and reconciled) · `testing-checklist.md` with
results · `summary.json` (validated by `npm run summary:validate`) · `verdict.md` (≤60 lines, verdict first)
· the HTML page and the one tracker comment from `/vc-fix:qa-report` · bug tickets only through
`/vc-fix:qa-bug` · `candidate_cases` and `stale_cases` in `summary.json` (§5.6) · the run cost (§5.3). No suite CSV is written.

## 8. Migration

Counted 2026-11-13 under `.claude`, `plugins`, `scripts`, `ci`, `config`, `CLAUDE.md`, `package.json`
(worktrees excluded): `qa-test-fast` 40 files · `ticket-routing.md` 23 · `Artifact A` 29 · `3-cases` 6 ·
FAST/FULL path wording 18 · `technical-change` 19. Plugin text naming `/qa-test` or `/qa-test-fast`: 83
lines in vc-test and vc-fix. Plugin files that cite a `.claude/skills/qa-test/` file being deleted:
`vc-test/skills/qa-design/visual-axis.md` (`axes.md`), `vc-test/skills/qa-test-strategy/floors.md`
(`coverage-triage.md` §3a, how a `RE-BASE` row is settled at triage — that rule, with §3 and §4, moves into
`regression-selection.md` and `floors.md` is repointed), `vc-fix/skills/qa-report/reference.md` (`modes.md`). `route.mjs`'s
`technical-change` `next` text points at the removed flow (§5.5).

Order, one branch:
1. New command + `SKILL.md` + `execution.md`; trim the kept skill files.
2. Delete `/qa-test-fast`, its skill, and the removed `qa-test` skill files; drop the command from the
   prompt-size baseline (`npm run context:check:baseline`).
3. Migrate repo consumers (`.claude/**`, `CLAUDE.md`, `ROUTING.md`, `rules/agents.md`, `ticket-routing.md`, `qa-suite-sync` (§5.6),
   `summary.json` validator and template).
4. Plugin text (vc-test, vc-fix), version bump and tag per plugin.
5. `docs/decisions/qa-test-evolution.md`: one entry — what was removed, why, and that §8 was waived.

Gate for the branch: `npm test` green (it runs `context:check`), every `/qa-test` link resolves, and a dry
run (`/qa-test <TICKET> --dry-run`) reaches the approval on one recent ticket.

## 9. Success measures

- `.claude/commands/qa-test.md` ≤19,000 chars; not in `.prompt-size-baseline.json`.
- `skills/qa-test/` total at most half of today's 322K; no file moved there unchanged from a deleted one.
- Zero references to `/qa-test-fast`, FAST/FULL paths, Artifact A or `3-cases` outside `docs/decisions/`.
- Every strategy artifact row in a run ends as a result or a `SKIP — <reason>` in `verdict.md`.
- Every run's `summary.json` carries its per-step cost and its budget line.

## 10. Decisions taken in this round (owner, 2026-11-13)

| # | Question | Decision |
|---|---|---|
| E1 | Approach | A — one path, the vc-test strategy decides (§4) |
| E2 | Run the 2026-10-09 §8 validation before deleting? | No — waived; `/qa-test-fast` was the prototype in use |
| E3 | Keep `--iterate` / `--epic`? | No — both removed (§5.5) |
| E4 | Non-ticket targets? | Ticket keys only, one per run (§5.5) |
| E5 | May a run write a new seeder? | No — `FIXTURE-GAP` is raised at approval; seeders come from `/qa-generate-data` + `/qa-seed-data` (§5.2) |
| E7 | How do the run's case findings reach the corpus? | `candidate_cases` + `stale_cases` in `summary.json`; one question at close offers `/qa-test-lifecycle <TICKET>`; `qa-suite-sync` reads both lists (§5.6) |
| E6 | Budget: report only, or stop? | Report only: measured with `run-cost.mjs`, shown at approval and at close; the run is never stopped or asked on budget (§5.3) |

## 11. Calls made in this design (the builder's, checkable)

- Status transitions stay as today's `/qa-test` does them (`/qa-test-fast` made none): `/qa-test` is the
  one ticket command that owns status.
- `5-docs-map` survives as a non-blocking close-out step; `5-mind-map` (build a missing map at close) is
  dropped — the strategy's Mind map row is the only trigger.
- Regression of cases at risk runs through `/qa-regression <ids>` rather than a C1 lane of its own.
- One branch, staged commits, rather than a series of PRs.
- Routing reads `ticket-routing.md`, not `route.mjs` (§5.1); `ticket-routing.md` keeps §1–§4 and §6.
- The domain map, when it has to be built, is joined before the strategy (as `/qa-test-fast` Wave 1 does),
  so the strategy's Mind map row can be `RUN` on a domain's first run.
- `coverage-triage.md` §3 (the dispositions), §3a (`RE-BASE`) and §4 (`tc:scope`) move into `.claude/knowledge/execution/regression-selection.md` §Existing-Coverage Triage — `/qa-test-lifecycle` and `tc:scope`'s own output use them too, so they belong to the on-demand knowledge tier, not to `/qa-test`.
- Dispatch descriptions use the `[vc-test:qa-test.<step>]` prefix so `run-cost.mjs` counts them unchanged.