# Stage 1 — the context waves, in detail

Three waves. Every brief uses the section structure of
[`../../templates/agent-dispatch.md`](../../templates/agent-dispatch.md) §Agent Prompt Structure.
Anything the brief can pass as a **file** is passed as a path, never pasted.

## Wave 1 — the ticket context, and the domain map when it is missing

### A+B · Ticket context — [`/ticket-context`](../ticket-context/SKILL.md)
Dispatch C first when it is due (background, its own browser lane), then run
`/ticket-context <KEY> --domain <slug> --kb-hits <ids from Step 0>`. It returns one gated bundle:
ACs with provenance, comment signals, every attachment, inline image and link with an outcome, design
conditions, the PRs (only product-repo PRs are change surface), PR↔AC both ways, whether each PR is
deployed on this stand, known ground, gaps and blockers. Do not re-fetch the ticket or a PR, and do not
re-check deployment: the bundle is the answer.

### C · Domain map — only when the state is `ABSENT` or `unresolved`
Invoke `/qa-domain-map <slug>` on `playwright-firefox` as
[`../qa-test/context-wave.md`](../qa-test/context-wave.md) §1c-map does. That means the command itself,
never a re-implementation. Cite §1c-map for the invocation only; its FULL-only trigger does not apply,
the trigger is this section's heading. The state is decided by [`../qa-test/axes.md`](../qa-test/axes.md) §2g:
- `PRESENT` → read it
- `STALE` → read it as hypotheses and never auto-refresh
- a build failure → record it and proceed, never block

`--dry-run` skips C's live pass.

## Join 1 — the context bundle

The bundle is `/ticket-context`'s file; it is never copied under `reports/` (not a report category), and
**no consumer ever writes it**: it is schema-gated and cached, so run-derived state has no field there.
That state goes to the **run context**, a file in this run's scratchpad that names the bundle path. It
holds `visual_surface` + `surface_source[]`, C's domain-map result, the map signals, contract-refresh
drift, the suspect list and `mind_map_findings`. Before Wave 2, **wait for C** when it ran, then:
- **Deployment.** A `NOT DEPLOYED:` line in `blockers[]` is BLOCKED-on-deploy: stop, never a FAIL. A
  `DEPLOYMENT UNKNOWN:` line lets the run proceed, and `verdict.md` says "deployment unverified" and
  quotes the line.
- **Domain map.** C's result, when it ran, supersedes `known.domain_map` in the run context.
- **Visual axis.** `visual_surface` + `surface_source[]`, derived from the bundle's `change.prs[].layers`
  and written to the run context, per [`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §1.
- **Pass the bundle path** (and the run context's) to `/qa-test-model --context` and to every later brief
  that needs the ticket.

**Contract refresh (inline).** If the bundle names a GraphQL operation (in
`change.prs[].operations`), run the two commands of
[`../qa-test/contract-refresh.md`](../qa-test/contract-refresh.md) §2. Drift on an operation the diff
touches goes into the run context as a model input.

## Wave 2 — one message

- **Test model — you, inline.** `/qa-test-model <TICKET> --context <bundle>`. You are the Judge, and
  the model's gate runs inside that skill.
- **Mind map — `ba-system-analyzer`, no browser.**
  - The map exists → `/qa-test-mind-map update <slug> --from <TICKET>`.
  - It is absent and the domain map is `PRESENT` → `build`, **with step 10 removed from the brief**,
    because this flow writes no suite CSV.
  - The domain map is `ABSENT` or `STALE` → skip, and write the reason into the run context.
  - Either way, `npm run models:check` must be green before the result is used.
  - **Map signals.** From `npm run models:check -- --json`, copy these lists for the slug into the
    run context: DRIFT nodes (with `drift.observed`, and whether `TM-018` flags the route as unfiled),
    UNVERIFIED nodes, nodes no case stamps (`TM-014`), suspect cases (`TM-017`), and integration
    points no case exercises (`TM-032`, the `crossings` array). Wave 3 filters them to the in-scope
    nodes; no later step re-runs the checker.

**Join 2.** When Wave 2 built or updated the mind map, set the model's `Mind map:` header line to its
path. A map built in this wave did not exist when the model was written, so the model's Part 0 carries
no node ids from it, and that is expected. Node-level tracing is Wave 3's job (Mode 5 selects by
chain link and descent).

## Wave 3 — the checklist

`/qa-checklist <TICKET> --from-model --mind-map <slug>`
([`../qa-checklist/from-model.md`](../qa-checklist/from-model.md)), written to
`reports/tickets/{SPRINT}/<TICKET>/testing-checklist.md`. The model's unresolved items are **not**
checklist items. They are the exploratory charter ([`execution.md`](execution.md) §Exploratory).

**Map signals decide what a node's item asserts.** Mode 5 step 3 already gives every in-scope node an
item or an omission line; this table says which, for the nodes whose truth is not settled.

| In-scope node | Its line in the checklist |
|---|---|
| DRIFT | An item that re-observes `drift.observed`, with Expected `drift.expected`. The Result is `DRIFT HOLDS` or `DRIFT RESOLVED`, plus evidence. It decides an AC only when that AC names the behaviour. A HOLDS whose route `TM-018` flags as unfiled is written `FAIL — DRIFT HOLDS (TM-018 unfiled)`, so Stage 3 triage collects it; any other HOLDS stays `DRIFT HOLDS`. |
| UNVERIFIED | An omission line `UNVERIFIED → charter`. With no ground truth to assert, it is exploratory work, not a pass/fail item. |
| No stamped case | An ordinary item. A PASS on it is a `candidate case` in `verdict.md`. |
| Integration point (cross-domain edge) | One item that exercises both sides, under the other domain's partition. A PASS is a `candidate case` carrying both stamps. |
| Linked to a suspect case | No change. The suspect list stays in the run context for the verdict. |

## Stage gate — inline, before any browser opens

| Check | Fails when |
|---|---|
| Model | any gate line is neither `PASS` nor `FIXED` |
| Checklist | an in-scope scenario row or node is neither an item nor an omission line |
| Data | an item has no Data cell (`FIXTURE-GAP` with a reason counts as a cell) |
| Record | a Stage-1 artifact is neither produced nor SKIPPED with an observable reason |
| Visual | `visual_surface` is not recorded with its sources |

A failing check is fixed before Stage 2. It is never carried into execution as a note.
