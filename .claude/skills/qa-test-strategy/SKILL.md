---
name: qa-test-strategy
description: "[QA Method] Use when a ticket's context is gathered and nothing has been tested yet — /qa-test step 1s, /qa-test-fast Stage 1 — to CHOOSE the test strategy: risks, strategy mix, technique and oracle per risk, lanes and tools, data, which artifacts run, entry/exit criteria. Holds it for one human approval (skipped by --yes), and reconciles plan against what ran at close-out. Writes reports/tickets/{SPRINT}/<TICKET>/test-strategy.md. Not the fault model (/qa-test-model), not a sprint plan (/qa-test-plan), not risk scoring alone (/qa-risk)."
argument-hint: "<TICKET> --context <bundle> --path fast|full|fast-grounded [--yes] | reconcile <TICKET>"
---

# /qa-test-strategy — decide how a ticket is tested, before anything is tested

A strategy answers one question: **given this change, these risks and these means, how do we test it,
and when are we done?** Before this skill the answer was never written down. It emerged from flags,
derived axes and whichever artifacts happened to exist, so no one chose a method and no one could
argue with the choice. Here the choice is one short file, checked, approved, and compared against
what actually ran. Why this shape (HTSM, ISTQB strategy types, ISO/IEC/IEEE 29119-3, and the
agent-specific evidence): [`docs/decisions/qa-test-evolution.md`](../../../docs/decisions/qa-test-evolution.md)
§Explicit test strategy.

## Who chooses — the orchestrator, inline

The orchestrator that gathered the context writes the strategy. **Never dispatch it to a subagent:**
choosing needs the whole bundle at once, and a brief carries only a summary of it (the measured loss —
a fact relayed to a subagent and silently dropped — is in
[`../../knowledge/execution/regression-suites.md`](../../knowledge/execution/regression-suites.md)
§Working concurrently on suites).
Independence belongs at the **check**, not the choice: a human approves it, FULL adds a verifier, and
the strategy is executed by other agents, so its author is never its executor.

## Inputs

The context bundle (`/qa-test-fast` Join 1; `/qa-test` 1a–1d plus 2-load), the kb hit ids from
pre-flight, and prior artifacts for the ticket. **A missing input is a project risk, never a guess.**

## Procedure

1. **Ask the base for any coordinate pre-flight did not** — for each page path / GraphQL operation /
   endpoint in the bundle: `mcp__kb__kb_ask` (CLI: `npm run kb -- ask "<coordinate> <question>"`).
   Record hit ids; close each list by its handle (`kb_show`/`kb_none`); a miss is not a blocker.
   Rule: [`CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context*.
2. **Mission** — one sentence: what this run must find out, and for whom.
3. **The three inputs** (HTSM). *Project environment*: stand, build, whether each PR is deployed there,
   roles and accounts, free browser lanes, time. *Product elements*: the change surface by layer, from
   the diff, and the chain links it touches. *Quality criteria*: the oracles available — AC ids, `BL-*`
   / `ECL-*` ids, docs, kb ids, a design link.
4. **Risk register.** Each product risk is phrased as **what a customer would see** if the code is
   wrong, never as "verify X works". Every risk names its source: an `AC-n`, a diff hotspot
   `file:line`, a `VC-*` entry, a prior bug, a `BL-*`/`ECL-*` rule. Score and level by
   [`../qa-risk/risk-prioritization-framework.md`](../qa-risk/risk-prioritization-framework.md); its
   rules bind (revenue-critical flows start at Medium; a Critical risk is never out of scope).
   **Project risks** (stand not on the PR's build, fixture gap, missing role, no free lane) each get a
   mitigation or an explicit `accepted`.
5. **Strategy mix** — mark each ISTQB type used or not, with the reason:

   | Type | On when |
   |---|---|
   | Analytical (risk-based) | always — the register is its output |
   | Methodical (checklist) | always — the checklist is what the runners execute |
   | Consultative | always — the ACs, plus this skill's approval |
   | Model-based | the chain crosses ≥2 links or layers, or the matrix has ≥2 role or variant kinds |
   | Reactive (exploratory) | any oracle is `{HYPOTHESIS}`, the feature is new, or an AC is ambiguous |
   | Regression-averse | the diff touches a surface existing suite cases cover |
   | Process-compliant | a11y (WCAG), payment (PCI) or another external standard is in scope |

6. **Approach per risk.** For each `R-n`:
   - **Technique** from the closed vocabulary
     ([`../qa-test-design/test-design-techniques.md`](../qa-test-design/test-design-techniques.md) §0,
     chosen by its §1 selection guide). **FLOW comes first** for anything that changes state. Beyond
     test design, four approaches: `EXPLORE` (a charter item), `VISUAL`, `CONTRACT`, `REGRESSION`.
   - **Oracle with its authority**: `{SPEC}` / `{BL}` / `{DOC}` / `{OBSERVED}` / `{HYPOTHESIS}`
     ([`../../knowledge/agents/qa/shared-instructions.md`](../../knowledge/agents/qa/shared-instructions.md)
     §5). A `{HYPOTHESIS}` oracle cannot decide PASS/FAIL: the risk goes to the exploratory charter, or
     the row names what would ground it.
   - **Layer and tool, lane and agent** — lanes per [`../../rules/agents.md`](../../rules/agents.md)
     §Parallel Execution; never more than 3 browser lanes at once.
   - **Depth** — from the risk level, per the framework above.
7. **Artifacts** — decide each per §Artifact decisions. Every row is `RUN`, `SKIP — <observable
   reason>` or `RECOMMENDED`.
8. **Data** — per risk: an existing `@td()` alias, `live-discover`, created in the case, or a seeder a
   Data cell names. Name the values that must **differ** for the risk to be decidable
   ([`../../rules/test-data.md`](../../rules/test-data.md) SECOND RULE); a state the environment can
   take away is created in the case (FIFTH RULE).
9. **Out of scope** — what is not tested, why, and the residual risk it leaves.
10. **Criteria.** *Entry*: the build carries the PRs, `npm run env:check` is green, the data is
    reachable. *Suspension*: what makes the run `BLOCKED`. *Exit*: every in-scope risk has a result or
    a named deviation, and the exploratory box is spent.
11. **Write** `reports/tickets/{SPRINT}/<TICKET>/test-strategy.md` from
    [`../../templates/test-strategy.md`](../../templates/test-strategy.md). A same-ticket strategy from a
    prior run on the same build is **amended**, never forked.

## Artifact decisions

The strategy decides only what the calling flow lets it decide. It never removes a mandate.

| Flow | The strategy decides | Fixed by the flow |
|---|---|---|
| `/qa-test` FULL | exploratory box, depth, the order of risks; every artifact stays `RUN` | the whole FULL set |
| `/qa-test` FAST | `RECOMMENDED` for an opt-in axis (`--visual` / `--contract` / `--coverage`) a risk needs | one execution agent; the opt-in axes run only under their flag **or** an approved recommendation |
| `/qa-test-fast` | test model, mind map, exploratory (rules below) | checklist always; visual lane by `visual_surface` |

`/qa-test-fast` rules — each `SKIP` is a recorded decision, never an omission:

| Artifact | `RUN` when | `SKIP` allowed when |
|---|---|---|
| Test model | any High/Critical risk, **or** the mix is model-based, **or** exploratory runs (`/qa-exploratory ticket` stops without a model) | every risk is Medium/Low, single-surface, and exploratory is skipped. The checklist is then written from §4 of the strategy |
| Mind map | the model runs **and** the domain map is `PRESENT` | the model is skipped, or the domain map is `ABSENT`/`STALE` |
| Exploratory | the mix is reactive | every oracle is grounded, the surface is single and not new — or `--no-explore` |

## Gate — inline, before approval

The strategy is not shown for approval until every clause holds. A failing clause is fixed, never noted.

1. Every AC maps to at least one risk, or is out of scope with a reason.
2. Every diff hotspot the bundle names maps to a risk, or is out of scope with a reason.
3. Every risk has a technique or approach, an oracle with its authority, a lane and a depth.
4. No `{HYPOTHESIS}` oracle decides a pass/fail row (step 6).
5. No Critical risk is out of scope; no revenue-critical risk is below Medium.
6. Every project risk has a mitigation or `accepted`.
7. Every artifact row is `RUN`, `SKIP — reason` or `RECOMMENDED`, and nothing the flow mandates is `SKIP`.
8. Concurrent browser lanes ≤ 3.
9. Exit criteria are observable, and the exploratory box (when it runs) follows
   [`../qa-test/exploratory-lane.md`](../qa-test/exploratory-lane.md) §5.
10. The file is within its cap ([`../../rules/reports.md`](../../rules/reports.md) §2).

## Approval — one question, by default

1. **FULL only, first:** dispatch a fresh `qa-lead-orchestrator` in Verifier Mode, gate `1s`, with the
   strategy path and the bundle path. It re-derives the gate from the bundle and returns
   `APPROVE`/`REJECT`. Loop and independence rules:
   [`../qa-test/SKILL.md`](../qa-test/SKILL.md) §The verifier.
2. **Ask the user once** (AskUserQuestion): show the mission, the risk table, the artifacts table and
   the out-of-scope list — not the whole file — plus its path. Options: *Approve* · *Change* (free
   text). A change is applied, the gate re-run, and the question asked again. An approved
   `RECOMMENDED` row becomes `RUN`; a declined one becomes `SKIP — declined at approval`.
3. **`--yes`** skips step 2: `Status: AUTO (--yes)`, and every `RECOMMENDED` row becomes `SKIP — not
   approved (--yes)`. On FULL the verifier is then the only check.
4. **No human can answer and no `--yes`** (headless, CI) ⇒ **STOP**. The strategy file is the output.

Nothing in this step writes to the tracker.

**After approval the strategy is a contract.** A risk the run discovers, or an approach that has to
change, is appended to §9 Amendments with its reason, never applied silently.

## Reconcile — at close-out, before the verdict

`/qa-test-strategy reconcile <TICKET>` (or the same steps inline) fills §10 of the file:

- One row per in-scope risk, plus one per amendment: planned approach → what ran (checklist item ids,
  charter items, lane) → result → deviation and its reason.
- A planned risk that did not run and has no reason ⇒ back to execution, or listed under *Not tested,
  and why* in the run's report. It is never dropped.
- A High or Critical risk without a result **caps the verdict**: not `PASS`
  ([`../qa-test/close-out.md`](../qa-test/close-out.md) §5-verdict.2).
- Copy the counts into `summary.json.strategy` (its keys come from
  [`../../templates/qa-test-summary.schema.json`](../../templates/qa-test-summary.schema.json)).

## Rationalization table

| Excuse | Reality |
|---|---|
| "The ticket is tiny — skip the strategy." | A tiny ticket gets a 25-line strategy. Its out-of-scope list is still the part a reviewer needs. |
| "Techniques get chosen per checklist item anyway." | That is the implicit strategy this skill replaces: nobody can see or argue with it. |
| "A subagent can write the strategy while I do something else." | It would decide from a summary of the context. Choosing is the orchestrator's job (§Who chooses). |
| "Approval slows the run down." | One question, once. Pass `--yes` where nobody is watching. |
| "The model skipped, so the risks were not analysed." | The risk register is the analysis. The model is one method for a risk that needs it. |
| "Exploratory found a new risk — just test it." | Add it to §9 Amendments first, then test it, so reconciliation sees it. |
