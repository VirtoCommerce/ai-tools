# `/qa-test` redesign — route the job, choose a strategy, then test

> **Status: DRAFT — for review.** Nothing here is built. §9 records the decisions taken (D1–D5, by the owner
> on 2026-10-09); none are open. A prototype of the strategy step exists as
> draft PR #416; it predates D1–D3 and is input to this design, not its implementation.

## 1. Problem

Testing one ticket takes one of two commands and, inside `/qa-test`, one of two paths:

| Today | How depth is chosen |
|---|---|
| `/qa-test` FAST | ticket type, priority, layer count, six "narrow story" tokens (`ticket-routing.md` §5, §5b) |
| `/qa-test` FULL | the default for Story/Epic, P0/P1, cross-layer, ≥2 domains, unclear surface |
| `/qa-test-fast` | a third shape between them, chosen by the operator |

Three things are wrong with that.

1. **No one chooses a test strategy.** Methods, oracles and depth emerge from the ticket type, six derived
   axes, opt-in flags and whichever artifacts already exist. The choice is never written down, so it cannot
   be reviewed, argued with or checked against what ran.
2. **Ticket type is a weak proxy for risk.** The clearest case: a P2 `.scss`-only change is "narrow" on
   every token, yet it is the change most likely to break the UI — which is why the visual lane had to be
   carved out as an exception to the FAST cut (`ticket-routing.md` §5, last paragraph). `Review task`
   (§5a), `ui-kit` (§5c) and `technical-change` (§5d) are three more special cases of the same mismatch.
3. **FULL carries a corpus-writing pipeline inside a ticket test.** Artifact A (background case authoring),
   the `3-cases` verifier, `1e-plan` scaffolding and the single-writer rule on suite CSVs exist so that a
   ticket run can append `Draft` cases — which `/qa-test-lifecycle` then has to promote anyway.

## 2. Goal and non-goals

**Goal.** One command, `/qa-test <TICKET>`. A deterministic router decides *what job* this is. For the
testing job, the orchestrator gathers context, writes an explicit **test strategy** that the user approves,
and then runs exactly what the strategy selected. Depth comes from risk, not from ticket type.

**Non-goals.**
- Not a change to `/qa-verify-fix`, `/qa-hotfix-check` or `/qa-fix`. They are separate jobs with their own
  side effects (role-based transitions, deploys, bundle bumps) and stay as they are.
- Not a change to the context gatherer. That is `/ticket-context`
  ([design](2026-10-08-ticket-context-design.md)); this design consumes its bundle.
- No regression-case authoring inside a ticket run (D2). Corpus work stays in `/qa-test-lifecycle`.
- No new execution machinery. Runners, lanes, triage, `qa-investigate`, `qa-bug`, the verdict rules and the
  tracker rules are reused as they are.

## 3. Requirements every decision is judged against

| # | Requirement |
|---|---|
| R1 | **The strategy is explicit and reviewable** before any browser opens, and reconciled against what ran before the verdict. |
| R2 | **Safety floors are deterministic.** Anything that must always happen (a lane, a mandatory artifact, a BLOCKED) is a gate rule, never a model judgment. |
| R3 | **Not slower on a small ticket** than `/qa-test` FAST is today; measured, not assumed (§8). |
| R4 | **No lost coverage** against today's FULL on a high-risk ticket: every artifact FULL runs is still reachable, chosen by risk. |
| R5 | **One writer per artifact**, as today; no new concurrent writes. |

## 4. The shape

```
/qa-test <TICKET> [--yes]
 0 ROUTER      type × status → job                      deterministic (§5)
 1 CONTEXT     /ticket-context <TICKET> → bundle         parallel, cached
 2 STRATEGY    /qa-test-strategy → test-strategy.md      orchestrator, inline
               gate (floors §6 + strategy clauses) → user approval (--yes skips) [→ verifier if Critical]
 3 PREPARE     only what the strategy selected: test model · mind map · data · contract refresh ·
               coverage triage → checklist (every item names its R-n)
 4 EXECUTE     ≤3 browser lanes: checklist runners ‖ exploratory ‖ visual ‖ regression
               order per strategy: explore-first or alongside (D3)
 5 CLOSE       reconcile plan vs fact → triage → investigate → qa-bug → verdict → verdict.md + HTML
               → tracker comment (after a yes) → status → docs → kb → candidate cases for lifecycle
```

## 5. The router (step 0)

The FLOW matrix of `ticket-routing.md` §4 survives; the EFFORT axis (§5) does not.

| Type × status | Job |
|---|---|
| Bug, `fix-ready` | `/qa-verify-fix` (unchanged) |
| Bug, `hotfix-ready` | `/qa-hotfix-check` (unchanged) |
| Sub-task | re-enter with the parent's type × status |
| everything else — Story, Task, Epic, Review task, Technical task, Bug `not-fixed`, a PR or feature name | **test** |

`technical-change` stops being a flow: a refactor or dependency bump is a test job whose strategy is
regression-averse with no new-behaviour risks (§6 floor F5 makes that deterministic). A Bug `not-fixed` is a
test job whose mission is "reproduce and characterize", with `/qa-fix` named as the next step.

## 6. The strategy (step 2)

Owned by `/qa-test-strategy` (prototype: PR #416). The orchestrator writes it inline — choosing needs the
whole bundle, and a dispatch brief carries only a summary. The file: inputs (project environment, product
elements, quality criteria), risk register, strategy mix (ISTQB types), approach per risk (technique +
oracle with authority + lane + depth), artifacts, data, out of scope, entry/exit criteria, amendments,
reconciliation. Cap 80 lines.

**Who chooses, and where independence lives.** The orchestrator that gathered the context — never a
separate "strategist" agent. A subagent would decide from a brief, and a fact relayed to a subagent is
dropped silently (measured: `.claude/knowledge/execution/regression-suites.md` §Working concurrently on
suites). Independence (Bolton's *critical distance*) belongs at the **check**, not the choice: the user's
approval, the verifier when a risk is Critical, and execution by other agents, so the plan's author is
never its executor.

**Also a standalone skill.** `/qa-test-strategy <TICKET>` runs context + strategy and stops. The
strategy is then a deliverable in its own right: a team can review "how will we test this?" before any
run is paid for, and `/qa-test` picks the approved file up instead of writing a new one.

**Floors — deterministic gate rules that replace `ticket-routing.md` §5–§5d.** The strategy may add to a
floor, never go under it.

| # | Signal (from the bundle) | Floor |
|---|---|---|
| F1 | any High/Critical risk, P0/P1, ≥2 layers or ≥2 domains | test model + exploratory |
| F2 | Story whose surface purpose is `UNDECLARED` (§5b) | test model + exploratory, whatever else holds |
| F3 | `visual_surface: true` | visual lane |
| F4 | revenue-critical flow touched | no risk on it below Medium |
| F5 | diff touches a surface existing suite cases cover | coverage triage + a regression run over those cases |
| F6 | a PR is not deployed on the stand (`/ticket-context` block 3) | BLOCKED before any browser opens |
| F7 | `Review task` (no ACs) | oracles from the diff only; F5 on by default |
| F8 | design-system / token change (`ui-kit`, §5c) | F3 + token audit; fails closed |
| F9 | any doubt about a floor's signal | the floor applies |

**Approval.** One question to the user, showing mission, risks, artifacts and out-of-scope. `--yes` skips
it (CI, unattended). No human and no `--yes` ⇒ STOP with the file as output. A fresh `qa-lead` verifier
re-derives the gate first when any risk is Critical (replaces FULL's per-path verifier).

**Exploratory order (D3).** The strategy decides: explore **first** when any High/Critical risk rests on a
`{HYPOTHESIS}` oracle or the feature is new (the checklist is then written from what discovery observed,
today's FULL `3x → B`); otherwise **alongside** the checklist (today's `/qa-test-fast`).

## 7. What moves where

| Today | Target |
|---|---|
| `1a` fetch + route · `1b` pre-flight | router (§5) + `/ticket-context` |
| `1c` · `1d` · `1c-map` · `2-load` · `2-topup` | `/ticket-context` bundle |
| the six derived axes (`2b`–`2g`) | signals in the bundle, read by the floors |
| `1r` reachability | entry criterion of the strategy (F6) |
| `1e` test model · mind map | PREPARE, when selected (F1/F2 or the strategy) |
| `1e-plan` scaffold · Artifact A authoring · `3-cases` verifier | **removed** — authoring moves to `/qa-test-lifecycle` (D2) |
| Artifact A phase `2a` (coverage triage) · C1 | PREPARE + EXECUTE, when F5 or the strategy selects them |
| `3a` data · `3x` exploratory · Artifact B checklist · `3-exec` | PREPARE / EXECUTE, ordered per D3; `3-exec` becomes the stage gate before execution |
| `4a` · `4v` · `4c` | EXECUTE |
| `5-*` | CLOSE, plus the reconciliation and a `candidate cases` list |
| `/qa-test-fast` | merged into `/qa-test` (D1); its verdict.md + HTML page become the report |
| `ticket-routing.md` §5, §5a–§5d | replaced by §5 here + floors F1–F9 |

**Consumers to migrate** (counted 2026-10-09, files outside `docs/decisions`): 24 cite `qa-test-fast`, 20
cite `ticket-routing.md`, 13 name a FAST/FULL path, 28 name Artifact A or `3-cases`; `ci/run-full-cycle.ts`
and `ci/run-suite-audit.ts` reference `/qa-test`. `--epic` and `--iterate` keep their semantics; each child
story or round gets its own strategy (round N+1 amends round N's).

## 8. Validation — before anything is deleted

Run 3–5 recent tickets that already have runs through the prototype and compare with the recorded run:

| Ticket kind | Measures |
|---|---|
| Story · Review task · Technical task · UI-only change · Bug `not-fixed` | wall time to verdict · tokens · bugs found · bugs escaped (found later by people) · edits at approval · plan-vs-fact deviations |

Pass: R3 holds on the small tickets, R4 holds on the large ones, and no floor had to be overridden by
hand. A failed measure goes back to the floors, not to more prose in the strategy.

## 9. Decisions

| # | Question | Decision |
|---|---|---|
| D1 | One command or two? | **One — `/qa-test`.** Depth is a property of the strategy, not of the command. (owner, 2026-10-09) |
| D2 | Author regression cases inside a ticket run? | **No — moved to `/qa-test-lifecycle`.** The run emits `candidate cases` (passing items no suite case covers) in `summary.json`. Removes Artifact A, `3-cases`, `1e-plan` and the in-run single-writer race. (owner, 2026-10-09) |
| D3 | Exploratory before the checklist or alongside? | **The strategy decides**, by the rule in §6. (owner, 2026-10-09) |
| D4 | Approve every strategy, or only a non-default one? | **Every strategy, every run.** `--yes` is the only way past the question (CI, unattended); no `AUTO` for "default-looking" strategies. The edit count at approval is a §8 measure. (owner, 2026-10-09) |
| D5 | Named depth levels? | **A derived label for reports only** — `light` / `standard` / `deep`, computed from the artifacts table (`light` = checklist only; `deep` = test model + exploratory, or the Critical-risk verifier ran; `standard` = anything between), shown in `verdict.md`, the HTML page and `summary.json`. Never an input: no rule, floor or gate reads it, so it cannot drift from what ran. (owner, 2026-10-09) |

## 10. Risks

| Risk | Mitigation |
|---|---|
| The model over-plans: every strategy selects everything, and nothing gets faster | floors set the minimum; the gate rejects an artifact with no risk naming it; §8 measures wall time |
| The model under-plans and skips what FULL would have caught | floors F1–F9 are deterministic; F9 resolves doubt upward; the Critical-risk verifier |
| Approval becomes a rubber stamp | the question shows four short tables, not the file; the edit count at approval is tracked (§8, D4) |
| Agents drift from the approved plan | reconciliation before the verdict; an unresulted High/Critical risk caps it below PASS |
| Losing case authoring lowers regression growth | `candidate cases` in every summary; `/qa-test-lifecycle` consumes them; track the count in §8 |
| A big-bang migration of 80+ citing files | ship behind the prototype first, migrate consumers only after §8 passes |

## 11. Grounding — what the strategy is built on

| Source | What it gives the design |
|---|---|
| Heuristic Test Strategy Model (Bach, v6.3, 2024) | techniques are the *output* of three inputs — project environment, product elements, quality criteria. The strategy file's inputs section is that shape |
| ISTQB Test Manager — strategy types | analytical, model-based, methodical, process-compliant, reactive, consultative, regression-averse; real strategies mix them. The mix table makes the mix explicit instead of an accident of which artifacts exist |
| ISO/IEC/IEEE 29119-3:2021 §7.2 | a strategy follows a product + project risk register and names techniques, entry/exit criteria, data, environment, retest, regression; the agile example tailors content by risk. The floors are that tailoring, made deterministic |
| Planner/executor agents (DeepPlanner, arXiv 2510.12979; ScenGen, 2506.05079; ResTest, 2506.00520) | separating the plan from the actions is what makes an agent's plan inspectable — the strategy is that plan |
| Plan Declaration–Execution Gap (arXiv 2609.38108) | agents drift from a declared plan, and the drift is invisible in the final verdict — hence the reconciliation before the verdict |
| LLM testing surveys + oracle authority taxonomy (arXiv 2307.07221, 2509.25043, 2607.05031) | the oracle is the weak point; every risk names its oracle *and where its authority comes from*; a `{HYPOTHESIS}` oracle never decides PASS/FAIL |
| Bolton & Bach — testing vs checking (2025) | agents do checking well; discovery needs a deliberate, time-boxed reactive part — exploratory is a strategy decision (D3), not a by-product |

## 12. Expected effect — stated as hypotheses for §8, not claims

| | Expected | Why it might not hold |
|---|---|---|
| **Quality** | up: risks and oracles are visible, out-of-scope is written down, drift is caught at reconciliation, a wrong direction is corrected at approval instead of after the run | a rubber-stamp approval (D4) or a strategy written to fit the checklist rather than the risks |
| **Speed, small ticket** | about equal: one extra step (minutes) plus the approval wait, against no model, mind map or exploratory when the floors do not require them | the model over-plans (§10) and selects everything |
| **Speed, large ticket** | up: no in-run case authoring, no `3-cases` verifier, no single-writer wait (D2); fewer re-runs after a wrong direction | the floors push most tickets to "deep", which is today's FULL minus authoring |
| **Maintenance** | up: one command, one router table and nine floors instead of two commands, two paths and §5–§5d with four special cases | the migration (§7, 80+ citing files) is done before §8 proves the design |

