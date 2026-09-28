# Stage 1 — the context waves, in detail

Three waves, each one message. Every brief uses the section structure of
[`../../templates/agent-dispatch.md`](../../templates/agent-dispatch.md) §Agent Prompt Structure.
Briefs A and B are **Mechanic** dispatches (tracker and diff reading, no platform observation), so they
omit the `Observed behaviour` line, as that template allows. Anything the brief can pass as a **file**
is passed as a path, never pasted.

## Wave 1 — one message, up to three dispatches

### A · Ticket — `ba-system-analyzer`, no browser
Fetch the ticket **with all fields**, following the fetch bullets of
[`../qa-test/preflight.md`](../qa-test/preflight.md) §1a (comments always, and every attachment opened —
one that cannot be read is a named gap). ACs often live in a custom field; an empty description is not
"no ACs". Return:
- the ACs as numbered atomic conditions (`AC-1…`), each with its source (the field, or a comment and
  its date)
- the comment signals that change what is tested
- one concrete finding per attachment
- the epic line and any Done siblings (the integration seams)
- the domains, a layer guess and open questions

Read-only: no tracker writes.

### B · PRs — `ba-api-specialist`, no browser
Work the four-rung ladder of [`../qa-test/technical-change.md`](../qa-test/technical-change.md) §2.1 and
stop at the first rung that yields PRs. Then run `gh pr diff <n> --repo <r>` per PR. **Only product-repo
PRs are change surface.** Deployment-manifest PRs and this repo's PRs are listed as context. Return, per PR:
- repo, number, state, and the build it is deployed in (if known)
- files, by layer token (`storefront` / `admin-spa` / `api` / `module` / `platform`)
- the **GraphQL operations and REST endpoints touched, by name**
- settings and permissions added or changed
- risk hotspots as `file:line` plus one line each
- review-thread concerns

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

Write it to your scratchpad, never under `reports/`. It is not a report category. The bundle holds:
- A's conditions and findings
- B's change surface
- the domain map state and path
- the mind map path, or `null`
- the kb hit ids from Step 0
- the gaps A and B named

**Contract refresh (inline).** If B named a GraphQL operation, run the two commands of
[`../qa-test/contract-refresh.md`](../qa-test/contract-refresh.md) §2. Drift on an operation the diff
touches goes into the bundle as a model input.

## Wave 2 — one message

- **Test model — you, inline.** `/qa-test-model <TICKET> --context <bundle>`. You are the Judge, and
  the model's gate runs inside that skill.
- **Mind map — `ba-system-analyzer`, no browser.**
  - The map exists → `/qa-test-mind-map update <slug> --from <TICKET>`.
  - It is absent and the domain map is `PRESENT` → `build`, **with step 10 removed from the brief**,
    because this flow writes no suite CSV.
  - The domain map is `ABSENT` or `STALE` → skip, and write the reason into the bundle.
  - Either way, `npm run models:check` must be green before the result is used.
  - **Map signals.** From `npm run models:check -- --json`, copy four lists for the slug into the
    bundle: DRIFT nodes (with `drift.observed`, and whether `TM-018` flags the route as unfiled),
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
| DRIFT | An item that re-observes `drift.observed`, with Expected `drift.expected`. The Result is `DRIFT HOLDS` or `DRIFT RESOLVED`, plus evidence. It decides an AC only when that AC names the behaviour. |
| UNVERIFIED | An omission line `UNVERIFIED → charter`. With no ground truth to assert, it is exploratory work, not a pass/fail item. |
| No stamped case | An ordinary item. A PASS on it is a `candidate case` in `verdict.md`. |
| Integration point (cross-domain edge) | One item that exercises both sides, under the other domain's partition. A PASS is a `candidate case` carrying both stamps. |
| Linked to a suspect case | No change. The suspect list stays in the bundle for the verdict. |

## Stage gate — inline, before any browser opens

| Check | Fails when |
|---|---|
| Model | any gate line is neither `PASS` nor `FIXED` |
| Checklist | an in-scope scenario row or node is neither an item nor an omission line |
| Data | an item has no Data cell (`FIXTURE-GAP` with a reason counts as a cell) |
| Record | a Stage-1 artifact is neither produced nor SKIPPED with an observable reason |

A failing check is fixed before Stage 2. It is never carried into execution as a note.
