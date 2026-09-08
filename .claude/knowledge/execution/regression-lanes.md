# Regression — per-case lane routing, case filter, executability

> **Moved verbatim from `.claude/rules/regression.md` on 2026-09-08** (PR 2 of the agentic-system audit) so it loads only when a task reads it. `rules/` is the always-loaded tier; this file is on-demand. Section anchors are unchanged.

## Per-Case Lane Routing — a suite is no longer the unit of execution

Lane routing used to be all-or-nothing: a suite reached the runner only if **every** non-empty
`Steps` cell carried a runner op tag. That rule is right about its own risk — handing a runner a
row it cannot parse manufactures BLOCKED cases that read as product failures — but its cost is
measurable: **169 machine-ready rows in 10 suites** ride the browser lane because a handful of
their siblings are prose. Suite `050d` sends 46 runner-native cases through a browser agent on
account of the other 3; suite `087` occupies a browser slot to run **zero** browser cases (12
machine + 3 explicitly `Manual`).

**The bigger prize is verdict quality, not wall-clock.** Rows that ride a browser lane come back
BLOCKED for reasons about *how* they ran — a contaminated cart, a drifted session — rather than
about the product. Routing them to a runner turns those into real verdicts, and the nine biggest
mixed suites shrink their agent session by 80–95%, which removes the long-session context decay
that produces blanket-status JSON.

> **Measured, 2026-08-26 — and it corrects the figure this paragraph used to quote.** The old
> "~29% artefactual-BLOCKED" came from ONE run of suite 048b (47 of 161). That suite ran twice:
> `REG-2026-07-14-0018` blocked **11.8%** and `REG-2026-07-24-2121` blocked **29.2%** — the same
> 161 cases, 17 percentage points apart. So 29% was not a property of the suite, it was one run's
> value, and the higher of two. Across all of `reports/regression/history.json` (108 suite rows,
> 19 runs, 3991 cases) the BLOCKED rate is **19.9%**.
>
> The *mechanism* the figure was invoked for does hold, and more sharply than the headline: blocked
> rate rises with suite size — **13.5%** (≤15 cases) · **17.9%** (16–40) · **17.7%** (41–80) ·
> **28.6%** (81+). That gradient is the empirical case for splitting a large suite, independent of
> wall-clock: 115 cases in one file sit in the 28.6% bucket, four ~29-case siblings in the 17.9%
> one. Quote the gradient, not a single run.

Three commands, run in this order by `regression-orchestrator` Step 3:

| Command | Does |
|---|---|
| `npm run suites:filter -- <resolved.csv> --priority <tier> [--also-ids <ids>] --out <p>` | narrow a resolved CSV to a priority tier (+ named cases) **before** lanes sees it |
| `npm run suites:filter -- <resolved.csv> --ids <ids> --out <p>` | the **exact-set** form — precisely those cases, no tier. Mutually exclusive with `--priority`/`--also-ids`; reads no `Priority`, so an unreadable one is not a finding here. `/qa-test` 5k's RED→GREEN track is its caller |
| `npm run suites:lanes -- <ID> --run-id <R> [--csv <resolved>]` | classify every case → `suite-{ID}-lanes.json` + `suite-{ID}-resolved.browser.csv` |
| `npm run suites:machine -- <ID> --run-id <R>` | run the machine rows via `graphql-runner.ts --case` → `suite-{ID}-results.machine.json` |
| `npm run suites:merge -- <ID> --run-id <R>` | fold the fragments → the canonical `suite-{ID}-results.json` |

`npm run suites:lanes:all` surveys the corpus and writes nothing.

### The case filter — a suite is no longer the unit of SCOPE either

Per-case *routing* (above) decided **where** a case runs. `suites:filter` decides **whether** it runs at
all in a change-scoped context, and it is the mechanism behind `/qa-regression --cases <tier>` and
`/qa-test`'s Artifact C. Selecting whole suites is what made a search-change run plan all 44 cases of
suite `004` — 6 of them Critical, 19 skipped outright.

Measured on the 117 canonical-header suites: **Critical 883 · High 1899 · Medium 1088 · Low 64 · P1 18 ·
P2 17**, and **no `P0` row exists**. Corpus-wide Critical is 918 of 4,243 (21.6%) and ~23.2% of the
estimated minutes — which is what makes a 40-minute window reachable for a single-module change.

Four rules, and three of them are the same discipline the lane classifier already follows:

- **It plugs into an existing hop, not a new one.** `regression-orchestrator` Step 3 already writes a
  per-suite `suite-{ID}-resolved.csv` before calling `suites:lanes`; the filter rewrites that file
  (Step 3a). Lanes, the machine lane, the merge, the results envelope, triage and promotion are
  untouched — they see a smaller suite, not a new mechanism.
- **A legacy 11-column header is REFUSED (exit 2), never filtered.** Same reason `plan-lanes.ts` refuses
  it: `parseSuite` maps positionally, so on those 11 suites `Priority` is not `Priority`, and filtering
  would drop real cases with total confidence.
- **`P0`–`P3` are spellings, not a second vocabulary.** The alias table is `append-test-cases-to-suite.ts`'s
  own (`PRIORITIES` / `HIGH_PRIORITIES` already pair `Critical` with `P0`), read out loud rather than
  re-decided. A parallel table that drifted would silently change what "critical" means.
- **Exclusion fails OPEN, and is always REPORTED.** This is the one place the discipline *inverts*
  relative to `case-classifier.ts`: there, doubt routes to the browser lane, because a wrongly-machined
  case manufactures a BLOCKED that reads as a product failure. Here the expensive direction is the
  other way — a case that quietly leaves the run is a coverage hole with no error anywhere. So an
  unreadable `Priority` does not run (it is not provably Critical) but **is named**, and a suite that
  contributes zero cases is stated in the run report's **Scope Exclusions** section. 11 of 128 suites
  hold no Critical case at all; a suite that vanishes without a line is indistinguishable from one that
  passed.

**Pair it with a time budget, not instead of one.** `npm run regression:select -- --target <min>` bounds
the *suite* list by predicted makespan across the three lanes and never trims the risk floor (P0 +
`critical-ui-scope`); `--cases critical` bounds the *case* list within each surviving suite. Note the
standing caveat: `estimatedMinutes` is documented in `suite-selection.ts` as wrong by ×18–×88 for
runner-native suites, so a `--target` run must **state its prediction and its exclusions** until
`npm run regression:recalibrate` has real observations to correct it.

**The classifier delegates to the executor's own parser.** `scripts/lib/case-classifier.ts` calls
`parseSteps`/`validateStepBlocks` (the modules `graphql-runner.ts` itself uses) and
`parseAssertions`/`classifyPredicateScoreability` (the modules that score its verdicts) — it does
not pattern-match tags with a private regex, because a static verdict derived from a second
similar-looking implementation is exactly how a classifier and a runtime drift apart. Reason codes
are a closed vocabulary (`EX-002` no steps · `EX-003` invalid op structure · `EX-010` a step line
the parser cannot type · `EX-011` no runner op · `EX-101` nothing scoreable to assert · `EX-102` an
assertion the runner cannot score · `EX-200` explicitly `Manual` · `EX-201` explicitly
`Deprecated` · `EX-300` compiles under the UI grammar but no `ui-runner` exists yet).

Five rules make it safe rather than merely faster:

- **Fail-closed in one direction only.** Any doubt routes to `browser`, which is the status quo —
  so a classifier bug costs the saving, never a verdict. If `graphql-runner` still exits 2
  (structure), `machine-lane.ts` **returns the case to the browser lane** and records the
  disagreement in `errors[]`. That is cheap precisely because the machine lane runs FIRST, before
  any agent is dispatched.
- **ALL assertions must be scoreable, not one of them.** The runner's verdict is
  `failed === 0 && results.length > 0`, so a case mixing one parseable predicate with three prose
  ones would PASS on the strength of the one — a green earned by not understanding the rest. Same
  "silence is never a pass" rule as `layout-runner.ts`, applied one step earlier. This is what
  catches suite `050a`'s `CAT-GQL-131`, whose assertion reads
  `data.products.sortings[0].name is non-null OR is null` — vacuously true.
- **An explicit `Manual` is respected, never overruled.** It is one of two opt-out uses of
  `Automation_Status` (which carries 23 distinct values corpus-wide, so it cannot route anything
  else). `050h`'s `WISH-009` is the worked example; it lands in the results as `SKIPPED` with its
  reason, never as a quiet absence.
- **An explicit `Deprecated` is EXCLUDED from both lanes (`EX-201`), on its own count.** A retired
  case still parsed, still ran and was still scored — `050m` in `REG-2026-08-26-1631` dispatched
  all three of its `Deprecated` rows: `SR-GQL-053` (titled *"UNREACHABLE at API layer"*) FAILed
  against the suite's pass rate and was first triaged as a fixable assertion defect, while
  `SR-GQL-029` (*"OBSOLETE (statuses[] arg removed)"*) and `SR-GQL-038` "PASSed" while asserting
  nothing anyone intends to support. Both directions are wrong, so the status is now read BEFORE
  any parsing, and — exactly like `Manual` — the case lands as `SKIPPED` with its reason, never as
  a quiet absence (`suite-results-merge.ts` materialises it from the plan). It is a **fourth lane**,
  not a variant of `manual`: `manual` means *a person runs this*, `deprecated` means *nobody does*,
  and folding them would make the `manual` count lie — the same rule that keeps UNROUTABLE out of
  `browser`. Corpus-wide this excludes **35 cases in 10 suites** (4 of them previously on the
  machine lane: `050m` ×3, `050b1` ×1; the other 31 were riding browser agents). Because excluding
  a case runs AGAINST fail-closed, the match is **exact** (trim + case-fold on the whole cell) —
  `'Deprecated pending review'` is not a match and falls through to the compiler.
- **A legacy 11-column header is REFUSED (exit 2), never classified.** `parseSuite` maps fields
  positionally, so on those 11 suites the legacy `Steps` lands in `Test_Data` and `Expected Result`
  lands in `Steps` — routing would score real cases on the wrong columns. None of the 10 mixed
  suites has that header, so refusing costs nothing.

**Fragments plus one deterministic merger, never a shared file.** Once a suite's cases span two
writers, a shared `suite-*-results.json` is a race — and the agent's own contract is "overwrite the
whole file", so asking it to preserve another writer's rows is a rule it will break under context
pressure, at which point a real failure disappears. So: one writer per fragment
(`…-results.machine.json`, `…-results.browser.json`) and `scripts/lib/suite-results-merge.ts`.
Its invariants, each unit-tested in `scripts/unit/suite-results-merge.test.ts`:

1. **No case can be lost.** The planned set comes from the lanes file, not from the fragments — so a
   lane that dies before writing surfaces as `BLOCKED` / `lane_lost: the <lane> lane did not report
   this case`, instead of producing a smaller, greener, faster-looking suite. The two
   **non-executing** lanes are the deliberate exception and are materialised from the plan as
   `SKIPPED` with their own note (`manual` → `Automation_Status=Manual (explicit)`, `deprecated` →
   `Automation_Status=Deprecated (retired …, EX-201)`) — a planned lane that never dispatches must
   not read as a lane that died, and a retired case must not be labelled as awaiting a human.
2. **No case can be counted twice.** The same id in two fragments is a hard error naming both, and
   **nothing is written** — that means the split leaked.
3. **Every row carries its `lane`**, and the envelope carries per-lane counts. Without it no
   determinism trend can be read off history.
4. **Counts are recomputed from the rows**, never summed from the fragment headers (a header is one
   writer's claim about itself). A status outside PASS/FAIL/BLOCKED/SKIPPED stays untallied, so the
   four counts summing to less than `totalCases` is how an incomplete suite stays visibly
   incomplete.
5. **Idempotent** — the orchestrator re-merges on every poll so the live dashboard is not frozen
   while both lanes work. `completedAt` stays empty until every fragment closes.

Determinism moves **9.3% → 13.3%** of the corpus (385 → 554 of 4,155 cases). It also pulls four
cases OFF the fast path that are currently fed to a runner which cannot fully parse them — one of
them, `050c`'s `ORD-GQL-TODO-001`, says so in its own steps: *"[MANUAL-BLOCKED] … Do NOT run via
graphql-runner"*, and today the runner runs it and reports `EMPTY` → exit 1 → a FAIL on a
placeholder row.

## Executability — what a runner can execute, and what would move it

`npm run suites:executability` is the reporting half of `scripts/lib/case-classifier.ts`. It adds
no judgement of its own and deliberately shares the classifier with the lane planner, because a
report that disagreed with the routing would be worse than no report.

| Command | Answers |
|---|---|
| `npm run suites:executability` | per-suite machine/browser/manual/**unroutable** + the `EX-*` histogram |
| `… -- --suite <ID>` | per case, with the blocker codes and the offending token |
| `… -- --burn-down` | the backlog, cheapest first |
| `npm run suites:executability:check` | **ratchet: fails only when a suite LOSES machine cases** |

**`--check` is not the question `suites:lint` asks.** That one asks *"is the manifest in sync?"* and
fails on drift in either direction. This one asks *"did determinism regress?"* and fails **only on a
drop**, so a change that makes cases unroutable cannot ride in behind a routine `suites:sync`.

**It is deliberately NOT a gate on prose.** 84% of the corpus is prose by design — these are cases an
LLM agent drives, and most should stay that way. A gate that failed on "not machine-executable"
would be red forever, everyone would learn to pass `--warn-only`, and the signal would be dead.

**Per-suite lane counts are recorded in the manifest** (`lanes: {machine, browser, manual}` plus
`deprecated` when non-zero, reconciled by `suites:sync` exactly like `testCount` and `clickDriven`,
present only when a suite has at least one machine case). So the planner and the report read one
recorded answer instead of each re-classifying 127 CSVs — and a drop shows up as manifest drift as
well as a ratchet failure. **Not every drop is lost determinism:** a case retired to `Deprecated`
(EX-201) leaves the machine lane by design, so `--check` naming a suite whose only loss is an
EX-201 is drift to *record*, not a regression to fix — which is why the failure text says so and
why `deprecated` is recorded separately rather than melted into `manual`.

**UNROUTABLE is its own count, never folded into `browser`.** The 11 surviving legacy 11-column
suites (274 cases) are not "browser suites" — they are suites nothing can classify, because
`parseSuite` maps positionally and on them the legacy `Steps` lands in `Test_Data`. Counting them as
browser would hide 274 cases behind a number that reads like a deliberate choice.

### The measured correction to the burn-down economics

Determinism is **555 / 4,231 = 13.1%**. The backlog splits, against the grammar the GraphQL/REST
runner actually parses:

| cases | bucket |
|---|---|
| **2** | steps compile, assertions are prose |
| **46** | assertions compile, steps need normalising |
| **2,481** | prose on both sides — not a project; taken suite by suite in `/qa-review-tests` |
| **838** | explicitly `Manual` — out of scope by intent |
| **35** | explicitly `Deprecated` — retired; out of scope by *definition*, never converted (EX-201) |
| **274** | UNROUTABLE — legacy header; a suite-level migration, and authoring |

**Read the small number as a finding, not an under-count.** An earlier estimate put ~365 cases one
assertion-rewrite away from determinism and ~739 one step-normalisation away. Those came from a proxy
metric — *does the assertion CONTAIN a comparison operator* — and do not survive the executor's own
parser: a storefront case asserting `[DOM] cart icon visible` can never be scoreable by a GraphQL
predicate scorer, however well it is written. Worked examples of the real cheap tranche: `050a`'s
`CAT-GQL-131`, whose assertion reads `data.products.sortings[0].name is non-null OR is null`
(vacuously true), and `027b`'s `ORGROLE-001..003`, which carry a `[NAV]` step inside an otherwise
GraphQL-shaped case.

**So the next real gain is not an authoring push — it is a DOM predicate grammar (a `ui-runner`).**
Rewriting assertions buys about **1 percentage point**; giving the browser lane a runner of its own
is what addresses the other 2,508. That reorders the plan: the authoring burn-down is a tail task,
not the next step.

