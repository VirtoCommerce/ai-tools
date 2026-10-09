---
name: qa-test-strategy
description: "[QA Method] Use when a ticket's context is gathered and nothing has been tested yet — the strategy step of /qa-test-fast (the prototype of the single /qa-test), or standalone to plan a run before paying for it — to CHOOSE the test strategy: risks, strategy mix, technique and oracle per risk, lanes, data, which artifacts run, entry/exit criteria, under deterministic floors F1–F9 and a three-round cap. Asks the user once to approve (--yes skips), and reconciles plan against what ran at close-out. Writes reports/tickets/{SPRINT}/<TICKET>/test-strategy.md, one section per round. Not the fault model (/qa-test-model), not a sprint plan (/qa-test-plan), not risk scoring alone (/qa-risk)."
argument-hint: "<TICKET> [--context <bundle>] [--yes] | reconcile <TICKET>"
---

# /qa-test-strategy — decide how a ticket is tested, before anything is tested

A strategy answers one question: **given this change, these risks and these means, how do we test it,
and when are we done?** It is one short file, checked against deterministic floors, approved by the user,
and compared at close-out against what actually ran. Depth comes from risk, never from the ticket type.
Design and decisions D1–D12: `docs/superpowers/specs/2026-10-09-qa-test-strategy-redesign.md`.
Why this shape (HTSM, ISTQB strategy types, ISO/IEC/IEEE 29119-3, agent research):
[`docs/decisions/qa-test-evolution.md`](../../../docs/decisions/qa-test-evolution.md) §Explicit test strategy.

| Need | Read |
|---|---|
| The floors F1–F9, the staleness check, the depth label | [`floors.md`](floors.md) |
| Rounds: what counts, the cap of three, what round N reads from N−1 | [`rounds.md`](rounds.md) |
| The file's shape | [`../../templates/test-strategy.md`](../../templates/test-strategy.md) |

## Who chooses — the orchestrator, inline

The orchestrator that gathered the context writes the strategy. **Never dispatch it to a subagent:**
choosing needs the whole bundle at once, and a brief carries only a summary of it (the measured loss —
a fact relayed to a subagent and silently dropped — is in
[`../../knowledge/execution/regression-suites.md`](../../knowledge/execution/regression-suites.md)
§Working concurrently on suites). Independence belongs at the **check**, not the choice: the user
approves, a verifier re-derives the gate when a risk is Critical, and other agents execute.

**Standalone:** `/qa-test-strategy <TICKET>` gathers the context the way `/qa-test-fast` Stage 1 Wave 1
does, writes the strategy, asks for approval and stops. A later run on the same build picks the approved
file up instead of writing a new one.

## Inputs

The context bundle, the kb hit ids from pre-flight, prior artifacts for the ticket, and — from round 2 on
— the previous round's section of this same file ([`rounds.md`](rounds.md)). **A missing input is a
project risk, never a guess.**

## Procedure

1. **Round.** Count this ticket's rounds per [`rounds.md`](rounds.md). A fourth ⇒ **STOP** with the
   escalation there; nothing below runs. Round ≥ 2 ⇒ the diff is taken from the last tested commit.
2. **Ask the base for any coordinate pre-flight did not** — for each page path / GraphQL operation /
   endpoint in the bundle: `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`).
   Record hit ids; close each list by its handle (`kb_show`/`kb_none`); a miss is not a blocker.
   Rule: [`CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context*.
3. **Mission** — one sentence: what this round must find out, and for whom. Round 3 says it is the last.
4. **The three inputs** (HTSM). *Project environment*: stand, build, whether each PR is deployed there,
   roles and accounts, free browser lanes, time. *Product elements*: the change surface by layer and the
   chain links it touches. *Quality criteria*: AC ids, `BL-*` / `ECL-*` ids, docs, kb ids, a design link.
5. **Risk register.** Each product risk is **what a customer would see** if the code is wrong, never
   "verify X works". Every risk names its source: an `AC-n`, a diff hotspot `file:line`, a `VC-*`
   entry, a prior bug, a `BL-*`/`ECL-*` rule. Score and level by
   [`../qa-risk/risk-prioritization-framework.md`](../qa-risk/risk-prioritization-framework.md). Layer and
   domain counts **raise a risk's L×I** — they never fire a floor on their own (D8). **Project risks**
   (stand not on the PR's build, fixture gap, missing role, no free lane, stale cases) each get a
   mitigation or an explicit `accepted`.
6. **Strategy mix** — mark each ISTQB type used or not, with the reason:

   | Type | On when |
   |---|---|
   | Analytical · Methodical · Consultative | always — the register, the checklist, the ACs plus approval |
   | Model-based | F1/F2 fired, or the matrix has ≥2 role or variant kinds |
   | Reactive (exploratory) | F1/F2 fired, any oracle is `{HYPOTHESIS}`, or an AC is ambiguous |
   | Regression-averse | F5 fired |
   | Process-compliant | a11y (WCAG), payment (PCI) or another external standard is in scope |

7. **Approach per risk.** For each `R-n`:
   - **Technique** from the closed vocabulary
     ([`../qa-test-design/test-design-techniques.md`](../qa-test-design/test-design-techniques.md) §0,
     chosen by its §1 guide; **FLOW first** for anything that changes state), or `EXPLORE`, `VISUAL`,
     `CONTRACT`, `REGRESSION`.
   - **Oracle with its authority**: `{SPEC}` / `{BL}` / `{DOC}` / `{OBSERVED}` / `{HYPOTHESIS}`
     ([`../../knowledge/agents/qa/shared-instructions.md`](../../knowledge/agents/qa/shared-instructions.md)
     §5). A `{HYPOTHESIS}` oracle never decides PASS/FAIL: the risk goes to the charter, or the row names
     what would ground it.
   - **Layer and tool, lane and agent** — lanes per [`../../rules/agents.md`](../../rules/agents.md)
     §Parallel Execution.
   - **Effort** — `low` / `medium` / `high`, from the risk level (D12). Never the words of the depth label.
8. **Artifacts** — every row `RUN` or `SKIP — <observable reason>`, starting from the floors
   ([`floors.md`](floors.md)): the strategy may add to a floor, never go under it.

   | Artifact | `RUN` when |
   |---|---|
   | Test model | F1/F2, or the mix is model-based, or exploratory runs (`/qa-exploratory ticket` stops without a model). Round ≥ 2: **amend**, never rebuild |
   | Mind map | the model runs **and** the domain map is `PRESENT` |
   | Checklist | always — every item names its `R-n` |
   | Exploratory | the mix is reactive. **First** when a High/Critical risk rests on a `{HYPOTHESIS}` oracle or the feature is new; otherwise **alongside** the checklist (D3). Box per [`../qa-test/exploratory-lane.md`](../qa-test/exploratory-lane.md) §5 |
   | Visual lane | F3 or F8 |
   | Contract refresh | the diff names a GraphQL operation or changes a REST contract |
   | Coverage triage + regression | F5, after the staleness check in [`floors.md`](floors.md) (D11) |
   | Verifier | any Critical risk |
   | Case authoring | **never in the run** (D2) — passing items no suite case covers become `candidate cases` for `/qa-test-lifecycle` |

9. **Data** — per risk: an existing `@td()` alias, `live-discover`, created in the case, or a seeder a
   Data cell names. Name the values that must **differ** for the risk to be decidable
   ([`../../rules/test-data.md`](../../rules/test-data.md) SECOND RULE); a state the environment can take
   away is created in the case (FIFTH RULE). Name any record that must be created **before** a redeploy.
10. **Out of scope** — what is not tested, why, and the residual risk. In round 3 this list is the
    ticket's residual risk.
11. **Criteria.** *Entry*: the build carries the PRs (F6), `npm run env:check` is green, the data is
    reachable. *Suspension*: what makes the run `BLOCKED`. *Exit*: every in-scope risk has a result or a
    named deviation, and the exploratory box is spent.
12. **Depth label** per [`floors.md`](floors.md) §Depth label — computed, never chosen.
13. **Write** the round's section of `reports/tickets/{SPRINT}/<TICKET>/test-strategy.md` from the template
    (D7: one file per ticket; a re-run on the same build amends the current section).

## Method rules (D10)

- ACs without ids are numbered `AC-n` in source order. An AC owned by a sibling ticket is out of scope,
  named with its ticket.
- Two `{SPEC}` sources that contradict each other (ticket vs developer, ticket vs mockup) become a PO
  question; that risk's oracle is `{HYPOTHESIS}` until it is answered.
- A developer's own E2E report is an **input** — it names risks and data — never an oracle and never a
  prior round.
- More than 3 browser lanes needed ⇒ sequence lanes by risk level, highest first. The cap is never raised.
- Reconstructing a past round ("as of build X") is not a mode of this skill.

## Gate — inline, before approval

The strategy is not shown for approval until every clause holds. A failing clause is fixed, never noted.

1. The round is counted and ≤ 3; round ≥ 2 carries over every unresulted risk of the previous round.
2. Every AC maps to at least one risk, or is out of scope with a reason (method rules apply).
3. Every diff hotspot the bundle names maps to a risk, or is out of scope with a reason.
4. Every risk has a technique or approach, an oracle with its authority, a lane and an effort.
5. No `{HYPOTHESIS}` oracle decides a pass/fail row.
6. Every floor is named as fired or not, with its signal; nothing a fired floor requires is `SKIP`.
7. Every project risk has a mitigation or `accepted`.
8. Concurrent browser lanes ≤ 3 (method rules).
9. Exit criteria are observable.
10. The section is within the cap ([`../../rules/reports.md`](../../rules/reports.md) §2).

## Approval — one question, every run (D4)

1. **Any Critical risk, first:** dispatch a fresh `qa-lead-orchestrator` in Verifier Mode with the strategy
   path and the bundle path. It re-derives the gate and returns `APPROVE`/`REJECT`. Loop and
   independence rules: [`../qa-test/SKILL.md`](../qa-test/SKILL.md) §The verifier, in one place.
2. **Ask the user once** (AskUserQuestion): the mission, the risk table, the artifacts table, the
   out-of-scope list and the depth label — not the whole file — plus its path. Options: *Approve* ·
   *Change* (free text). A change is applied, the gate re-run, and the question asked again.
3. **`--yes`** skips step 2: `Status: AUTO (--yes)`. Where a verifier is due it is then the only check.
4. **No human can answer and no `--yes`** (headless, CI) ⇒ **STOP**. The strategy file is the output.

Nothing in this step writes to the tracker. **After approval the strategy is a contract:** a risk the run
discovers, or an approach that has to change, is appended to the round's Amendments with its reason.

## Reconcile — at close-out, before the verdict

`/qa-test-strategy reconcile <TICKET>` (or the same steps inline) fills the round's reconciliation:

- One row per in-scope risk, plus one per amendment: planned → what ran (checklist item ids, charter
  items, lane, regression case ids) → result → deviation and its reason.
- A planned risk that did not run and has no reason ⇒ back to execution, or listed under *Not tested, and
  why*. It is never dropped; in round 3 it goes to the escalation.
- A High or Critical risk without a result **caps the verdict**: not `PASS`
  ([`../qa-test/close-out.md`](../qa-test/close-out.md) §5-verdict.2).
- Copy the counts, the round, the depth label and the candidate cases into `summary.json.strategy` (keys
  from [`../../templates/qa-test-summary.schema.json`](../../templates/qa-test-summary.schema.json)).

## Rationalization table

| Excuse | Reality |
|---|---|
| "The ticket is tiny — skip the strategy." | A tiny ticket gets a short strategy with depth `light`. Its out-of-scope list is still what a reviewer needs. |
| "It touches three layers, so it is deep." | Layers raise L×I; only a High/Critical risk or P0/P1 fires F1 (D8). |
| "A subagent can write the strategy while I do something else." | It would decide from a summary of the context. Choosing is the orchestrator's job. |
| "Approval slows the run down." | One question, once. `--yes` where nobody is watching. |
| "Run the whole regression the floor asks for." | Stale cases first go to `/qa-test-lifecycle` (D11); a run over them manufactures FAILs. |
| "This is round 4, but the fix is tiny." | Three rounds is the cap (D6). The ticket goes to people. |
| "Exploratory found a new risk — just test it." | Amend first, then test it, so reconciliation sees it. |
