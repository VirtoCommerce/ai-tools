# Stage 4 — Execute, in detail

One message, at most three browser lanes ([`../../rules/agents.md`](../../rules/agents.md) §Parallel
Execution); a lane that does not fit waits for the first to return
([`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md) §4). Each lane is its own agent with
its own browser session and its own pool user. Count the live lanes before every dispatch.

| Lane | Runs when | Agent | Browser | Pool user | Runs |
|---|---|---|---|---|---|
| Storefront | always | `qa-frontend-expert` | `playwright-chrome` | `@td(AGENT_POOL_SLOT_1.*)` | the checklist's storefront section |
| Admin + API | always | `qa-backend-expert` | `playwright-edge` | `@td(AGENT_POOL_SLOT_3.*)` | the Admin/REST/GraphQL section |
| Exploratory | `Exploratory: RUN` | `qa-testing-expert` | `playwright-firefox` | `@td(AGENT_POOL_SLOT_2.*)` | `/qa-exploratory ticket <TICKET> <env>` |
| Visual | `Visual lane: RUN` | `vc-test:ui-ux-expert` | the Playwright lane left free (else the first to return) | the account role the brief names (§Visual) | the `vc-test:qa-design` skill's axes |
| Regression | `Coverage triage + regression: RUN`, ≥1 non-stale case | `/qa-regression`'s runners | the lanes its plan takes — counted in the three | the suites' own fixtures | the non-stale cases at risk (§Regression) |

**When the three lanes are full, yield in this order:** an Exploratory row marked **first** (it is upstream
of what the runners check) → the checklist runners (they are the verdict's evidence) → visual → regression
(released last; triage joins on everything). State the order chosen.

The pool slots are the ones in [`../../knowledge/execution/live-discovery.md`](../../knowledge/execution/live-discovery.md)
§Test isolation in parallel runs. A checklist with a cross-layer section gives it to the lane that
**writes** the state and the other lane reads it back. A lane with no items is not dispatched.

## Runner brief (both checklist lanes)

Use the [`agent-dispatch.md`](../../templates/agent-dispatch.md) structure, **including** its
`Observed behaviour` line — runners are Observers. The description starts `[vc-test:qa-test.runner-fe]` or
`[vc-test:qa-test.runner-be]`. Add:
- **Items:** the path to `testing-checklist.md` and the section letter. The runner reads its section
  from the file and nothing else.
- **Oracles:** the `BL-*` and `ECL-*` text for the scope, cut by `npm run bl:extract -- --domain <d>` and
  `npm run ecl:extract -- --domain <d>` ([`dispatch-pack.md`](dispatch-pack.md)) — never a re-summary.
- **Data:** the Data cell of each item is the instruction (§Data below).
- **Account:** an item whose Data cell opens `as <account>` is done as that account, not the pool user. Two lanes
  never act as the same KEY in one message (the pool exists for that, [`live-discovery.md`](../../knowledge/execution/live-discovery.md)
  §Test isolation in parallel runs): give those items to one lane, or run them after the other lane returns.
  `deny:<permission> <KEY>` is that KEY, which lacks the permission; `guest` is signed out; `A + B` are the steps'
  own actors; `as P<n>` is `BLOCKED — no such account on the stand`, never another account. Same on the API.
- **Shared state:** the checklist header's Rules block. Only the lane it names writes a shared setting,
  and that lane restores the setting and re-reads it to prove it.
- **Evidence:** `{SCREENSHOTS}`, the `run:use` line — a lane that refuses it (outside the project, without
  `--allow-unrestricted-file-access`) saves a bare filename and the file is moved in ([`run-output.md`](../../knowledge/execution/run-output.md) §Screenshots) — per
  [`../qa-evidence/evidence-capture-policy.md`](../qa-evidence/evidence-capture-policy.md). HAR always.
- **Scope:** run only this section; no regression suite in this session. The checklist is the floor, not the
  ceiling ([`shared-instructions.md`](../../knowledge/agents/qa/shared-instructions.md) §Always-On Bug
  Detection): an incidental defect is returned as a finding, never filed by the runner.
- **Return, per item:**
  - `PASS` / `FAIL` / `BLOCKED` and a one-line note
  - the evidence file
  - every entity id it created (the ledger)
  - for a FAIL, what was expected vs seen, the layer, and the console/network lines
- **BLOCKED needs a failed attempt.** A BLOCKED with no attempt is returned as not-run, not as BLOCKED.

## Exploratory

Invoke `/qa-exploratory ticket <TICKET> <env>` (the run's env; the lane never binds it — [`run-env.md`](../../knowledge/execution/run-env.md)) — the command, never a re-implementation; the dispatch description starts `[vc-test:qa-test.exploratory]`. The charter
payload has the shape of [`exploratory-lane.md`](exploratory-lane.md) §6, and
its mission is the strategy's Exploratory row (its R-ids, each with the `{HYPOTHESIS}` oracle or question it
rests on — source 6 there), plus, when a model ran, the `/qa-test-model` output's item 4 (the unresolved
cells, reverse edges, `{HYPOTHESIS}` oracles and flagged ACs), plus the mind-map branches the checklist
declared as omissions, including the `UNVERIFIED → charter` lines (§Map signals).
The lane runs only when that row is `RUN`, **first** or **alongside** the runners as the row says.
- **The box** is sized per [`exploratory-lane.md`](exploratory-lane.md) §5: 30-minute floor, 60-minute ceiling, stated in the payload.
- **Read-only by default.** When a charter item needs its own data, it follows §Data with its own pool
  user.
- **No promotion in this flow.** The brief says so explicitly. A net-new scenario returns with its `Fate`
  proposed, not applied, and becomes a row of the `X` table (§Join gate); a `PROMOTE` one that PASSED is a
  `candidate_cases` entry for `/qa-test-lifecycle`.
- **A same-day SBTM file for this ticket already exists** ⇒ pass the prior session as input. The new
  charter covers what that session marked NOT REACHED; it is never a re-run of the old charter.
- **No unresolved item anywhere** ⇒ the lane is recorded as not run with that reason — the one legitimate
  skip of a `RUN` row besides an Amendment.

## Visual

Dispatch `vc-test:ui-ux-expert` (`[vc-test:qa-test.visual]`) — never run the `/qa-design` command. **The brief's first instruction: invoke
the Skill tool with `skill: "vc-test:qa-design"` before any browser call**, and open the return with
`qa-design skill: loaded`. Everything else the brief carries (target, the design project from the
ticket's Prototype link + the `design:extract` spec path, the invariant text, the lane and the account
role, never a credential), the lane-count rule and the verdict vocabulary are
[`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md) §2–§4 — cited, not restated here.
A `ui-kit` change (floor F8) adds what [`ui-kit-class.md`](ui-kit-class.md) asks.
- **Writes** `{RUN_DIR}/design-report.md`; you write `summary.json.visual`.
- **Read-only.** It creates no data; a role-gated target signs in as that role's account on its lane, never a
  minted account ([`visual-axis.md`](../../../plugins/vc-test/skills/qa-design/visual-axis.md) §2).
- **Skipped** (the row is `SKIP`) ⇒ `visual.ran: false` + the row's reason — never `null`.

## Regression

The strategy's `Coverage triage + regression` row is `RUN` and Stage 3's staleness check left at least one
case: `/qa-regression <their suite ids> --ids <the non-stale case ids> --no-promote`, dispatch description
`[vc-test:qa-test.regression]`. `--ids` is the exact set; `--no-promote` keeps `/qa-regression` Step 6.5 from
promoting anything inside a ticket run. A stale case never enters it — it is a `stale_cases` entry for
`/qa-test-lifecycle`. Capture the `RUN_ID`, the pass rate and the wall clock for `summary.json.regression`.
Every case stale ⇒ the lane is not dispatched, and `verdict.md` says why.

## Map signals

When the Mind map row ran, copy from `npm run models:check -- --json`, for the slug, into the run context:
DRIFT nodes (with `drift.observed`, and whether `TM-018` flags the route as unfiled), UNVERIFIED nodes, nodes
no case stamps (`TM-014`), suspect cases (`TM-017`), and integration points no case exercises (`TM-032`, the
`crossings` array). `models:check` must be green before the result is used. They decide what an in-scope
node's line in the checklist asserts:

| In-scope node | Its line in the checklist |
|---|---|
| DRIFT | An item that re-observes `drift.observed`, Expected `drift.expected`; Result `DRIFT HOLDS` or `DRIFT RESOLVED` + evidence. A HOLDS whose route `TM-018` flags as unfiled is written `FAIL — DRIFT HOLDS (TM-018 unfiled)`, so triage collects it |
| UNVERIFIED | An omission line `UNVERIFIED → charter` — exploratory work, not a pass/fail item |
| No stamped case | An ordinary item; a PASS on it is a `candidate_cases` entry |
| Integration point | One item that exercises both sides; a PASS is a `candidate_cases` entry carrying both stamps |
| Linked to a suspect case | No change; the suspect list stays in the run context for the verdict |

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

**Teardown after Stage 5's Bugs step, inline — by ledger id only.** The ledger stays open through
Stage 5: triage's investigation reproduces on these entities, a test-defect re-run reuses them, and
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
- The regression lane returned a `RUN_ID`, or is recorded as not dispatched with its reason.
- Every exploratory and visual finding is a row in ONE table at the end of `testing-checklist.md`,
  which `plugins/vc-test/lib/triage-collect.mjs --ticket` reads:
  `## X. Exploratory + visual findings` with `| # | Condition | Source | Result |`, ids `X1…`
  (exploratory) and `V1…` (visual), Result led by `FAIL` / `BLOCKED` / `NOT-RUN` / `PASS` / `DRIFT`. A
  finding a lane item already covers goes into that item's row. Prose is NOT collected.

The orchestrator writes the Results into `testing-checklist.md`. Runners return them and never edit
the file, so the checklist has a single writer.
