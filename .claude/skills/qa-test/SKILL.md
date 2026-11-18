---
name: qa-test
description: "[QA Methodology] Methodology behind the single strategy-driven /qa-test — the lanes and their briefs, test data made during the run, the verdict and the one tracker comment, the status hop, and the hand-off of stale and candidate cases to /qa-test-lifecycle. The command is the orchestration shell; this skill holds what the vc-test skills it calls do not. Read the file for the stage you are in."
argument-hint: "(read by /qa-test — not invoked directly)"
disable-model-invocation: true
---

# `/qa-test` methodology

[`/qa-test`](../../commands/qa-test.md) is the orchestration shell: six stages, the rule that decides each
step, the STOP conditions. **The method is split between vc-test and this skill, and never copied between
them.** Context, strategy, the floors, routing within the strategy, reconciliation and triage are vc-test's —
invoked, not restated. What this skill holds is what the repo adds: the lanes and their briefs, data made on
the fly, the verdict files, the tracker comment, the status hop, the docs and the hand-off to
`/qa-test-lifecycle`.

| File | Covers | Read it when |
|---|---|---|
| [`execution.md`](execution.md) | Stage 4 — the lanes, the runner brief, exploratory, visual, the regression lane, data made on the fly and teardown, the map signals, the join gate | Dispatching or joining the lanes |
| [`close-out.md`](close-out.md) | Stage 5 — triage routing, filing (`5-file`), the verdict (`5-verdict`), the run's files, the page and the one comment, the hand-off to lifecycle | Deciding and delivering what the run concluded |
| [`triage.md`](triage.md) | App Insights correlation, evidence quality, provenance, severity, dedup, the visual-finding classes and the a11y carve-out | Turning results into findings |
| [`reporting.md`](reporting.md) | `5-status` · `5-docs` · `5-docs-map` | The transition, the docs, the domain-map write-back |
| [`sequencing.md`](sequencing.md) | What may run in parallel and what must stay serial | Batching a step, or changing the order |
| [`dispatch-pack.md`](dispatch-pack.md) | What a brief carries as TEXT and what stays a PATH | Writing any dispatch brief |
| [`contract-refresh.md`](contract-refresh.md) | The strategy row `Contract refresh: RUN` — the two artifacts, the two commands, `UNKNOWN` never falling back | A ticket touching GraphQL/xAPI |
| [`exploratory-lane.md`](exploratory-lane.md) | The exploratory charter's sources, the box, the payload | The strategy's Exploratory row is `RUN` |
| [`ui-kit-class.md`](ui-kit-class.md) | The `ui-kit` class — when the change IS the design system (strategy floor F8) | A design-system / token / primitive change |
| [`/vc-test:ticket-context`](../../../plugins/vc-test/skills/ticket-context/SKILL.md) · [`/vc-test:qa-test-strategy`](../../../plugins/vc-test/skills/qa-test-strategy/SKILL.md) (`floors.md`, `reconcile.md`, `verdict-rules.md`) · [`vc-test:qa-triage-results`](../../../plugins/vc-test/skills/qa-triage-results/SKILL.md) · [`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md) | Context, strategy, triage, the visual lane | Stages 1, 2, 5 and the visual lane |
| [`../qa-test-model/test-model.md`](../qa-test-model/test-model.md) | The fault model, for the risks whose technique is `MODEL` | The strategy's Test model row is `RUN` |
| [`regression-selection.md`](../../knowledge/execution/regression-selection.md) §Existing-Coverage Triage | `tc:scope` and what a case at risk is disposed as | The staleness check |

## The two things that hold the whole pipeline together

**1. The value chain is derived before anything else, and everything hangs off it.** EP, BVA, DT, ST, PW,
CT and EG are all *parameter-space* techniques: each refines a link that has already been named, and none
of them can name the chain. Run against an unnamed chain they faithfully produce per-screen field checks
that are individually well-formed, strongly asserted, and collectively unable to notice the feature does
not work.

Measured on Loyalty Missions (VCST-5320/5346): **127 cases**, of which the 71-case storefront suite placed
**zero** orders and 54 of its cases never left one page; the mechanism end-to-end (order → progress →
completion → points credited) got **11%**; the last link — spending what the feature grants — got **one**
case, written on the final day; **zero `BL-*` invariants existed for the domain**, so the corpus recorded
behaviour instead of judging it; and no model was written at all. `npm run tc:rank` scored that storefront
suite as *strong* (41 `INV`, 58 `KEEP`) — assertion strength says whether a check **can fail**, chain
coverage says whether anyone **cares if it does**, and only the second one culls a garbage check.

In this flow the chain is the strategy's risk register and, for its `MODEL` risks, the test model's Part 0:
every checklist item names the `R-n` it serves, so an item no risk reaches is either out of scope or a risk
the strategy missed — appended to the round's `### Amendments`, never kept silently.

**2. Silence is never an answer.** Every row, cell, waiver, exclusion and below-floor finding is stated
explicitly, because in every one of these places an omission is indistinguishable from a clean result:

| Place | A blank reads as | So the rule is |
|---|---|---|
| A strategy artifact row | it ran, or was not needed | a result, or `SKIP — <observable reason>` in `verdict.md` |
| An in-scope risk | covered | a checklist item, a charter item, or an omission line with its reason |
| Mechanism coverage matrix cell (a model ran) | covered | scenario # or `GAP` / `WAIVED + reason` |
| Reverse edges (a model ran) | no reverse effect exists | covered by #, or `ABSENT IN PRODUCT` (a finding) |
| A charter source | nothing in it | covered, or `NOT REACHED + reason` |
| Below-floor findings | nothing minor was found | `summary.json.bugs_not_filed: []` |
| A case at risk | still correct | ran in the regression lane, or a `stale_cases` entry with its reason |
| A ledger id not deleted | cleaned up | named under `verdict.md`'s Data heading and in `summary.json.test_data` |

## Rationalization table

| Excuse | Reality |
|---|---|
| "The mind map doesn't exist and nothing requires it — skip it." | The strategy's Mind map row decides. A `SKIP` carries its observable reason in `verdict.md`; "not needed" is not one. |
| "That node is already DRIFT in the map, so there's nothing to check." | A DRIFT is a question. Re-observe it: `HOLDS` or `RESOLVED` with evidence is the finding the next map update needs ([`execution.md`](execution.md) §Map signals). |
| "Pre-seed with the domain seeder first, then test." | Data is made per item. A seeder runs only when an item's Data cell names it ([`execution.md`](execution.md) §Data). |
| "No data reaches this risk — I'll write a small seeder." | A run writes no seeder. The risk is `FIXTURE-GAP`, raised in the approval question; seeders come from `/qa-generate-data` + `/qa-seed-data`. |
| "This case is stale — one selector, I'll just fix it." | A run never edits a case. It is a `stale_cases` entry with its reason, and `/qa-test-lifecycle` repairs it. |
| "The runner already saw it fail — call `qa-bug` straight away." | A runner's FAIL is a candidate: a wrong item, stale data or an env blip. Triage classifies it, `vc-fix:qa-investigate` reproduces it and finds the owning layer, and only then does `qa-bug` file it, from that package. |
| "Triage is quick — I'll classify inline." | `vc-test:qa-triage-results` runs the same classifier as a regression run. An inline classification is a second copy of that taxonomy, and it drifts. |
| "I'll write the bug reports into `{RUN_DIR}/bugs/` myself." | `/vc-fix:qa-bug` does the 4-layer validation, the owning-repo resolution and the `/qa-fix` hand-off block. A hand-written report has none of them. |
| "The verdict is PASS, so the closing hop is obvious — no need to ask." | The closing hop is always asked: it notifies watchers and `REOPEN` hands work to another team ([`reporting.md`](reporting.md) §5-status). Only the opening hop is unconfirmed. |
| "Contract refresh isn't needed for a verdict." | Without it every `{DOC}` oracle on a GraphQL field is `{HYPOTHESIS}`. When the diff names an operation, the row should be `RUN`; `schema:refresh` takes about 9 s. |
| "The budget is over — drop the exploratory lane." | The budget never stops a run. Dropping an approved `RUN` row is an Amendment with its reason, and time pressure is not a reason. |
| "A 120-line report is within the per-ticket cap." | The deliverable is the HTML page + a ≤60-line `verdict.md`. The cap is a ceiling, not a target. |
| "The page is optional — offer it." | It is the deliverable ([`close-out.md`](close-out.md) §HTML page and comment). |
| "This morning's run already has results — reuse them." | On the same build, show that verdict and ask (command Stage 0). Never silently reuse another run's results, and never silently overwrite them. |
| "Sweep leftovers with `seed:*:teardown`." | Persistent fixtures share the `AGENT-TEST-` prefix, and a sweep deletes them. Teardown is by ledger id only. |
| "The checklist runner already looked at the page — skip the visual lane." | A functional runner cannot see a contrast failure, a token collision or design drift. `Visual lane: RUN` ⇒ the lane runs, or the drop is an Amendment ([`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md) §5). |
| "I'll invoke `/qa-design` myself, inline." | The command is not model-invocable, and the skill belongs in an agent that owns its own Playwright lane. The `vc-test:ui-ux-expert` brief makes the **agent** invoke the `vc-test:qa-design` skill ([`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md) §2). |
| "25 minutes is enough exploring." | The exploratory box floor is 30 minutes ([`exploratory-lane.md`](exploratory-lane.md) §5). |

## Red flags — stop and re-read the command's Rules

- You are about to `Write` a bug report yourself (under `{RUN_DIR}/bugs/` or `reports/bugs/`).
- You are about to call `/vc-fix:qa-bug` for a finding that has no `vc-fix:qa-investigate` package.
- You are about to write under `regression/suites/**` or `scripts/seed-data/**`.
- You are about to post a second tracker comment, or post one without a yes.
- You are about to make the closing transition without asking, or past `TESTED`.
- A Stage-4 message contains a `seed:*` call that no checklist item's Data cell names.
- `verdict.md` lists a strategy artifact as neither produced nor `SKIP` with a reason.
- You wrote "optional" next to the HTML page.
- A `seed:*:teardown` appears anywhere in your teardown.
- A dispatch description does not start `[vc-test:qa-test.<step>]`.
