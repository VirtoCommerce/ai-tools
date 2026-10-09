---
description: "[Testing] Prototype of the single /qa-test (design D1–D12, draft #417): route the job, gather context, choose an explicit test strategy the user approves (--yes skips), then run only what the strategy selected — under deterministic floors F1–F9 and at most three rounds per ticket. Context from the ticket, the PR diff and the domain map; test model, mind map, exploratory (first or alongside), visual lane and a staleness-checked regression run as the strategy and its floors decide; data made on the fly; no suite writes (candidate cases instead); ends in a short human-readable verdict and a plan-vs-fact reconciliation."
argument-hint: "<TICKET> [--layer fe|be|both] [--no-explore] [--no-visual] [--dry-run] [--yes]"
disable-model-invocation: true
---

# /qa-test-fast — route, choose a strategy, then test (prototype of the single `/qa-test`)

You run this orchestration **inline**. Each wave is **one message** of parallel dispatches. The method
behind every step, the rationalization table and the red flags are in
[`../skills/qa-test-fast/SKILL.md`](../skills/qa-test-fast/SKILL.md). **Read it before Step 0.**

**This command is the prototype of the single `/qa-test`** described in
`docs/superpowers/specs/2026-10-09-qa-test-strategy-redesign.md` (draft #417, decisions D1–D12). `/qa-test` <!-- doclint:may-not-exist — the design lands with #417 -->
FAST/FULL stay untouched until that design's §8 validation passes. Depth here comes from the strategy's
risks and the floors in [`../skills/qa-test-strategy/floors.md`](../skills/qa-test-strategy/floors.md),
never from the ticket type.

## Seven rules

1. **Bugs are reported only through `/vc-fix:qa-bug`**, one call per bug. Never write a bug report by hand.
2. **No ticket status transition, ever.** The tracker gets **one** comment, and only after the user says
   yes ([`../rules/reports.md`](../rules/reports.md) §0).
3. **Test data is made during the run**, as each checklist item's Data cell says
   ([`../skills/qa-test-fast/execution.md`](../skills/qa-test-fast/execution.md) §Data). There is no
   pre-seed wave. A seeder runs only when an item's Data cell names it.
4. **Every Stage-1 artifact either runs, or is recorded in `verdict.md` as SKIPPED with an observable
   reason** — for example `domain map ABSENT and build FAILED: <why>`, or the approved strategy's own
   `SKIP — <reason>`. Time pressure is not a reason.
5. **No suite CSV is written** (D2): no `Behavior:` stamps, no `Draft` cases. A passing item no suite
   case covers is a `candidate case` in `verdict.md`, for `/qa-test-lifecycle`.
6. **The deliverable is the HTML page plus `verdict.md`** (≤60 lines, verdict first). The page is not
   optional.
7. **At most three rounds per ticket** (D6). A fourth is refused at Step 0, before any work
   ([`../skills/qa-test-strategy/rounds.md`](../skills/qa-test-strategy/rounds.md)).

## Step 0 — Pre-flight (inline)

1. **Route the job** (deterministic — type × status role per
   [`../knowledge/execution/ticket-routing.md`](../knowledge/execution/ticket-routing.md) §2–§3; its
   EFFORT axis §5–§5d is NOT used here):

   | Type × status role | Job |
   |---|---|
   | Bug, `fix-ready` | **STOP** → `/vc-fix:qa-verify-fix <TICKET>` |
   | Bug, `hotfix-ready` | **STOP** → `/qa-hotfix-check <TICKET>` |
   | Sub-task | re-enter with the parent's type × status |
   | anything else (Story, Task, Epic, Review task, Technical task, Bug `not-fixed`, a PR) | **test** — a refactor's strategy is regression-averse with no new-behaviour risks; a `not-fixed` Bug's mission is reproduce-and-characterize, next step `/vc-fix:qa-fix` |
2. **Count the rounds** per [`rounds.md`](../skills/qa-test-strategy/rounds.md). A fourth ⇒ **STOP** with
   the escalation there. Round ≥ 2 ⇒ record the last tested commit of each PR.
3. **Environment.** Run `npm run env:check`, record the deployed build per
   [`../templates/agent-dispatch.md`](../templates/agent-dispatch.md) §Build Verification, and resolve
   `{SPRINT}` as [`../skills/qa-test/preflight.md`](../skills/qa-test/preflight.md) does.
4. **Prior artifacts are inputs.** For this ticket, glob `reports/tickets/*/<TICKET>/`,
   `reports/ba/test-models/<TICKET>-*` and `reports/bugs/**`. A prior model is amended, never forked.
   Prior bugs are the dedupe baseline `qa-bug` checks against. A prior run on a **different build**
   supplies context, never results.
   **A prior `summary.json` on the SAME build** is handled before anything runs:
   - Show its verdict, date and tracker comment id.
   - Ask once whether to re-run. A re-run overwrites that folder's files, so if they are uncommitted,
     ask the user to commit them first.
   - A re-run **amends** the recorded comment id and never posts a second comment
     ([`../knowledge/execution/tracker-ops.md`](../knowledge/execution/tracker-ops.md) §0).
5. **Domain slug.** Take the candidate from the ticket's components and summary, then check it with
   `npm run bl:extract -- --has-domain <slug>`.
6. **Ask the base for this run's coordinates.** For each page path, GraphQL operation and endpoint the
   ticket names, run `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`). Record the
   hit ids; a miss is not a blocker. Rule: [`../../CLAUDE.md`](../../CLAUDE.md) §Essential Rules →
   *Product context*.

## Stage 1 — Context

Full briefs, merge rules and the context bundle:
[`../skills/qa-test-fast/context-wave.md`](../skills/qa-test-fast/context-wave.md).

1. **Wave 1 — one message:**
   - **A** ticket, comments and attachments — `ba-system-analyzer`, no browser
   - **B** linked PRs and their `gh pr diff` — `ba-api-specialist`, no browser
   - **C** domain map — `/qa-domain-map <slug>` on `playwright-firefox`, only when the map is
     `ABSENT`/`unresolved`
2. **Join.** Merge A+B+C into the context bundle. If B names a GraphQL operation, run both
   contract-refresh commands ([`context-wave.md`](../skills/qa-test-fast/context-wave.md) §Join 1).
3. **Strategy — you, inline.** Invoke the Skill tool with `skill: "qa-test-strategy"`, args
   `<TICKET> --context <bundle>` (plus `--yes` when passed). It writes this round's section of
   `test-strategy.md`, applies the floors, runs its gate, dispatches the verifier when a risk is Critical,
   and asks the user **once** to approve. **Nothing below runs until the strategy is `APPROVED` or
   `AUTO (--yes)`.** F6 fired (the build is not deployed) ⇒ the run ends here as `BLOCKED`. Its artifacts
   table decides everything below.
4. **Wave 2 — one message, only the rows the strategy marked `RUN`:**
   - `/qa-test-model <TICKET> --context <bundle>` (round ≥ 2: amend), run by you
   - `/qa-test-mind-map update|build <slug> --from <TICKET>` — `ba-system-analyzer`, no browser,
     **without** build step 10; then copy the map signals into the bundle
     ([`context-wave.md`](../skills/qa-test-fast/context-wave.md) §Wave 2)
   - the staleness check over F5's selected cases, inline
     ([`floors.md`](../skills/qa-test-strategy/floors.md) §Staleness check): the stale ids go into the
     strategy's Artifacts row and to `/qa-test-lifecycle`; the rest is the regression id list
5. **Wave 3 — explore first**, only when the strategy says `FIRST` (D3): `/qa-exploratory ticket <TICKET>`
   → `qa-testing-expert` on `playwright-firefox`, in the strategy's box
   ([`execution.md`](../skills/qa-test-fast/execution.md) §Exploratory). What it observed feeds the checklist.
6. **Wave 4 — the checklist.** Model ran ⇒ `/qa-checklist <TICKET> --from-model --mind-map <slug>`; model
   skipped ⇒ `/qa-checklist <TICKET>` with the strategy's approach table as its conditions. Write it to
   `reports/tickets/{SPRINT}/<TICKET>/testing-checklist.md`; every item names its `R-n`.
7. **Stage gate.** The strategy is approved. Every model gate clause is `PASS`/`FIXED` (when the model
   ran). Every in-scope risk, scenario row and node is an item or an omission line. Every item has a Data
   cell. The regression id list holds no stale case.

   **`--dry-run` stops here.** It prints the artifact list and the Stage-2 dispatch plan and writes
   nothing to the tracker.

## Stage 2 — Execution (one message of ≤3 browser lanes; the visual lane follows when a slot frees)

Briefs, the lane split, the data rules and teardown:
[`../skills/qa-test-fast/execution.md`](../skills/qa-test-fast/execution.md).

1. **Checklist runners** — one per checklist lane section. `qa-frontend-expert` takes
   `playwright-chrome`; `qa-backend-expert` takes `playwright-edge`. `--layer` narrows this to one lane.
2. **Exploratory** — when the strategy marks it `RUN` **alongside** (a `FIRST` session already ran in
   Wave 3): `/qa-exploratory ticket <TICKET>` → `qa-testing-expert` on `playwright-firefox`, in the
   strategy's box. The charter is the strategy's
   `EXPLORE` risks plus the model's unresolved items. `--no-explore` drops the lane. A skip is recorded,
   never silent.
3. **Visual** — `ui-ux-expert` on Chrome DevTools MCP, when F3 or F8 fired (`visual_surface: true`,
   derived from the Wave-1 diff). **Its brief's first line makes it invoke the Skill tool with `skill: "qa-design"`**; the
   `/qa-design` command is never run. `--no-visual` drops the lane, recorded never silent. Trigger, the
   brief, the lane-count rule (a 4th lane waits for the first to return) and verdict handling:
   [`../skills/qa-test/visual-axis.md`](../skills/qa-test/visual-axis.md) §2, §4, §5. Writes
   `design-report.md` + `summary.json.visual`.
4. **Regression** — when the strategy marks it `RUN`: `/qa-regression <ids> --no-promote` over the
   non-stale list from Wave 2, through `regression-orchestrator`. Its lanes count toward the 3; more than 3
   needed ⇒ sequence by risk level, highest first (method rules). Its non-passing cases join the triage below.
5. **Join.** Pass every bullet of [`execution.md`](../skills/qa-test-fast/execution.md) §Join gate —
   results, ledger, settings, the visual lane's `qa-design skill: loaded`, and every exploratory/visual
   finding as a table row.

## Stage 3 — Verdict

Triage, the verdict rules, the report shapes and the tracker comment:
[`../skills/qa-test-fast/verdict.md`](../skills/qa-test-fast/verdict.md).

1. **Triage.** Invoke the Skill tool with `skill: "qa-triage-results"`, args `ticket <TICKET> --verify` (and,
   when regression ran, `<RUN_ID>` for its non-passing cases). It classifies every non-passing row, and Phase 4 sends **every** real-bug candidate through
   `vc-fix:qa-investigate`, which returns an evidence package for each one. It returns the confirmed bugs, the
   checklist fixes (you apply them; you are the checklist's only writer) and the dismissed rows. A non-empty
   `unresulted[]` sends you back to the Stage 2 join. Visual findings block or advise per
   [`visual-axis.md`](../skills/qa-test/visual-axis.md) §3.
2. **Bugs.** Call `/vc-fix:qa-bug` **once per confirmed bug**, sequentially, passing its investigation package
   so that it reuses the package and does not reproduce the bug again. A `needs-review` candidate is listed in
   `verdict.md` and not filed. Its tracker-ticket step runs only after the user says yes. Then tear down
   by ledger id ([`execution.md`](../skills/qa-test-fast/execution.md) §Data) and re-read.
3. **Reconcile, then verdict.** Fill this round's reconciliation, candidate cases and carry-overs
   ([`qa-test-strategy`](../skills/qa-test-strategy/SKILL.md) §Reconcile). Then decide the verdict per
   [`../skills/qa-test/close-out.md`](../skills/qa-test/close-out.md) §5-verdict.2. Round 3 with a non-PASS
   verdict ⇒ `verdict.md` carries the escalation of [`rounds.md`](../skills/qa-test-strategy/rounds.md).
4. **Write the ticket folder:** `summary.json`, `verdict.md`, the reconciled `test-strategy.md` and the
   updated `testing-checklist.md`.
   Then run `npm run summary:validate`.
5. **HTML page.** Load the `artifact-design` skill, fill in
   [`../skills/qa-test-fast/report-template.html`](../skills/qa-test-fast/report-template.html), and
   publish it as an Artifact for **Anyone at Virto Commerce** — the user sets that in Share
   ([`verdict.md`](../skills/qa-test-fast/verdict.md) §HTML page).
6. **Ask once:** "Post the verdict comment to <TICKET>?" Yes ⇒ post it per [`verdict.md`](../skills/qa-test-fast/verdict.md) §Tracker
   comment, and write the returned id into `summary.json.tracker.comment_id` — a same-build re-run amends that id
   (Step 0.4); a new build posts a new comment. No status transition.
7. **Bank what the run established.** For each platform behaviour the verdict states: matched ⇒
   `kb_confirm`, contradicted ⇒ `kb_dispute`, base held nothing ⇒ `kb_capture`
   (`.claude/knowledge/execution/kb-capture-contract.md`). Public base — nothing client-specific. List the ids in
   `summary.json.report.kb`, then re-run `npm run summary:validate`.
8. **Chat.** The verdict line, the page link, the `verdict.md` path, the bug links. Nothing else.
