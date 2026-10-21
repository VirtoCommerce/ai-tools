---
description: "[Testing] Use when a ticket needs a fast but GROUNDED test pass — more than /qa-test FAST's single-agent checklist, less than /qa-test FULL's verifier-gated pipeline. Context from the PR diff, the ticket and the domain map feeds an approved test strategy; its MODEL risks get a test model, and with the mind map they feed one traced checklist; the checklist and, when the strategy asks for one, an exploratory session run in parallel with test data made on the fly, plus the qa-design visual lane when the ticket is UI-visible; the run ends in a short human-readable verdict. feature-test route only."
argument-hint: "<TICKET> [<env>] [--layer fe|be|both] [--no-explore] [--no-visual] [--dry-run]"
disable-model-invocation: true
---

# /qa-test-fast — a grounded quick test of one ticket

You run this orchestration **inline**. Each wave is **one message** of parallel dispatches. The method
behind every step, the rationalization table and the red flags are in
[`../skills/qa-test-fast/SKILL.md`](../skills/qa-test-fast/SKILL.md). **Read it before Step 0.**

| | `/qa-test` FAST | **`/qa-test-fast`** | `/qa-test` FULL |
|---|---|---|---|
| Context | the ticket | ticket + PR diff + domain map + **test strategy** + test model (its `MODEL` risks) + mind map | the same + story review + reachability |
| Execution | one agent (+ visual lane under `--visual`) | checklist lanes ‖ exploratory ‖ visual lane when UI-visible, ≤3 browser lanes at once | + suite authoring + C1 regression + visual lane |
| Gates | inline self-check | inline, per stage | independent verifier per step |
| Suites | untouched | **untouched** | new `Draft` cases |

## Six rules

1. **Bugs are reported only through `/vc-fix:qa-bug`**, one call per bug. Never write a bug report by hand.
2. **No ticket status transition, ever.** The tracker gets **one** comment, and only after the user says
   yes ([`../rules/reports.md`](../rules/reports.md) §0).
3. **Test data is made during the run**, as each checklist item's Data cell says
   ([`../skills/qa-test-fast/execution.md`](../skills/qa-test-fast/execution.md) §Data). There is no
   pre-seed wave. A seeder runs only when an item's Data cell names it.
4. **Every Stage-1 artifact either runs, or is recorded in `verdict.md` as SKIPPED with an observable
   reason** — for example `domain map ABSENT and build FAILED: <why>`. Time pressure is not a reason.
5. **No suite CSV is written.** That means no `Behavior:` stamps and no `Draft` cases.
6. **The deliverable is the HTML page plus `verdict.md`** (≤60 lines, verdict first). The page is not
   optional.

## Step 0 — Pre-flight (inline)

**Env and run folder first.** `npm run run:use -- <TICKET> [<env>]` binds this session's env
([`run-env.md`](../knowledge/execution/run-env.md); no env argument ⇒ the default) and its run folder
`{RUN_DIR}` ([`run-output.md`](../knowledge/execution/run-output.md)). Every script below then resolves both, its
output fills the Environment line of every brief, and **every file this run writes goes into `{RUN_DIR}`** —
the domain map, mind map and GraphQL schema it builds or refreshes included (layout: run-output.md).

1. **Route.** Fetch the ticket and route it per
   [`../knowledge/execution/ticket-routing.md`](../knowledge/execution/ticket-routing.md). Anything
   other than `feature-test` ⇒ **STOP** and name the right command (`/qa-verify-fix`,
   `/qa-hotfix-check`, `/qa-test`).
2. **Environment.** Run [`/preflight`](../skills/preflight/SKILL.md)
   `ticket-fast --ticket <KEY> --components <…>`. It returns env health,
   the deployed build, `{SPRINT}`, the duplicate check (its row says "same build" / "different build" when
   both runs probed the deployed modules) and MCP availability, and runs its own remediation loop. A `not-deployed:*`
   row is BLOCKED-on-deploy, never a FAIL. **No `--expect` here:** the PRs are found in Stage 1, where
   `/ticket-context` asks the same core per PR.
3. **Prior artifacts are inputs.** For this ticket, read the prior run folders `run:use` listed (every env),
   `reports/ba/test-models/<TICKET>-*` (the older place) and `reports/bugs/**`. A prior model is amended into
   `{RUN_DIR}/test-model.md`, never forked. Prior bugs are the dedupe baseline `qa-bug` checks against. A
   prior run on a **different build** supplies context, never results.
   **A prior `summary.json` on the SAME build** (this env's folder) is handled before anything runs:
   - Show its verdict, date and tracker comment id.
   - Ask once whether to re-run. A re-run overwrites that folder's files, so if they are uncommitted,
     ask the user to commit them first.
   - A re-run **amends** the recorded comment id and never posts a second comment
     ([`../knowledge/execution/tracker-ops.md`](../knowledge/execution/tracker-ops.md) §0).
4. **Domain slug.** Take the candidate from the ticket's components and summary, then check it with
   `npm run bl:extract -- --has-domain <slug>`.
5. **Ask the base for this run's coordinates** — done inside `/preflight` step 3 (kb first, then
   VirtoOZ). Carry its hit ids into Stage 1.
6. **Round.** Count it per [`/qa-test-strategy`](../skills/qa-test-strategy/SKILL.md) procedure step 1,
   from local evidence. A fourth round ⇒ **STOP** with that skill's escalation; nothing below runs.

## Stage 1 — Context

Full briefs, merge rules and the context bundle:
[`../skills/qa-test-fast/context-wave.md`](../skills/qa-test-fast/context-wave.md).

1. **Wave 1:**
   - **C** domain map — `/qa-domain-map <slug>` on `playwright-firefox`, only when the map is
     `ABSENT`/`unresolved`; dispatch it first, in the background
   - **A+B** [`/ticket-context <KEY> --domain <slug> --kb-hits <Step 0 ids>`](../skills/ticket-context/SKILL.md)
     — ticket, every attachment and link, the PRs, their deployment on this stand, known ground and
     gaps, as one gated bundle
2. **Join.** The bundle is the context. Its `blockers[]` decide deployment, and if it names a GraphQL
   operation, run both contract-refresh commands
   ([`context-wave.md`](../skills/qa-test-fast/context-wave.md) §Join 1).
3. **Strategy.** Run [`/qa-test-strategy`](../skills/qa-test-strategy/SKILL.md) with the bundle: step 1's
   second round count (the bundle's `signals[]`), then step 2 onward — its gate, then one approval question ([`context-wave.md`](../skills/qa-test-fast/context-wave.md)
   §Strategy). Its STOP is this run's STOP. The approved round decides which artifacts below run.
4. **Wave 2 — one message:**
   - `/qa-test-model <TICKET> --context <run context> --strategy <test-strategy.md>`, run by you, **only
     when** the strategy's `Test model` row is `RUN`; otherwise recorded as `SKIP — no MODEL risk`
   - `/qa-test-mind-map update|build <slug> --from <TICKET>` — `ba-system-analyzer`, no browser, **only
     when** the strategy's `Mind map` row is `RUN`, **without** build step 10; then copy the map signals into the run context
     ([`context-wave.md`](../skills/qa-test-fast/context-wave.md) §Wave 2)
5. **Wave 3.** Run `/qa-checklist <TICKET> --from-model --strategy <test-strategy.md> [--mind-map <slug>]`
   (always Mode 5, which reads no model when the strategy ran none; `--mind-map` only when the mind map
   ran) and write the result to
   `{RUN_DIR}/testing-checklist.md`.
6. **Stage gate.** The strategy gate passed and the round is approved. When a model ran, every model gate
   clause is `PASS`/`FIXED`. Every in-scope risk, scenario row and node is either an item or an omission
   line. Every item has a Data cell.

   **`--dry-run` stops here.** It prints the artifact list and the Stage-2 dispatch plan and writes
   nothing to the tracker.

## Stage 2 — Execution (one message of ≤3 browser lanes; the visual lane follows when a slot frees)

Briefs, the lane split, the data rules and teardown:
[`../skills/qa-test-fast/execution.md`](../skills/qa-test-fast/execution.md).

1. **Checklist runners** — one per checklist lane section. `qa-frontend-expert` takes
   `playwright-chrome`; `qa-backend-expert` takes `playwright-edge`. `--layer` narrows this to one lane.
2. **Exploratory** — `/qa-exploratory ticket <TICKET> <env>` (the lane never re-binds the env) →
   `qa-testing-expert` on `playwright-firefox`.
   Only when the strategy's Exploratory row is `RUN`. The charter is that row's risks plus the model's
   unresolved items when a model ran. `--no-explore` drops the lane. That is recorded, never
   silent: against an approved `RUN` it is a deviation — append it to the round's `### Amendments` and list
   the charter's risks under *Not tested, and why*.
3. **Visual** — `ui-ux-expert` on Chrome DevTools MCP, whenever `visual_surface: true` (derived from the
   bundle's PR layers, recorded in the run context). **Its brief's first line makes it invoke the Skill tool with `skill: "qa-design"`**; the
   `/qa-design` command is never run. `--no-visual` drops the lane, recorded never silent. Trigger, the
   brief, the lane-count rule (a 4th lane waits for the first to return) and verdict handling:
   [`../skills/qa-test/visual-axis.md`](../skills/qa-test/visual-axis.md) §2, §4, §5. Writes
   `design-report.md` + `summary.json.visual`.
4. **Join.** Pass every bullet of [`execution.md`](../skills/qa-test-fast/execution.md) §Join gate —
   results, ledger, settings, the visual lane's `qa-design skill: loaded`, and every exploratory/visual
   finding as a table row.

## Stage 3 — Verdict

Triage, the verdict rules, the report shapes and the tracker comment:
[`../skills/qa-test-fast/verdict.md`](../skills/qa-test-fast/verdict.md).

1. **Triage.** Invoke the Skill tool with `skill: "qa-triage-results"`, args `ticket <TICKET> --verify`. It
   classifies every non-passing checklist row, and Phase 4 sends **every** real-bug candidate through
   `vc-fix:qa-investigate`, which returns an evidence package for each one. It returns the confirmed bugs, the
   checklist fixes (you apply them; you are the checklist's only writer) and the dismissed rows. A non-empty
   `unresulted[]` sends you back to the Stage 2 join. Visual findings block or advise per
   [`visual-axis.md`](../skills/qa-test/visual-axis.md) §3.
2. **Bugs.** Call `/vc-fix:qa-bug` **once per confirmed bug**, sequentially, passing its investigation package
   so that it reuses the package and does not reproduce the bug again. A `needs-review` candidate is listed in
   `verdict.md` and not filed. Its tracker-ticket step runs only after the user says yes. Then tear down
   by ledger id ([`execution.md`](../skills/qa-test-fast/execution.md) §Data) and re-read.
3. **Verdict.** Decide it per [`../skills/qa-test/close-out.md`](../skills/qa-test/close-out.md)
   §5-verdict.2.
4. **Write `{RUN_DIR}`:** `summary.json`, `verdict.md`, and the updated `testing-checklist.md`.
   Then run `npm run summary:validate`.
5. **HTML page and comment — ONE `/vc-fix:qa-report` call** ([`verdict.md`](../skills/qa-test-fast/verdict.md) §HTML page). It builds the page and the comment. Skill refused ⇒ `/plugin update`, stop the report step.
6. **The post.** `qa-report` asks the one question (never ask it again here); on yes, write the returned id into
   `summary.json.tracker.comment_id` — a same-build re-run amends that id (Step 0.3); a new build posts a new
   comment. No status transition.
7. **Bank what the run established.** For each platform behaviour the verdict states: matched ⇒
   `kb_confirm`, contradicted ⇒ `kb_dispute`, base held nothing ⇒ `kb_capture`
   (`.claude/knowledge/execution/kb-capture-contract.md`). Public base — nothing client-specific. List the ids in
   `summary.json.report.kb`, then re-run `npm run summary:validate`.
8. **Chat.** The verdict line, the page link, the `verdict.md` path, the bug links. Nothing else.
