# Stage 2 — execution, in detail

One message, at most three browser lanes ([`../../rules/agents.md`](../../rules/agents.md) §Parallel
Execution); the visual lane joins it or follows as soon as one lane returns
([`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §4). Each lane is its own agent with its own browser session and its own pool user.

| Lane | Agent | Browser | Pool user | Runs |
|---|---|---|---|---|
| Storefront | `qa-frontend-expert` | `playwright-chrome` | `@td(AGENT_POOL_SLOT_1.*)` | the checklist's storefront section |
| Admin + API | `qa-backend-expert` | `playwright-edge` | `@td(AGENT_POOL_SLOT_3.*)` | the Admin/REST/GraphQL section |
| Exploratory | `qa-testing-expert` | `playwright-firefox` | `@td(AGENT_POOL_SLOT_2.*)` | `/qa-exploratory ticket <TICKET>`, when the strategy marks it `RUN` |
| Visual | `ui-ux-expert` | Chrome DevTools MCP | the auth path the brief names (§Visual) | the `qa-design` skill's axes, when F3/F8 fired |
| Regression | `regression-orchestrator` | its own slots, counted toward the 3 | the suites' own | `/qa-regression <non-stale ids> --no-promote` (§Regression) |

The pool slots are the ones in [`../../knowledge/execution/live-discovery.md`](../../knowledge/execution/live-discovery.md)
§Test isolation in parallel runs. A checklist with a cross-layer section gives it to the lane that
**writes** the state and the other lane reads it back. A lane with no items is not dispatched, and
`--layer` removes lanes.

## Runner brief (both checklist lanes)

Use the [`agent-dispatch.md`](../../templates/agent-dispatch.md) structure, **including** its
`Observed behaviour` line — runners are Observers. Add:
- **Items:** the path to `testing-checklist.md` and the section letter. The runner reads its section
  from the file and nothing else. Each item's `R-n` comes back with its result, for reconciliation.
- **Data:** the Data cell of each item is the instruction (§Data below).
- **Shared state:** the checklist header's Rules block. Only the lane it names writes a shared setting,
  and that lane restores the setting and re-reads it to prove it.
- **Evidence:** `reports/tickets/{SPRINT}/<TICKET>/screenshots/`, per
  [`../qa-evidence/evidence-capture-policy.md`](../qa-evidence/evidence-capture-policy.md). HAR always.
- **Return, per item:**
  - `PASS` / `FAIL` / `BLOCKED` and a one-line note
  - the evidence file
  - every entity id it created (the ledger)
  - for a FAIL, what was expected vs seen, the layer, and the console/network lines
- **BLOCKED needs a failed attempt.** A BLOCKED with no attempt is returned as not-run, not as BLOCKED.

## Exploratory

Invoke `/qa-exploratory ticket <TICKET>` — the command, never a re-implementation. The charter
payload has the shape of [`../qa-test/exploratory-lane.md`](../qa-test/exploratory-lane.md) §6, and
its mission is the strategy's `EXPLORE` risks plus the `/qa-test-model` output's item 4 (the unresolved cells, reverse edges, `{HYPOTHESIS}`
oracles and flagged ACs) plus the mind-map branches the checklist declared as omissions, including
the `UNVERIFIED → charter` lines ([`context-wave.md`](context-wave.md) §Wave 4).
- **First or alongside** is the strategy's (D3). A `FIRST` session runs in Wave 3, before any checklist
  exists, so its charter is the strategy's `EXPLORE` risks plus the model's item 4 only.
- **The box** is the strategy's, sized per §5 there: 30-minute floor, 60-minute ceiling, stated in the payload.
- **Read-only by default.** When a charter item needs its own data, it follows §Data with its own pool
  user.
- **No promotion in this flow.** The brief says so explicitly (rule 5). A net-new scenario returns with
  its `Fate` proposed, not applied. The orchestrator lists PROMOTE candidates in `verdict.md` under
  *Not tested, and why* as `candidate case`, for a later `/qa-test-lifecycle` run.
- **A same-day SBTM file for this ticket already exists** ⇒ pass the prior session as input. The new
  charter covers what that session marked NOT REACHED; it is never a re-run of the old charter.
- **The strategy skipped it, or no unresolved item exists anywhere** ⇒ the lane is recorded as
  `ran: false` with that reason. Those are the only legitimate skips besides `--no-explore`.

## Visual

Dispatch `ui-ux-expert` — never run the `/qa-design` command. **The brief's first instruction: invoke
the Skill tool with `skill: "qa-design"` before any browser call**, and open the return with
`qa-design skill: loaded`. Everything else the brief carries (target, the design project from the
ticket's Prototype link + the `design:extract` spec path, the invariant text, the auth path, no
credential names), the lane-count rule and the verdict vocabulary are
[`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §2–§4 — cited, not restated here.
- **Writes** `reports/tickets/{SPRINT}/<TICKET>/design-report.md`; you write `summary.json.visual`.
- **Read-only.** It creates no data; a role-gated target uses the pre-signed profile, never a minted
  account ([`../qa-test/visual-axis.md`](../qa-test/visual-axis.md) §2).
- **Skipped** (`visual_surface: false` or `--no-visual`) ⇒ `visual.ran: false` + the reason.

## Regression

When the strategy marks it `RUN` (F5, or added by the strategy): `/qa-regression <ids> --no-promote` over
the non-stale id list from Wave 2 — never the raw `regression:select` output. It promotes nothing and writes
no suite row (D2). Its lanes count toward the 3 browser lanes; more than 3 needed ⇒ sequence by risk level,
highest first. Its `RUN_ID` goes to Stage 3 triage; its non-passing cases are triaged like checklist rows.

## Data — made during the run

The Data cell of each checklist item decides it, using the layers in
[`../../rules/test-data.md`](../../rules/test-data.md) and the decision tree in
[`live-discovery.md`](../../knowledge/execution/live-discovery.md) §Decision tree:

| Data cell | The runner |
|---|---|
| `{{VAR}}` / `@td(ALIAS.field)` | resolves it at runtime and never types the value |
| `live-discover <what>` | reads the entity (for example `scripts/lib/live-discover.ts`) and logs what it picked |
| `create-on-fly <entity> via <op>` | builds the unique values with `scripts/lib/random-data.ts` (`AGENT-TEST-` prefix), creates the entity through the named GraphQL or REST operation, **writes the id to the ledger with the observation it supports**, and never re-seeds between producing and using it |
| `setting <name> flip+restore` | reads the original value, flips it, hard-reloads the consumer, observes, restores, and re-reads |
| `fixture <alias> mutate + npm run <seeder> [--only <part>]` | mutates a persistent fixture, observes, restores it by re-running **only** the named seeder part, and re-reads the alias |
| `FIXTURE-GAP` | runs nothing and returns BLOCKED with the gap as the attempt |

**Teardown after Stage 3's Bugs step, inline — by ledger id only.** The ledger stays open through
Stage 3: triage's investigation reproduces on these entities, a test-defect re-run reuses them, and
`qa-bug` is handed their ids. Flipped settings are still restored and re-read at the join. Delete every
ledger id, oldest dependency last, then re-read each restored setting and fixture. **Never run a `seed:*:teardown` as a sweep.**
Persistent seeded fixtures carry the same `AGENT-TEST-` prefix, and those scripts delete them too,
which breaks every suite that uses their aliases. An entity that could not be deleted by id is named
under the output `verdict.md`'s Data heading and in `summary.json.test_data`, never left silent.

## Join gate

- Every checklist item has a Result.
- The ledger is complete: every created id, with its observation.
- Every restored setting has been re-read.
- The exploratory lane returned, or its box ran out; on overrun, proceed on what returned.
- The visual lane returned with `qa-design skill: loaded` (else re-dispatched once), or is recorded as
  not run with its reason.
- Every exploratory and visual finding is a row in ONE table at the end of `testing-checklist.md`,
  which `triage:collect --ticket` reads:
  `## X. Exploratory + visual findings` with `| # | Condition | Source | Result |`, ids `X1…`
  (exploratory) and `V1…` (visual), Result led by `FAIL` / `BLOCKED` / `NOT-RUN` / `PASS` / `DRIFT`. A
  finding a lane item already covers goes into that item's row. Prose is NOT collected.

The orchestrator writes the Results into `testing-checklist.md`. Runners return them and never edit
the file, so the checklist has a single writer.
