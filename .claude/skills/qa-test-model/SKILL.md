---
name: qa-test-model
description: "[QA Method] Use when a ticket needs a TEST MODEL (the fault model: value chain, mechanism matrix, scenario table) — /qa-test FULL Step 1e, /qa-test-fast Stage 1 (with --strategy: only the approved strategy's MODEL risks), or before /qa-checklist --from-model. Builds or amends {RUN_DIR}/test-model.md (the ticket's run folder). Not for test cases (/qa-test-cases-generator) or a domain's behaviour graph (/qa-test-mind-map)."
argument-hint: "<TICKET> [--context <file>] [--strategy <test-strategy.md>]"
---

# /qa-test-model — the Test Model of one ticket

A test model is the fault model a ticket's tests are derived from: **Part 0 — the value chain — first**,
then the condition space, the reduction and a scenario table where every row carries a defect
hypothesis and an oracle. **This skill is the only place a Test Model is built** — `/qa-test` FULL
invokes it at Step `1e`, `/qa-test-fast` in its Stage 1, and anyone else directly.

**The method lives in this skill's supporting file** [`test-model.md`](test-model.md) — why Part 0
comes first, the eight rules, Part 0r, the gate and the worked references — and
[`../../templates/test-model.md`](../../templates/test-model.md) is the shape. Read both before step 5.
This file is the procedure: the inputs, the prior-model decision, the contract refresh the gate's
oracle clause depends on, and the observed-behaviour steps.

## Two modes — chosen by `--strategy`, never by judgment

| | **Strategy mode** — `--strategy <path>` | **Ticket mode** — no strategy |
|---|---|---|
| Caller | `/qa-test-fast` Stage 1, after `/qa-test-strategy` approved a round whose `Test model` row is `RUN` | `/qa-test` FULL `1e`, a standalone call |
| Scope | **only** the strategy's risks with technique `MODEL` — chain, matrix and scenarios for those | the whole ticket |
| Gate · shape · cap | [`test-model.md`](test-model.md) §Strategy mode — its gate, the org-context and configuration groups; the strategy-mode cap in `reports-policy.md` §2 | §The gate; the ticket-mode cap there |
| Rounds | the strategy's round number; no `## Round N` rules of its own | §One ticket, one model file |

The strategy is the authority: refine a technique if you must, but a wrong technique, a weaker oracle or a
new risk is appended to that round's `### Amendments` with its reason (a High/Critical change re-asks
approval) — never a silent disagreement with a strategy row. Ticket mode is deleted when `/qa-test` runs the
strategy (design: `docs/superpowers/specs/2026-10-09-qa-test-model-redesign.md` M8).

## Inputs — the context bundle

`--context <file>` is the bundle a caller already gathered — `/qa-test` FULL passes `1a` + `1c` + `1d`,
`/qa-test-fast` its run context, which names the `/ticket-context` bundle. A caller that already ran
step 2 or 3 passes their result in that file.
Without it, gather each part yourself; a part that cannot be obtained is a **recorded gap in the
model's header**, never a guess.

| Part | How it is obtained | Rule it follows |
|---|---|---|
| Ticket — ACs as atomic conditions, comments, every attachment opened, epic | tracker fetch **with all fields** — ACs often live in a custom field, so an empty description is never "no ACs" | [`../qa-test/intake.md`](../qa-test/intake.md) §1a |
| Change surface — changed files, GraphQL operations, endpoints, layers | the four-rung PR ladder, then `gh pr diff`; only **product-repo** PRs are change surface — a deployment-manifest or QA-repo PR is context | [`../qa-test/technical-change.md`](../qa-test/technical-change.md) §2.1 |
| Domain map state | step 2 below | [`../qa-test/axes.md`](../qa-test/axes.md) §2g |
| Mind map path, or `null` | step 2 below | `/qa-test-mind-map` |

## Procedure

1. **Find the prior model first.** In strategy mode the strategy's `Artifacts` row already decides `new`
   or `amend <path>` — an amendment is a section headed with the strategy's round — and only the third
   bullet below still applies: a new model carries Part 0 forward from another ticket's model of the same
   surface. In ticket mode, the ticket's `test-model.md` in `{RUN_DIR}` or in a prior run folder
   `run:use` listed (an amendment copies it into `{RUN_DIR}` first), else the older
   `reports/ba/test-models/<TICKET>-*`; for the surface, the models the domain map or the bundle names. Then exactly one of these applies
   ([`test-model.md`](test-model.md) §Why it is a durable file):
   - **same ticket, and the diff moved since the model was written** (a fix, new commits) → amend that
     file with a `## Round N` section (§One ticket, one model file). Never a second dated file for one ticket.
   - **same ticket, same diff** → reuse the model and run step 6 against it. A failing clause is a
     `## Round N — correction` (§One ticket, one model file — the unchanged-diff case).
   - **another ticket, same surface** → a new `{RUN_DIR}/test-model.md` whose `Prior model:` names the
     predecessor and **carries Part 0 forward**; corrections are drift against it, never a re-derivation.
2. **Resolve the domain map and mind map.** Slug: `npm run bl:extract -- --has-domain <slug>`, then
   `npm run domain:check`. Record the state (`PRESENT` / `STALE` / `ABSENT` / `unresolved`) exactly as
   [`axes.md`](../qa-test/axes.md) §2g defines it — the gate's chain-position clauses read it and
   `ABSENT` is written down, not blocked. A `.mind-map.json` beside the map ⇒ Part 0 **cites its node
   ids**, and a mechanism the ticket changes that no node carries is listed as mind-map DRIFT.
3. **Refresh the contract when the change surface names a GraphQL operation.** Run both commands in
   [`../qa-test/contract-refresh.md`](../qa-test/contract-refresh.md) §2 — `npm run schema:refresh` (the
   agents' oracle) and `npm run graphql:fixtures:validate:refresh` (fixture drift) — before writing any
   `{DOC}` oracle on a field, argument or response shape. Not refreshed ⇒ those oracles are
   `{HYPOTHESIS}` and the contract state is `UNKNOWN` in the output (§3 there). Drift on an operation the
   ticket's own diff touches is a chain link and a candidate reverse edge in the model.
4. **Ask the base for this run's coordinates** — for each page path / GraphQL operation / endpoint in
   the change surface that the bundle does not already carry kb hit ids for: `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`). Record hit
   ids; a miss is not a blocker. VirtoOZ (`/vc-docs`) before any claim about what the platform is
   supposed to do — released vs new decides the source. Rule: [`../../../CLAUDE.md`](../../../CLAUDE.md)
   §Essential Rules → *Product context*.
5. **Write the model** to `{RUN_DIR}/test-model.md` in the template's shape, Part 0 first, per the method
   file. Standalone, `npm run run:use -- <TICKET>` binds the run folder first
   ([`run-output.md`](../../knowledge/execution/run-output.md)).
6. **Run the gate** — every clause of the mode's gate ([`test-model.md`](test-model.md) §Strategy mode or §The gate), inline,
   against the written file. A failing clause is fixed in the file, then re-checked; it is never waived
   in the output. No verifier dispatch — the gate is the doer's own completeness check on every path.
7. **Bank what THIS run observed** — only a fresh observation or a document read this session counts;
   agreeing with an entry you only read is not a confirmation. For each: matched ⇒ `kb_confirm`,
   contradicted ⇒ `kb_dispute`, base held nothing ⇒ `kb_capture` (`.claude/knowledge/execution/kb-capture-contract.md`).
   Public base — nothing client-specific.

## Output — returned to the caller, in this order

1. The model path, and whether it is **new**, a **round amendment**, **reused** (with any correction), or
   **carried forward** from `<path>`. Contract state: `REFRESHED` / `UNKNOWN` / `n/a` (no GraphQL surface).
2. One line per gate clause: `<clause> PASS` or `<clause> FIXED — <what changed>`.
3. `Domain map: <state>` · `Mind map: <path | null>` · mind-map DRIFT rows (for `/qa-test-mind-map update`).
4. The unresolved items that feed an exploratory charter — `GAP`/`WAIVED` matrix cells, unresolved
   reverse edges, `{HYPOTHESIS}` oracles, ACs flagged DRIFT/NOT-FOUND/CONTRADICTS
   ([`../qa-test/exploratory-lane.md`](../qa-test/exploratory-lane.md) §3).
5. `FIXTURE-GAP`s and the kb ids read / confirmed / disputed / captured.
6. Strategy mode: the amendments appended to the strategy round, or `none`.

## Not this skill

- **The authoring plan** (`tc:scaffold --check`, `/qa-test` `1e-plan`) belongs to case authoring, not to
  the model.
