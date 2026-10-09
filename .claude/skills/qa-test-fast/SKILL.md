---
name: qa-test-fast
description: "[Testing] Methodology behind the /qa-test-fast command — the prototype of the single /qa-test (route the job, choose an approved strategy, run only what it selects; design D1–D12, draft #417). Use when running or changing /qa-test-fast, or when deciding whether a ticket fits it."
argument-hint: "(read by /qa-test-fast — not invoked directly)"
disable-model-invocation: true
---

# /qa-test-fast — methodology

**The promise:** a ticket verdict in one sitting that is still **grounded**, at the depth the ticket's
risks need and no more. Every checklist item is traced to a risk in an explicit, user-approved **test
strategy**; the strategy is traced to the diff, the ticket and the domain; deterministic floors
([`../qa-test-strategy/floors.md`](../qa-test-strategy/floors.md)) keep it from going under what a risk
requires. This is the prototype of the single `/qa-test` (D1): there is no FAST/FULL here, only the
strategy's artifacts, its depth label, and at most three rounds per ticket.

## Stage flow

```
Step 0  route the job · count rounds (4th ⇒ STOP) · env · prior artifacts · slug · kb ask
Stage 1 Wave 1  A ticket ‖ B PRs ‖ C domain map (only if ABSENT)   ── join → bundle (+ schema:refresh)
        Strategy /qa-test-strategy (inline) ── floors ── gate ── [verifier if Critical] ── user approves once
                 [--yes skips the question]   F6 (not deployed) ⇒ BLOCKED, stop
        Wave 2  /qa-test-model ‖ /qa-test-mind-map ‖ staleness check — only rows the strategy marked RUN
        Wave 3  exploratory FIRST (only when the strategy says so)
        Wave 4  /qa-checklist [--from-model]  ──  stage gate   [--dry-run stops here]
Stage 2         runner(chrome) ‖ runner(edge) ‖ exploratory ALONGSIDE(firefox) ‖ visual(devtools) ‖
                regression(non-stale ids) — ≤3 browser lanes at once, sequenced by risk; data on the fly
Stage 3         qa-triage-results (→ vc-fix:qa-investigate per real bug) → /vc-fix:qa-bug per confirmed bug
                ── teardown → reconcile strategy → verdict (round 3 non-PASS ⇒ escalation) → files → HTML
                → ask → comment → kb
```

**Why waves, not six parallel agents:** the dependencies are real. The strategy needs the whole bundle.
The mind map is derived from the domain map. The model needs the ticket, the diff and the strategy's
risks. An explore-first session feeds the checklist. `/qa-exploratory ticket` stops without a model, so a
strategy that runs exploratory also runs the model. Parallelism lives *inside* each wave.

## Fit

| Use `/qa-test-fast` | Use something else |
|---|---|
| any ticket whose job is **test** (Step 0.1): Story, Task, Epic, Review task, Technical task, a `not-fixed` Bug, a PR | a fix-ready Bug → `/vc-fix:qa-verify-fix` · a hotfix → `/qa-hotfix-check` |
| rounds 1–3 of a ticket | a fourth round → the escalation in [`../qa-test-strategy/rounds.md`](../qa-test-strategy/rounds.md) |
| no suite authoring is wanted from this run | new regression cases → `/qa-test-lifecycle` with this run's candidate cases |

## What each stage may write

| Stage | Writes | Never writes |
|---|---|---|
| 1 | this round's section of `test-strategy.md` · `reports/ba/test-models/<TICKET>-<date>.md` (when selected) · the domain map (only via `/qa-domain-map`) · the mind map (only via `/qa-test-mind-map`) · `testing-checklist.md` | suite CSVs, the tracker |
| 2 | evidence under `reports/tickets/{SPRINT}/<TICKET>/screenshots/` · `design-report.md` (visual lane) · `AGENT-TEST-` entities (then deletes them) · the SBTM session file · the regression run's results (via `/qa-regression --no-promote`) · a setting or fixture a Data cell names (`flip+restore` / `mutate` + its seeder part, re-read after) · the Results in `testing-checklist.md` (you, at the join) | any other shared fixture, other lanes' settings |
| 3 | `summary.json`, `verdict.md`, the strategy's reconciliation, `triage-report.md` + the investigation packages (via `qa-triage-results`), bug reports **via `qa-bug`** · the Artifact page (shared with Anyone at Virto Commerce) + its `Page:` line · one tracker comment after a yes · kb entries | a status transition, a hand-written bug |

## Rationalization table (each row was produced by a baseline run without this skill)

| Excuse | Reality |
|---|---|
| "The mind map doesn't exist and nothing requires it — skip it." | The approved strategy decides it ([`../qa-test-strategy/SKILL.md`](../qa-test-strategy/SKILL.md) §Procedure step 8). Model selected and domain map present ⇒ build it. Otherwise record the reason (Rule 4). |
| "The strategy is obvious — start testing and write it afterwards." | A strategy written after the run describes what happened; it cannot be approved or reconciled. Nothing in Wave 2 runs before it is `APPROVED` or `AUTO (--yes)`. |
| "That node is already DRIFT in the map, so there's nothing to check." | A DRIFT is a question. Re-observe it: `HOLDS` or `RESOLVED` with evidence is the finding the next map update needs ([`context-wave.md`](context-wave.md) §Wave 4). |
| "Pre-seed with the domain seeder first, then test." | Rule 3: data is made per item. A seeder runs only when an item's Data cell names it. A pre-seed wave is FULL's `3a`, not this flow. |
| "The runner already saw it fail — call `qa-bug` straight away." | A runner's FAIL is a candidate, not a bug: it can be a wrong checklist item, stale data or an env blip. Triage classifies it, and `vc-fix:qa-investigate` reproduces it and finds the owning layer. Only then does `qa-bug` file it, from that package. |
| "Triage is quick — I'll classify inline." | `qa-triage-results ticket` runs the same classifier as a regression run. Inline classification is the second copy of that taxonomy that drifts. |
| "I'll write the bug reports into `reports/bugs/open/` myself." | Rule 1: `/vc-fix:qa-bug` does the 4-layer validation, the owning-repo resolution and the `/qa-fix` handoff block. A hand-written report has none of them. |
| "The opening status hop is automatic." | Rule 2: this flow makes no transition, and that includes the opening one. |
| "Contract refresh isn't needed for a verdict." | Without it, every `{DOC}` oracle on a GraphQL field is `{HYPOTHESIS}`. `schema:refresh` takes about 9 s. |
| "A 120-line report is within the per-ticket cap." | The deliverable is the HTML page + a ≤60-line `verdict.md`. The cap is a ceiling, not a target. |
| "The page is optional — offer it." | Rule 6: it is the deliverable. |
| "It's a Story, so it should go FULL." | There is no FAST/FULL here. Depth comes from the risks and the floors; a Story on 2+ layers is `deep` only when a High/Critical risk or P0/P1 fires F1. Do not re-route to `/qa-test`. |
| "Run every case regression:select picked." | Stale cases go to `/qa-test-lifecycle` first (Wave 2 staleness check); a run over them manufactures FAILs. |
| "It is the fourth round, but the fix is tiny." | Rule 7: three rounds, then the escalation. |
| "This morning's run already has results — reuse them." | On the same build, show that verdict and ask (Step 0.4). Never silently reuse another run's results, and never silently overwrite them. |
| "Sweep leftovers with `seed:*:teardown`." | Persistent fixtures share the `AGENT-TEST-` prefix, and a sweep deletes them. Teardown is by ledger id only. |
| "The checklist runner already looked at the page — skip the visual lane." | A functional runner cannot see a contrast failure, a token collision or design drift. F3/F8 fired ⇒ the lane runs, or `--no-visual` is recorded ([`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §5). |
| "I'll invoke `/qa-design` myself, inline." | The command is not model-invocable, and the skill is ~30K chars. The `ui-ux-expert` brief makes the **agent** invoke the `qa-design` skill ([`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §2). |
| "25 minutes is enough exploring." | The exploratory box floor is 30 minutes ([`../qa-test/exploratory-lane.md`](../qa-test/exploratory-lane.md) §5). |

## Red flags — stop and re-read the seven rules

- You are about to `Write` a file under `reports/bugs/`.
- You are about to call `/vc-fix:qa-bug` for a finding that has no `vc-fix:qa-investigate` package.
- You are about to call a tracker transition.
- Wave 2 or Stage 2 is starting and `test-strategy.md` is still `DRAFT`.
- A checklist item names no `R-n`, or a planned risk has no row in the reconciliation.
- The Stage-2 message contains a `seed:*` call that no checklist item's Data cell names.
- `verdict.md` lists a Stage-1 artifact as neither produced nor SKIPPED-with-reason.
- You wrote "optional" next to the HTML page.
- A `seed:*:teardown` appears anywhere in your teardown.
- The strategy names no floor as fired or not, or a fired floor's artifact is `SKIP`.
- The regression id list holds a case the staleness check marked stale.
- This is the ticket's fourth round and Stage 1 has started.
