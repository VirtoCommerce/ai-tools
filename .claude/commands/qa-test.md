---
description: "Test ONE tracker ticket on one strategy-driven path, in six stages — 0 Route · 1 Context · 2 Strategy · 3 Prepare · 4 Execute · 5 Close. vc-test supplies the ticket context, the approved test strategy (which decides what runs) and triage; the repo adds the lanes, the verdict, the one tracker comment, the status hop and the docs. Ticket keys only, one per run. Writes no suite case and no seeder: stale and candidate cases are handed to /qa-test-lifecycle."
argument-hint: "<TICKET> [<env>] [--yes] [--dry-run]"
---

# /qa-test — test one ticket

You run this orchestration **inline** — never hand it to another orchestrator agent. This file says what
runs, when, and what stops it; it holds no method. The method is in the vc-test skills each stage invokes
and in [`skills/qa-test/`](../skills/qa-test/SKILL.md): **read `SKILL.md` before Stage 0**, then the file a
stage names. Diagram: `docs/qa-test-flow.md`.

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

## Arguments

There is no argv parser: resolve the arguments by reading them, and state what you resolved in one line
before Stage 0.

| Written | Read as |
|---|---|
| `<TICKET>` | one tracker key — the only target a run takes |
| `<env>` | an env `npm run run:use` accepts; absent ⇒ the session's binding |
| `--yes` | the strategy approval is skipped (`Status: AUTO (--yes)`). Every other question is still asked |
| `--dry-run` | the run stops after Stage 2's approval; no status hop, nothing posted |
| a feature name | **STOP**, one line: a feature area is tested with `/qa-exploratory` |
| `PR #N` | **STOP**, one line: test the ticket the PR belongs to, or run `/qa-regression` |
| several ticket keys | **STOP**, one line: one `/qa-test` run per key |
| `--iterate` · `--epic` | one line — removed 2026-11-13: a re-test on a new build is `/qa-test <TICKET>` again (the strategy counts the round), and an Epic's stories are tested one run each. The run continues without it |
| `--visual` · `--contract` · `--coverage` · `--axes` | one line — removed: the strategy's artifact rows decide. The run continues |
| `--release-regression` | one line — removed: a release sweep is a deliberate `/qa-regression` run. The run continues |
| any other token | **STOP and ask**; never fold it into the target or a flag |

## Rules

1. **One tracker comment per round**, posted by `/vc-fix:qa-report` only after a yes; a same-build re-run
   amends it ([`rules/reports.md`](../rules/reports.md) §0).
2. **Status moves only per [`ticket-status-transitions.md`](../knowledge/execution/ticket-status-transitions.md)**:
   the opening hop at Stage 0, the closing hop after a yes, never past `TESTED`. Every hop and every skip is a
   row of `summary.json.status_transitions[]`.
3. **No suite CSV and no seeder are written.** Cases are read and run, never written, edited or deleted;
   stale cases and passing items no case covers go to `/qa-test-lifecycle`
   ([`close-out.md`](../skills/qa-test/close-out.md) §Hand-off to lifecycle). A state no data source reaches
   is `FIXTURE-GAP`, raised at the approval.
4. **Bugs only through `/vc-fix:qa-bug`**, one call per confirmed bug, after triage and
   `vc-fix:qa-investigate`. A separate tracker ticket is created only on the operator's yes to ONE list
   question; an IN-SCOPE bug is a To-fix row, never a ticket. Never a hand-written report.
5. **The approved strategy decides, and every row lands.** Each artifact row ends in `verdict.md` as a
   result or `SKIP — <observable reason>`; time pressure is not a reason. A deviation from an approved `RUN`
   is appended to the round's `### Amendments`.
6. **Paths, not content.** Every hand-off is a file in `{RUN_DIR}`; a brief carries paths and the oracle text
   cut per [`dispatch-pack.md`](../skills/qa-test/dispatch-pack.md).
7. **Every subagent dispatch's description starts `[vc-test:qa-test.<step>]`**, `<step>` one of
   `domain-map`, `mind-map`, `runner-fe`, `runner-be`, `exploratory`, `visual`, `regression`, `investigate`,
   `docs` — that is how `run-cost.mjs` counts it (as `qa-test.<step>`). What runs inline — the context
   bundle, the strategy, the model, the checklist, triage — takes no tag: it is counted as `orchestrator`,
   and a subagent a skill dispatches on its own under its own tag or as `other`.
8. **Budget is reported, never a stop or a question:**
   `node plugins/vc-test/lib/run-cost.mjs --since <start> --budget qa --key <TICKET>` — at the approval and
   at close.
9. **≤3 browser lanes at once, one agent per lane** ([`rules/agents.md`](../rules/agents.md) §Parallel
   Execution); never WebKit; URLs from `config.js`, never hardcoded.
10. **An agent that fails with an internal error** ⇒ do its step directly; never retry the same delegation.
    No tracker MCP ⇒ ask the user for the ticket and skip the hops (recorded).

## 0 — Route

1. **vc-test.** `vc-test:ticket-context`, `vc-test:qa-test-strategy`, `vc-test:qa-triage-results` and
   `vc-test:qa-design` are in your skill list and vc-test is ≥ 0.17.1 — else **STOP**: "install or update
   vc-test (`/plugin install vc-test@ai-tools`, or `/plugin marketplace update ai-tools`), then restart Claude
   Code". Never run half the flow.
2. **Start and env.** Note the start time (ISO) — it is `run-cost.mjs --since`. Run
   `npm run run:use -- <TICKET> [<env>]`: it binds the env ([`run-env.md`](../knowledge/execution/run-env.md))
   and `{RUN_DIR}` ([`run-output.md`](../knowledge/execution/run-output.md)); every file this run writes —
   a domain map, mind map or schema it builds included — goes there.
3. **Route.** Fetch the ticket and read its row in
   [`ticket-routing.md`](../knowledge/execution/ticket-routing.md) §4 (a Sub-task takes its parent's).
   `verify-fix` ⇒ **STOP**: run `/vc-fix:qa-verify-fix <TICKET>`. `hotfix-verify` ⇒ **STOP**: run
   `/qa-hotfix-check <TICKET>`. Every other row is the `test` job and continues — a refactor, migration or
   dependency bump too (its floors make the strategy regression-averse). A **not-fixed Bug** runs with the
   mission "reproduce and characterize" and names `/vc-fix:qa-fix <TICKET>` as its next step.
4. **Round.** Count it per [`/vc-test:qa-test-strategy`](../../plugins/vc-test/skills/qa-test-strategy/SKILL.md)
   procedure step 1, from local evidence. A fourth ⇒ **STOP** with that skill's escalation; nothing below runs.
5. **Preflight.** [`/preflight`](../skills/preflight/SKILL.md) `ticket --ticket <TICKET> --components <…>`
   — env health, deployed build, `{SPRINT}`, the duplicate check, MCP availability, and the kb ask for this
   run's coordinates (carry its hit ids). No `--expect`: deployment is the bundle's. A `not-deployed:*` row
   is BLOCKED-on-deploy, never a FAIL.
6. **Prior runs are inputs.** The run folders `run:use` listed, `reports/ba/test-models/<TICKET>-*` and
   `reports/bugs/**`: a prior model is amended into `{RUN_DIR}/test-model.md`, never forked; prior bugs are
   `qa-bug`'s dedupe baseline; a different build gives context, never results. **A `summary.json` on the
   same build:** show its verdict, date and comment id and ask once whether to re-run (uncommitted files ⇒
   ask to commit them first); a re-run amends that comment, and a "no" ends the run here with nothing moved.
7. **Opening hop** — [`ticket-status-transitions.md`](../knowledge/execution/ticket-status-transitions.md) §3:
   to in-testing, no confirmation; its skip list applies, and `--dry-run` skips it too. Record it (`at: "0"`).
8. **Domain slug.** From the ticket's components and summary, checked with
   `npm run bl:extract -- --has-domain <slug>`. Read the map's state now: a `.claude/knowledge/domain/`
   map whose `domain_slug` matches is `PRESENT` (or `STALE` by `npm run domain:check`), none is `ABSENT`, no
   slug is `unresolved`.

## 1 — Context

**One message, both joined before Stage 2:**

- **Bundle** — [`/vc-test:ticket-context`](../../plugins/vc-test/skills/ticket-context/SKILL.md)
  `<TICKET> --domain <slug> --kb-hits <ids>`: ticket, every attachment and link, the PRs, their deployment on
  this stand, known ground, gaps and blockers, as one gated bundle. Never re-fetch what it holds; never copy
  or write it.
- **Domain map** — only when the state is `ABSENT` or `unresolved`: `/qa-domain-map <slug>` on
  `playwright-firefox`, in the background. `STALE` is read as hypotheses, never auto-refreshed.

**Join.** A `/vc-test:ticket-context` STOP ⇒ the run is `BLOCKED`, its STOP line quoted verbatim — never a
FAIL. Wait for the domain map; a failed build is recorded and the run proceeds. Write the **run context** (a
scratchpad file naming the bundle path, the domain-map result, and later the contract drift and map signals).
A Claude Design link with no local copy ⇒ ask the operator once to import it
([`claude-design-verification.md`](../../plugins/vc-test/skills/qa-design/claude-design-verification.md) §Missing copy).

## 2 — Strategy

1. **Run [`/vc-test:qa-test-strategy`](../../plugins/vc-test/skills/qa-test-strategy/SKILL.md) inline** with
   the bundle path — never dispatched, never from a summary: step 1's second round count (the bundle's
   `signals[]`), then step 2 onward — floors, risks, artifacts, Data per risk, its gate, and
   `vc-test:strategy-verifier` on a Critical risk. Its STOP is this run's STOP.
2. **Its ONE approval question also carries** the spend so far (`run-cost.mjs`) and **every `FIXTURE-GAP`
   risk with its two answers**: run `/qa-generate-data` + `/qa-seed-data` first and re-run `/qa-test
   <TICKET>` (this run stops), or approve with those risks `BLOCKED — FIXTURE-GAP` in the round's Out of
   scope. `--yes` takes the second answer.
3. **After approval the round's `### Artifacts` table decides what runs.** A `SKIP` row is recorded with its
   reason, never second-guessed. F6 fired (a PR not deployed) ⇒ no lane opens: go to Stage 5 with `BLOCKED`.
4. **`--dry-run` stops here:** print the approved artifacts and the Stage 3–4 dispatch plan.

## 3 — Prepare

Only the rows marked `RUN`; independent ones in one message.

| Row | When `RUN` |
|---|---|
| Contract refresh | `npm run schema:refresh` ‖ `npm run graphql:fixtures:validate:refresh` ([`contract-refresh.md`](../skills/qa-test/contract-refresh.md) §2–§3); drift into the run context |
| Test model | `/qa-test-model <TICKET> --context <run context> --strategy <test-strategy.md>`, inline. A finding that changes a risk goes to `### Amendments` |
| Mind map | `/qa-test-mind-map update\|build <slug> --from <TICKET>` — `ba-system-analyzer`, no browser, the build's stamping step removed from the brief; then the map signals ([`execution.md`](../skills/qa-test/execution.md) §Map signals) |
| Coverage triage + regression | the staleness check of the cases at risk ([`floors.md`](../../plugins/vc-test/skills/qa-test-strategy/floors.md) §Staleness check; dispositions: [`regression-selection.md`](../knowledge/execution/regression-selection.md) §Existing-Coverage Triage). A stale case is a `stale_cases` entry with its reason and never runs; the rest are Stage 4's regression lane |
| Checklist | always: `/qa-checklist <TICKET> --from-strategy <test-strategy.md> [--mind-map <slug>]` → `{RUN_DIR}/testing-checklist.md`. Every item names its `R-n` and has a Data cell |

**Gate, inline, before any browser opens** — fix a failure here, never carry it as a note: the strategy's
gate is green and its `Status:` is not `DRAFT`; a model that ran has every gate line `PASS`/`FIXED`; every
in-scope risk, scenario row and node is an item or an omission line; every item has a Data cell
(`FIXTURE-GAP` with its reason counts); every artifact row is produced or `SKIP` with its reason.

## 4 — Execute

**One message, ≤3 browser lanes; a fourth waits for the first to return.** Lanes, briefs, data and the join:
[`execution.md`](../skills/qa-test/execution.md). Record the test-window start (App Insights, Stage 5).

- **Checklist runners** — always, one per checklist lane section: `qa-frontend-expert` on
  `playwright-chrome`, `qa-backend-expert` on `playwright-edge` (§Runner brief).
- **Exploratory** — `Exploratory: RUN`: `/qa-exploratory ticket <TICKET> <env>` → `qa-testing-expert` on
  `playwright-firefox`, first or alongside the runners as the row says (§Exploratory).
- **Visual** — `Visual lane: RUN`: `vc-test:ui-ux-expert` on the free lane; its brief's first line invokes the
  Skill `vc-test:qa-design` (§Visual).
- **Regression** — `Coverage triage + regression: RUN` and at least one non-stale case:
  `/qa-regression <suites> --ids <non-stale case ids> --no-promote` (§Regression); its lanes count in the ≤3.
- **Data** is made as each item's Data cell says (§Data); the ledger stays open through Stage 5.
- **Join** — every bullet of §Join gate. You write the Results into the checklist; runners never edit it.

## 5 — Close

In this order ([`close-out.md`](../skills/qa-test/close-out.md) holds the rules):

1. **Reconcile** — [`reconcile.md`](../../plugins/vc-test/skills/qa-test-strategy/reconcile.md): fill the
   round's `### Reconciliation`; a High/Critical risk without a result caps the verdict; write
   `summary.json.strategy` (never null once a strategy ran). Done once, here — close-out.md §5-verdict uses it.
2. **Triage** — App Insights for the test window ([`triage.md`](../skills/qa-test/triage.md) §1); then the
   Skill `vc-test:qa-triage-results`, args `ticket <TICKET> --verify --min-severity P2`, and for the regression
   lane `<RUN_ID> --verify --min-severity P2` — never `--fix`. A non-empty `unresulted[]` sends you back to
   the join. What each class goes to: close-out.md §Triage.
3. **Investigate** — every Medium+ real-bug candidate goes through `vc-fix:qa-investigate` (triage's Phase 4).
4. **Bugs** — ONE list question for every bug that would be its own ticket, then `/vc-fix:qa-bug` once per
   confirmed bug, sequentially, `--evidence <package>` and the shape its provenance gives (close-out.md
   §5-file).
5. **Teardown** by ledger id (execution.md §Data) — never a `seed:*:teardown` sweep.
6. **Verdict** — close-out.md §5-verdict.
7. **Files** — `summary.json`, `verdict.md` and the checklist's Results (close-out.md §Files), then
   `npm run summary:validate`.
8. **Page and comment** — ONE `/vc-fix:qa-report` call (close-out.md §HTML page and comment). It asks the
   one question; on a yes write the returned id into `summary.json.tracker.comment_id`.
9. **Status** — [`reporting.md`](../skills/qa-test/reporting.md) §5-status: asked, `qa-lead` only, never past
   `TESTED`; `BLOCKED` transitions nothing and the comment names the blocker.
10. **Docs** — the ticket ends in Tested or Done ⇒ `/qa-docs <TICKET>` (reporting.md §5-docs).
11. **Domain-map write-back** — a map exists and the run established something: reporting.md §5-docs-map.
    Non-blocking.
12. **kb** — for each platform behaviour the verdict states: matched ⇒ `kb_confirm`, contradicted ⇒
    `kb_dispute`, nothing held ⇒ `kb_capture`
    ([`kb-capture-contract.md`](../knowledge/execution/kb-capture-contract.md)); the base is public. Ids into
    `summary.json.report.kb`.
13. **Run cost** — `run-cost.mjs` again: the per-step table into `summary.json.cost`, its `budget:` line into
    `verdict.md`; re-run `npm run summary:validate`.
14. **Lifecycle** — `candidate_cases` or `stale_cases` non-empty ⇒ ONE question: `/qa-test-lifecycle
    <TICKET>` now, or later (close-out.md §Hand-off to lifecycle).
15. **Chat** — the verdict line, the page link, the `verdict.md` path, the bug links and the next command:
    FAIL → `/vc-fix:qa-fix <TICKET>`; BLOCKED → resolve the blocker and re-run `/qa-test <TICKET>`.
