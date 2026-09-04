# Steps 2–3 — oracle loading, the four artifacts, and the per-surface fan-out

Methodology for `/qa-test` Step 2 (Plan) and Step 3 (Write · Review · Provision). The command states the
sequence and the gates; this file is the detail and the reasoning.

**The owning skills are the single source of truth for their own mechanics; neither the command nor this
file restates them. Read them:**

| Concern | Owner |
|---|---|
| Technique selection + condition-space reduction | `/qa-test-design` (`SKILL.md` §3, `test-design-techniques.md` §0 tokens, §6 interaction rule) |
| Case authoring contract, 15-column schema, `Automation_Status` enum | `/qa-test-cases-generator` + [`test-case-template.md`](../qa-test-cases-generator/test-case-template.md) |
| Review dimensions, check codes, severities, auto-fix matrix | [`qa-review-tests/SKILL.md`](../qa-review-tests/SKILL.md) + `review-criteria.md` |
| Behavior-rewrite evidence bar (docs + live + source) | [`qa-review-tests/triangulation-criteria.md`](../qa-review-tests/triangulation-criteria.md) |
| Test-data design + provisioning | `/qa-generate-data` → `/qa-seed-data` (`test-data-engineer`) |
| Write-scope ceiling + revert-on-regression | [`qa-test-lifecycle.md`](../../commands/qa-test-lifecycle.md) §Phase 4b |
| Scaffolder, ID allocator, the KEEP gate | [`.claude/rules/regression.md`](../../rules/regression.md) §Pre-Authoring Scaffold |

---

## Step 2 — enrich the model, then route

This *completes* the Step-1 model; it does not re-derive what Step 1 populated. Skip anything `1c` already
returned.

**Load knowledge files** for the identified domains (from `.claude/knowledge/`) — fill the model's
`Business Rules` / `Edge cases` with the actual rule **text** and patterns, not just IDs:

- **business-logic.md** — the `BL-*` invariants for the domains (mandatory verification points).
- **e-commerce-edge-cases-library.md** — the `ECL-*` patterns.
- **domain-checklists.md** / **backend-admin-checklists.md** / **graphql-checklist.md** (via
  `/qa-checklist`) — checklist items for the domains.
- **`skills/qa-plan/e2e-scenario-catalog.md`** — map to the `E2E-*` scenario(s) and inherit their
  pre-mapped regression suites (the suite-traceability backbone for Artifact C).
- **oracles/vc-bug-catalog.md** — the `VC-*` entries for these domains. **Each entry's `Detection probe` is
  a ready-made scenario**: carry it into `Test scenarios` as its own row (archetype = the entry's
  `Archetype:`, oracle = `{OBSERVED} VC-…`), or record it in `Probes carried in` as `N/A + reason`.
  **Silence is not an answer** — a domain's entries are triaged, not skimmed. Skip `BY-DESIGN` and
  `CONVENTION` entries as scenario candidates: those are false-positive guards, and the right use is to
  *avoid filing* the behaviour they describe. Then fill `Archetype sweep`.
- **When `1b` item 2c derived `visual_surface: true` — the oracles that make a UI assertion strong:**
  `business-logic.md` **Domain 15 `BL-UI-*`** (measurable invariants + their `Verify` recipes) **and
  `BL-A11Y-001..004`** (keyboard operability, accessible naming, contrast, axe-clean — all **P1**, and new
  to this load: the pipeline previously carried no accessibility oracle at any step),
  `oracles/critical-ui-scope.md` (36 components × applicable invariants, with real selectors — a scope
  selector, **not** a coverage claim; its matrix is `GAP`-filled and stale against `048c`),
  `skills/qa-design/SKILL.md` **§State-Stress Pass** (the seven states a surface must survive),
  `automation/storefront-selectors.md`, and the generated design tokens (`SPACING_GRID` et al. via
  `tokens:sync` — never transcribed). Assert these with the **measurable tags**
  (`[SHIFT] [TOUCH] [SPACING] [ALIGN] [OVERFLOW] [CLS]`), never as prose inside `[DOM]`.

  The condition is the **derived token**, not a judgment call — this bullet used to open *"For a UI/storefront
  surface"*, a phrase nothing checked was ever applied. Loading these oracles is **authoring-time** work and
  is separate from *executing* the design + a11y pass, which is the Step-4 visual lane
  ([`visual-axis.md`](visual-axis.md)). FULL does both; FAST skips authoring and still runs the lane.
- **`skills/qa-sbtm/modern-web-attack-surface.md` §The `UIP-*` sweep** — resolve all ten probes for a UI
  flow: each covered by a scenario row or waived with a reason. These are the cases a real user produces
  (Back, refresh, two tabs, expired session, deep link) and the corpus has almost none of them:
  8 · 5 · 11 · 5 · 5 out of 1,961 Frontend cases.

**VirtoOZ docs query** (via `/vc-docs`) — **skip when `1c` delegated to `ba-system-analyzer`** (reuse its
docs grounding; top up specific gaps only). Otherwise query the affected domain against the topic-scoped
VirtoOZ tool that fits; fall back to Context7 (`/virtocommerce/vc-docs`, `tokens: 8000`) only if VirtoOZ
returns nothing. **Fold in `ba-system-analyzer` risk areas** as mandatory verification points alongside the
`BL-*` rules.

Agent routing table and the dispatch minimums: [`SKILL.md`](SKILL.md) §Agent dispatch.

---

## Step 3a — provision test data, CONDITIONALLY, dispatched by the ORCHESTRATOR

Cases are authored *against fixtures that already resolve*, never against imagined ones — so when this
runs, it runs **before** Artifact A, not after the review pass.

### Whether it runs at all — `data_surface` (`1b` item 2f)

**It is a step for tickets that need data that does not exist yet, not a fixed cost of every run.** The
token derives like every other pre-flight axis — derived, never asked, never defaulted, recorded with its
sources, `unresolved` ⇒ **`false`** — it fails **CLOSED** ([`axes.md`](axes.md)). Sources, in order — **a
ladder over the four data layers of [`.claude/rules/test-data.md`](../../rules/test-data.md), not a flat list:**

| Source | Reads |
|---|---|
| the `1e-plan` authoring plan (FULL) / the Artifact-B conditions (FAST) | every `@td(…)` / `{{VAR}}` the planned rows name |
| `npm run td:validate` | does each of those actually RESOLVE against this env |
| **`live-discover`** — `scripts/lib/live-discover.ts`, decision tree in [`live-discovery.md`](../../knowledge/execution/live-discovery.md) | **can the environment supply it ALREADY?** `discoverFirstAvailableProduct` · `discoverProductBySku` · `discoverVirtualCatalogRoot` · `discoverFirstAddress` · `discoverFirstCart` · `discoverAnyActiveCoupon`. For *"are there ≥N products"* use the plural `discoverCatalogProducts(api, count)` in `scripts/lib/seed-common.mjs` — the six primitives above are singular/nullable |
| the Test Model Part 0 value chain | does any link under test need a **divergence** the existing fixtures do not have |
| the ticket + diff | a new entity type, a new store/org/role, a new pricing or inventory shape |

**`false` when layer 1, 2 OR 3 can supply every planned row** — the refs resolve, *or* the entity is
discoverable from what the env already holds — **AND** no link under test needs a divergence those values
lack. **`true` only when the data is absent from the environment AND undiscoverable.** The divergence
clause is the whole reason this is a token rather than a one-line shortcut: *"existing data is enough"* is
**two** claims, and only the cheap one was ever checked.

**The reuse-first rule already existed — in the wrong place.** [`/qa-generate-data`](../qa-generate-data/SKILL.md)
§5 opens with *"**Reuse** — does an existing `aliases.json` entry / `test-data/` row / **live platform
entity** already satisfy this state? … author nothing."* That is the correct procedure, and it lived
**inside the agent Step 3a dispatches** — so it ran only after the dispatch had already been paid for.
Lifting it into 2f *is* the change: the same question, asked before the cost instead of after.

**Discovery answers *does it exist*, never *is it discriminating*.** `.claude/rules/test-data.md` §SECOND
RULE still binds in full: `live-discover` selects on **availability, not suitability**, so pin currency,
price shape, stock and catalog scope on every dimension the feature reads. Discovering "any two buyable
products" for a money-summing surface will eventually hand you one in EUR and one in USD.

1. **Do the fixtures RESOLVE?** Deterministic — `td:validate` answers it.
2. **Are they DISCRIMINATING on the links under test?** Judgment — `.claude/rules/test-data.md` §SECOND
   RULE. Loyalty Missions is the measured case: every `@td()` resolved, every guard was green, and the
   seeded orders were flat $30 with no shipping, tax or discount — so the feature's central question
   (does the goal accrue `order.Total` or merchandise value?) was **undecidable from the data**, and both
   the right and the wrong implementation predicted `$30.00`. A fixture set can satisfy every validator
   and still make the run vacuous.

So a `false` is not *"the aliases resolve"* — it is *"the aliases resolve **and** no link under test needs
a divergence these fixtures lack"*, and the run **states which existing fixtures cover the plan**. An
unstated skip reads exactly like a satisfied one.

**Why it fails CLOSED** (changed 2026-09-04 — it used to fail open, and `axes.md` §3 carries the argument).
Fail-open recreated the very flaw this section names: *default-on with a burden of proof to skip*. An axis
that dispatches an opus agent whenever it is unsure is not subtracting. So doubt now **skips and states
the skip**. The residual risk is real and is caught one step later: a wrong `false` authors cases against
data that cannot answer them, and **Step 3's gate re-derives whether every planned case resolves** before
any of them execute.

**It gates the dispatch, never the ownership.** When authoring later surfaces a fixture need, the answer
is still `test-data-engineer` (below) — a `false` at 2f is a prediction, not a licence to write a seeder
inline.

### When it runs

**The orchestrator dispatches `test-data-engineer` directly** (`/qa-generate-data <feature>` →
`/qa-seed-data <domain>`), because dispatching a peer agent is an orchestration act and `test-data-engineer`
is the canonical fixture owner (`.claude/rules/agents.md`). Asking `test-management-specialist` to
sub-delegate is both unreliable and wrong-shaped, and in practice produces fixtures written by the wrong
agent and **never executed**.

`test-data-engineer` owns the whole job end-to-end: design the combinations, author the
specs/seeder/`@td()` aliases/drift-guard + its unit test, **and RUN the seed live** against the non-prod
env, ending on a green `td:validate` (+ any `td:validate:<domain>` guard it added). The skip condition is
now the derived `data_surface` above rather than a judgment made at dispatch time.

A fixture that cannot be seeded is reported as such and its dependent cases are marked BLOCKED — never
authored against data that does not exist. **Seeder files authored by any other agent are unvalidated
drafts**: hand them to `test-data-engineer` to review and run, never treat them as done.

**If authoring later surfaces a fixture need 3a missed, report it back to the orchestrator** (which
re-dispatches `test-data-engineer`) rather than authoring the seeder inline — inline is exactly how fixtures
end up written by the wrong agent and never executed.

Fixture design itself is governed by `.claude/rules/test-data.md` §SECOND RULE — a fixture is designed from
the chain's question, and equal values on both sides of a distinction under test are a data defect.

---

## Artifact A — test cases, authored into the durable suites (FULL only)

Derive cases from the Test Model's scenarios + chain diagrams + `1d` AC conditions (story + gap-ACs) +
`E2E-*` scenarios + `BL-*` / `ECL-*` + domain checklists.

**Author from the model AS AMENDED by Step 3x, not from the model as `1e` left it.** The discovery lane
runs concurrently with 3a and closes before this artifact for exactly this reason
([`exploratory-lane.md`](exploratory-lane.md)), and it hands over three things this step must consume:
its **model amendments** (a `GAP` cell that is now a scenario #, a reverse edge that turned out to exist, a
variant nobody enumerated), its **`{HYPOTHESIS}` → `{OBSERVED}` grounding** per row, and its **`PROMOTE`d
net-new scenarios**, which are authored **in this run** rather than deferred. The grounding is the one that
changes the output most: a row whose oracle the lane observed gets an assertion that can be *graded*,
where the same row authored blind gets a presence check or a `{HYPOTHESIS}` that 5g will hold (`GRD-001`
escalates a surviving hypothesis to Blocker in a promoted case). A row the lane could not reach is authored
knowing it is still a hypothesis — that is a fine outcome; silently not knowing which is not.

- **New feature / Story** → **author new** enriched-CSV cases.
- **Bug fix / enhancement with existing coverage** → **map to existing** suite cases (start from the Step-2
  `E2E-*` → suite mappings), then author **only the gaps**. Mapping to existing coverage runs in **two
  directions**, and this bullet is where only one of them was encoded: it asked which rows already cover
  the surface and never which rows the change makes **wrong**. Step 2a has already answered the second
  question deterministically — **carry its dispositions in, do not re-derive them.** A **`REPAIR`** row is
  fixed *before* a single new row is authored (`/qa-review-tests file <suite> --fix`), because its
  mechanics — a renamed selector, a moved route, a removed arg, a dead `@td()` alias — mean it cannot
  execute at all. A **`RE-BASE`** row is **not a gap to author**: it is an existing case that goes into
  **Artifact C1's `--ids`**, so Step 4 executes it and 5a rewrites its expected value against the run's
  own evidence — never rewritten here, where the unmerged change would be its own oracle. A
  **`SUPERSEDED`** row is a proposal only. Single source of truth:
  [`coverage-triage.md`](coverage-triage.md).

**Precedence: amend an existing case before authoring a new one that asserts the same observable.** Grep
the target suite for the observable first; if a case already crosses the mechanism and merely asserts the
wrong thing, the fix is that row, not a second row beside it. This generalises to every run the rule the
`--iterate` section below states for round 2 ("Prefer amending") — two rows asserting one observable is
permanent coverage maintained twice that can disagree with itself, and the appender's only content dedup
is exact `Title` + `Section`, so it will not notice.

### Split the targets by EXECUTION SURFACE before authoring a single row

A feature that spans API/GraphQL *and* an Admin SPA blade *and* the storefront needs **one suite per
surface**, because the surface decides the lane, the agent and the browser: API/GraphQL rows are
machine-lane (`graphql-runner`), Admin-SPA and storefront rows are browser-lane and **cannot run on
firefox** (`.claude/rules/agents.md` — `browser_click` fails on this Admin SPA).

Follow the corpus convention for the admin-side twin: the storefront/API suite keeps the bare prefix and
the admin suite takes an `A` suffix (`CAT-`/`CATA-`, `ORD-`/`ORDA-`, `SRCH-`/`SRCHA-`).

Naming a single backend suite makes browser cases homeless, and the agent will then satisfy a UI condition
through the API — which reads as coverage but tests a different surface. **Symptom to check for in the
manifest after `suites:sync`: a change that touched a blade producing `lanes: {browser: 0}`.** If the Test
Model's affected surface lists an Admin blade or a storefront view, a browser-lane suite is mandatory, and
each blade/view is an explicit coverage target — not an incidental mention inside an API case.

Naming every target suite up front is also what makes the Step-3b fan-out safe, since a batch is a suite.

### Carry the model's design decision into the row

Each authored case stamps its scenario row's archetype and technique into the free-text `References`
column: `Archetype:<TOKEN> · Technique:<TOKEN>` (+ `Probe:VC-*-NNN` when the row came from a
`vc-bug-catalog` Detection probe). The appender **rejects a row without them**. No new CSV column: these
join the `Synced:` / `Audited:` / `Promoted:` stamps `References` already carries.

### Scaffold before authoring — never hand-type the boilerplate

```bash
npm run tc:alloc    -- --prefix <PREFIX> --block <layer>=<n> [--block ...]   # once, before any fan-out
npm run tc:scaffold -- --plan <plan>.json --id-block <PREFIX-NNN..PREFIX-NNN> --out <staged>.csv
```

`scripts/test-cases/scaffold-rows.ts` derives **eleven of the fourteen non-Title columns** (ID, Section, Priority,
Business_Rule, Edge_Case_Refs, Test_Data, Cross_Layer_Checks, Failure_Signals, Cleanup, References,
Automation_Status) and leaves only `Preconditions` / `Steps` / `Assertions` blank — the genuinely authored
half. It emits a `.design.md` sidecar carrying each row's three KEEP answers, which is the audit trail for
why the row exists.

That removes the whole class of appender rejections (a missing stamp, fewer than two failure signals, empty
References on a Critical/High row) before the appender ever sees the rows, and the staged file lints in
place: `npm run suites:review -- <staged.csv>` names each unfilled column as `S-006`/`C-001`/`C-003`, so
"author the rest" is a checklist the linter hands you rather than a thing to remember.

**The KEEP gate (run at 1e-plan, enforced here).** The gate refuses any planned row that cannot answer:

| Plan field | The question | Rejected when |
|---|---|---|
| `observable` | what value does this case READ? | missing or under 15 chars |
| `defect` | what would a CUSTOMER see if it were wrong? | missing, under 25 chars, or a **null-hypothesis** phrasing (`could fail to render`, `might not work`, …) |
| `plausible` | why is that defect plausible **here**? | not one of the three grounds §6d names — a `VC-*` catalog entry, a filed bug (`VCST-*` / `reports/bugs/…`), or `mechanism: <what in this code makes it likely>` |

This is §6d's cull moved to where it is cheap. §6d culls a candidate list that has already been written, so
it saves review time and nothing else; here a row that cannot justify itself never becomes a CSV row —
never authored, never reviewed, never executed, never maintained. On the Loyalty Missions numbers that is
the difference between writing 127 cases and writing the ones that matter, and it is a larger saving than
any amount of parallelism.

The plan also carries the **sweeps** (`state-stress` · `uip` · `toggle` · `date-range`). Each expands
mechanically from the markdown that owns it — read at run time, never transcribed — with the defect
hypothesis already written by that document, so a swept row satisfies the gate by construction and costs no
judgment. Waiving a swept item requires a reason; a silent omission is not available, which is the
`Archetype sweep` / `UIP sweep` discipline made deterministic.

The gate is the appender's twin, one step earlier: the appender rejects a **row** with no
`Archetype:`/`Technique:` stamp, this rejects a **decision** with no defect behind it.

### Append as `Draft`

```bash
npx tsx scripts/test-cases/append-test-cases-to-suite.ts <target-suite.csv> \
  --rows <staged.csv> --check-global-ids --dry-run     # drop --dry-run on a clean pass
```

Never a hand-rolled append. Existing-suite sync/review edits happen in place. `--check-global-ids` rejects
an ID already used anywhere under `regression/suites/`.

**`Draft` is required, not a placeholder.** These cases are grounded and promotable only after Step 4
executes them live; 5g does the `Draft → Automated` flip. A deliberate `{HYPOTHESIS}` — a genuinely unknown
expected value phrased as a question — is legal **only** at `Draft`. The runner does not skip `Draft`, so
Step 4's scoped regression *will* run them; that is the point.

---

### Between `--iterate` rounds: never re-author, sometimes add

**Step 3 is not re-runnable for rows a previous round already appended, and it fails two different ways
depending on how you re-run it.** Re-running `tc:scaffold` with the previous round’s `--id-block` makes
the appender reject every row on ID collision — dead-ended but safe. Re-running `tc:alloc` first yields
a **fresh** block, so the same logical rows land under new IDs, and the appender’s only content dedup is
exact `Title` + `Section` against the target suite — so a **reworded title duplicates silently** in
permanent coverage, which no gate downstream can detect.

A **loop-confirmed defect does earn a new case**, and it is the best-grounded row the KEEP gate ever
sees: `plausible:` accepts a filed bug, and a defect this run filed *and then watched go green* is that
ground at full strength. Three rules on it:

- **Prefer amending.** Grep the target suite for the defect’s observable first. If a case already
  crosses the mechanism and merely asserted the wrong thing, the fix is
  `/qa-review-tests file <suite> --fix` on that row — not a new row.
- **Allocate fresh.** A genuinely new row gets its own `tc:alloc` block; never reach for a block a
  previous round already spent.
- **Author it before the round that executes it.** A case authored after the final round is `Draft`
  with evidence nowhere — PR-002 at 5g, held forever. If that happens anyway, record it in
  `summary.json.promotion.blocked` with exactly that reason rather than leaving it silently
  unpromoted.

## Step 3b — author Artifact A in parallel, ONE BATCH PER EXECUTION SURFACE (FULL only)

Authoring is the serial bottleneck of Step 3, and the partition that makes splitting safe already exists:
Artifact A requires the targets split by execution surface, named up front. A surface is a CSV file, a lane,
an agent and a browser — so **batch ≙ target suite CSV**, and the batches are file-disjoint by construction.
That is what keeps the one-author-per-CSV rule (`.claude/rules/regression.md`) literally true while several
agents write at once.

Fan out when the plan names **≥2 target suites**; below that the dispatch overhead exceeds the saving. Cap
at 3–4 concurrent (no browser is involved, so the 3-lane rule does not bind — context and rate limits do).

Do **not** copy `/qa-coverage-generation`'s domain batching: a manifest domain is not a file, which is why
that command needs a Step-5 "suite-write conflicts → merge IDs sequentially" repair pass. Partition on the
surface and the conflict cannot occur.

*Before* dispatch the orchestrator does four things — each closes a failure fan-out would otherwise
introduce:

| # | Do | Because |
|---|---|---|
| 1 | `npm run tc:alloc` and hand each batch **only its own** `--id-block` | `--check-global-ids` reads the corpus at APPEND time, so two batches both pass and then both write. A cross-suite duplicate ID silently overwrites the other suite's per-case results and failure evidence at run time. `tc:scaffold` refuses to spill past its block. |
| 2 | Author the **`[JOURNEY]` / `Technique:FLOW` case itself**, before fan-out, and put it in every batch brief as the baseline they refine | It traverses the whole chain by definition. Per-layer batches each writing their own produce N partial journeys and no owner of the chain — the failure the 71-case storefront suite that placed zero orders represents. |
| 3 | Resolve **every blank cell** of the 1e variants × links matrix and assign each cell to exactly one batch | Cell ownership is what makes duplication structurally impossible. With it there is no cross-batch dedup pass to run; without it two batches both claim a cell, or both skip it. |
| 4 | Compile a per-layer **authoring pack** into the brief — the extracted `BL-*`/`ECL-*` rule text, the batch's matrix rows, the journey case, the layer's selectors/schema fragments. **Cut the schema fragments from the snapshot `1b` item 2d refreshed, and stamp the pack with its rev** | Step 2 already loaded the oracles once. Four agents re-reading `business-logic.md` + ECL + `critical-ui-scope` + `vc-bug-catalog` + `graphql-schema.md` is 4× the dominant token cost for zero extra information — that alone can make the fan-out cost more than it saves. The pack is also the fan-out's single point of contract failure: cut from an unrefreshed snapshot it distributes one stale contract to every batch at once, and the resulting cases fail at Step 4 as what look like product defects ([`contract-refresh.md`](contract-refresh.md) §4). A GraphQL batch reads `test-data/graphql/index.json` before authoring a new fixture — 74 ops already exist. |

**Batch contract** (each batch is one `test-management-specialist`):

1. Scaffold its own plan (`tc:scaffold --plan … --id-block …`) into a **staged CSV in the scratchpad**.
2. Author `Preconditions` / `Steps` / `Assertions` on those rows, using its pack.
3. Self-lint to green **before returning**: `npm run suites:review -- <staged.csv> --fail-on=High`, plus
   `npm run graphql:lint-labels -- <staged.csv>` on the GraphQL batch.
4. Return the staged CSV path + its `.design.md` sidecar. **It never touches `regression/suites/`.**

The orchestrator then appends **serially**, one `suites:append … --check-global-ids` per batch, and runs
`suites:sync` **once** at the end. Two reasons that half stays serial: `suites:sync` writes the shared
manifest, and `suites:lint`/`sync` hard-fail on a parse error *anywhere* in the corpus — a suite left
transiently unparsable blocks every concurrent author in the tree, so N parallel writers into
`regression/suites/` multiplies a 15-minute outage by N. Staging costs nothing and removes the whole class.

Because each batch self-lints, the Step-3 gate becomes confirmation rather than a fix loop.

**Ordering constraint: Artifact A waits for the whole Step-3 wave — do NOT overlap authoring with `3a` or
`3x`.** Fan-out buys nothing if the fixtures do not resolve yet, and a batch authored beside `3x` is
authored from exactly the guesses that lane exists to replace. `3a ‖ 3x ‖ B` are concurrent with each
other; **A alone is downstream of all three**
([`SKILL.md`](SKILL.md) §What must NOT be parallelised). The fan-out this section describes is *within*
Artifact A — one batch per execution surface, once the wave has closed.

---

## Artifact B — the testing checklist (both paths)

Written to `reports/tickets/{SPRINT}/<ticket-key>/testing-checklist.md`.

Map **each atomic condition** to a case (new or existing); fold in the matching `E2E-*` scenario(s); add
items for `BL-*`, `ECL-*`, and each `ba-system-analyzer` risk area; **flag any condition with no covering
case**. Conditions flagged DRIFT/NOT-FOUND/CONTRADICTS get an explicit item to verify live. When the Test
Model has `Epic context`, add an integration item for each seam with a Done sibling — this story consumes
or produces state a sibling owns, so verify the boundary end-to-end, not just the story in isolation.

On FAST the conditions come from `1a`'s ACs directly, since there is no `1d` table.

**When `visual_surface: true`, the visual conditions are rows in this table like any other** — one per
applicable `BL-A11Y-*` / `BL-UI-*` invariant for the surface under audit, plus the design-system and
`vs. DESIGN` axes, each with its verdict at 5e. This matters most exactly where the run is cheapest: on FAST
this file is the **only** durable record, so a visual condition that appears in neither the checklist nor a
bug draft has been deleted rather than deprioritized. **An uncovered or `SKIPPED` visual condition is listed
with its reason, never omitted** — the same rule the section already applies to uncovered functional
conditions, and the reason it exists.

**It is a file, and that is load-bearing on FAST** (`.claude/rules/reports.md` §1, category 6; 30–60 lines,
cap 120). A FAST run authors no cases and writes no Test Model, so the checklist is the **only** durable
record of what was actually checked — terminal-only would leave the run unauditable the moment the session
ends. **Update it in place at Step 5** with each item's verdict, so the committed file is the checklist that
ran and not the one that was planned. It also carries any finding held below the 5d severity floor.

**On `--iterate` it is APPEND-ONLY.** Round 1 writes the item table with verdicts as above; round N
appends `## Round N — re-test (<probed version>, prerelease <PR>)` holding only the re-run items, each
as a transition (`Round 1: FAIL → Round N: PASS`), plus that round’s still-failing items and any
below-floor finding. **Never edit a round-1 verdict cell in place**: the RED→GREEN transition is the
loop’s deliverable, overwriting the RED erases the proof, and on FAST there is no other durable record
of it. Keep each round section ≤15 lines; if the file would exceed the 120-line cap, cut per-item prose,
never the round sections.

---

## Artifact C — TWO runs, because "did this ticket pass" and "did this break anything else" are two questions

**C1 gates the verdict; C2 gates the release.** They used to be one `/qa-regression` invocation
(`--cases critical --also-ids <new ids>`) executed at Step 4, which put a ~40-minute suite sweep on the
critical path to a verdict that never depended on it: 5c's criteria are atomic conditions, reconciled ACs,
DoD items, `BL-*` and IN-SCOPE bugs — every one of them a claim about *this ticket*. A Critical case failing
in some other suite is, by 5a's own provenance rules, PRE-EXISTING or OUT-OF-SCOPE, and neither of those
fails the ticket. The one exception (an IN-SCOPE finding surfacing in a neighbouring suite) is real, and
§5r handles it by amending a verdict that has been *recorded and not yet published*.

| | Question | Selection | Runs |
|---|---|---|---|
| **C1** | Do *this ticket's* cases pass? | `/qa-regression <target suite ids> --ids <new Draft ids + every Step-2a RE-BASE id>` | **Step 4** |
| **C2** | Did the change break anything else? | `regression:select … --target 40` → `--cases critical` | **5r**, after 5c, overlapped with 5d + drafting 5e |

Three consequences worth stating:

- **`--ids` is an exact set and is mutually exclusive with `--cases`/`--also-ids`.** A tier union and an
  exact set answer different questions, and accepting both leaves *"did `--ids` narrow the tier, or extend
  it"* unanswerable. It also reads no `Priority` at all, so an unreadable one is not a finding on the C1
  path — the same property `5k`'s RED→GREEN track already relies on.
- **`--also-ids` disappears from this pipeline.** It existed to smuggle this run's own cases into a
  tier-filtered sweep; with the sweep moved off the verdict path, those cases have a run of their own.
  `--also-ids` survives in `5k`'s C2, where a tier sweep genuinely does need to carry named ids.
- **A skipped C1 is stated.** A run that authored no cases and disposed no `RE-BASE` has an empty exact set
  and no C1 — say so. An omitted regression track reads exactly like a passing one, which is §2's rule
  applied one level up.

**`5k` reached this split first**, for the same reason, and [`modes.md`](modes.md) §The two tracks of round
N+1 is now named in these terms rather than in its own.

### C2's selection — critical cases, in 40 minutes

**On `--iterate`, round N+1 re-derives this scope from the FIX’s diff**
(`regression:select --repo <name> --diff <fix-PR range>`) — round 1’s selection was computed from the
*ticket’s* diff and cannot know what the fix touched — and runs it as a **second** `/qa-regression`
alongside a separate `--ids` run of exactly the previously-failed cases, so the RED→GREEN pass rate and
the release gate’s ≥80% floor stay two different numbers ([`modes.md`](modes.md) §5k §The two tracks).

The scope is **case-level, not suite-level.** Selecting whole suites is what made a search-change run plan
all 44 cases of suite `004` — 6 of them Critical, 19 skipped outright.

1. **Suites** — start deterministic, not from judgment:
   ```bash
   npm run regression:select -- --repo <repo> --changed-files <file> --target 40 --json
   ```
   `--target` trims against the predicted **makespan across the three lanes** (real wall-clock, not a sum of
   suite minutes) and **refuses to trim the risk floor** (P0 + `critical-ui-scope`), so a tight budget can
   never quietly delete the P0 gate. Add the suites covering the Done Epic siblings this story integrates
   with, and the target suite(s) that received new `Draft` cases.
2. **Cases** — `--cases critical`. Critical is ~22% of the corpus by count and ~23% by estimated minutes,
   which is what puts the run inside the window. **No `--also-ids` here** — this run's own new cases have
   their own exact-set run (C1), which is the whole point of the split.
3. **State the budget, don't just trust it.** Report the predicted makespan and **every suite `--target`
   excluded**. `scripts/lib/suite-selection.ts` documents its own cost model as wrong by **×18–×88** for
   runner-native suites (`050m` declares 245 min, ran in 2.77), so until `npm run regression:recalibrate`
   has real observations the number is a hint, not a fact.

**Worked example — and it shows why both knobs are needed.** A `vc-frontend` checkout-path change with
`--target 40` selects 14 suites and predicts **71 minutes**, over budget: 13 of the 14 are **risk floor**
(P0 + `critical-ui-scope`), which `--target` refuses to trim, so it reports the overrun instead of cheating
it. `--target` alone therefore cannot deliver the window. Those 14 suites hold 369 cases / 232 predicted
minutes, of which **120 are Critical → ~79 lane-minutes → ~26 minutes across the three lanes.** The case
filter is what cuts *inside* a floor suite, which is the only place left to cut. One suite in that set
(`048c`) has **no Critical case at all** and contributes nothing — name it in the report; a suite that
disappears silently reads exactly like a suite that passed.

Output the concrete suite ID list with a one-line rationale each (`config/test-suites.json` is the source of
truth for what a selection expands to; don't restate counts). **5r** runs it as its own `/qa-regression`
run; **never fold suite IDs into a ticket agent's prompt**
(`feedback_long_runner_sessions_unreliable`).

**The scope is still computed at Step 3, even though the run is at 5r.** It is derived from the ticket's
diff, which does not change between Step 3 and the verdict, and computing it here means 5r can dispatch the
instant 5c is recorded rather than spending a turn on `regression:select` first — the latency this split
exists to remove.

---

## Review & auto-fix (FULL only — there are no new cases on FAST)

Any **newly authored** case runs through `/qa-review-tests file <target-suite> --fix` — start with the
deterministic core (`npm run suites:review -- <csv>`, plus `npm run graphql:lint-labels -- <csv>` for
GraphQL) and spend LLM effort only on the judgment rules.

Confirmed fixes apply under `/qa-test-lifecycle` §Phase 4b's write-scope ceiling + **revert-on-regression**
(re-run `suites:review -- <csv> --fail-on=High` + `npm run td:validate`; an auto-fix introducing a new
Blocker/Critical is reverted). A case that can't pass review is flagged, not shipped.
